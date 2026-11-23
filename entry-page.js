// Online tournament entry: draws entry-forms/<slug>.json as a copy of the paper
// entry sheet and submits it to /entry/submit/<slug>, which emails it in.
(function () {
  const root = document.getElementById('entry-root');
  const slug = new URLSearchParams(location.search).get('form') || '';
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const fail = msg => { root.replaceChildren(el('div', { class: 'info-box' }, el('h4', {}, 'Entry form unavailable'), el('p', {}, msg), el('p', {}, el('a', { href: 'tournaments.html' }, '← Back to Tournaments')))); };

  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return fail('No entry form was selected.');
  fetch(`/entry/form/${slug}`).then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error), () => Promise.reject()))
    .then(render).catch(msg => fail(typeof msg === 'string' ? msg : 'This entry form could not be found.'));

  function input(name, f) {
    if (f.type === 'check') return el('input', { id: `f-${name}`, name, type: 'checkbox', value: 'X', 'aria-label': f.label });
    const type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text';
    const attrs = { id: `f-${name}`, name, type, maxlength: f.type === 'average' ? 3 : (f.max || 100), 'aria-label': f.label, required: !!f.required };
    if (f.type === 'average') Object.assign(attrs, { inputmode: 'numeric', pattern: '\\d{1,3}' });
    if (type === 'email') attrs.autocomplete = 'email';
    if (type === 'tel') attrs.autocomplete = 'tel';
    return el('input', attrs);
  }

  // Styled text: a plain string, or runs [{t, bold, red, blue, u, i, style}]
  function spans(text) {
    if (typeof text === 'string') return text;
    return text.map(s => el('span', { class: [s.red && 'es-red', s.blue && 'es-blue', s.bold && 'es-bold', s.u && 'es-u', s.i && 'es-i'].filter(Boolean).join(' '), style: s.style || false }, s.t));
  }
  const plain = text => typeof text === 'string' ? text : text.map(s => s.t).join('');

  // Rules: numbered items (string or styled runs), with {heading} section titles
  // and unnumbered {text} paragraphs; numbering carries on across sections.
  function ruleList(items) {
    const out = [];
    let ol = null, n = 0;
    for (const r of items) {
      if (r.heading) { out.push(el('h3', { class: 'es-rules-h' }, r.heading)); ol = null; }
      else if (r.text) { out.push(el('p', { class: 'es-text es-md' }, spans(r.text))); ol = null; }
      else {
        if (!ol) { ol = el('ol', { start: n + 1 }); out.push(ol); }
        ol.append(el('li', {}, spans(r))); n++;
      }
    }
    return out;
  }

  // A ruled table like the paper's (bowler grids, captain box). cols: [{head: [lines],
  // field (an input in the header cell), cell (label for the cell on phones), bold, w (%),
  // group (a heading over this and the following columns with the same group)}];
  // rows: [{n (row number), sep (heavier rule above), cells: [field | {label, field, span, cell} | null]}].
  // side: blocks drawn in a column at the right of the table (event box), sidew its width (%).
  function table(t, fields, block) {
    const cell = (c, col, n) => {
      const spec = typeof c === 'string' ? { field: c } : c;
      if (!spec) return el('td', { class: 'es-empty' });
      const f = fields[spec.field];
      return el('td', { class: f.type === 'check' ? 'es-td-check' : '', colspan: spec.span || false,
        'data-label': spec.cell ?? col.cell ?? (col.head || []).map(plain).join(' ') },
        el('label', { for: `f-${spec.field}` }, n ? el('span', { class: 'es-n' }, n) : null, spec.label ? el('span', { class: 'es-label' }, spans(spec.label)) : null,
          input(spec.field, f)),
        el('span', { class: 'es-err', id: `e-${spec.field}` }));
    };
    const th = (c, attrs) => el('th', { class: [c.field && 'es-th-field', c.bold && 'es-bold'].filter(Boolean).join(' '), ...attrs },
      el('span', {}, (c.head || []).map((h, i) => [i ? el('br') : null, spans(h)])),
      c.field ? [input(c.field, fields[c.field]), el('span', { class: 'es-err', id: `e-${c.field}` })] : null);
    let head;
    if (t.cols.some(c => c.group)) {   // two header rows: group headings, then the grouped columns' own heads
      const top = [], sub = [];
      t.cols.forEach((c, i) => {
        if (!c.group) { top.push(th(c, { rowspan: 2 })); return; }
        if (i && JSON.stringify(t.cols[i - 1].group) === JSON.stringify(c.group)) top[top.length - 1].colSpan++;
        else top.push(el('th', { colspan: 1, class: 'es-th-group' }, el('span', {}, [].concat(c.group).map((h, k) => [k ? el('br') : null, spans(h)]))));
        sub.push(th(c));
      });
      head = [el('tr', {}, top), el('tr', {}, sub)];
    } else head = el('tr', {}, t.cols.map(c => th(c)));
    const tbl = el('table', { class: 'es-table' },
      el('colgroup', {}, t.cols.map(c => el('col', { style: c.w ? `width:${c.w}%` : false }))),
      el('thead', {}, head),
      el('tbody', {}, t.rows.map(r => el('tr', { class: r.sep ? 'es-sep' : false }, r.cells.map((c, i) => cell(c, t.cols[i], i === 0 ? r.n : null))))));
    if (!t.side) return el('div', { class: 'es-table-wrap' }, tbl);
    return el('div', { class: 'es-table-wrap es-with-side', style: t.sidew ? `--side-w:${t.sidew}%` : false }, el('div', { class: 'es-table-main' }, tbl),
      el('div', { class: 'es-side' }, t.side.map(block)));
  }

  function render(form) {
    document.title = `${form.tournament} Entry Form | Spokane County USBC`;
    const sheet = el('div', { class: 'entry-sheet' });
    let totalOut = null;
    const lineOuts = [];   // per-line amounts of a fee box (form.fee_items)
    const look = b => [b.black && 'es-black', b.serif && 'es-serif', b.u && 'es-u', b.center && 'es-center-text'].filter(Boolean).join(' ');
    const block = b => {
      if (b.logos) return el('div', { class: 'es-logos' }, b.logos.map(l => el('img', { src: l.src, alt: l.alt })));
      if (b.title) return el('h1', { class: `es-title ${look(b)}`, style: b.style || false }, b.title.map((t, i) => [i ? el('br') : null, t]));
      if (b.subtitle) return el('p', { class: `es-subtitle ${look(b)}`, style: b.style || false }, b.subtitle.map((t, i) => [i ? el('br') : null, t]));
      if (b.text) return el('p', { class: `es-text es-${b.size || 'md'} ${look(b)}`, style: b.style || false }, spans(b.text));
      if (b.heading) return el('h2', { class: 'es-heading' }, b.heading);
      if (b.table) return table(b.table, form.fields, block);
      // boxes side by side (stacked on phones), like the paper's bottom row: [{w (%), blocks}]
      if (b.boxes) return el('div', { class: 'es-boxes' }, b.boxes.map(x => el('div', { class: 'es-box', style: x.w ? `flex-basis:${x.w}%` : false }, x.blocks.map(block))));
      if (b.fees) {
        totalOut = el('span', { class: 'es-fee-amt' });
        const tally = form.fee_items.some(i => i.rate);   // paper-style tally: rate | $ amount | what it covers
        return el('div', { class: `es-fees${tally ? ' es-tally' : ''}` },
          b.intro ? el('p', { class: 'es-fee-intro' }, spans(b.intro)) : null,
          form.fee_items.map(i => {
            const before = i.before ? el('p', { class: 'es-fee-before' }, i.before) : null;
            if (i.check) {   // opt-in line with its own box instead of an amount (e.g. "Scratch Team: no additional fee [ ] Yes")
              lineOuts.push(null);
              const name = i.fields[0];
              return [before, el('p', { class: `es-fee-line${i.gap ? ' es-fee-gap' : ''}` }, el('label', { for: `f-${name}` }, i.label),
                el('label', { class: 'es-fee-check', for: `f-${name}` }, input(name, form.fields[name]), i.check, el('span', { class: 'es-err', id: `e-${name}` })))];
            }
            const out = el('span', { class: 'es-fee-amt' });
            lineOuts.push(out);
            if (tally) return [before, el('p', { class: 'es-fee-line' }, el('span', {}, i.rate || ''), el('span', {}, '$ ', out), el('span', {}, i.label))];
            return [before, el('p', { class: `es-fee-line${i.gap ? ' es-fee-gap' : ''}` }, el('span', {}, i.label), el('span', {}, '$ ', out))];
          }),
          tally ? el('p', { class: 'es-fee-line es-fee-total' }, el('span', {}), el('span', {}, '$ ', totalOut), el('span', {}, b.fees))
            : el('p', { class: 'es-fee-line es-fee-gap es-fee-total' }, el('span', {}, b.fees), el('span', {}, '$ ', totalOut)));
      }
      // fields on a line; `before` puts a checkbox ahead of its label ("[ ] Handicap")
      if (b.row) return el('div', { class: `es-row${b.center ? ' es-center' : ''}${b.tight ? ' es-tight' : ''}` },
        b.row.map(c => el('label', { class: `es-field${form.fields[c.field].type === 'check' ? ' es-check' : ''}`, style: `flex-grow:${c.grow || 1}`, for: `f-${c.field}` },
          c.before ? input(c.field, form.fields[c.field]) : null, el('span', { class: 'es-label' }, spans(c.label)), c.before ? null : input(c.field, form.fields[c.field]),
          el('span', { class: 'es-err', id: `e-${c.field}` }))));
      if (b.total) {
        totalOut = el('span', { class: 'es-amount' }, '0.00');
        return el('p', { class: 'es-total' }, `${b.total} $`, totalOut, el('span', { class: 'es-note' }, ` ${b.note || ''}`));
      }
      return null;
    };
    for (const b of form.sheet) { const n = block(b); if (n) sheet.append(n); }
    // honeypot for bots: hidden from people and screen readers
    sheet.append(el('div', { class: 'es-hp', 'aria-hidden': 'true' }, el('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })));

    const status = el('p', { class: 'es-status', role: 'status' });
    const submit = el('button', { type: 'submit', class: 'btn btn-red es-submit' }, 'Submit Entry');
    const formEl = el('form', { novalidate: true }, sheet, el('div', { class: 'es-actions' }, submit, status));

    const rules = form.rules ? el('div', { class: 'entry-sheet es-rules' },
      el('h2', { class: 'es-heading es-center-text' }, form.rules.title),
      ruleList(form.rules.items),
      form.rules.footer ? el('p', { class: 'es-text es-sm es-bold' }, [].concat(form.rules.footer).map((l, i) => [i ? el('br') : null, l])) : null) : null;

    const pdfLink = form.pdf_url ? el('p', { class: 'es-alt' }, 'Prefer paper? ', el('a', { href: form.pdf_url, target: '_blank', rel: 'noopener' }, 'Download the PDF entry form'), ' and mail or email it in.') : null;
    root.replaceChildren(...[el('p', { class: 'es-back' }, el('a', { href: 'tournaments.html' }, '← Tournaments')), formEl, pdfLink, rules].filter(Boolean));

    const valueOf = i => i.type === 'checkbox' ? (i.checked ? i.value : '') : i.value;
    const people = form.fee_people_fields || [];
    const updateTotal = () => {
      if (!totalOut) return;
      if (form.fee_items) {
        let total = 0;
        form.fee_items.forEach((item, k) => {
          const sum = item.amount * item.fields.filter(f => formEl.elements[f] && valueOf(formEl.elements[f]).trim()).length;
          total += sum;
          if (lineOuts[k]) lineOuts[k].textContent = sum ? sum.toFixed(2) : '';
        });
        totalOut.textContent = total.toFixed(2);
        return;
      }
      const n = people.filter(p => formEl.elements[p] && valueOf(formEl.elements[p]).trim()).length;
      const extra = n ? (form.fee_addons || []).filter(a => !(a.unless && formEl.elements[a.unless] && valueOf(formEl.elements[a.unless]))).reduce((sum, a) => sum + a.amount, 0) : 0;
      totalOut.textContent = (n * (form.fee_per_person || 0) + extra).toFixed(2);
    };
    formEl.addEventListener('input', e => {
      updateTotal();
      const err = document.getElementById(`e-${e.target.name}`);
      if (err) { err.textContent = ''; e.target.classList.remove('es-invalid'); }
    });
    updateTotal();

    formEl.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {};
      for (const n of [...Object.keys(form.fields), 'website']) data[n] = formEl.elements[n] ? valueOf(formEl.elements[n]) : '';
      // quick client-side check of required fields; the server re-checks everything
      let bad = null;
      for (const [n, f] of Object.entries(form.fields)) {
        const ok = !f.required || data[n].trim();
        document.getElementById(`e-${n}`).textContent = ok ? '' : 'Required';
        formEl.elements[n].classList.toggle('es-invalid', !ok);
        if (!ok && !bad) bad = formEl.elements[n];
      }
      if (bad) { status.textContent = 'Please fill in the highlighted fields.'; bad.focus(); return; }
      submit.disabled = true; status.textContent = 'Sending your entry…';
      try {
        const r = await fetch(`/entry/submit/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) {
          for (const [n, msg] of Object.entries(j.fields || {})) {
            document.getElementById(`e-${n}`).textContent = msg; formEl.elements[n].classList.add('es-invalid');
          }
          status.textContent = j.error || 'Something went wrong. Please try again.';
          submit.disabled = false; return;
        }
        done(form, j, data);
      } catch {
        status.textContent = 'Could not reach the server. Check your connection and try again.';
        submit.disabled = false;
      }
    });
  }

  // Payment panel: PayPal/Venmo buttons prefilled with the amount (and a note on Venmo),
  // their QR codes, and the check option. Older forms may give payment as plain text.
  function payBlock(pay, due, note) {
    if (!pay) return null;
    if (typeof pay === 'string') return el('p', { class: 'es-text es-sm es-bold' }, pay);
    const amt = due ? due.toFixed(2) : '';
    const opts = [];
    if (pay.paypal) opts.push(el('div', { class: 'es-pay-opt' },
      pay.paypal_qr ? el('img', { src: pay.paypal_qr, alt: 'PayPal QR code for SCUSBC', class: 'es-qr' }) : null,
      el('a', { class: 'btn btn-navy', target: '_blank', rel: 'noopener',
        href: `https://paypal.me/${encodeURIComponent(pay.paypal)}${amt ? '/' + amt : ''}` }, 'Pay with PayPal')));
    if (pay.venmo) opts.push(el('div', { class: 'es-pay-opt' },
      pay.venmo_qr ? el('img', { src: pay.venmo_qr, alt: 'Venmo QR code for @' + pay.venmo, class: 'es-qr' }) : null,
      el('a', { class: 'btn btn-navy', target: '_blank', rel: 'noopener',
        href: `https://venmo.com/${encodeURIComponent(pay.venmo)}?txn=pay${amt ? '&amount=' + amt : ''}&note=${encodeURIComponent(note)}` }, 'Pay with Venmo')));
    return el('div', { class: 'es-pay' },
      el('h2', { class: 'es-heading es-center-text' }, 'Pay Your Entry Fee'),
      el('p', { class: 'es-text es-sm' }, `Include "${note}" in the payment note.`),
      el('div', { class: 'es-pay-opts' }, opts),
      pay.checks ? el('p', { class: 'es-text es-sm es-bold' }, pay.checks) : null);
  }

  function done(form, j, data) {
    const note = [j.tournament, data.team_name || data.contact_name].filter(Boolean).join(' - ');
    const box = el('div', { class: 'entry-sheet es-done' },
      el('h1', { class: 'es-title' }, 'Entry Received!'),
      el('p', { class: 'es-subtitle' }, j.tournament),
      el('p', { class: 'es-text es-md' }, `Your entry has been sent to ${form.sent_to || 'the Spokane County USBC association manager'}.`),
      j.due ? el('p', { class: 'es-total' }, `AMOUNT DUE $${j.due.toFixed(2)}`) : null,
      payBlock(j.payment, j.due, note));
    if (j.pdf) {
      const bytes = Uint8Array.from(atob(j.pdf), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      box.append(el('p', {}, el('a', { href: url, download: `${slug}-entry.pdf`, class: 'btn btn-navy' }, 'Download a copy of your entry')));
    }
    box.append(el('p', {}, el('a', { href: 'tournaments.html' }, '← Back to Tournaments')));
    root.replaceChildren(box);
    window.scrollTo(0, 0);
  }
})();
