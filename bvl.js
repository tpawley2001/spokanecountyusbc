// ── BVL donation collection: director sign-up sheet ───────────────
// The online copy of the board's BVL collection sign-up spreadsheet: one row
// per league visit, where directors put their name and contact next to a visit
// and later record the date and amount collected.
//
// Private by link: everything lives under /bvl/<BVL_TOKEN>/, where BVL_TOKEN
// comes from the environment (EnvironmentFile in the systemd unit). A wrong or
// missing token gets the site's ordinary 404, and the routes are disabled when
// BVL_TOKEN is unset. The page is noindex, not cached, sends no referrer and is
// not linked from the site. Not under /api/ because Cloudflare Access gates it.
//
// The sheet is entries/bvl-signup.json (gitignored, never served: the repo is
// public and the sheet holds directors' contact details). Every change is
// appended to entries/bvl-signup-log.jsonl with the old and new values, so a
// mistaken edit can be put back by hand.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'entries');
const SHEET_FILE = path.join(DATA_DIR, 'bvl-signup.json');
const LOG_FILE = path.join(DATA_DIR, 'bvl-signup-log.jsonl');
const PAGE_FILE = path.join(__dirname, 'pages', 'bvl-signup.html');
const TOKEN = process.env.BVL_TOKEN || '';

const EDITABLE = { director: 60, contact: 80, date_collected: 10, amount: 12, notes: 200 };
const NEW_SLOT = { house: 40, day: 10, session: 12, arrive: 10, leagues: 160 };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function tokenOk(given) {
  if (TOKEN.length < 20 || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

function clean(v, max) {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function readSheet() {
  return JSON.parse(fs.readFileSync(SHEET_FILE, 'utf-8'));
}

// Write to a temp file and rename, so a crash mid-write can't leave half a sheet
function saveSheet(sheet) {
  const tmp = SHEET_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sheet, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, SHEET_FILE);
}

function logChange(req, entry) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify({
      at: new Date().toISOString(), ip: req.get('cf-connecting-ip') || req.ip, ...entry,
    }) + '\n', { mode: 0o600 });
  } catch (e) { console.error('bvl log failed:', e.message); }
}

function validate(body, fields) {
  const values = {}, errors = {};
  for (const [name, max] of Object.entries(fields)) {
    if (!(name in body)) continue;
    values[name] = clean(body[name], max);
  }
  if (values.date_collected && !/^\d{4}-\d{2}-\d{2}$/.test(values.date_collected)) errors.date_collected = 'Pick a date';
  if (values.amount) {
    const n = values.amount.replace(/[$,\s]/g, '');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(n)) errors.amount = 'Enter an amount like 125 or 125.50';
    else values.amount = Number(n).toFixed(2);
  }
  return { values, errors };
}

// Edits are rare (a dozen directors), so a generous per-IP cap only stops floods
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const mine = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (mine.length >= 120) return true;
  mine.push(now); hits.set(ip, mine);
  return false;
}

function mount(app) {
  const router = require('express').Router({ mergeParams: true });

  router.use((req, res, next) => {
    if (!tokenOk(req.params.token)) return res.status(404).type('text').send('Not found');
    res.set({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  router.get('/', (req, res) => {
    // Relative URLs in the page resolve against /bvl/<token>/
    if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(301, req.originalUrl.replace(/(\?|$)/, '/$1'));
    res.type('html').sendFile(PAGE_FILE);
  });

  router.get('/sheet', (req, res) => {
    try { res.json(readSheet()); }
    catch (e) { console.error('bvl read failed:', e.message); res.status(500).json({ error: 'The sign-up sheet could not be loaded.' }); }
  });

  // Update one visit. The client sends the version it last saw; if someone else
  // saved since, nothing is written and the current row comes back instead.
  router.post('/slot/:id', (req, res) => {
    if (rateLimited(req.get('cf-connecting-ip') || req.ip)) return res.status(429).json({ error: 'Too many changes. Please try again later.' });
    const body = req.body || {};
    const { values, errors } = validate(body, EDITABLE);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    let sheet;
    try { sheet = readSheet(); } catch { return res.status(500).json({ error: 'The sign-up sheet could not be loaded.' }); }
    const slot = sheet.slots.find(s => s.id === req.params.id);
    if (!slot) return res.status(404).json({ error: 'That visit is no longer on the sheet. Reload the page.' });
    if (body.version !== slot.version) return res.status(409).json({ error: 'Someone else just changed this visit. Here is the latest; check it and save again.', slot });
    const before = {};
    for (const k of Object.keys(values)) before[k] = slot[k] || '';
    Object.assign(slot, values, { version: slot.version + 1, updated_at: new Date().toISOString() });
    saveSheet(sheet);
    logChange(req, { action: 'update', id: slot.id, before, after: values });
    res.json({ success: true, slot });
  });

  // A visit the sheet doesn't list yet (a new league, a second session)
  router.post('/slot', (req, res) => {
    if (rateLimited(req.get('cf-connecting-ip') || req.ip)) return res.status(429).json({ error: 'Too many changes. Please try again later.' });
    const values = {};
    for (const [name, max] of Object.entries(NEW_SLOT)) values[name] = clean((req.body || {})[name], max);
    const errors = {};
    if (!values.house) errors.house = 'Pick a house';
    if (!DAYS.includes(values.day)) errors.day = 'Pick a day';
    if (!values.leagues) errors.leagues = 'Enter the league';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    let sheet;
    try { sheet = readSheet(); } catch { return res.status(500).json({ error: 'The sign-up sheet could not be loaded.' }); }
    const slot = { id: crypto.randomBytes(6).toString('hex'), ...values,
      director: '', contact: '', date_collected: '', amount: '', notes: '',
      version: 1, updated_at: new Date().toISOString() };
    sheet.slots.push(slot);
    saveSheet(sheet);
    logChange(req, { action: 'add', id: slot.id, after: values });
    res.json({ success: true, slot });
  });

  app.use('/bvl/:token', router);
}

module.exports = { mount };
