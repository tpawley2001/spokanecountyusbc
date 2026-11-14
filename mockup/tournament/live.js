// Public live-results page (mockup). The real page would poll /api/t/<slug>/state?since=<rev>
// every few seconds, like the check-in desk does; here it listens for localStorage changes.
(function () {
  'use strict';
  const { h } = TM;
  let s = TM.load();
  const ui = { ev: 'team', div: 'hdcp', squad: '', q: '', open: new Set() };
  let lastTotals = new Map();
  const $ = id => document.getElementById(id);

  function chip(done, games, started) {
    if (!started) return h('span', { class: 'tm-chip wait' }, 'Not started');
    if (done >= games) return h('span', { class: 'tm-chip final' }, 'Final');
    return h('span', { class: 'tm-chip thru' }, 'Thru ' + done);
  }
  const cell = (v, cls) => h('td', { class: 'num ' + (cls || '') }, v == null ? h('span', { class: 'tm-dim' }, '–') : v);

  function header() {
    const t = s.tournament;
    $('tm-name').textContent = t.name;
    $('tm-sub').textContent = t.dates + ' · ' + t.center + ' · Handicap ' + t.hdcp.pct + '% of ' + t.hdcp.base +
      (t.hdcp.max ? ' (max ' + t.hdcp.max + ')' : '');
    const anyLive = t.squads.some(q => TM.squadState(s, q.id) === 'live');
    $('tm-live').replaceChildren(anyLive ? h('span', { class: 'tm-live' }, 'LIVE') : h('span', { class: 'tm-chip final' }, 'No squad bowling right now'));
    $('tm-updated').textContent = 'Updated ' + new Date(s.updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    $('tm-squads').replaceChildren(...t.squads.map(q => {
      const st = TM.squadState(s, q.id);
      const evs = q.events.map(e => t.events.find(x => x.id === e).name).join(' + ');
      return h('div', { class: 'tm-squad' }, h('strong', null, q.label), evs + ' ',
        h('span', { class: 'tm-state ' + st }, st === 'live' ? '● bowling now' : st));
    }));
    const evTabs = t.events.map(e => [e.id, e.name]).concat([['ae', 'All-Events']]);
    $('tm-events').replaceChildren(...evTabs.map(([id, name]) =>
      h('button', { type: 'button', class: 'tm-tab', 'aria-pressed': String(ui.ev === id), onclick: () => { ui.ev = id; ui.open.clear(); lastTotals = new Map(); render(); } }, name)));
    const sel = $('tm-squad-filter');
    const opts = [['', 'All squads']].concat(t.squads.filter(q => ui.ev === 'ae' || q.events.includes(ui.ev)).map(q => [q.id, q.label]));
    if (!opts.some(o => o[0] === ui.squad)) ui.squad = '';
    sel.replaceChildren(...opts.map(([v, l]) => h('option', { value: v, selected: v === ui.squad }, l)));
    sel.disabled = ui.ev === 'ae';
  }

  function matches(names) {
    if (!ui.q) return true;
    const q = ui.q.toLowerCase();
    return names.some(n => n.toLowerCase().includes(q));
  }

  function renderEvent() {
    const ev = s.tournament.events.find(e => e.id === ui.ev);
    const { lines, cash } = TM.standings(s, ui.ev, ui.div);
    $('tm-note').textContent = lines.length + ' ' + ev.name.toLowerCase() + ' entries · prize ratio 1 in ' +
      s.tournament.prizeRatio + ' → top ' + cash + ' cash' + (ui.div === 'scratch' ? ' · scratch view (no handicap)' : '');
    $('tm-thead').replaceChildren(h('tr', null, h('th', null, 'Pl'), h('th', null, ev.size > 1 ? (ev.id === 'team' ? 'Team' : 'Pair') : 'Bowler'),
      h('th', { class: 'num hide-sm' }, 'G1'), h('th', { class: 'num hide-sm' }, 'G2'), h('th', { class: 'num hide-sm' }, 'G3'),
      h('th', { class: 'num' }, 'Scratch'), ui.div === 'hdcp' ? h('th', { class: 'num hide-sm' }, 'Hdcp') : null,
      ui.div === 'hdcp' ? h('th', { class: 'num' }, 'Total') : null, h('th', null, 'Status')));
    const rows = [];
    const totals = new Map();
    let cashDrawn = false;
    const cols = ui.div === 'hdcp' ? 9 : 7;
    lines.forEach(l => {
      totals.set(l.e.id, l.scratch);
      if (ui.squad && l.e.squad !== ui.squad) return;
      const names = l.members.map(m => m.b.name).concat(l.e.name || []);
      if (!matches(names)) return;
      const cashing = l.place != null && l.place <= cash;
      if (!cashing && !cashDrawn && !ui.q && !ui.squad && rows.length) {
        rows.push(h('tr', { class: 'cashline' }, h('td', { colspan: cols }, '▲ in the money (top ' + cash + ')')));
        cashDrawn = true;
      }
      const sq = TM.squad(s, l.e.squad);
      const nameCell = h('td', null, h('strong', null, TM.entryName(s, l.e)),
        h('span', { class: 'tm-mem' }, (ev.id === 'team' ? l.members.map(m => m.b.name.split(' ')[0]).join(', ') + ' · ' : '') +
          sq.label + ' · Lane ' + l.e.lane));
      const changed = lastTotals.size && lastTotals.get(l.e.id) !== l.scratch;
      rows.push(h('tr', { class: 'row' + (cashing ? ' cashing' : '') + (changed ? ' flash' : ''), onclick: () => toggle(l.e.id) },
        h('td', { class: 'pl' }, l.place == null ? '–' : l.place, l.tie ? h('span', { class: 'tm-tie' }, ' T') : null),
        nameCell, cell(l.games[0], 'hide-sm'), cell(l.games[1], 'hide-sm'), cell(l.games[2], 'hide-sm'),
        cell(l.started ? l.scratch : null), ui.div === 'hdcp' ? cell(l.started ? l.hdcp : null, 'hide-sm') : null,
        ui.div === 'hdcp' ? cell(l.started ? l.total : null, 'tot') : null, h('td', null, chip(l.done, ev.games, l.started))));
      if (ui.open.has(l.e.id)) l.members.forEach(m => rows.push(h('tr', { class: 'members' },
        h('td', null), h('td', { class: 'who' }, m.b.name + ' · avg ' + m.b.avg + ' · hdcp ' + m.h),
        cell(m.gs[0], 'hide-sm'), cell(m.gs[1], 'hide-sm'), cell(m.gs[2], 'hide-sm'), cell(m.n ? m.scratch : null),
        ui.div === 'hdcp' ? cell(m.n ? m.h * m.n : null, 'hide-sm') : null, ui.div === 'hdcp' ? cell(m.n ? m.scratch + m.h * m.n : null) : null, h('td', null))));
    });
    lastTotals = totals;
    if (!rows.length) rows.push(h('tr', null, h('td', { colspan: cols }, 'No matches.')));
    $('tm-body').replaceChildren(...rows);
  }

  function renderAE() {
    const { lines, cash } = TM.allEvents(s, ui.div);
    const evs = s.tournament.events;
    $('tm-note').textContent = lines.length + ' bowlers entered all-events · ' + evs.length * 3 + ' games · prize ratio 1 in ' +
      (s.tournament.aeRatio || 8) + ' → top ' + cash + ' cash';
    $('tm-thead').replaceChildren(h('tr', null, h('th', null, 'Pl'), h('th', null, 'Bowler'),
      ...evs.map(e => h('th', { class: 'num hide-sm' }, e.name)), h('th', { class: 'num' }, 'Scratch'),
      ui.div === 'hdcp' ? h('th', { class: 'num hide-sm' }, 'Hdcp') : null, ui.div === 'hdcp' ? h('th', { class: 'num' }, 'Total') : null,
      h('th', null, 'Status')));
    const cols = 4 + evs.length + (ui.div === 'hdcp' ? 2 : 0);
    const rows = [];
    let cashDrawn = false;
    lines.forEach(l => {
      if (!matches([l.b.name])) return;
      const cashing = l.place != null && l.place <= cash;
      if (!cashing && !cashDrawn && !ui.q && rows.length) {
        rows.push(h('tr', { class: 'cashline' }, h('td', { colspan: cols }, '▲ in the money (top ' + cash + ')')));
        cashDrawn = true;
      }
      rows.push(h('tr', { class: cashing ? 'cashing' : '' },
        h('td', { class: 'pl' }, l.place == null ? '–' : l.place, l.tie ? h('span', { class: 'tm-tie' }, ' T') : null),
        h('td', null, h('strong', null, l.b.name), h('span', { class: 'tm-mem' }, 'avg ' + l.b.avg + ' · hdcp ' + l.h + '/game')),
        ...evs.map(e => cell(l.per[e.id], 'hide-sm')), cell(l.started ? l.scratch : null),
        ui.div === 'hdcp' ? cell(l.started ? l.hdcp : null, 'hide-sm') : null, ui.div === 'hdcp' ? cell(l.started ? l.total : null, 'tot') : null,
        h('td', null, chip(l.done, evs.length * 3, l.started))));
    });
    if (!rows.length) rows.push(h('tr', null, h('td', { colspan: cols }, 'No matches.')));
    $('tm-body').replaceChildren(...rows);
  }

  function toggle(id) { ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id); render(); }
  function render() { header(); ui.ev === 'ae' ? renderAE() : renderEvent(); }

  $('tm-div').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ui.div = b.dataset.div;
    $('tm-div').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  $('tm-squad-filter').addEventListener('change', e => { ui.squad = e.target.value; render(); });
  $('tm-search').addEventListener('input', e => { ui.q = e.target.value.trim(); render(); });
  window.addEventListener('storage', e => { if (e.key === TM.KEY) { s = TM.load(); render(); } });
  render();
})();
