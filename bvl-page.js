// BVL donation collection sign-up (pages/bvl-signup.html, served by bvl.js at
// /bvl/<token>/). Phone-first: one card per league visit, grouped by house,
// with an inline form to sign up and later record what was collected. All
// requests are relative, so they carry the page's private token.
(function () {
  'use strict';

  const root = document.getElementById('bvl-root');
  const HOUSES_ORDER = [];
  let sheet = null;
  let filter = 'all';      // all | open | mine
  let house = '';          // '' = every house
  let openId = null;       // card whose form is showing
  let message = null;      // { id, text, kind }

  // Name remembered on this phone for one-tap sign-up
  const me = {
    get() { try { return JSON.parse(localStorage.getItem('bvl-me') || '{}'); } catch { return {}; } },
    set(v) { try { localStorage.setItem('bvl-me', JSON.stringify(v)); } catch {} },
  };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
    return n;
  }

  function money(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function isMine(s) {
    const name = (me.get().director || '').trim().toLowerCase();
    return name && (s.director || '').trim().toLowerCase() === name;
  }

  async function api(url, body) {
    const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  async function load() {
    const r = await api('sheet');
    if (!r.ok) { root.replaceChildren(el('p', { class: 'bvl-status' }, r.data.error || 'The sign-up sheet could not be loaded.')); return; }
    sheet = r.data;
    for (const s of sheet.slots) if (!HOUSES_ORDER.includes(s.house)) HOUSES_ORDER.push(s.house);
    // Arriving from the calendar's "Open: sign up" link (#v-<id>): open that visit's form
    const linked = sheet.slots.find(s => '#v-' + s.id === location.hash);
    if (linked) openId = linked.id;
    render();
    const c = linked && document.getElementById('v-' + linked.id);
    if (c) { c.scrollIntoView({ block: 'center' }); c.querySelector('input').focus({ preventScroll: true }); }
  }

  function summary() {
    const covered = sheet.slots.filter(s => s.director).length;
    const total = sheet.slots.reduce((t, s) => t + (Number(s.amount) || 0), 0);
    return el('div', { class: 'bvl-summary' },
      el('div', null, el('strong', null, `${covered} of ${sheet.slots.length}`), ' visits covered'),
      el('div', null, el('strong', null, money(total)), ' collected'));
  }

  function chips() {
    const chip = (label, active, onclick) => el('button', { type: 'button', class: 'bvl-chip' + (active ? ' active' : ''), 'aria-pressed': active ? 'true' : 'false', onclick }, label);
    const open = sheet.slots.filter(s => !s.director).length;
    return el('div', { class: 'bvl-filters' },
      el('div', { class: 'bvl-chips' },
        chip('All', filter === 'all', () => { filter = 'all'; render(); }),
        chip(`Open (${open})`, filter === 'open', () => { filter = 'open'; render(); }),
        me.get().director ? chip('Mine', filter === 'mine', () => { filter = 'mine'; render(); }) : null),
      el('div', { class: 'bvl-chips' },
        chip('Every house', !house, () => { house = ''; render(); }),
        HOUSES_ORDER.map(h => chip(h, house === h, () => { house = h; render(); }))));
  }

  function field(label, name, value, attrs) {
    return el('label', { class: 'bvl-field' }, el('span', null, label),
      el('input', { name, value: value || '', ...attrs }));
  }

  function form(s) {
    const saved = me.get();
    const signing = !s.director;
    const f = el('form', { class: 'bvl-form', novalidate: true },
      field('Your name', 'director', s.director || (signing ? saved.director : ''), { autocomplete: 'name', maxlength: 60, required: true }),
      el('details', { class: 'bvl-collected', open: (s.date_collected || s.amount || s.notes) ? true : null },
        el('summary', null, 'After the visit: date and amount collected'),
        field('Date collected', 'date_collected', s.date_collected, { type: 'date' }),
        field('Amount collected ($)', 'amount', s.amount, { inputmode: 'decimal', placeholder: '0.00', maxlength: 12 }),
        el('label', { class: 'bvl-field' }, el('span', null, 'Notes'),
          el('textarea', { name: 'notes', rows: 2, maxlength: 200 }, s.notes || ''))),
      el('div', { class: 'bvl-actions' },
        el('button', { type: 'submit', class: 'bvl-btn bvl-btn-primary' }, signing ? 'Sign me up' : 'Save'),
        el('button', { type: 'button', class: 'bvl-btn', onclick: () => { openId = null; message = null; render(); } }, 'Cancel')),
      s.director ? el('button', { type: 'button', class: 'bvl-link-btn', onclick: () => clearSlot(s) }, 'Take this name off the visit') : null);
    f.addEventListener('submit', e => { e.preventDefault(); save(s, f); });
    return f;
  }

  async function send(s, values) {
    const r = await api('slot/' + encodeURIComponent(s.id), { version: s.version, ...values });
    if (r.status === 409 && r.data.slot) {
      Object.assign(s, r.data.slot);
      message = { id: s.id, kind: 'warn', text: r.data.error };
    } else if (!r.ok) {
      message = { id: s.id, kind: 'error', text: r.data.error || 'Could not save. Check your connection and try again.', fields: r.data.fields };
    } else {
      Object.assign(s, r.data.slot);
      openId = null;
      message = { id: s.id, kind: 'ok', text: 'Saved.' };
    }
    render();
  }

  function save(s, f) {
    const values = Object.fromEntries(new FormData(f).entries());
    if (!values.director.trim() && !s.director) {
      message = { id: s.id, kind: 'error', text: 'Enter your name to sign up.' };
      render(); return;
    }
    if (values.director.trim()) me.set({ director: values.director.trim() });
    send(s, values);
  }

  function clearSlot(s) {
    if (!confirm(`Take ${s.director} off ${s.house}, ${s.day} ${s.session.toLowerCase()}?`)) return;
    send(s, { director: '' });
  }

  function card(s) {
    const showing = openId === s.id;
    const msg = message && message.id === s.id ? el('p', { class: 'bvl-msg ' + message.kind, role: 'status' }, message.text) : null;
    return el('article', { class: 'bvl-card' + (s.director ? ' taken' : ' open') + (showing ? ' editing' : ''), id: 'v-' + s.id },
      el('div', { class: 'bvl-card-top' },
        el('div', null,
          el('div', { class: 'bvl-when' }, `${s.day} · ${s.session}`),
          el('div', { class: 'bvl-arrive' }, 'Arrive by ', el('strong', null, s.arrive || '—'))),
        s.director ? el('span', { class: 'bvl-pill taken' }, '✓ Covered') : el('span', { class: 'bvl-pill open' }, 'Open')),
      el('div', { class: 'bvl-leagues' }, s.leagues),
      s.director ? el('div', { class: 'bvl-who' }, el('strong', null, s.director)) : null,
      (s.date_collected || s.amount) ? el('div', { class: 'bvl-done' },
        'Collected', s.date_collected ? ` ${new Date(s.date_collected + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '',
        s.amount ? el('strong', null, ' ' + money(s.amount)) : '') : null,
      s.notes ? el('div', { class: 'bvl-notes' }, s.notes) : null,
      msg,
      showing ? form(s) : el('button', { type: 'button', class: 'bvl-btn ' + (s.director ? '' : 'bvl-btn-primary') + ' bvl-full',
        onclick: () => { openId = s.id; message = null; render(); const c = document.getElementById('v-' + s.id); if (c) c.querySelector('input').focus(); } },
        s.director ? (isMine(s) ? 'Edit / record collection' : 'Edit') : 'Sign up for this visit'));
  }

  function addForm() {
    const houses = HOUSES_ORDER.map(h => el('option', { value: h }, h));
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => el('option', { value: d }, d));
    const sessions = ['Daytime', 'Afternoon', 'Evening'].map(d => el('option', { value: d }, d));
    const f = el('form', { class: 'bvl-form', novalidate: true },
      el('label', { class: 'bvl-field' }, el('span', null, 'House'), el('select', { name: 'house' }, houses)),
      el('label', { class: 'bvl-field' }, el('span', null, 'Day'), el('select', { name: 'day' }, days)),
      el('label', { class: 'bvl-field' }, el('span', null, 'Session'), el('select', { name: 'session' }, sessions)),
      field('Arrive by', 'arrive', '', { placeholder: 'e.g. 6:30 PM', maxlength: 10 }),
      field('League(s) and start time', 'leagues', '', { placeholder: 'e.g. Tuesday Turkeys (6:30)', maxlength: 160 }),
      el('div', { class: 'bvl-actions' }, el('button', { type: 'submit', class: 'bvl-btn bvl-btn-primary' }, 'Add visit')));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(f).entries());
      const r = await api('slot', values);
      if (!r.ok) { message = { id: 'add', kind: 'error', text: r.data.error || 'Could not add the visit.' }; render(); return; }
      sheet.slots.push(r.data.slot);
      message = { id: r.data.slot.id, kind: 'ok', text: 'Visit added.' };
      house = r.data.slot.house; filter = 'all';
      render();
      const c = document.getElementById('v-' + r.data.slot.id); if (c) c.scrollIntoView({ block: 'center' });
    });
    return el('details', { class: 'bvl-add' },
      el('summary', null, 'Add a visit that isn’t listed'),
      message && message.id === 'add' ? el('p', { class: 'bvl-msg ' + message.kind }, message.text) : null,
      f);
  }

  function render() {
    const scroll = window.scrollY;
    let slots = sheet.slots;
    if (filter === 'open') slots = slots.filter(s => !s.director);
    if (filter === 'mine') slots = slots.filter(isMine);
    if (house) slots = slots.filter(s => s.house === house);
    const groups = HOUSES_ORDER.filter(h => !house || h === house).map(h => {
      const list = slots.filter(s => s.house === h);
      if (!list.length) return null;
      return el('section', { class: 'bvl-house' },
        el('h2', null, h, el('span', null, `${list.filter(s => s.director).length}/${list.length} covered`)),
        list.map(card));
    }).filter(Boolean);
    root.replaceChildren(summary(), chips(),
      ...(groups.length ? groups : [el('p', { class: 'bvl-status' }, filter === 'open' ? 'Every visit here is covered. Thank you!' : 'Nothing to show.')]),
      addForm());
    window.scrollTo(0, scroll);
  }

  load();
})();
