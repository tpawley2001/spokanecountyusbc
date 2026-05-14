const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'spokaneusbc2025';
const DATA_FILE = path.join(__dirname, 'site-data.json');
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

app.use(express.json());
app.use(express.static(__dirname));

// ── Helpers ───────────────────────────────────────────────────────
function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function replaceSection(filename, startTag, endTag, newContent) {
  const filepath = path.join(__dirname, filename);
  let html = fs.readFileSync(filepath, 'utf-8');
  const re = new RegExp(`[ \\t]*${startTag}[\\s\\S]*?${endTag}`, 'm');
  html = html.replace(re, newContent);
  fs.writeFileSync(filepath, html);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Auth ──────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.json({ token: SESSION_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

function auth(req, res, next) {
  if (req.headers['x-admin-token'] === SESSION_TOKEN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── GET all data ──────────────────────────────────────────────────
app.get('/api/site', auth, (req, res) => {
  try { res.json(readData()); }
  catch { res.json({}); }
});

// ── Board ─────────────────────────────────────────────────────────
app.post('/api/board', auth, (req, res) => {
  const { members } = req.body;
  if (!Array.isArray(members)) return res.status(400).json({ error: 'Invalid' });
  const data = readData();
  data.board.members = members;
  saveData(data);
  regenerateBoard(members);
  res.json({ success: true });
});

function boardCard(m) {
  const email = m.email ? `\n      <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '';
  const phone = m.phone ? `\n      <a href="tel:${m.phone.replace(/\D/g,'')}" style="margin-top:0.25rem;">${esc(m.phone)}</a>` : '';
  return `    <div class="board-card">
      <div class="role">${esc(m.role)}</div>
      <div class="name">${esc(m.name)}</div>${email}${phone}
    </div>`;
}

function regenerateBoard(members) {
  const inner = `  <!-- BOARD-START -->\n  <div class="board-grid">\n${members.map(boardCard).join('\n')}\n  </div>\n  <!-- BOARD-END -->`;
  replaceSection('board.html', '<!-- BOARD-START -->', '<!-- BOARD-END -->', inner);
}

// ── Tournaments ───────────────────────────────────────────────────
app.post('/api/tournaments', auth, (req, res) => {
  const { tournaments } = req.body;
  if (!Array.isArray(tournaments)) return res.status(400).json({ error: 'Invalid' });
  const data = readData();
  data.tournaments = tournaments;
  saveData(data);
  regenerateTournaments(tournaments);
  res.json({ success: true });
});

function tournamentRow(t, showStatus) {
  const statusCol = showStatus
    ? `\n            <td><span class="badge badge-${esc(t.status_color)}">${esc(t.status)}</span></td>` : '';
  return `          <tr>
            <td><strong>${esc(t.name)}</strong></td>
            <td>${esc(t.date)}</td>
            <td><span class="badge badge-${esc(t.type_color)}">${esc(t.type)}</span></td>${statusCol}
            <td><a href="signup.html" class="btn btn-red" style="padding:0.3rem 0.8rem;font-size:0.82rem;">Sign Up</a></td>
          </tr>`;
}

function regenerateTournaments(tournaments) {
  // Full table (tournaments.html — has Status column)
  const fullRows = tournaments.map(t => tournamentRow(t, true)).join('\n');
  const fullTbody = `        <!-- TOURNAMENTS-TABLE-START -->\n        <tbody>\n${fullRows}\n        </tbody>\n        <!-- TOURNAMENTS-TABLE-END -->`;
  replaceSection('tournaments.html', '<!-- TOURNAMENTS-TABLE-START -->', '<!-- TOURNAMENTS-TABLE-END -->', fullTbody);

  // Preview table (index.html — no Status column)
  const previewRows = tournaments.map(t => tournamentRow(t, false)).join('\n');
  const previewTbody = `        <!-- TOURNAMENTS-PREVIEW-START -->\n        <tbody>\n${previewRows}\n        </tbody>\n        <!-- TOURNAMENTS-PREVIEW-END -->`;
  replaceSection('index.html', '<!-- TOURNAMENTS-PREVIEW-START -->', '<!-- TOURNAMENTS-PREVIEW-END -->', previewTbody);
}

// ── Contact ───────────────────────────────────────────────────────
app.post('/api/contact', auth, (req, res) => {
  const contact = req.body;
  if (!contact.manager_name) return res.status(400).json({ error: 'Invalid' });
  // auto-derive phone_digits
  contact.phone_digits = (contact.phone || '').replace(/\D/g, '');
  const data = readData();
  data.contact = contact;
  saveData(data);
  regenerateContact(contact);
  res.json({ success: true });
});

function regenerateContact(c) {
  // Footer contact block — appears in all 9 pages
  const footerBlock = (filename) => {
    const indent = '      ';
    const block = `${indent}<!-- FOOTER-CONTACT-START -->
${indent}<div>
${indent}  <h4>Contact</h4>
${indent}  <ul>
${indent}    <li><a href="tel:${esc(c.phone_digits)}">${esc(c.phone)}</a></li>
${indent}    <li><a href="mailto:${esc(c.email)}">Email Us</a></li>
${indent}    <li><a>${esc(c.address_line1)}, ${esc(c.address_line2)}</a></li>
${indent}  </ul>
${indent}</div>
${indent}<!-- FOOTER-CONTACT-END -->`;
    replaceSection(filename, '<!-- FOOTER-CONTACT-START -->', '<!-- FOOTER-CONTACT-END -->', block);
  };

  const allPages = ['index.html','board.html','contact.html','forms.html',
    'honor.html','signup.html','tournaments.html','youth.html','averages.html'];
  allPages.forEach(footerBlock);

  // contact.html main section
  const mainBlock = `    <!-- CONTACT-MAIN-START -->
    <div class="contact-grid" style="gap:2rem;">
      <div class="contact-block">
        <h4>${esc(c.manager_role)}</h4>
        <p style="font-size:1.1rem;font-weight:700;color:var(--navy);margin-bottom:0.75rem;">${esc(c.manager_name)}</p>
        <a href="tel:${esc(c.phone_digits)}" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
          📞 <strong>${esc(c.phone)}</strong>
        </a>
        <a href="mailto:${esc(c.email)}" style="display:flex;align-items:center;gap:0.5rem;word-break:break-all;">
          ✉️ ${esc(c.email)}
        </a>
      </div>
      <div class="contact-block">
        <h4>Mailing Address</h4>
        <p style="font-size:1rem;line-height:1.8;">
          Spokane County USBC<br>
          ${esc(c.address_line1)}<br>
          ${esc(c.address_line2)}
        </p>
      </div>
      <div class="contact-block">
        <h4>Online Resources</h4>
        <a href="${esc(c.facebook_url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
          📘 Find us on Facebook
        </a>
        <a href="https://www.bowl.com" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:0.5rem;">
          🎳 Bowl.com — USBC National
        </a>
      </div>
    </div>
    <!-- CONTACT-MAIN-END -->`;
  replaceSection('contact.html', '<!-- CONTACT-MAIN-START -->', '<!-- CONTACT-MAIN-END -->', mainBlock);
}

// ── Announcement ──────────────────────────────────────────────────
app.post('/api/announcement', auth, (req, res) => {
  const ann = req.body;
  const data = readData();
  data.announcement = ann;
  saveData(data);
  regenerateAnnouncement(ann);
  res.json({ success: true });
});

function regenerateAnnouncement(ann) {
  let block;
  if (ann.visible) {
    block = `  <!-- ANNOUNCEMENT-START -->
  <div class="alert">
    <strong>📢 Reminder:</strong> ${esc(ann.text)} <a href="${esc(ann.link)}" target="_blank" rel="noopener">${esc(ann.link_text)}</a>!
  </div>
  <!-- ANNOUNCEMENT-END -->`;
  } else {
    block = `  <!-- ANNOUNCEMENT-START -->
  <!-- ANNOUNCEMENT-END -->`;
  }
  replaceSection('index.html', '<!-- ANNOUNCEMENT-START -->', '<!-- ANNOUNCEMENT-END -->', block);
}

// ── Honor Scores ──────────────────────────────────────────────────
app.post('/api/honor', auth, (req, res) => {
  const { honor_scores } = req.body;
  if (!Array.isArray(honor_scores)) return res.status(400).json({ error: 'Invalid' });
  const data = readData();
  data.honor_scores = honor_scores;
  saveData(data);
  regenerateHonor(honor_scores);
  res.json({ success: true });
});

function regenerateHonor(scores) {
  let content;
  if (scores.length === 0) {
    content = `  <!-- HONOR-START -->
  <section class="section" style="border-top:none;padding-top:0;">
    <h2>Honor Scores</h2>
    <div class="divider"></div>
    <p class="section-meta">Local honor scores — 300 games, 800 series, and other certified achievements.</p>
    <div class="info-box">
      <h4>Submit an Honor Score</h4>
      <p>If you bowled a 300 game, 800 series, or other USBC honor score in a certified league, contact the Association Manager to submit your achievement for recognition.</p>
    </div>
    <div style="margin-top:1.5rem;">
      <a href="contact.html" class="btn btn-navy">Contact Association Manager →</a>
    </div>
  </section>
  <!-- HONOR-END -->`;
  } else {
    const rows = scores.map(s =>
      `          <tr><td><strong>${esc(s.bowler)}</strong></td><td>${esc(s.score)}</td><td>${esc(s.type)}</td><td>${esc(s.league)}</td><td>${esc(s.date)}</td></tr>`
    ).join('\n');
    content = `  <!-- HONOR-START -->
  <section class="section" style="border-top:none;padding-top:0;">
    <h2>Honor Scores</h2>
    <div class="divider"></div>
    <p class="section-meta">Local honor scores — 300 games, 800 series, and other certified achievements.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Bowler</th><th>Score</th><th>Type</th><th>League</th><th>Date</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <div class="info-box" style="margin-top:1.5rem;">
      <h4>Submit an Honor Score</h4>
      <p>Contact the Association Manager to have your achievement added to this list.</p>
    </div>
  </section>
  <!-- HONOR-END -->`;
  }
  replaceSection('honor.html', '<!-- HONOR-START -->', '<!-- HONOR-END -->', content);
}

// ── JBT Schedule ──────────────────────────────────────────────────
app.post('/api/jbt', auth, (req, res) => {
  const { jbt_schedule } = req.body;
  if (!Array.isArray(jbt_schedule)) return res.status(400).json({ error: 'Invalid' });
  const data = readData();
  data.jbt_schedule = jbt_schedule;
  saveData(data);
  regenerateJbt(jbt_schedule);
  res.json({ success: true });
});

function regenerateJbt(schedule) {
  const rows = schedule.map(s =>
    `          <tr><td>${esc(s.date)}</td><td>${esc(s.location)}</td><td>${esc(s.format)}</td></tr>`
  ).join('\n');
  const block = `        <!-- JBT-TABLE-START -->
        <tbody>
${rows}
        </tbody>
        <!-- JBT-TABLE-END -->`;
  replaceSection('youth.html', '<!-- JBT-TABLE-START -->', '<!-- JBT-TABLE-END -->', block);
}

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎳 Spokane County USBC — http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`   Password: ${ADMIN_PASSWORD}\n`);
});
