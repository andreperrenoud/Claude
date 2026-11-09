// Le Club du Vin – Frontend (ohne Framework). Alle Inhalte werden per textContent gesetzt.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let me = null;
let posts = [];

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error(data.error || 'Bitte anmelden.'); }
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const fmtDate = (s) => new Date(s.replace(' ', 'T') + (s.length === 19 ? 'Z' : '')).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------- Ansichten ----------
function showLogin() { $('#view-app').hidden = true; $('#view-login').hidden = false; }

async function boot() {
  try { me = await api('/api/me'); } catch { return showLogin(); }
  $('#view-login').hidden = true; $('#view-app').hidden = false;
  $('#hello').textContent = `Salut, ${me.name.split(' ')[0]}`;
  $('#account-info').textContent = `${me.name} · ${me.email}${me.role === 'admin' ? ' · Admin' : ''}`;
  $('#tab-admin').hidden = me.role !== 'admin';
  $('#pw-notice').hidden = !me.must_change_password;
  go(me.must_change_password ? 'account' : (location.hash.slice(1) || 'offers'));
  await loadPosts();
  if (me.role === 'admin') loadMembers();
}

function go(tab) {
  if (tab === 'admin' && me?.role !== 'admin') tab = 'offers';
  if (!$(`[data-tab="${tab}"]`)) tab = 'offers';
  $$('.tab').forEach((s) => (s.hidden = s.dataset.tab !== tab));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.go === tab));
  history.replaceState(null, '', `#${tab}`);
  window.scrollTo(0, 0);
}

async function loadPosts() {
  posts = await api('/api/posts');
  render('offer', $('#list-offer'), 'Gerade keine Angebote – bald wird wieder geschmuggelt.');
  render('news', $('#list-news'), 'Noch keine News aus dem Club.');
}

function render(kind, container, emptyText) {
  container.replaceChildren();
  const today = new Date().toISOString().slice(0, 10);
  const items = posts.filter((p) => p.kind === kind);
  if (!items.length) return container.append(el('p', { class: 'empty' }, emptyText));
  for (const p of items) {
    const card = $('#tpl-card').content.firstElementChild.cloneNode(true);
    if (p.pinned) card.classList.add('pinned');
    const img = $('.card-img', card);
    if (p.image_url) { img.onerror = () => img.remove(); img.src = p.image_url; } else img.remove();
    const meta = $('.card-meta', card);
    if (p.pinned) meta.append(el('span', { class: 'badge' }, 'Angeheftet'));
    meta.append(el('span', {}, fmtDate(p.created_at)));
    if (p.valid_until) {
      const expired = p.valid_until < today;
      meta.append(el('span', { class: expired ? 'badge expired' : 'badge' }, expired ? 'Abgelaufen' : `bis ${fmtDate(p.valid_until)}`));
    }
    $('.card-title', card).textContent = p.title;
    const price = $('.card-price', card);
    if (p.price) price.textContent = p.price; else price.remove();
    $('.card-text', card).textContent = p.body;
    const actions = $('.card-actions', card);
    if (p.link_url) actions.append(el('a', { class: 'btn primary small', href: p.link_url, target: '_blank', rel: 'noopener' }, kind === 'offer' ? 'Jetzt bestellen' : 'Mehr erfahren'));
    if (me.role === 'admin') {
      const edit = el('button', { class: 'btn ghost small', type: 'button' }, 'Bearbeiten');
      edit.onclick = () => editPost(p);
      const del = el('button', { class: 'btn ghost small danger', type: 'button' }, 'Löschen');
      del.onclick = async () => { if (confirm(`„${p.title}“ löschen?`)) { await api(`/api/posts/${p.id}`, { method: 'DELETE' }); loadPosts(); } };
      actions.append(edit, del);
    }
    container.append(card);
  }
}

// ---------- Admin: Beiträge ----------
const postForm = $('#post-form');
function syncKind() { const offer = postForm.kind.value === 'offer'; $$('.offer-only', postForm).forEach((l) => (l.hidden = !offer)); }
$$('input[name="kind"]', postForm).forEach((r) => r.addEventListener('change', syncKind));

function editPost(p) {
  go('admin');
  postForm.id.value = p.id; postForm.kind.value = p.kind; postForm.title.value = p.title; postForm.body.value = p.body;
  postForm.price.value = p.price; postForm.valid_until.value = p.valid_until; postForm.image_url.value = p.image_url;
  postForm.link_url.value = p.link_url; postForm.pinned.checked = !!p.pinned;
  $('#post-form-title').textContent = 'Beitrag bearbeiten'; $('#post-cancel').hidden = false; syncKind();
  postForm.title.focus();
}
function resetPostForm() { postForm.reset(); postForm.id.value = ''; $('#post-form-title').textContent = 'Neuer Beitrag'; $('#post-cancel').hidden = true; syncKind(); }
$('#post-cancel').onclick = resetPostForm;

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#post-msg'); msg.className = 'error'; msg.textContent = '';
  const f = postForm;
  const body = { kind: f.kind.value, title: f.title.value, body: f.body.value, price: f.kind.value === 'offer' ? f.price.value : '',
    valid_until: f.kind.value === 'offer' ? f.valid_until.value : '', image_url: f.image_url.value, link_url: f.link_url.value, pinned: f.pinned.checked };
  try {
    if (f.id.value) await api(`/api/posts/${f.id.value}`, { method: 'PUT', body });
    else await api('/api/posts', { method: 'POST', body });
    const kind = body.kind;
    resetPostForm(); await loadPosts();
    msg.className = 'error ok'; msg.textContent = 'Gespeichert.';
    setTimeout(() => go(kind === 'offer' ? 'offers' : 'news'), 500);
  } catch (err) { msg.textContent = err.message; }
});

// ---------- Admin: Mitglieder ----------
async function loadMembers() {
  const list = await api('/api/members');
  const tbody = $('#member-list'); tbody.replaceChildren();
  for (const m of list) {
    const tr = el('tr');
    tr.append(el('td', {}, m.name + (m.role === 'admin' ? ' (Admin)' : '')), el('td', {}, m.email), el('td', {}, m.active ? 'aktiv' : 'gesperrt'));
    const td = el('td');
    if (m.id !== me.id) {
      const reset = el('button', { class: 'btn ghost small', type: 'button' }, 'Neues Passwort');
      reset.onclick = async () => {
        if (!confirm(`Neues Passwort für ${m.name} erzeugen?`)) return;
        const r = await api(`/api/members/${m.id}/reset`, { method: 'POST', body: {} });
        showCredentials(m.email, r.tempPassword);
      };
      const toggle = el('button', { class: 'btn ghost small', type: 'button' }, m.active ? 'Sperren' : 'Aktivieren');
      toggle.onclick = async () => { await api(`/api/members/${m.id}/toggle`, { method: 'POST', body: {} }); loadMembers(); };
      td.append(reset, toggle);
    }
    tr.append(td); tbody.append(tr);
  }
}
function showCredentials(email, pw) {
  const box = $('#member-result'); box.replaceChildren();
  box.append(el('strong', {}, 'Zugangsdaten zum Weitergeben:'), el('br'), document.createTextNode(`E-Mail: ${email}`), el('br'),
    document.createTextNode(`Passwort: ${pw}`), el('br'), el('span', { class: 'small muted' }, 'Wird nur jetzt angezeigt. Beim ersten Login wird ein eigenes Passwort verlangt.'));
  box.hidden = false;
}
$('#member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const msg = $('#member-msg'); msg.textContent = '';
  try {
    const r = await api('/api/members', { method: 'POST', body: { name: f.name.value, email: f.email.value, role: f.admin.checked ? 'admin' : 'member' } });
    showCredentials(r.email, r.tempPassword); f.reset(); loadMembers();
  } catch (err) { msg.textContent = err.message; }
});

// ---------- Login / Konto ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; $('#login-error').textContent = '';
  try { await api('/api/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); f.reset(); boot(); }
  catch (err) { $('#login-error').textContent = err.message; }
});
$('#logout').onclick = async () => { await api('/api/logout', { method: 'POST', body: {} }).catch(() => {}); me = null; showLogin(); };
$('#pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const msg = $('#pw-msg'); msg.className = 'error'; msg.textContent = '';
  try {
    await api('/api/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } });
    f.reset(); msg.className = 'error ok'; msg.textContent = 'Passwort geändert.'; $('#pw-notice').hidden = true; me.must_change_password = 0;
  } catch (err) { msg.textContent = err.message; }
});
$$('.tabbar button').forEach((b) => (b.onclick = () => go(b.dataset.go)));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
