// BVL collection calendar (pages/bvl-calendar.html, served by bvl.js at
// /bvl/<token>/calendar). Read-only: every league visit on the sign-up sheet
// laid out Sunday to Saturday by arrive time, plus a month view of the
// collections directors have recorded. Signing up stays on the sheet; open
// visits link back to their card there. Requests are relative, so they carry
// the page's private token.
(function () {
  'use strict';

  const root = document.getElementById('bvl-root');
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const HOUSES = [];
  let sheet = null;
  let who = '';      // '' = everyone, '-' = open visits, else a director's name
  let house = '';    // '' = every house

  document.getElementById('bvl-print').addEventListener('click', () => window.print());

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

  // "6:30 PM" -> minutes after midnight, so a day's visits sort by arrive time
  function minutes(t) {
    const m = /^(\d{1,2}):?(\d{2})?\s*([AP])/i.exec(t || '');
    if (!m) return 24 * 60;
    return (Number(m[1]) % 12 + (m[3].toUpperCase() === 'P' ? 12 : 0)) * 60 + Number(m[2] || 0);
  }

  // A visit can carry two directors ("First Last  First Last", "A & B")
  function names(s) {
    return (s.director || '').split(/\s{2,}|\s*[,&\/]\s*|\s+and\s+/i).map(n => n.trim()).filter(Boolean);
  }

  function shows(s) {
    if (house && s.house !== house) return false;
    if (who === '-') return !s.director;
    if (who) return names(s).some(n => n.toLowerCase() === who.toLowerCase());
    return true;
  }

  async function load() {
    let data = {}, ok = false;
    try { const res = await fetch('sheet'); ok = res.ok; data = await res.json(); } catch {}
    if (!ok) { root.replaceChildren(el('p', { class: 'bvl-status' }, data.error || 'The calendar could not be loaded.')); return; }
    sheet = data;
    for (const s of sheet.slots) if (!HOUSES.includes(s.house)) HOUSES.push(s.house);
    render();
  }

  function controls() {
    const counts = new Map();
    for (const s of sheet.slots) for (const n of names(s)) counts.set(n, (counts.get(n) || 0) + 1);
    const open = sheet.slots.filter(s => !s.director).length;
    const pick = el('select', { id: 'bvl-who', onchange: e => { who = e.target.value; render(); } },
      el('option', { value: '' }, 'Everyone'),
      el('option', { value: '-' }, `Open visits (${open})`),
      [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([n, c]) => el('option', { value: n }, `${n} (${c})`)));
    pick.value = who;
    const chip = (label, h) => el('button', { type: 'button', class: 'bvl-chip' + (house === h ? ' active' : ''),
      'aria-pressed': house === h ? 'true' : 'false', onclick: () => { house = h; render(); } },
      h ? el('i', { class: 'bvl-dot h' + HOUSES.indexOf(h) }) : null, label);
    return el('div', { class: 'bvl-filters bvl-cal-filters' },
      el('label', { class: 'bvl-field bvl-cal-who' }, el('span', null, 'Show'), pick),
      el('div', { class: 'bvl-chips' }, chip('Every house', ''), HOUSES.map(h => chip(h, h))));
  }

  function visit(s) {
    const done = s.date_collected || s.amount;
    return el('article', { class: 'bvl-cal-visit h' + HOUSES.indexOf(s.house) + (s.director ? '' : ' open') },
      el('div', { class: 'bvl-cal-time' }, s.arrive || '—', el('span', null, s.house)),
      el('div', { class: 'bvl-cal-leagues' }, s.leagues),
      s.director
        ? el('div', { class: 'bvl-cal-who-name' }, s.director)
        : el('a', { class: 'bvl-cal-open', href: './#v-' + s.id }, 'Open: sign up'),
      done ? el('div', { class: 'bvl-cal-done' }, '✓ Collected',
        s.date_collected ? ' ' + new Date(s.date_collected + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
        s.amount ? ' · ' + money(s.amount) : '') : null);
  }

  function week(slots) {
    const today = new Date().getDay();
    return el('div', { class: 'bvl-week' }, DAYS.map((d, i) => {
      const list = slots.filter(s => s.day === d).sort((a, b) => minutes(a.arrive) - minutes(b.arrive));
      return el('section', { class: 'bvl-day' + (i === today ? ' today' : '') + (list.length ? '' : ' empty') },
        el('h2', null, d, el('span', null, list.length ? `${list.length} visit${list.length > 1 ? 's' : ''}` : 'No visits')),
        list.map(visit));
    }));
  }

  // Month grids for the visits that have a collection date recorded
  function collections(slots) {
    const done = slots.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date_collected || ''))
      .sort((a, b) => a.date_collected.localeCompare(b.date_collected));
    const head = el('h2', { class: 'bvl-cal-h' }, 'Collections recorded');
    if (!done.length) return el('section', { class: 'bvl-months' }, head,
      el('p', { class: 'bvl-status' }, 'Collection dates show up here as directors record them on the sign-up sheet.'));
    const months = [...new Set(done.map(s => s.date_collected.slice(0, 7)))];
    const total = done.reduce((t, s) => t + (Number(s.amount) || 0), 0);
    return el('section', { class: 'bvl-months' }, head,
      el('p', { class: 'bvl-cal-total' }, `${done.length} visit${done.length > 1 ? 's' : ''} collected · `, el('strong', null, money(total))),
      months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        const first = new Date(y, m - 1, 1);
        const days = new Date(y, m, 0).getDate();
        const cells = [];
        for (let i = 0; i < first.getDay(); i++) cells.push(el('div', { class: 'bvl-mday blank' }));
        for (let d = 1; d <= days; d++) {
          const date = `${ym}-${String(d).padStart(2, '0')}`;
          const hits = done.filter(s => s.date_collected === date);
          cells.push(el('div', { class: 'bvl-mday' + (hits.length ? ' hit' : '') },
            el('b', null, d),
            hits.map(s => el('div', { class: 'bvl-mvisit h' + HOUSES.indexOf(s.house) },
              `${s.house}: ${s.leagues}`, s.amount ? el('strong', null, ' ' + money(s.amount)) : ''))));
        }
        return el('div', { class: 'bvl-month' },
          el('h3', null, first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
          el('div', { class: 'bvl-mgrid' }, DAYS.map(d => el('div', { class: 'bvl-mhead' }, d.slice(0, 3))), cells));
      }));
  }

  function render() {
    const slots = sheet.slots.filter(shows);
    const covered = slots.filter(s => s.director).length;
    const label = who === '-' ? 'open visits' : who ? `visits for ${who}` : 'visits';
    root.replaceChildren(
      controls(),
      el('p', { class: 'bvl-cal-count' }, `${slots.length} ${label}${house ? ' at ' + house : ''}`,
        who === '-' ? '' : ` · ${covered} covered, ${slots.length - covered} open`),
      el('div', { class: 'bvl-legend' }, HOUSES.map((h, i) => el('span', null, el('i', { class: 'bvl-dot h' + i }), h))),
      week(slots),
      collections(slots));
  }

  load();
})();
