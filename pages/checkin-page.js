// Check-in desk page (served by checkin.js at /api/checkin/). Loads the roster
// once, then polls the shared state every few seconds so several phones stay in step.
(() => {
  'use strict';
  const POLL_MS = 4000;
  let TEAMS = [], people = new Map(), kind = 'Doubles';
  let S = { rev: -1, checkin: {}, paid: {}, lanes: {}, photos: [] };
  let filter = 'all', view = 'team', query = '';
  try { view = localStorage.getItem('checkin.view') || 'team'; } catch (e) {}
  const $ = id => document.getElementById(id);

  // ---- helpers
  const fullName = b => `${b.f} ${b.l}${b.s ? ' ' + b.s : ''}`;
  const teamLabel = t => t.name || t.b.map(b => b.l).join(' / ');
  const isIn = b => !!S.checkin['u' + b.u];
  const isPaid = b => (('e' + b.e) in S.paid ? S.paid['e' + b.e] : b.paid);
  const rosterLane = t => { const l = t.b.find(b => b.lane); return l ? String(l.lane) : ''; };
  const laneOf = t => S.lanes['t' + t.id] || rosterLane(t);
  const laneNum = t => { const n = parseInt(laneOf(t), 10); return isNaN(n) ? 1e9 : n; };
  const fmtTime = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function setStatus(msg, err) { const s = $('status'); s.textContent = msg; s.classList.toggle('err', !!err); }

  async function api(path, opts) {
    const r = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...opts });
    // An expired Cloudflare sign-in comes back as a redirect to the login page
    if (r.redirected || (r.headers.get('content-type') || '').includes('text/html')) throw { signin: true };
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { message: j.error || 'Something went wrong.' };
    return j;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function apply(state) {
    if (state && typeof state.rev === 'number' && state.checkin) { S = state; render(); renderPhotos(); }
  }
  function failed(e) {
    if (e && e.signin) setStatus('Your sign-in expired. Reload the page to sign in again.', true);
    else setStatus((e && e.message) || "Couldn't save that change. Check the connection and try again.", true);
    poll();
  }

  // ---- actions (show the change right away, then save; the reply carries the new state)
  function toggleIn(u) {
    const now = !S.checkin['u' + u];
    if (now) S.checkin['u' + u] = { in: true, at: new Date().toISOString() }; else delete S.checkin['u' + u];
    render();
    post('checkin/' + u, { in: now }).then(r => { apply(r.state); ok(); }, failed);
  }
  function togglePaid(b) {
    const v = !isPaid(b);
    S.paid['e' + b.e] = v; render();
    post('paid/' + b.e, { paid: v }).then(r => { apply(r.state); ok(); }, failed);
  }
  function setLane(t, v) {
    v = v.trim().slice(0, 8);
    if (v === (S.lanes['t' + t.id] || '')) return;
    if (v) S.lanes['t' + t.id] = v; else delete S.lanes['t' + t.id];
    post('lane/' + t.id, { lane: v }).then(r => { apply(r.state); ok(); }, failed);
  }

  // ---- render
  function bowlerRow(b, showTeam) {
    const row = el('div', 'bowler');
    const here = isIn(b);
    const ci = el('button', 'ci', '✓');
    ci.type = 'button';
    ci.setAttribute('aria-pressed', here);
    ci.setAttribute('aria-label', (here ? 'Undo check-in for ' : 'Check in ') + fullName(b));
    ci.addEventListener('click', () => toggleIn(b.u));
    const who = el('div', 'who');
    who.append(el('div', 'nm', fullName(b)));
    const meta = el('div', 'meta');
    meta.append(el('span', null, `Avg ${b.avg} · Hdcp ${b.hc}`));
    meta.append(el('span', null, b.usbc ? `USBC ${b.usbc}` : 'No USBC # on file'));
    if (showTeam) { const l = laneOf(b.team); meta.append(el('span', null, teamLabel(b.team) + (l ? ` · Lane ${l}` : ''))); }
    if (here && S.checkin['u' + b.u].at) meta.append(el('span', 't', 'In at ' + fmtTime(S.checkin['u' + b.u].at)));
    who.append(meta);
    const others = people.get(b.u).filter(x => x !== b);
    if (others.length) who.append(el('div', 'also', 'Also bowling with ' + others.map(x => teamLabel(x.team)).join(', ')));
    const paid = isPaid(b);
    const pill = el('button', 'pill ' + (paid ? 'paid' : 'due'), paid ? 'Paid' : 'Owes');
    pill.type = 'button';
    pill.setAttribute('aria-label', `${fullName(b)}: ${paid ? 'paid, tap to mark unpaid' : 'owes, tap to mark paid'}`);
    pill.addEventListener('click', () => togglePaid(b));
    row.append(ci, who, pill);
    return row;
  }

  function matches(b) {
    if (filter === 'in' && !isIn(b)) return false;
    if (filter === 'out' && isIn(b)) return false;
    if (filter === 'due' && isPaid(b)) return false;
    if (!query) return true;
    const hay = `${fullName(b)} ${teamLabel(b.team)} ${b.usbc} lane ${laneOf(b.team)}`.toLowerCase();
    return query.split(/\s+/).every(w => hay.includes(w));
  }

  function render() {
    if (!TEAMS.length) return;
    const all = [...people.values()].map(a => a[0]);
    const nIn = all.filter(isIn).length;
    $('s-in').textContent = `${nIn} / ${all.length}`;
    $('s-bar').style.width = (100 * nIn / all.length) + '%';
    $('s-ready').textContent = `${TEAMS.filter(t => t.b.every(isIn)).length} / ${TEAMS.length}`;
    $('s-due').textContent = TEAMS.flatMap(t => t.b).filter(b => !isPaid(b)).length;
    $('s-lanes').textContent = `${TEAMS.filter(t => laneOf(t)).length} / ${TEAMS.length}`;

    // Don't rebuild the list under someone typing a lane number
    const a = document.activeElement;
    if (a && a.matches && a.matches('.lane input')) return;
    const list = $('list');
    list.replaceChildren();
    list.classList.toggle('flat', view === 'name');

    if (view === 'name') {
      const bs = TEAMS.flatMap(t => t.b).filter(matches).sort((x, y) => (x.l + x.f).localeCompare(y.l + y.f) || x.e - y.e);
      if (!bs.length) return list.append(el('p', 'empty', 'No bowlers match.'));
      const card = el('div', 'team');
      bs.forEach(b => card.append(bowlerRow(b, true)));
      return list.append(card);
    }
    const teams = TEAMS.filter(t => t.b.some(matches)).sort(view === 'lane'
      ? (x, y) => laneNum(x) - laneNum(y) || teamLabel(x).localeCompare(teamLabel(y))
      : (x, y) => teamLabel(x).localeCompare(teamLabel(y)));
    if (!teams.length) return list.append(el('p', 'empty', 'No teams match.'));
    teams.forEach(t => {
      const card = el('article', 'team' + (t.b.every(isIn) ? ' ready' : ''));
      const head = el('div', 'team-head');
      const nm = el('div', 'team-name');
      nm.append(el('strong', null, teamLabel(t)));
      const avg = t.b.reduce((s, b) => s + b.avg, 0), hc = t.b.reduce((s, b) => s + b.hc, 0);
      nm.append(el('small', null, `Team avg ${avg} · Hdcp ${hc} · ${t.b.filter(isIn).length}/${t.b.length} here`));
      const lane = el('div', 'lane');
      const lab = el('label', null, 'Lane'); lab.htmlFor = 'lane-' + t.id;
      const inp = el('input'); inp.id = 'lane-' + t.id; inp.inputMode = 'numeric'; inp.placeholder = '—'; inp.value = laneOf(t); inp.maxLength = 8;
      inp.setAttribute('aria-label', 'Lane for ' + teamLabel(t));
      inp.addEventListener('change', () => setLane(t, inp.value));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('blur', () => setTimeout(render, 0));
      lane.append(lab, inp);
      head.append(nm, lane);
      card.append(head);
      t.b.forEach(b => card.append(bowlerRow(b, false)));
      list.append(card);
    });
  }

  let pendingRemove = null;
  function renderPhotos() {
    const box = $('thumbs');
    box.replaceChildren();
    $('ph-note').hidden = S.photos.length > 0;
    $('ph-btn').firstChild.textContent = S.photos.length ? 'Add another photo' : 'Add photo';
    S.photos.forEach((id, i) => {
      const wrap = el('div', 'thumb');
      const open = el('button', 'open'); open.type = 'button';
      open.setAttribute('aria-label', 'Open lane sheet photo ' + (i + 1));
      const img = el('img'); img.src = 'photo/' + id; img.alt = 'Lane sheet photo ' + (i + 1); img.loading = 'lazy';
      open.append(img);
      open.addEventListener('click', () => openLb(img.src));
      const rm = el('button', 'rm', pendingRemove === id ? 'Tap again to remove' : 'Remove'); rm.type = 'button';
      rm.addEventListener('click', () => removePhoto(id));
      wrap.append(open, rm);
      box.append(wrap);
    });
  }
  function removePhoto(id) {
    if (pendingRemove !== id) {
      pendingRemove = id; renderPhotos();
      setTimeout(() => { if (pendingRemove === id) { pendingRemove = null; renderPhotos(); } }, 4000);
      return;
    }
    pendingRemove = null;
    api('photo/' + id, { method: 'DELETE' }).then(r => { apply(r.state); setStatus('Photo removed.'); }, failed);
  }

  // Phone photos can be 5+ MB; scale to 3000 px on the long side so they upload quickly and stay readable
  function shrink(file) {
    return new Promise(res => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 2.5e6) return res(file);
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 3000 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), 'image/jpeg', 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  $('ph-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    setStatus('Uploading the photo…');
    try {
      let blob = await shrink(file);
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) throw { message: 'Use a JPEG, PNG or WebP photo. (iPhone HEIC photos: set the camera to "Most Compatible".)' };
      const r = await api('photo', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      apply(r.state); setStatus('Photo added.');
    } catch (err) { failed(err); }
  });

  function openLb(src) { $('lb-img').src = src; $('lb').classList.remove('zoom'); $('lb').hidden = false; $('lb-close').focus(); }
  $('lb-close').addEventListener('click', () => { $('lb').hidden = true; });
  $('lb-zoom').addEventListener('click', () => $('lb').classList.toggle('zoom'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('lb').hidden = true; });

  // ---- controls
  $('q').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });
  document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.f;
    document.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b));
    render();
  }));
  function setView(v) {
    view = ['team', 'lane', 'name'].includes(v) ? v : 'team';
    document.querySelectorAll('[data-v]').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === view));
    try { localStorage.setItem('checkin.view', view); } catch (e) {}
    render();
  }
  document.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));

  // ---- sync
  let lastOk = Date.now(), timer = null;
  function ok() { lastOk = Date.now(); setStatus('Live · changes show on every device within a few seconds.'); }
  async function poll() {
    clearTimeout(timer);
    try {
      const r = await api('state?since=' + S.rev);
      if (r.checkin) apply(r);
      ok();
    } catch (e) {
      if (e && e.signin) setStatus('Your sign-in expired. Reload the page to sign in again.', true);
      else if (Date.now() - lastOk > 12000) setStatus('Not connected. Changes may not be saved; keep this page open and it will retry.', true);
    }
    timer = setTimeout(poll, document.hidden ? POLL_MS * 4 : POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  async function start() {
    try {
      const roster = await api('roster');
      TEAMS = roster.teams;
      kind = roster.event.kind || kind;
      TEAMS.forEach(t => t.b.forEach(b => { b.team = t; (people.get(b.u) || people.set(b.u, []).get(b.u)).push(b); }));
      $('ev-name').textContent = roster.event.name;
      $('ev-when').textContent = `${kind} · ${roster.event.squad}`;
      document.title = `${roster.event.name} check-in`;
      const unit = kind === 'Doubles' ? 'Pairs' : kind === 'Singles' ? 'Bowlers' : 'Teams';
      $('s-ready-l').textContent = unit + ' ready';
      $('s-lanes-l').textContent = unit + ' on lanes';
      document.querySelector('[data-v="team"]').textContent = unit;
      setView(view);
      poll();
    } catch (e) {
      setStatus(e && e.signin ? 'Your sign-in expired. Reload the page to sign in again.' : ((e && e.message) || "Couldn't load the roster."), true);
    }
  }
  start();
})();
