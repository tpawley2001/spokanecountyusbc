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
  let calId = null;        // card whose add-to-calendar panel is showing
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

  // A visit can carry two directors ("First Last  First Last", "A & B"); same split as the calendar
  function names(director) {
    return (director || '').split(/\s{2,}|\s*[,&\/]\s*|\s+and\s+/i).map(n => n.trim()).filter(Boolean);
  }

  function isMine(s) {
    const name = (me.get().director || '').trim().toLowerCase();
    return !!name && names(s.director).some(n => n.toLowerCase() === name);
  }

  // Everyone signed up for anything, for the "My sign-ups" name picker
  function directors() {
    const seen = new Map();
    for (const s of sheet.slots) for (const n of names(s.director)) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  // ── Add to calendar ──
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // The next date (today counts) that falls on the visit's weekday
  function nextDate(day) {
    const d = new Date();
    d.setDate(d.getDate() + (DAYS.indexOf(day) - d.getDay() + 7) % 7);
    return ymd(d);
  }

  // "6:30 PM" -> [18, 30]
  function clock(t) {
    const m = /^(\d{1,2}):?(\d{2})?\s*([AP])/i.exec(t || '');
    return m ? [Number(m[1]) % 12 + (m[3].toUpperCase() === 'P' ? 12 : 0), Number(m[2] || 0)] : [18, 0];
  }

  // Google Calendar's new-event page (opens the app or signed-in web on Android)
  function googleUrl(s, date) {
    const [h, m] = clock(s.arrive);
    const at = (hh) => date.replace(/-/g, '') + 'T' + String(hh).padStart(2, '0') + String(m).padStart(2, '0') + '00';
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: `BVL collection – ${s.house}`,
      dates: `${at(h)}/${at(h + 1)}`,
      ctz: 'America/Los_Angeles',
      location: (sheet.places || {})[s.house] || `${s.house}, Spokane, WA`,
      details: `${s.day} ${s.session.toLowerCase()}: ${s.leagues}\nArrive by ${s.arrive || '—'}.\nAfter the visit, record the date and amount on the sign-up sheet:\n${location.origin}${location.pathname}`,
    });
    return 'https://calendar.google.com/calendar/render?' + q;
  }

  // The site serves the .ics; iPhone Safari opens it straight into Calendar
  const icsUrl = (s, date) => `visit/${encodeURIComponent(s.id)}/calendar.ics?date=${date}`;

  function calendarPanel(s) {
    const date = el('input', { type: 'date', name: 'cal_date', value: nextDate(s.day) });
    const google = el('a', { class: 'bvl-btn bvl-cal-btn', target: '_blank', rel: 'noopener' }, 'Google Calendar', el('small', null, 'Android'));
    const apple = el('a', { class: 'bvl-btn bvl-cal-btn' }, 'Apple Calendar', el('small', null, 'iPhone · Outlook'));
    const update = () => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(date.value) ? date.value : nextDate(s.day);
      google.href = googleUrl(s, d);
      apple.href = icsUrl(s, d);
    };
    date.addEventListener('change', update);
    update();
    return el('div', { class: 'bvl-calpanel' },
      el('label', { class: 'bvl-field' }, el('span', null, `Which ${s.day} are you going?`), date),
      el('div', { class: 'bvl-actions' }, google, apple),
      el('button', { type: 'button', class: 'bvl-link-btn bvl-muted', onclick: () => { calId = null; render(); } }, 'Close'));
  }

  // "My sign-ups": pick your name once, then see every visit you're on across houses
  function minePanel() {
    const name = me.get().director || '';
    const known = directors();
    const pick = el('select', { name: 'me', 'aria-label': 'Your name' },
      el('option', { value: '' }, 'Pick your name…'),
      known.map(n => el('option', { value: n, selected: n.toLowerCase() === name.toLowerCase() }, n)));
    pick.addEventListener('change', () => { me.set({ director: pick.value }); render(); });
    const mine = name ? sheet.slots.filter(isMine) : [];
    const upcoming = mine.filter(s => !s.date_collected);
    return el('div', { class: 'bvl-mine' },
      el('div', { class: 'bvl-mine-top' },
        el('h2', null, 'My sign-ups'),
        el('button', { type: 'button', class: 'bvl-link-btn bvl-muted', onclick: () => { filter = 'all'; render(); } }, 'Show every visit')),
      el('label', { class: 'bvl-field' }, el('span', null, 'Your name'), pick),
      !name ? el('p', { class: 'bvl-mine-note' }, 'Pick your name to see every visit you’re signed up for.')
        : !mine.length ? el('p', { class: 'bvl-mine-note' }, `${name} isn’t signed up for any visits yet.`)
        : el('p', { class: 'bvl-mine-note' }, el('strong', null, `${mine.length} visit${mine.length === 1 ? '' : 's'}`),
          upcoming.length < mine.length ? ` · ${mine.length - upcoming.length} already collected` : ''),
      upcoming.length ? el('a', { class: 'bvl-btn bvl-btn-primary bvl-full bvl-cal-all', href: 'mine/calendar.ics?name=' + encodeURIComponent(name) },
        `📅 Add all ${upcoming.length} to my calendar`) : null,
      upcoming.length ? el('p', { class: 'bvl-mine-hint' }, 'Each goes on its next date; move any in your calendar. On Android with Google Calendar, use “Add to my calendar” on each visit below.') : null);
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
        chip('My sign-ups', filter === 'mine', () => { filter = 'mine'; render(); })),
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
      s.director && !showing ? (calId === s.id ? calendarPanel(s)
        : el('button', { type: 'button', class: 'bvl-btn bvl-full bvl-cal-add', onclick: () => { calId = s.id; render(); } }, '📅 Add to my calendar')) : null,
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
    const empty = filter === 'open' ? 'Every visit here is covered. Thank you!' : filter === 'mine' ? null : 'Nothing to show.';
    root.replaceChildren(...[summary(), chips(), filter === 'mine' ? minePanel() : null,
      ...(groups.length ? groups : empty ? [el('p', { class: 'bvl-status' }, empty)] : []),
      addForm()].filter(Boolean));
    window.scrollTo(0, scroll);
  }

  document.getElementById('bvl-mine-link').addEventListener('click', () => {
    if (!sheet) return;
    filter = 'mine'; house = ''; openId = null; calId = null; message = null;
    render();
    root.scrollIntoView();
  });

  load();
})();
