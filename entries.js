// ── Online tournament entry forms ─────────────────────────────────
// Each form is entry-forms/<slug>.json: the fields (validated here), the sheet
// layout (drawn by entry-page.js to look like the paper entry form) and the
// fillable PDF whose field names match. A submission is validated, written to
// that PDF, emailed to the entry address with the PDF attached, and appended
// to entries/<slug>.jsonl as a backup in case the email ever fails.
//
// Mail settings come from the environment (EnvironmentFile in the systemd unit):
//   SMTP_USER, SMTP_PASS   Gmail account + app password used to send
//   SMTP_HOST, SMTP_PORT   default smtp.gmail.com:465
//   ENTRY_TO               recipient, default the association manager
const fs = require('fs');
const path = require('path');

const FORMS_DIR = path.join(__dirname, 'entry-forms');
const LOG_DIR = path.join(__dirname, 'entries');
const ENTRY_TO = process.env.ENTRY_TO || 'spokaneusbc.assoc.manager@gmail.com';
const SLUG = /^[a-z0-9-]{1,60}$/;

function loadForm(slug) {
  if (!SLUG.test(slug || '')) return null;
  try { return JSON.parse(fs.readFileSync(path.join(FORMS_DIR, `${slug}.json`), 'utf-8')); }
  catch { return null; }
}

// Tournament name shown in the subject: the site's tournament list wins, so a
// rename in the admin panel carries through; the form's own name is the fallback.
function tournamentName(slug, form, readData) {
  try {
    const t = (readData().tournaments || []).find(t => t.online_form === slug);
    if (t && t.name) return t.name;
  } catch {}
  return form.tournament;
}

function clean(v, max) {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function validate(form, body) {
  const values = {}, errors = {};
  for (const [name, f] of Object.entries(form.fields)) {
    if (f.type === 'check') { values[name] = body[name] ? 'X' : ''; continue; }   // checkbox: 'X' on the PDF
    const v = clean(body[name], f.max || 100);
    if (!v) { if (f.required) errors[name] = `${f.label} is required`; values[name] = ''; continue; }
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) errors[name] = 'Enter a valid email address';
    if (f.type === 'tel' && (v.replace(/\D/g, '').length < 7)) errors[name] = 'Enter a valid phone number';
    if (f.type === 'average' && !(/^\d{1,3}$/.test(v) && +v <= 300)) errors[name] = 'Average must be a number from 0 to 300';
    values[name] = v;
  }
  // Per-bowler event picks (e.g. Hdcp/Scratch): a named bowler needs at least one,
  // and an event can't be picked for a bowler with no name.
  for (const b of form.event_picks || []) {
    const picked = b.events.some(n => values[n]);
    if (values[b.name] && !picked) errors[b.events[0]] = b.error || 'Pick at least one event';
    if (!values[b.name] && picked && !errors[b.name]) errors[b.name] = `${form.fields[b.name].label} is required`;
  }
  // At least one of several optional fields (e.g. any bowler, doubles or singles)
  const one = form.require_one;
  if (one && !one.fields.some(n => values[n]) && !errors[one.fields[0]]) errors[one.fields[0]] = one.error || 'Required';
  return { values, errors };
}

function amountDue(form, values) {
  const people = (form.fee_people_fields || []).filter(n => values[n]).length;
  return people * (form.fee_per_person || 0);
}

// The emailed copy is for printing: entries are drawn in black and flattened into
// the page, since phone/Gmail previews and printers often drop live form fields.
async function fillPdf(form, values) {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.load(fs.readFileSync(path.join(__dirname, form.pdf)));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pdfForm = doc.getForm();
  for (const [name, v] of Object.entries(values)) {
    let tf;
    try { tf = pdfForm.getTextField(name); } catch { continue; }   // field missing on the PDF: skip
    // 12pt, shrunk only as far as needed so a long value fits a narrow (or short) blank
    const w = tf.acroField.getWidgets()[0];
    const r = w ? w.getRectangle() : { width: Infinity, height: Infinity };
    const size = Math.max(6, Math.min(12, Math.floor(r.height * 0.9), Math.floor(12 * (r.width - 4) / (font.widthOfTextAtSize(v, 12) || 1))));
    tf.acroField.setDefaultAppearance(`/Helv ${size} Tf 0 g`);
    tf.setText(v);
  }
  pdfForm.updateFieldAppearances(font);
  pdfForm.flatten();
  return Buffer.from(await doc.save());
}

// A fresh transport per send, pinned to an IPv4 address: IPv6 routes to Gmail can
// hang silently, and the timeouts keep a slow server from stalling the entrant.
async function mailer() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const nodemailer = require('nodemailer');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = +(process.env.SMTP_PORT || 465);
  const { address } = await require('dns').promises.lookup(host, { family: 4 });
  return nodemailer.createTransport({
    host: address, port, secure: port === 465, tls: { servername: host },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const htmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function emailBody(name, form, values, due, when) {
  const rows = Object.entries(form.fields).map(([k, f]) => [f.label, values[k] || '—']);
  rows.push(['Entry fee due', `$${due.toFixed(2)} ($${form.fee_per_person}/${form.fee_unit || 'person'})`]);
  const text = `${name} entry submitted online ${when}\n\n` +
    rows.map(([l, v]) => `${l}: ${v}`).join('\n') +
    `\n\nThe completed entry form is attached as a printable PDF. Reply to this email to reach the contact.\n`;
  const html = `<p><strong>${htmlEsc(name)}</strong> entry submitted online ${htmlEsc(when)}</p>` +
    '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    rows.map(([l, v]) => `<tr><td style="border:1px solid #ccc;background:#f5f7fa"><b>${htmlEsc(l)}</b></td>` +
      `<td style="border:1px solid #ccc">${htmlEsc(v)}</td></tr>`).join('') +
    '</table><p>The completed entry form is attached as a printable PDF. Reply to this email to reach the contact.</p>';
  return { text, html };
}

// Per-IP and global caps keep the form from being used to flood the inbox.
const hits = new Map();
let globalHits = [];
function rateLimited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter(t => now - t < 3600e3);
  const mine = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (mine.length >= 5 || globalHits.length >= 60) return true;
  mine.push(now); hits.set(ip, mine); globalHits.push(now);
  return false;
}

function mount(app, readData) {
  // Public form definition (layout + field rules) for entry-page.js
  app.get('/entry/form/:slug', (req, res) => {
    const form = loadForm(req.params.slug);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    const { pdf, ...pub } = form;
    res.json({ ...pub, tournament: tournamentName(req.params.slug, form, readData), pdf_url: pdf });
  });

  // Not under /api/ on purpose: Cloudflare Access gates /api/* for the admin panel.
  app.post('/entry/submit/:slug', async (req, res) => {
    const slug = req.params.slug;
    const form = loadForm(slug);
    if (!form) return res.status(404).json({ error: 'Form not found' });
    const body = req.body || {};
    if (body.website) return res.json({ success: true });            // honeypot: quietly drop bots
    const { values, errors } = validate(form, body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
    const ip = req.get('cf-connecting-ip') || req.ip;
    if (rateLimited(ip)) return res.status(429).json({ error: 'Too many entries from this connection. Please try again later or email the entry form.' });

    const name = tournamentName(slug, form, readData);
    const due = amountDue(form, values);
    const when = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
    let pdf;
    try { pdf = await fillPdf(form, values); } catch (e) { console.error('entry pdf fill failed:', e.message); }

    let emailed = false;
    let t = null;
    try { t = await mailer(); } catch (e) { console.error('entry email lookup failed:', e.message); }
    if (t) {
      try {
        await t.sendMail({
          from: { name: 'Spokane County USBC Entries', address: process.env.SMTP_USER },
          to: ENTRY_TO,
          replyTo: { name: values.contact_name || '', address: values.contact_email },
          subject: `${name} Entry Form`,
          ...emailBody(name, form, values, due, when),
          attachments: pdf ? [{ filename: `${slug}-entry-${clean(values.team_name || values.contact_name, 40).replace(/[^\w-]+/g, '-')}.pdf`, content: pdf }] : [],
        });
        emailed = true;
      } catch (e) { console.error('entry email failed:', e.message); }
    } else console.error('entry email not configured (SMTP_USER/SMTP_PASS unset)');

    try {
      fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
      fs.appendFileSync(path.join(LOG_DIR, `${slug}.jsonl`),
        JSON.stringify({ at: new Date().toISOString(), emailed, due, values }) + '\n', { mode: 0o600 });
    } catch (e) { console.error('entry log failed:', e.message); }

    if (!emailed) return res.status(502).json({ error: 'Your entry could not be sent right now. Please try again in a few minutes, or download the PDF entry form and email it in.' });
    res.json({ success: true, tournament: name, due, payment: form.payment || '', pdf: pdf ? pdf.toString('base64') : null });
  });
}

module.exports = { mount };
