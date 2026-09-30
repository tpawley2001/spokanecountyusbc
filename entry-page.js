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
  fetch(`/entry/form/${slug}`).then(r => r.ok ? r.json() : Promise.reject()).then(render).catch(() => fail('This entry form could not be found.'));

  function input(name, f) {
    if (f.type === 'check') return el('input', { id: `f-${name}`, name, type: 'checkbox', value: 'X', 'aria-label': f.label });
    const type = f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text';
    const attrs = { id: `f-${name}`, name, type, maxlength: f.type === 'average' ? 3 : (f.max || 100), 'aria-label': f.label, required: !!f.required };
    if (f.type === 'average') Object.assign(attrs, { inputmode: 'numeric', pattern: '\\d{1,3}' });
    if (type === 'email') attrs.autocomplete = 'email';
    if (type === 'tel') attrs.autocomplete = 'tel';
    return el('input', attrs);
  }

  function render(form) {
    document.title = `${form.tournament} Entry Form | Spokane County USBC`;
    const sheet = el('div', { class: 'entry-sheet' });
    let totalOut = null;
    for (const b of form.sheet) {
      if (b.logos) sheet.append(el('div', { class: 'es-logos' }, b.logos.map(l => el('img', { src: l.src, alt: l.alt }))));
      else if (b.title) sheet.append(el('h1', { class: 'es-title' }, b.title.map((t, i) => [i ? el('br') : null, t])));
      else if (b.subtitle) sheet.append(el('p', { class: 'es-subtitle' }, b.subtitle.map((t, i) => [i ? el('br') : null, t])));
      else if (b.text) sheet.append(el('p', { class: `es-text es-${b.size || 'md'}` },
        b.text.map(s => el('span', { class: [s.red && 'es-red', s.bold && 'es-bold'].filter(Boolean).join(' ') }, s.t))));
      else if (b.heading) sheet.append(el('h2', { class: 'es-heading' }, b.heading));
      else if (b.row) sheet.append(el('div', { class: `es-row${b.center ? ' es-center' : ''}` },
        b.row.map(c => el('label', { class: `es-field${form.fields[c.field].type === 'check' ? ' es-check' : ''}`, style: `flex-grow:${c.grow || 1}`, for: `f-${c.field}` },
          el('span', { class: 'es-label' }, c.label), input(c.field, form.fields[c.field]),
          el('span', { class: 'es-err', id: `e-${c.field}` })))));
      else if (b.total) {
        totalOut = el('span', { class: 'es-amount' }, '0.00');
        sheet.append(el('p', { class: 'es-total' }, `${b.total} $`, totalOut, el('span', { class: 'es-note' }, ` ${b.note || ''}`)));
      }
    }
    // honeypot for bots: hidden from people and screen readers
    sheet.append(el('div', { class: 'es-hp', 'aria-hidden': 'true' }, el('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })));

    const status = el('p', { class: 'es-status', role: 'status' });
    const submit = el('button', { type: 'submit', class: 'btn btn-red es-submit' }, 'Submit Entry');
    const formEl = el('form', { novalidate: true }, sheet, el('div', { class: 'es-actions' }, submit, status));

    const rules = form.rules ? el('div', { class: 'entry-sheet es-rules' },
      el('h2', { class: 'es-heading es-center-text' }, form.rules.title),
      el('ol', {}, form.rules.items.map(r => el('li', {}, r))),
      form.rules.footer ? el('p', { class: 'es-text es-sm es-bold' }, form.rules.footer) : null) : null;

    const pdfLink = form.pdf_url ? el('p', { class: 'es-alt' }, 'Prefer paper? ', el('a', { href: form.pdf_url, target: '_blank', rel: 'noopener' }, 'Download the PDF entry form'), ' and mail or email it in.') : null;
    root.replaceChildren(el('p', { class: 'es-back' }, el('a', { href: 'tournaments.html' }, '← Tournaments')), formEl, pdfLink, rules);

    const valueOf = i => i.type === 'checkbox' ? (i.checked ? i.value : '') : i.value;
    const people = form.fee_people_fields || [];
    const updateTotal = () => {
      if (!totalOut) return;
      const n = people.filter(p => formEl.elements[p] && valueOf(formEl.elements[p]).trim()).length;
      totalOut.textContent = (n * (form.fee_per_person || 0)).toFixed(2);
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
      el('p', { class: 'es-text es-md' }, 'Your entry has been sent to the Spokane County USBC association manager.'),
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
