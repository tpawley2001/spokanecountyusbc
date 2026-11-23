(function () {
  var body = document.getElementById('avg-body');
  var q = document.getElementById('avg-q');
  var lg = document.getElementById('avg-league');
  var count = document.getElementById('avg-count');
  if (!body) return;
  var rows = [];
  var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };

  function render() {
    var terms = norm(q.value).split(' ').filter(Boolean);
    var league = lg.value;
    var frag = document.createDocumentFragment();
    var shown = 0, people = {}, last = null;
    rows.forEach(function (r) {
      if (league && r.l !== league) return;
      if (terms.length && !terms.every(function (t) { return r.k.indexOf(t) !== -1; })) return;
      var tr = document.createElement('tr');
      var same = last === r.id;
      if (same) tr.className = 'avg-more';
      [[r.n, 'avg-name'], [r.a + r.t, 'num'], [r.g, 'num'], [r.l, ''], [r.id, '']].forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c[0];
        if (c[1]) td.className = c[1];
        tr.appendChild(td);
      });
      frag.appendChild(tr);
      shown++; people[r.id] = 1; last = r.id;
    });
    body.replaceChildren(frag);
    var n = Object.keys(people).length;
    count.textContent = shown ? (n + ' bowler' + (n === 1 ? '' : 's') + ', ' + shown + ' average' + (shown === 1 ? '' : 's')) : 'No matching bowlers.';
  }

  fetch('averages/2025-26.json').then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    rows = data.map(function (r) { r.k = norm(r.n + ' ' + r.id) + ' ' + r.id; return r; });
    var leagues = {};
    rows.forEach(function (r) { leagues[r.l] = 1; });
    Object.keys(leagues).sort().forEach(function (l) {
      var o = document.createElement('option'); o.value = l; o.textContent = l; lg.appendChild(o);
    });
    var t;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 120); });
    lg.addEventListener('change', render);
    render();
  }).catch(function () {
    count.innerHTML = 'Could not load the averages. <a href="forms/averages-2025-26.pdf">Open the PDF instead.</a>';
  });
})();
