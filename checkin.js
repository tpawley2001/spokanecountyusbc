// ── Tournament check-in desk ──────────────────────────────────────
// A private page for checking bowlers in at a tournament: tick each bowler
// as they arrive, mark entry fees paid, type in lane numbers, and keep a photo
// of the posted lane sheet. Several devices can use it at once; each one polls
// for changes every few seconds.
//
// Private: it lives under /api/checkin/, and Cloudflare Access already gates
// every /api path to the director's own sign-in. As a second lock, a request that
// came through Cloudflare must carry an Access-verified email listed in
// CHECKIN_EMAILS (set in the systemd drop-in, never committed: the repo is public).
// Requests made straight to the box on the LAN (no cf-connecting-ip) are allowed,
// the same as LAN admin editing. If CHECKIN_EMAILS is unset, only the LAN can reach it.
//
// Data lives in checkin-data/ (gitignored, never served statically):
//   roster.json  the event and its pairs, written by scripts/checkin_import.py
//                from a TournamentBowl "Tournament Roster" export
//   state.json   check-ins, paid overrides, lanes, photo ids, and a revision number
//   log.jsonl    every change, with the old and new values
//   photos/      lane-sheet photos
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const DATA_DIR = path.join(__dirname, 'checkin-data');
const ROSTER_FILE = path.join(DATA_DIR, 'roster.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const LOG_FILE = path.join(DATA_DIR, 'log.jsonl');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const PAGE_FILE = path.join(__dirname, 'pages', 'checkin.html');
const SCRIPT_FILE = path.join(__dirname, 'pages', 'checkin-page.js');
const ALLOWED = (process.env.CHECKIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function allowed(req) {
  if (!req.get('cf-connecting-ip')) return true;   // straight to the box on the LAN
  const email = (req.get('cf-access-authenticated-user-email') || '').toLowerCase();
  return !!email && ALLOWED.includes(email);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
const emptyState = () => ({ rev: 0, checkin: {}, paid: {}, lanes: {}, photos: [] });
function readState() { return { ...emptyState(), ...readJson(STATE_FILE, {}) }; }

function log(req, entry) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify({
      at: new Date().toISOString(),
      who: req.get('cf-access-authenticated-user-email') || 'lan',
      ...entry,
    }) + '\n', { mode: 0o600 });
  } catch (e) { console.error('checkin log failed:', e.message); }
}

// Every change goes through here: read, change, bump rev, save, log
function change(req, res, fn) {
  const state = readState();
  const result = fn(state);
  if (result && result.error) return res.status(result.status || 400).json({ error: result.error });
  state.rev += 1;
  writeJson(STATE_FILE, state);
  if (result && result.log) log(req, result.log);
  res.json({ success: true, state });
}

function mount(app) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!allowed(req)) return res.status(404).type('text').send('Not found');
    res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    next();
  });

  router.get('/', (req, res) => {
    // Relative URLs in the page resolve against /api/checkin/
    if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(301, req.originalUrl.replace(/(\?|$)/, '/$1'));
    res.type('html').sendFile(PAGE_FILE);
  });
  router.get('/checkin-page.js', (req, res) => res.type('application/javascript').sendFile(SCRIPT_FILE));

  router.get('/roster', (req, res) => {
    const roster = readJson(ROSTER_FILE, null);
    if (!roster) return res.status(404).json({ error: 'No roster has been loaded yet.' });
    res.json(roster);
  });

  // ?since=<rev> answers {rev} alone when nothing changed, so polling stays cheap
  router.get('/state', (req, res) => {
    const state = readState();
    if (String(state.rev) === req.query.since) return res.json({ rev: state.rev });
    res.json(state);
  });

  // Check-in is per person (USBC user id), so someone on two teams is checked in once
  router.post('/checkin/:u', (req, res) => change(req, res, s => {
    const key = 'u' + String(req.params.u).replace(/\D/g, '').slice(0, 12);
    if (key === 'u') return { error: 'Unknown bowler.' };
    const before = s.checkin[key] || null;
    if (req.body && req.body.in === true) s.checkin[key] = { in: true, at: new Date().toISOString() };
    else delete s.checkin[key];
    return { log: { action: 'checkin', key, before, after: s.checkin[key] || null } };
  }));

  // Paid is per entry; the roster's own paid flag applies until someone changes it here
  router.post('/paid/:e', (req, res) => change(req, res, s => {
    const key = 'e' + String(req.params.e).replace(/\D/g, '').slice(0, 12);
    if (key === 'e' || typeof (req.body || {}).paid !== 'boolean') return { error: 'Unknown entry.' };
    const before = key in s.paid ? s.paid[key] : null;
    s.paid[key] = req.body.paid;
    return { log: { action: 'paid', key, before, after: req.body.paid } };
  }));

  router.post('/lane/:t', (req, res) => change(req, res, s => {
    const key = 't' + String(req.params.t).replace(/\D/g, '').slice(0, 12);
    if (key === 't') return { error: 'Unknown pair.' };
    const lane = String((req.body || {}).lane ?? '').replace(/[^\w\- &]/g, '').trim().slice(0, 8);
    const before = s.lanes[key] || null;
    if (lane) s.lanes[key] = lane; else delete s.lanes[key];
    return { log: { action: 'lane', key, before, after: lane || null } };
  }));

  router.post('/photo', express.raw({ type: Object.keys(PHOTO_TYPES), limit: '15mb' }), (req, res) => {
    const ext = PHOTO_TYPES[(req.get('content-type') || '').split(';')[0].trim()];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Send a JPEG, PNG or WebP photo.' });
    const id = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.mkdirSync(PHOTO_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(PHOTO_DIR, id), req.body, { mode: 0o600 });
    change(req, res, s => { s.photos.push(id); return { log: { action: 'photo-add', id } }; });
  });

  router.delete('/photo/:id', (req, res) => change(req, res, s => {
    if (!s.photos.includes(req.params.id)) return { error: 'That photo is already gone.', status: 404 };
    s.photos = s.photos.filter(p => p !== req.params.id);
    // The file stays on disk so a mistaken removal can be undone by hand
    return { log: { action: 'photo-remove', id: req.params.id } };
  }));

  router.get('/photo/:id', (req, res) => {
    if (!/^[0-9a-f]{16}\.(jpg|png|webp)$/.test(req.params.id)) return res.status(404).type('text').send('Not found');
    const file = path.join(PHOTO_DIR, req.params.id);
    if (!fs.existsSync(file)) return res.status(404).type('text').send('Not found');
    res.set('Cache-Control', 'private, max-age=86400').sendFile(file);
  });

  app.use('/api/checkin', router);
}

module.exports = { mount };
