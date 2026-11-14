// Board desk (mockup): direct entries, score entry, lanes, rules.
(function () {
  'use strict';
  const { h } = TM;
  let s = TM.load();
  const $ = id => document.getElementById(id);
  const ui = { tab: 'entries', filter: 'all', q: '', squad: 'D1', sev: 'singles', lsquad: 'D1' };
  const checkedIn = new Set(); // demo-only, not saved
  const SRC = { online: ['Online form', 'badge-blue'], paper: ['Paper form', 'badge-gold'], board: ['Board', 'badge-green'] };

  function toast(msg) {
    const t = $('bd-toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1800);
  }
  function commit(msg) { TM.save(s); if (msg) toast(msg); }
  const evName = id => (s.tournament.events.find(e => e.id === id) || {}).name;

  // ---------- tabs ----------
  $('bd-tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ui.tab = b.dataset.tab;
    $('bd-tabs').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelectorAll('.bd-panel').forEach(p => p.classList.toggle('on', p.id === 'p-' + ui.tab));
    render();
  });

  // ---------- entries ----------
  function formEvent() { return s.tournament.events.find(e => e.id === $('f-ev').value); }
  function buildForm() {
    const t = s.tournament;
    $('bd-name').textContent = t.name + ' — Board Desk';
    $('bd-sub').textContent = t.dates + ' · ' + t.center;
    $('f-ev').replaceChildren(...t.events.map(e => h('option', { value: e.id, selected: e.id === 'singles' }, e.name + (e.size > 1 ? ' (' + e.size + ' bowlers)' : ''))));
    onEventChange();
  }
  function onEventChange() {
    const ev = formEvent();
    $('f-team-wrap').style.display = ev.id === 'team' ? '' : 'none';
    $('f-bowlers').replaceChildren(...Array.from({ length: ev.size }, (_, i) => bowlerBox(i)));
    $('f-squad').replaceChildren(...s.tournament.squads.filter(q => q.events.includes(ev.id)).map(q => h('option', { value: q.id }, q.label)));
    fee();
  }
  function bowlerBox(i) {
    const msg = h('div', { class: 'bd-mini' });
    const usbc = h('input', { placeholder: 'USBC # (e.g. 9001-10449)', 'data-k': 'usbc' });
    const name = h('input', { placeholder: 'First Last', 'data-k': 'name' });
    const avg = h('input', { type: 'number', min: 0, max: 300, placeholder: 'Avg', 'data-k': 'avg' });
    const look = h('button', { type: 'button', class: 'bd-btn small', onclick: () => lookup(usbc, name, avg, msg) }, 'Look up');
    return h('div', { class: 'bd-bowler' }, h('div', { class: 'bd-bowler-h' }, 'Bowler ' + (i + 1)),
      h('div', { class: 'bd-row three' }, usbc, avg, look), h('div', { class: 'bd-row', style: 'grid-template-columns:1fr' }, name), msg);
  }
  // Real system: bowl.com Find-a-Member by USBC # (already built for the TB sync) gives name + entering average.
  function lookup(usbc, name, avg, msg) {
    const n = usbc.value.trim();
    if (!/^\d{3,5}-\d{3,7}$/.test(n)) { msg.className = 'bd-mini warn'; msg.textContent = 'USBC numbers look like 1234-56789.'; return; }
    const known = s.bowlers.find(b => b.usbc === n);
    if (known) {
      name.value = known.name; avg.value = known.avg;
      msg.className = 'bd-mini ok'; msg.textContent = 'Already in this tournament: ' + known.name + ', avg ' + known.avg + '.';
      return;
    }
    const digits = n.replace(/\D/g, '');
    const fake = 150 + (parseInt(digits.slice(-3), 10) % 70);
    avg.value = fake;
    msg.className = 'bd-mini ok';
    msg.textContent = 'bowl.com (demo): 2025-26 book average ' + fake + ' over ' + (21 + digits.length * 6) + ' games. Name check: type it as the card shows.';
  }
  function fee() {
    const ev = formEvent(); const f = s.tournament.fees;
    const total = ev.size * f[ev.id] + ($('f-ae').checked ? ev.size * f.ae : 0);
    $('f-fee').textContent = 'Fee: $' + total + ' (' + ev.size + ' × $' + f[ev.id] + ($('f-ae').checked ? ' + all-events $' + f.ae + ' each' : '') + ')';
  }
  $('f-ev').addEventListener('change', onEventChange);
  $('f-ae').addEventListener('change', fee);
  $('bd-form').addEventListener('submit', e => {
    e.preventDefault();
    const ev = formEvent();
    const msg = $('f-msg');
    const boxes = [...$('f-bowlers').children].map(b => ({
      usbc: b.querySelector('[data-k=usbc]').value.trim(), name: b.querySelector('[data-k=name]').value.trim(),
      avg: parseInt(b.querySelector('[data-k=avg]').value, 10)
    }));
    const bad = boxes.findIndex(b => !b.name || !(b.avg >= 0 && b.avg <= 300));
    if (bad >= 0) { msg.className = 'bd-mini warn'; msg.textContent = 'Bowler ' + (bad + 1) + ' needs a name and an average.'; return; }
    if (ev.id === 'team' && !$('f-team').value.trim()) { msg.className = 'bd-mini warn'; msg.textContent = 'Give the team a name.'; return; }
    const members = boxes.map(b => {
      let found = b.usbc && s.bowlers.find(x => x.usbc === b.usbc);
      if (!found) { found = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: b.name, usbc: b.usbc, avg: b.avg, ae: false }; s.bowlers.push(found); }
      if ($('f-ae').checked) found.ae = true;
      return found.id;
    });
    const dupe = s.entries.find(x => x.ev === ev.id && members.every(m => x.members.includes(m)) && x.members.length === members.length);
    if (dupe) { msg.className = 'bd-mini warn'; msg.textContent = 'That ' + ev.name.toLowerCase() + ' entry already exists (' + TM.entryName(s, dupe) + ').'; return; }
    const squadEntries = s.entries.filter(x => x.squad === $('f-squad').value && x.ev === ev.id);
    s.entries.push({ id: 'e' + Date.now().toString(36), ev: ev.id, squad: $('f-squad').value, lane: '', name: $('f-team').value.trim(),
      members, paid: $('f-paid').checked, src: 'board' });
    commit('Entry added');
    msg.className = 'bd-mini ok';
    msg.textContent = 'Added. ' + (squadEntries.length + 1) + ' ' + ev.name.toLowerCase() + ' entries in that squad now.';
    $('bd-form').reset(); onEventChange(); renderEntries();
  });

  function renderEntries() {
    const opts = [['all', 'All']].concat(s.tournament.events.map(e => [e.id, e.name]));
    $('e-filter').replaceChildren(...opts.map(([id, n]) => h('button', { type: 'button', 'aria-pressed': String(ui.filter === id),
      onclick: () => { ui.filter = id; renderEntries(); } }, n)));
    const q = ui.q.toLowerCase();
    const list = s.entries.filter(e => (ui.filter === 'all' || e.ev === ui.filter) && (!q || TM.entryName(s, e).toLowerCase().includes(q) ||
      e.members.some(m => TM.bowler(s, m).usbc.includes(q))));
    const f = s.tournament.fees;
    const owed = s.entries.reduce((a, e) => a + e.members.length * f[e.ev], 0) + s.bowlers.filter(b => b.ae).length * f.ae;
    const paid = s.entries.filter(e => e.paid).reduce((a, e) => a + e.members.length * f[e.ev], 0);
    $('e-totals').replaceChildren(
      h('span', null, h('b', null, s.entries.length), ' entries'),
      h('span', null, h('b', null, s.bowlers.length), ' bowlers'),
      h('span', null, h('b', null, s.entries.filter(e => !e.paid).length), ' unpaid'),
      h('span', null, 'Fees ', h('b', null, '$' + paid), ' of $' + owed + ' collected (events)'));
    $('e-body').replaceChildren(...list.slice().reverse().map(e => h('tr', null,
      h('td', null, h('strong', null, TM.entryName(s, e)), h('span', { class: 'tm-mem' }, e.members.map(m => {
        const b = TM.bowler(s, m); return b.usbc + ' · ' + b.avg;
      }).join(' / '))),
      h('td', null, evName(e.ev)),
      h('td', { class: 'hide-sm' }, TM.squad(s, e.squad).label + (e.lane ? ' · L' + e.lane : '')),
      h('td', null, h('span', { class: 'badge ' + SRC[e.src][1] }, SRC[e.src][0])),
      h('td', null, h('input', { type: 'checkbox', checked: e.paid, 'aria-label': 'Paid', onchange: ev => { e.paid = ev.target.checked; commit(e.paid ? 'Marked paid' : 'Marked unpaid'); renderEntries(); } })),
      h('td', null, h('button', { type: 'button', class: 'bd-btn small', onclick: () => {
        if (!confirm('Withdraw ' + TM.entryName(s, e) + ' from ' + evName(e.ev) + '? Their scores are removed too.')) return;
        s.entries = s.entries.filter(x => x !== e);
        Object.keys(s.scores).forEach(k => { if (k.split(':')[1] === e.id) delete s.scores[k]; });
        commit('Entry withdrawn'); renderEntries();
      } }, 'Withdraw')))));
  }
  $('e-search').addEventListener('input', e => { ui.q = e.target.value.trim(); renderEntries(); });

  // ---------- scores ----------
  function renderScores() {
    const t = s.tournament;
    $('s-squad').replaceChildren(...t.squads.map(q => h('option', { value: q.id, selected: q.id === ui.squad }, q.label + ' — ' + TM.squadState(s, q.id))));
    const sq = TM.squad(s, ui.squad);
    if (!sq.events.includes(ui.sev)) ui.sev = sq.events[0];
    $('s-ev').replaceChildren(...sq.events.map(id => h('button', { type: 'button', 'aria-pressed': String(id === ui.sev),
      onclick: () => { ui.sev = id; renderScores(); } }, evName(id))));
    const fin = !!s.final[ui.squad];
    $('s-final').textContent = fin ? 'Reopen squad' : 'Mark squad final';
    const entries = s.entries.filter(e => e.squad === ui.squad && e.ev === ui.sev);
    const lanes = new Map();
    entries.forEach(e => { const k = e.lane || '?'; if (!lanes.has(k)) lanes.set(k, []); lanes.get(k).push(e); });
    const order = [...lanes.keys()].sort((a, b) => (parseInt(a, 10) || 999) - (parseInt(b, 10) || 999));
    $('s-lanes').replaceChildren(...order.map(k => h('div', { class: 'bd-lane' },
      h('div', { class: 'bd-lane-h' }, h('span', null, k === '?' ? 'No lane yet' : 'Lane ' + k), h('span', null, lanes.get(k).length + ' entr' + (lanes.get(k).length === 1 ? 'y' : 'ies'))),
      ...lanes.get(k).map(e => scoreEntry(e, fin)))));
    if (!entries.length) $('s-lanes').replaceChildren(h('p', { class: 'tm-note' }, 'No entries in this squad for this event.'));
  }
  function scoreEntry(e, fin) {
    const line = TM.entryLine(s, e);
    const wrap = h('div', { class: 'bd-entry' }, e.members.length > 1 ? h('div', { class: 'bd-entry-name' }, TM.entryName(s, e)) : null,
      h('div', { class: 'bd-score hd' }, h('span'), h('span', null, 'G1'), h('span', null, 'G2'), h('span', null, 'G3'), h('span', null, 'Total')));
    line.members.forEach(m => {
      const tot = h('span', { class: 't' }, m.n ? m.scratch + m.h * m.n : '–');
      const inputs = [0, 1, 2].map(i => h('input', { inputmode: 'numeric', value: m.gs[i] == null ? '' : m.gs[i], disabled: fin, 'aria-label': m.b.name + ' game ' + (i + 1),
        onchange: ev => setScore(e, m.b, i, ev.target, tot) }));
      wrap.append(h('div', { class: 'bd-score' }, h('span', { class: 'nm' }, m.b.name, h('small', null, 'avg ' + m.b.avg + ' · hdcp ' + m.h)), ...inputs, tot));
    });
    return wrap;
  }
  function setScore(e, b, i, input, tot) {
    const raw = input.value.trim();
    const v = raw === '' ? null : Number(raw);
    if (v != null && !(Number.isInteger(v) && v >= 0 && v <= 300)) { input.classList.add('bad'); toast('Scores are 0 to 300'); return; }
    input.classList.remove('bad');
    const k = e.ev + ':' + e.id + ':' + b.id;
    const gs = (s.scores[k] || [null, null, null]).slice();
    gs[i] = v; s.scores[k] = gs;
    commit(raw === '' ? 'Score cleared' : b.name.split(' ')[0] + ' G' + (i + 1) + ': ' + v + ' saved');
    input.classList.add('saved');
    const n = gs.filter(x => x != null).length;
    const hc = TM.hdcp(b.avg, s.tournament.hdcp);
    tot.textContent = n ? gs.reduce((a, x) => a + (x || 0), 0) + hc * n : '–';
  }
  $('s-squad').addEventListener('change', e => { ui.squad = e.target.value; renderScores(); });
  $('s-final').addEventListener('click', () => {
    if (s.final[ui.squad]) delete s.final[ui.squad]; else s.final[ui.squad] = true;
    commit(s.final[ui.squad] ? 'Squad marked final — scores locked' : 'Squad reopened'); renderScores();
  });

  // ---------- lanes ----------
  function renderLanes() {
    $('l-squad').replaceChildren(...s.tournament.squads.map(q => h('option', { value: q.id, selected: q.id === ui.lsquad }, q.label)));
    const list = s.entries.filter(e => e.squad === ui.lsquad).sort((a, b) => (parseInt(a.lane, 10) || 999) - (parseInt(b.lane, 10) || 999) || a.ev.localeCompare(b.ev));
    $('l-body').replaceChildren(...list.map(e => h('tr', null,
      h('td', null, h('input', { class: 'bd-lane-input', value: e.lane, maxlength: 8, 'aria-label': 'Lane', onchange: ev => { e.lane = ev.target.value.trim(); commit('Lane saved'); } })),
      h('td', null, h('strong', null, TM.entryName(s, e))), h('td', null, evName(e.ev)),
      h('td', null, h('input', { type: 'checkbox', checked: checkedIn.has(e.id), 'aria-label': 'Checked in', onchange: ev => { ev.target.checked ? checkedIn.add(e.id) : checkedIn.delete(e.id); } })),
      h('td', null, e.paid ? h('span', { class: 'badge badge-green' }, 'Paid') : h('span', { class: 'badge badge-red' }, 'Owes')))));
  }
  $('l-squad').addEventListener('change', e => { ui.lsquad = e.target.value; renderLanes(); });
  $('l-auto').addEventListener('click', () => {
    const sq = TM.squad(s, ui.lsquad);
    sq.events.forEach(ev => {
      const perLane = ev === 'team' ? 1 : 2;
      const list = s.entries.filter(e => e.squad === ui.lsquad && e.ev === (sq.events[0]));
      if (ev !== sq.events[0]) return; // later events in the squad follow the first event's lanes
      list.forEach((e, i) => { e.lane = String(ev === 'team' ? 1 + i * 2 : 1 + Math.floor(i / perLane)); });
      s.entries.filter(e => e.squad === ui.lsquad && e.ev !== ev).forEach(e => {
        const lead = list.find(x => e.members.some(m => x.members.includes(m)));
        if (lead) e.lane = lead.lane;
      });
    });
    commit('Lanes assigned'); renderLanes();
  });
  $('l-print').addEventListener('click', () => window.print());

  // ---------- house scores ----------
  // Match a house row to a bowler: same squad + lane, then same last name and first initial.
  function matchRow(b, r) {
    if (r.pick) return r.pick;
    const [first, ...rest] = r.name.trim().split(/\s+/);
    const last = rest.join(' ').toLowerCase();
    const hits = [];
    s.entries.filter(e => e.squad === b.squad && e.ev === b.ev && e.lane === r.lane).forEach(e => e.members.forEach(m => {
      const bw = TM.bowler(s, m);
      const [bf, ...bl] = bw.name.split(' ');
      if (bl.join(' ').toLowerCase() === last && bf[0].toLowerCase() === first[0].toLowerCase()) hits.push(e.id + '|' + m);
    }));
    return hits.length === 1 ? hits[0] : null;
  }
  function renderHouse() {
    const pending = (s.houseBatches || []).filter(b => b.status === 'pending').length;
    $('house-count').textContent = pending || '';
    if (ui.tab !== 'house') return;
    const list = s.houseBatches || [];
    if (!list.length) { $('h-list').replaceChildren(h('p', { class: 'tm-note' }, 'Nothing from the houses yet.')); return; }
    $('h-list').replaceChildren(...list.map(b => {
      b.squad = b.squad || 'D2'; b.ev = b.ev || 'doubles';
      const rows = b.rows.map(r => ({ r, hit: matchRow(b, r) }));
      // Two rows pointing at the same bowler + game is a conflict: post neither until it's fixed.
      const seen = {};
      rows.forEach(x => { if (x.hit) { const k = x.hit + '|' + x.r.game; seen[k] = (seen[k] || 0) + 1; } });
      rows.forEach(x => { if (x.hit && seen[x.hit + '|' + x.r.game] > 1) { x.conflict = true; x.hit = null; } });
      const ok = rows.filter(x => x.hit).length;
      const laneOptions = r => {
        const opts = [];
        s.entries.filter(e => e.squad === b.squad && e.ev === b.ev).forEach(e => e.members.forEach(m =>
          opts.push([e.id + '|' + m, 'Lane ' + e.lane + ' — ' + TM.bowler(s, m).name])));
        return h('select', { class: 'hb-pick', 'aria-label': 'Pick the bowler for ' + r.name, onchange: ev => { r.pick = ev.target.value || null; commit(); renderHouse(); } },
          h('option', { value: '' }, 'Pick the bowler…'), ...opts.map(([v, l]) => h('option', { value: v, selected: r.pick === v }, l)));
      };
      const body = rows.map(({ r, hit, conflict }) => {
        let note = '';
        if (hit) {
          const [eid, mid] = hit.split('|');
          const cur = (s.scores[b.ev + ':' + eid + ':' + mid] || [])[r.game - 1];
          if (cur != null && cur !== r.score) note = 'Board already typed ' + cur + ' — keeps ' + cur;
          else if (cur === r.score) note = 'Already posted';
        }
        const done = b.status === 'posted';
        return h('tr', { class: done ? 'hb-done' : hit ? '' : 'hb-bad' },
          h('td', null, r.lane), h('td', null, r.name), h('td', { class: 'num' }, 'G' + r.game), h('td', { class: 'num' }, h('strong', null, r.score)),
          h('td', null, hit ? h('span', { class: 'badge badge-green' }, '✓ ' + TM.bowler(s, hit.split('|')[1]).name) :
            done ? 'skipped' : h('span', null, h('span', { class: 'badge badge-red' }, conflict ? 'Two rows → same bowler' : 'No match'), ' ', laneOptions(r))),
          h('td', { class: 'hb-meta' }, note));
      });
      const post = h('button', { type: 'button', class: 'bd-btn primary', disabled: b.status !== 'pending' || !ok, onclick: () => {
        let n = 0;
        rows.forEach(({ r, hit }) => {
          if (!hit) return;
          const [eid, mid] = hit.split('|');
          const k = b.ev + ':' + eid + ':' + mid;
          const gs = (s.scores[k] || [null, null, null]).slice();
          if (gs[r.game - 1] == null) { gs[r.game - 1] = r.score; s.scores[k] = gs; n++; }
        });
        b.status = 'posted'; b.posted = n;
        commit(n + ' games posted to the live results'); renderHouse();
      } }, b.status === 'posted' ? 'Posted ' + b.posted + ' games' : 'Post ' + ok + ' matched games');
      return h('div', { class: 'bd-card', style: 'margin-bottom:1rem' },
        h('div', { class: 'hb-head' }, h('div', null, h('h3', null, b.house + ' — ' + b.subject),
          h('div', { class: 'hb-meta' }, (b.via === 'email' ? '📧 Email from ' : '💻 Sender program at ') + b.from + ' · ' + b.file + ' · received ' + b.received + ' · ' +
            TM.squad(s, b.squad).label + ' ' + evName(b.ev))), post),
        h('div', { class: 'bd-totals' }, h('span', null, h('b', null, ok), ' matched'), h('span', null, h('b', null, rows.length - ok), ' need a pick')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tm-table' },
          h('thead', null, h('tr', null, h('th', null, 'Lane'), h('th', null, 'Name in file'), h('th', { class: 'num' }, 'Game'), h('th', { class: 'num' }, 'Score'), h('th', null, 'Matched to'), h('th', null, ''))),
          h('tbody', null, ...body))));
    }));
  }

  // ---------- settings ----------
  const SET = { 'c-base': ['hdcp', 'base'], 'c-pct': ['hdcp', 'pct'], 'c-max': ['hdcp', 'max'], 'c-ratio': [null, 'prizeRatio'], 'c-aeratio': [null, 'aeRatio'] };
  function renderSettings() {
    const t = s.tournament;
    for (const id in SET) { const [a, k] = SET[id]; $(id).value = a ? t[a][k] : t[k]; }
    $('c-name').value = t.name; $('c-center').value = t.center; $('c-dates').value = t.dates; $('c-award').value = t.award || 'cash';
    $('c-events').replaceChildren(...t.events.map(e => h('tr', null, h('td', null, h('strong', null, e.name)), h('td', null, e.size), h('td', null, e.games),
      h('td', null, h('input', { class: 'bd-lane-input', type: 'number', min: 0, value: t.fees[e.id], 'aria-label': e.name + ' fee',
        onchange: ev => { t.fees[e.id] = +ev.target.value || 0; commit('Fee saved'); } })))),
      h('tr', null, h('td', null, h('strong', null, 'All-Events')), h('td', null, 'optional add-on'), h('td', null, t.events.length * 3),
        h('td', null, h('input', { class: 'bd-lane-input', type: 'number', min: 0, value: t.fees.ae, 'aria-label': 'All-events fee',
          onchange: ev => { t.fees.ae = +ev.target.value || 0; commit('Fee saved'); } }))));
    $('c-squads').replaceChildren(...t.squads.map(q => h('tr', null, h('td', null, q.label),
      h('td', null, q.events.map(evName).join(' + ')), h('td', null, TM.squadState(s, q.id)))));
  }
  [['c-name', 'name'], ['c-center', 'center'], ['c-dates', 'dates'], ['c-award', 'award']].forEach(([id, k]) =>
    $(id).addEventListener('change', e => { s.tournament[k] = e.target.value.trim(); commit('Saved'); buildForm(); }));
  Object.keys(SET).forEach(id => $(id).addEventListener('change', e => {
    const v = parseInt(e.target.value, 10); if (!Number.isFinite(v)) return;
    const [a, k] = SET[id]; if (a) s.tournament[a][k] = v; else s.tournament[k] = v;
    commit('Rules saved — standings re-figured');
  }));

  $('bd-reset').addEventListener('click', () => { if (confirm('Put the sample data back the way it started?')) { s = TM.reset(); TM.save(s); buildForm(); render(); toast('Sample data reset'); } });
  window.addEventListener('storage', e => { if (e.key === TM.KEY) { s = TM.load(); if (ui.tab !== 'scores') render(); } });

  function render() {
    if (ui.tab === 'entries') renderEntries();
    if (ui.tab === 'scores') renderScores();
    if (ui.tab === 'lanes') renderLanes();
    if (ui.tab === 'settings') renderSettings();
    renderHouse();
  }
  buildForm(); render();
})();
