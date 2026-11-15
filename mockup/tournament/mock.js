// Tournament system MOCKUP: shared sample data, scoring math and demo storage.
// Everything here is fake. In the real system this lives in a database on the
// usbc box and both pages talk to an API; here both pages share localStorage
// so you can enter a score on the board page and watch the live page update.
(function () {
  'use strict';
  // ?t=senior / ?t=bvl load real results (senior-2026.js, bvl-2026.js); the default is the made-up sample.
  // ?t=senior loads the real 2026 Senior Championships results (senior-2026.js); default is the made-up sample.
  const DATASETS = { sample: 'Sample: Open Championships (made-up data)', senior: '2026 Senior Championships (real results)',
    bvl: '2026 BVL Veterans Doubles (real results)' };
  let DS = 'sample';
  try { DS = new URLSearchParams(location.search).get('t') || 'sample'; } catch (e) { /* default */ }
  if (!DATASETS[DS]) DS = 'sample';
  const KEY = 'scusbc-tourney-mock-v2' + (DS === 'sample' ? '' : '-' + DS);

  function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }

  const FIRST = ['Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Cameron', 'Avery',
    'Quinn', 'Parker', 'Reese', 'Dana', 'Logan', 'Skyler', 'Hayden', 'Rowan', 'Emerson', 'Blake', 'Sawyer',
    'Kendall', 'Jessie', 'Robin'];
  const LAST = ['Archer', 'Bishop', 'Carver', 'Dalton', 'Ellison', 'Fletcher', 'Garrett', 'Holloway', 'Ingram',
    'Jennings', 'Keller', 'Lowell', 'Mercer', 'Norris', 'Osborne', 'Prescott', 'Ramsey', 'Sutton', 'Thayer',
    'Underwood', 'Vance', 'Whitaker', 'Yates', 'Zimmer'];
  const TEAMS = ['Split Happens', 'Pin Pals', 'Gutter Gang', 'Ten Pin Titans', 'Strike Force', 'Lucky Strikes',
    'Spare Parts', 'Alley Cats', 'Kingpins', 'Rolling Thunder', 'The Pocket', 'Back Row'];

  function seed() {
    const r = rng(20270313);
    const normal = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    const bowlers = [];
    const seen = new Set();
    for (let i = 0; bowlers.length < 48; i++) {
      const name = FIRST[i % 24] + ' ' + LAST[(i * 7 + Math.floor(i / 24) * 5) % 24];
      if (seen.has(name)) continue;
      seen.add(name);
      const n = bowlers.length;
      bowlers.push({ id: 'b' + n, name, usbc: '9001-' + (10412 + n * 37), avg: Math.round(145 + r() * 78), ae: r() > 0.18 });
    }
    const entries = [];
    let eid = 0;
    const src = () => (r() < 0.55 ? 'online' : r() < 0.6 ? 'paper' : 'board');
    for (let t = 0; t < 12; t++) {
      entries.push({ id: 'e' + eid++, ev: 'team', squad: t < 6 ? 'T1' : 'T2', lane: String(1 + (t % 6) * 2),
        name: TEAMS[t], members: bowlers.slice(t * 4, t * 4 + 4).map(b => b.id), paid: r() > 0.08, src: src() });
    }
    const order = bowlers.map(b => b.id).sort(() => r() - 0.5);
    for (let d = 0; d < 24; d++) {
      const squad = d < 12 ? 'D1' : 'D2';
      const lane = String(1 + Math.floor((d % 12) / 2));
      const members = [order[d * 2], order[d * 2 + 1]];
      entries.push({ id: 'e' + eid++, ev: 'doubles', squad, lane, name: '', members, paid: r() > 0.08, src: src() });
      members.forEach(m => entries.push({ id: 'e' + eid++, ev: 'singles', squad, lane, name: '', members: [m], paid: r() > 0.06, src: src() }));
    }
    // Scores: team squads done, Sunday 9 AM doubles done, singles mid-squad, 1 PM not started.
    const avgOf = id => bowlers.find(b => b.id === id).avg;
    const game = id => Math.max(92, Math.min(300, Math.round(avgOf(id) + normal() * 27)));
    const scores = {};
    entries.forEach(e => {
      if (e.squad === 'D2') return;
      e.members.forEach(m => {
        let g = [game(m), game(m), game(m)];
        if (e.ev === 'singles') {
          const lane = +e.lane;
          g = [g[0], lane <= 3 ? g[1] : null, null];
        }
        scores[e.ev + ':' + e.id + ':' + m] = g;
      });
    });
    // A pending batch of scores emailed by the house: Sun 1 PM doubles, game 1.
    // Two rows don't match on purpose (a misspelled name, and a bowler on the wrong lane).
    const batchRows = [];
    entries.filter(e => e.squad === 'D2' && e.ev === 'doubles').forEach(e => e.members.forEach(m => {
      const b = bowlers.find(x => x.id === m);
      batchRows.push({ lane: e.lane, name: b.name, game: 1, score: game(m) });
    }));
    if (batchRows.length > 6) {
      batchRows[3].name = batchRows[3].name.replace(/[aeiou](?=[a-z]*$)/, 'e').replace(/(\w+)$/, w => w + 'e');
      batchRows[6].lane = String(+batchRows[6].lane + 4);
    }
    return {
      rev: 1,
      houseBatches: [{ id: 'hb1', house: 'North Bowl', via: 'email', from: 'front desk, North Bowl',
        subject: 'Open Champs Sun 1pm doubles G1', file: 'recap-1pm-g1.csv', received: '1:42 PM', status: 'pending', rows: batchRows }],
      updated: Date.now(),
      tournament: {
        name: 'SCUSBC Open Championships', season: '2026–27 (sample)', center: 'North Bowl', dates: 'March 13–14, 2027',
        hdcp: { base: 220, pct: 90, max: 0 }, prizeRatio: 5, aeRatio: 8, award: 'cash',
        fees: { team: 25, doubles: 25, singles: 25, ae: 10 },
        events: [
          { id: 'team', name: 'Team', size: 4, games: 3 },
          { id: 'doubles', name: 'Doubles', size: 2, games: 3 },
          { id: 'singles', name: 'Singles', size: 1, games: 3 }
        ],
        squads: [
          { id: 'T1', label: 'Sat 3/13 · 9:00 AM', events: ['team'] },
          { id: 'T2', label: 'Sat 3/13 · 1:00 PM', events: ['team'] },
          { id: 'D1', label: 'Sun 3/14 · 9:00 AM', events: ['doubles', 'singles'] },
          { id: 'D2', label: 'Sun 3/14 · 1:00 PM', events: ['doubles', 'singles'] }
        ]
      },
      bowlers, entries, scores, final: { T1: true, T2: true }
    };
  }

  function fresh() {
    if (DS !== 'sample' && window.TM_DATASETS && window.TM_DATASETS[DS]) {
      const d = JSON.parse(JSON.stringify(window.TM_DATASETS[DS])); d.updated = Date.now(); return d;
    }
    return seed();
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.rev) return s; } catch (e) { /* demo only */ }
    return fresh();
  }
  function save(s) {
    s.rev++; s.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* demo only */ }
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* demo only */ } return fresh(); }

  // Keep ?t= on links between the mockup pages, and put a tournament picker in the banner.
  function wire() {
    document.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href');
      if (/^(index|board)\.html$/.test(h) && DS !== 'sample') a.setAttribute('href', h + '?t=' + DS);
    });
    const banner = document.querySelector('.mock-banner');
    if (!banner) return;
    const sel = document.createElement('select');
    sel.className = 'mock-pick'; sel.setAttribute('aria-label', 'Tournament');
    for (const k in DATASETS) { const o = document.createElement('option'); o.value = k; o.textContent = DATASETS[k]; o.selected = k === DS; sel.append(o); }
    sel.addEventListener('change', () => { location.search = sel.value === 'sample' ? '' : '?t=' + sel.value; });
    if (DS === 'senior') {
      banner.replaceChildren('REAL results from the 2026 Senior Championships (from TournamentBowl), shown in the new system. Board changes save only in this browser.');
    }
    if (DS === 'bvl') {
      banner.replaceChildren('REAL results from the 2026 BVL Veterans Doubles (Valley Bowl results sheet + our check-in), shown in the new system. Board changes save only in this browser.');
    }
    banner.prepend(sel, ' ');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  // ---- scoring math (this is the part that carries over to the real build) ----
  function hdcp(avg, cfg) {
    if (avg == null) return null;
    let h = Math.max(0, Math.floor((cfg.base - avg) * cfg.pct / 100));
    if (cfg.max > 0) h = Math.min(h, cfg.max);
    return h;
  }
  function games(s, ev, e, m) { return s.scores[ev + ':' + e.id + ':' + m] || [null, null, null]; }
  // Some houses only report a pair/team total per game (no per-bowler games). Those land under the
  // key '<ev>:<entry>:*'. When a bowler's own average isn't known (walk-in), the entry carries the
  // house's team average + per-game team handicap (e.teamAvg / e.teamHc).
  const PAIR = '*';
  function pairGames(s, e) { return s.scores[e.ev + ':' + e.id + ':' + PAIR] || null; }
  function entryHc(s, e) {
    const hs = e.members.map(m => hdcp(bowler(s, m).avg, s.tournament.hdcp));
    return hs.some(x => x == null) ? (e.teamHc != null ? e.teamHc : 0) : hs.reduce((a, x) => a + x, 0);
  }

  function entryLine(s, e) {
    const cfg = s.tournament.hdcp;
    const g = [0, 0, 0];
    let scratch = 0, hc = 0, done = 3, any = false;
    const members = e.members.map(m => {
      const b = bowler(s, m);
      const gs = games(s, e.ev, e, m);
      const h = hdcp(b.avg, cfg);
      let n = 0;
      gs.forEach((x, i) => { if (x != null) { g[i] += x; scratch += x; hc += h; n++; any = true; } });
      done = Math.min(done, gs.filter(x => x != null).length);
      return { b, gs, h, scratch: gs.reduce((a, x) => a + (x || 0), 0), n };
    });
    const pg = pairGames(s, e);
    if (pg) {
      const ph = entryHc(s, e), n = pg.filter(x => x != null).length, sc = pg.reduce((a, x) => a + (x || 0), 0);
      return { e, members, pair: true, games: pg.slice(), scratch: sc, hdcp: ph * n, total: sc + ph * n, done: n, started: n > 0, hcGame: ph };
    }
    const gameCols = g.map((x, i) => (members.some(m => m.gs[i] != null) ? x : null));
    return { e, members, games: gameCols, scratch, hdcp: hc, total: scratch + hc, done, started: any, hcGame: entryHc(s, e) };
  }

  function rank(lines, div) {
    const key = l => (div === 'scratch' ? l.scratch : l.total);
    lines.sort((a, b) => (b.started - a.started) || (key(b) - key(a)) || (b.done - a.done));
    let place = 0;
    lines.forEach((l, i) => {
      if (!l.started) { l.place = null; return; }
      if (i === 0 || key(l) !== key(lines[i - 1])) place = i + 1;
      l.place = place;
      l.tie = (i > 0 && lines[i - 1].started && key(l) === key(lines[i - 1])) || (i + 1 < lines.length && lines[i + 1].started && key(l) === key(lines[i + 1]));
    });
    return lines;
  }

  function standings(s, ev, div) {
    const lines = s.entries.filter(e => e.ev === ev).map(e => entryLine(s, e));
    const cash = s.tournament.prizeRatio ? Math.ceil(lines.length / s.tournament.prizeRatio) : 0;
    return { lines: rank(lines, div), cash };
  }

  function allEvents(s, div) {
    const cfg = s.tournament.hdcp;
    const lines = s.bowlers.filter(b => b.ae).map(b => {
      const h = hdcp(b.avg, cfg);
      const per = {};
      let scratch = 0, n = 0;
      s.entries.filter(e => e.members.includes(b.id)).forEach(e => {
        const gs = games(s, e.ev, e, b.id);
        const sc = gs.filter(x => x != null);
        per[e.ev] = sc.length ? sc.reduce((a, x) => a + x, 0) : null;
        scratch += sc.reduce((a, x) => a + x, 0); n += sc.length;
      });
      return { b, per, scratch, hdcp: h * n, total: scratch + h * n, done: n, started: n > 0, h };
    });
    const cash = Math.ceil(lines.length / (s.tournament.aeRatio || 8));
    return { lines: rank(lines, div), cash };
  }

  function bowler(s, id) { return s.bowlers.find(b => b.id === id); }
  function squad(s, id) { return s.tournament.squads.find(q => q.id === id); }
  function squadState(s, id) {
    if (s.final[id]) return 'final';
    const any = s.entries.some(e => e.squad === id && ((pairGames(s, e) || []).some(x => x != null) || e.members.some(m => games(s, e.ev, e, m).some(x => x != null))));
    return any ? 'live' : 'upcoming';
  }
  function entryName(s, e) {
    if (e.ev === 'team') return e.name || 'Team ' + e.id;
    return e.members.map(m => bowler(s, m).name).join(' & ');
  }

  // Tiny DOM helper: h('td', {class: 'x'}, 'text', childNode)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') el.className = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }

  window.TM = { DS, KEY, PAIR, load, save, reset, hdcp, games, pairGames, entryHc, entryLine, standings, allEvents, bowler, squad, squadState, entryName, h };
})();
