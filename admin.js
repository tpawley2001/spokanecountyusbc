// admin.html page script
  let token = '';
  let siteData = {};
  let editCtx = {}; // { type, index }

  // ── Auth ──────────────────────────────────────────────────────
  document.getElementById('pw').onkeydown = e => { if(e.key==='Enter') doLogin(); };

  async function doLogin() {
    const pw = document.getElementById('pw').value;
    const err = document.getElementById('login-err');
    err.textContent = '';
    try {
      const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pw}) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        err.textContent = res.status === 429 ? (d.error || 'Too many attempts — try again later.') : 'Incorrect password.';
        return;
      }
      const d = await res.json();
      token = d.token;
      sessionStorage.setItem('tok', token);
      await showApp();
    } catch { err.textContent='Cannot connect to server.'; }
  }

  function doLogout(message) {
    sessionStorage.removeItem('tok');
    token = '';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
    document.getElementById('pw').value = '';
    document.getElementById('login-err').textContent = typeof message === 'string' ? message : '';
  }
  const SESSION_EXPIRED = 'Your session expired — please sign in again. Nothing was saved.';

  async function showApp() {
    const res = await fetch('/api/site', { headers:{'x-admin-token':token} });
    if (res.status === 401) { doLogout(SESSION_EXPIRED); return; }   // never show empty forms
    siteData = await res.json();
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    populateAll();
  }

  // ── Section switching ─────────────────────────────────────────
  function switchSection(id, el) {
    document.querySelectorAll('.section-panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.getElementById('s-'+id).classList.add('active');
    el.classList.add('active');
  }

  // ── Populate all sections from siteData ───────────────────────
  function populateAll() {
    // Home
    const ann = siteData.announcement || {};
    document.getElementById('ann-visible').checked = !!ann.visible;
    document.getElementById('ann-text').value = ann.text || '';
    document.getElementById('ann-link-text').value = ann.link_text || '';
    document.getElementById('ann-link').value = ann.link || '';
    document.getElementById('ann-type').value = BANNER_TYPES[ann.type] ? ann.type : 'reminder';
    document.getElementById('ann-label').value = ann.label || '';
    renderAnnouncementPreview();

    // Contact
    const c = siteData.contact || {};
    document.getElementById('c-name').value = c.manager_name || '';
    document.getElementById('c-role').value = c.manager_role || '';
    document.getElementById('c-email').value = c.email || '';
    document.getElementById('c-phone').value = c.phone || '';
    document.getElementById('c-addr1').value = c.address_line1 || '';
    document.getElementById('c-addr2').value = c.address_line2 || '';
    document.getElementById('c-fb').value = c.facebook_url || '';

    // Lists
    renderBoardList();
    renderTournamentList();
    renderHonorList();
    renderJbtList();
  }

  // ── Board ─────────────────────────────────────────────────────
  function renderBoardList() {
    const members = siteData.board?.members || [];
    const list = document.getElementById('b-list');
    list.innerHTML = '';
    members.forEach((m, i) => {
      const card = mkCard(
        '⠿',
        `<div class="item-label">${esc(m.name)}</div><div class="item-sub">${esc(m.role)}${m.email ? ' · ' + esc(m.email) : ''}</div>`,
        `<button class="btn-edit-sm" data-action="openModal" data-args="board,${i}">✏️</button>
         <button class="btn-danger-sm" data-action="removeItem" data-args="board,${i}">🗑</button>`
      );
      card.dataset.index = i;
      addDrag(card, 'board', members);
      list.appendChild(card);
    });
  }

  // ── Tournaments ───────────────────────────────────────────────
  const TYPE_COLORS = { Doubles:'blue', Singles:'blue', Trios:'blue', Team:'blue', Scratch:'green', Handicap:'blue', "Women's":'gold', Youth:'gold', Mixed:'gold', 'Youth/Mixed':'gold', 'All-Events':'green', Veterans:'blue', Senior:'blue', Queens:'gold', Kings:'blue' };
  const STATUS_COLORS = { Open:'green', TBD:'gold', Full:'red', Closed:'red', Completed:'blue' };

  function renderTournamentList() {
    const list = document.getElementById('t-list');
    list.innerHTML = '';
    const items = siteData.tournaments || [];
    items.forEach((t, i) => {
      const card = mkCard(
        '⠿',
        `<div class="item-label">${esc(t.name)}</div>
         <div class="item-sub" style="display:flex;gap:.4rem;margin-top:.2rem;">
           <span class="item-badge badge-${t.type_color}">${esc(t.type)}</span>
           <span class="item-badge badge-${t.status_color}">${esc(t.status)}</span>
           <span style="color:var(--muted)">${esc(t.date)} · ${esc(t.center || 'TBD')}</span>
         </div>`,
        `<button class="btn-edit-sm" data-action="openModal" data-args="tournament,${i}">✏️</button>
         <button class="btn-danger-sm" data-action="removeItem" data-args="tournament,${i}">🗑</button>`
      );
      card.dataset.index = i;
      addDrag(card, 'tournament', siteData.tournaments);
      list.appendChild(card);
    });
  }

  // ── Honor Scores ──────────────────────────────────────────────
  function renderHonorList() {
    const list = document.getElementById('h-list');
    list.innerHTML = '';
    const items = siteData.honor_scores || [];
    if (items.length === 0) {
      list.innerHTML = '<div class="info-box">No honor scores yet. Add one to replace the contact-only message with a full table on the Honor Scores page.</div>';
      return;
    }
    items.forEach((h, i) => {
      const card = mkCard(
        '⠿',
        `<div class="item-label">${esc(h.bowler)} — ${esc(h.score)}</div>
         <div class="item-sub">${esc(h.type)} · ${esc(h.league)} · ${esc(h.date)}</div>`,
        `<button class="btn-edit-sm" data-action="openModal" data-args="honor,${i}">✏️</button>
         <button class="btn-danger-sm" data-action="removeItem" data-args="honor,${i}">🗑</button>`
      );
      card.dataset.index = i;
      addDrag(card, 'honor', siteData.honor_scores);
      list.appendChild(card);
    });
  }

  // ── JBT ──────────────────────────────────────────────────────
  function renderJbtList() {
    const list = document.getElementById('j-list');
    list.innerHTML = '';
    const items = siteData.jbt_schedule || [];
    items.forEach((j, i) => {
      const card = mkCard(
        '⠿',
        `<div class="item-label">${esc(j.date)} — ${esc(j.location)}</div><div class="item-sub">${esc(j.format)}</div>`,
        `<button class="btn-edit-sm" data-action="openModal" data-args="jbt,${i}">✏️</button>
         <button class="btn-danger-sm" data-action="removeItem" data-args="jbt,${i}">🗑</button>`
      );
      card.dataset.index = i;
      addDrag(card, 'jbt', siteData.jbt_schedule);
      list.appendChild(card);
    });
  }

  // ── Card helper ───────────────────────────────────────────────
  function mkCard(handle, info, actions) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.draggable = true;
    card.innerHTML = `<span class="drag-handle">${handle}</span><div class="item-info">${info}</div><div class="item-actions">${actions}</div>`;
    return card;
  }

  // ── Drag & drop ───────────────────────────────────────────────
  let dragSrc = null;
  function addDrag(card, type, arr) {
    card.addEventListener('dragstart', () => { dragSrc=card; setTimeout(()=>card.classList.add('dragging'),0); });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); document.querySelectorAll('.item-card').forEach(c=>c.classList.remove('drag-over')); });
    card.addEventListener('dragover', e => { e.preventDefault(); if(card!==dragSrc){document.querySelectorAll('.item-card').forEach(c=>c.classList.remove('drag-over')); card.classList.add('drag-over'); } });
    card.addEventListener('drop', e => {
      e.preventDefault();
      if(dragSrc && dragSrc!==card) {
        const from=parseInt(dragSrc.dataset.index), to=parseInt(card.dataset.index);
        const [moved]=arr.splice(from,1);
        arr.splice(to,0,moved);
        saveSection(type==='board'?'board':type==='tournament'?'tournaments':type==='honor'?'honor':'jbt', true);
        refreshRender(type);
      }
    });
  }

  function refreshRender(type) {
    if(type==='board') renderBoardList();
    else if(type==='tournament') renderTournamentList();
    else if(type==='honor') renderHonorList();
    else if(type==='jbt') renderJbtList();
  }

  // ── Modal ─────────────────────────────────────────────────────
  function openModal(type, index=null) {
    editCtx = { type, index };
    const isEdit = index !== null;

    if(type==='board') {
      const m = isEdit ? siteData.board.members[index] : {role:'USBC Director',name:'',email:'',phone:'',photo:''};
      document.getElementById('modal-board-title').textContent = isEdit ? 'Edit Board Member' : 'Add Board Member';
      document.getElementById('mf-role').value = m.role;
      document.getElementById('mf-name').value = m.name;
      document.getElementById('mf-email').value = m.email||'';
      document.getElementById('mf-phone').value = m.phone||'';
      document.getElementById('mf-photo').value = m.photo||'';
      openOverlay('modal-board');
      setTimeout(()=>document.getElementById('mf-name').focus(),50);

    } else if(type==='tournament') {
      const t = isEdit ? siteData.tournaments[index] : {name:'',date:'TBD',center:'TBD',type:'Doubles',type_color:'blue',status:'TBD',status_color:'gold'};
      document.getElementById('modal-t-title').textContent = isEdit ? 'Edit Tournament' : 'Add Tournament';
      document.getElementById('tf-name').value = t.name;
      document.getElementById('tf-date').value = t.date;
      document.getElementById('tf-center').value = t.center || 'TBD';
      document.getElementById('tf-type').value = t.type;
      document.getElementById('tf-type-color').value = t.type_color;
      document.getElementById('tf-status').value = t.status;
      document.getElementById('tf-status-color').value = t.status_color;
      openOverlay('modal-tournament');
      setTimeout(()=>document.getElementById('tf-name').focus(),50);

    } else if(type==='honor') {
      const h = isEdit ? siteData.honor_scores[index] : {bowler:'',score:'',type:'300 Game',league:'',date:''};
      document.getElementById('modal-h-title').textContent = isEdit ? 'Edit Honor Score' : 'Add Honor Score';
      document.getElementById('hf-bowler').value = h.bowler;
      document.getElementById('hf-score').value = h.score;
      document.getElementById('hf-type').value = h.type;
      document.getElementById('hf-league').value = h.league;
      document.getElementById('hf-date').value = h.date;
      openOverlay('modal-honor');
      setTimeout(()=>document.getElementById('hf-bowler').focus(),50);

    } else if(type==='jbt') {
      const j = isEdit ? siteData.jbt_schedule[index] : {date:'',location:'',format:'Singles'};
      document.getElementById('modal-j-title').textContent = isEdit ? 'Edit JBT Event' : 'Add JBT Event';
      document.getElementById('jf-date').value = j.date;
      document.getElementById('jf-location').value = j.location;
      document.getElementById('jf-format').value = j.format;
      openOverlay('modal-jbt');
      setTimeout(()=>document.getElementById('jf-date').focus(),50);
    }
  }

  function openOverlay(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(type) {
    const ids = {board:'modal-board', tournament:'modal-tournament', honor:'modal-honor', jbt:'modal-jbt'};
    document.getElementById(ids[type]).classList.remove('open');
  }

  function saveModal(type) {
    const { index } = editCtx;
    const isEdit = index !== null;

    if(type==='board') {
      const name = document.getElementById('mf-name').value.trim();
      if(!name) { document.getElementById('mf-name').focus(); return; }
      const m = { role:document.getElementById('mf-role').value, name, email:document.getElementById('mf-email').value.trim(), phone:document.getElementById('mf-phone').value.trim(), photo:document.getElementById('mf-photo').value.trim() };
      if(!siteData.board) siteData.board = {members:[]};
      if(isEdit) siteData.board.members[index]=m; else siteData.board.members.push(m);
      closeModal('board');
      renderBoardList();
      saveSection('board', true);

    } else if(type==='tournament') {
      const name = document.getElementById('tf-name').value.trim();
      if(!name) { document.getElementById('tf-name').focus(); return; }
      const t = { name, date:document.getElementById('tf-date').value.trim(), center:document.getElementById('tf-center').value.trim() || 'TBD', type:document.getElementById('tf-type').value, type_color:document.getElementById('tf-type-color').value, status:document.getElementById('tf-status').value, status_color:document.getElementById('tf-status-color').value };
      if(!siteData.tournaments) siteData.tournaments=[];
      if(isEdit) siteData.tournaments[index]=t; else siteData.tournaments.push(t);
      closeModal('tournament');
      renderTournamentList();
      saveSection('tournaments', true);

    } else if(type==='honor') {
      const bowler = document.getElementById('hf-bowler').value.trim();
      if(!bowler) { document.getElementById('hf-bowler').focus(); return; }
      const h = { bowler, score:document.getElementById('hf-score').value.trim(), type:document.getElementById('hf-type').value, league:document.getElementById('hf-league').value.trim(), date:document.getElementById('hf-date').value.trim() };
      if(!siteData.honor_scores) siteData.honor_scores=[];
      if(isEdit) siteData.honor_scores[index]=h; else siteData.honor_scores.push(h);
      closeModal('honor');
      renderHonorList();
      saveSection('honor', true);

    } else if(type==='jbt') {
      const date = document.getElementById('jf-date').value.trim();
      if(!date) { document.getElementById('jf-date').focus(); return; }
      const j = { date, location:document.getElementById('jf-location').value.trim(), format:document.getElementById('jf-format').value };
      if(!siteData.jbt_schedule) siteData.jbt_schedule=[];
      if(isEdit) siteData.jbt_schedule[index]=j; else siteData.jbt_schedule.push(j);
      closeModal('jbt');
      renderJbtList();
      saveSection('jbt', true);
    }
  }

  function removeItem(type, index) {
    const names = {board:'board member',tournament:'tournament',honor:'honor score',jbt:'event'};
    if(!confirm(`Remove this ${names[type]}?`)) return;
    if(type==='board') siteData.board.members.splice(index,1);
    else if(type==='tournament') siteData.tournaments.splice(index,1);
    else if(type==='honor') siteData.honor_scores.splice(index,1);
    else if(type==='jbt') siteData.jbt_schedule.splice(index,1);
    refreshRender(type);
    saveSection(type==='board'?'board':type==='tournament'?'tournaments':type==='honor'?'honor':'jbt', true);
  }

  // ── Save sections ─────────────────────────────────────────────
  async function saveSection(section, silent=false) {
    const endpoints = {
      announcement: { url:'/api/announcement', body:siteData.announcement },
      board: { url:'/api/board', body:{members: siteData.board?.members||[]} },
      tournaments: { url:'/api/tournaments', body:{tournaments: siteData.tournaments||[]} },
      honor: { url:'/api/honor', body:{honor_scores: siteData.honor_scores||[]} },
      jbt: { url:'/api/jbt', body:{jbt_schedule: siteData.jbt_schedule||[]} },
      contact: { url:'/api/contact', body: buildContact() },
    };

    // For announcement, build from form first
    if(section==='announcement') {
      siteData.announcement = {
        visible: document.getElementById('ann-visible').checked,
        text: document.getElementById('ann-text').value.trim(),
        link_text: document.getElementById('ann-link-text').value.trim(),
        link: document.getElementById('ann-link').value.trim(),
        type: document.getElementById('ann-type').value,
        label: document.getElementById('ann-label').value.trim()
      };
      endpoints.announcement.body = siteData.announcement;
    }

    const { url, body } = endpoints[section];
    try {
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','x-admin-token':token}, body:JSON.stringify(body) });
      if (res.status === 401) { doLogout(SESSION_EXPIRED); return; }
      if (!res.ok) throw new Error(`server said ${res.status}`);
      if(!silent) toast('Published ✓', 'ok');
    } catch (e) {
      toast(`Save failed (${e.message || 'no connection'})`, 'err');
    }
  }

  function buildContact() {
    return {
      manager_name: document.getElementById('c-name').value.trim(),
      manager_role: document.getElementById('c-role').value.trim(),
      email: document.getElementById('c-email').value.trim(),
      phone: document.getElementById('c-phone').value.trim(),
      address_line1: document.getElementById('c-addr1').value.trim(),
      address_line2: document.getElementById('c-addr2').value.trim(),
      facebook_url: document.getElementById('c-fb').value.trim(),
    };
  }

  // ── Toast ─────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, type='') {
    const el=document.getElementById('toast');
    el.textContent=msg; el.className=`show ${type}`;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove('show'),3000);
  }

  // ── Escape html ───────────────────────────────────────────────
  function esc(s) {
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Keyboard / overlay close ──────────────────────────────────
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target===ov) ov.classList.remove('open'); });
  });
  document.addEventListener('keydown', e => {
    if(e.key==='Escape') document.querySelectorAll('.overlay.open').forEach(ov=>ov.classList.remove('open'));
  });

  // ── Auto-login ────────────────────────────────────────────────
  const saved = sessionStorage.getItem('tok');
  if(saved) { token=saved; showApp(); }

  // Buttons use data-action="fn" data-args="a,1" (data-self passes the element) instead of inline onclick
  const ACTIONS = { doLogin, doLogout, switchSection, saveSection, openModal, closeModal, saveModal, removeItem };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || !ACTIONS[el.dataset.action]) return;
    const args = (el.dataset.args || '').split(',').filter(a => a !== '').map(a => /^\d+$/.test(a) ? Number(a) : a);
    if ('self' in el.dataset) args.push(el);
    ACTIONS[el.dataset.action](...args);
  });

  // Home page banner types - keep in sync with BANNER_TYPES in server.js
  const BANNER_TYPES = {
    reminder:     { icon: '📢', label: 'Reminder' },
    announcement: { icon: '📣', label: 'Announcement' },
    important:    { icon: '⚠️', label: 'Important' },
    event:        { icon: '📅', label: 'Upcoming Event' },
    congrats:     { icon: '🎉', label: 'Congratulations' },
    info:         { icon: 'ℹ️', label: 'Info' },
  };

  function renderAnnouncementPreview() {
    const typeKey = document.getElementById('ann-type').value;
    const type = BANNER_TYPES[typeKey] || BANNER_TYPES.reminder;
    const heading = document.getElementById('ann-label').value.trim() || type.label;
    const text = document.getElementById('ann-text').value.trim();
    const linkText = document.getElementById('ann-link-text').value.trim();
    const link = document.getElementById('ann-link').value.trim();
    const preview = document.getElementById('ann-preview');
    preview.className = `ann-preview alert alert-${typeKey}`;
    preview.innerHTML = `<strong>${type.icon} ${esc(heading)}:</strong> ${esc(text)}` +
      (link && linkText ? ` <a href="#">${esc(linkText)}</a>!` : '');
  }
  ['ann-type', 'ann-label', 'ann-text', 'ann-link-text', 'ann-link'].forEach(id =>
    document.getElementById(id).addEventListener('input', renderAnnouncementPreview));
