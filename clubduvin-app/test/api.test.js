const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'club-')), 'test.db');
process.env.ADMIN_EMAIL = 'admin@test.ch'; process.env.ADMIN_PASSWORD = 'admin-pass-123';
const { server } = require('../server.js');

let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); })));
test.after(() => server.close());

async function call(p, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

test('Ablauf: Admin postet, Mitglied liest, Mitglied darf nicht posten', async () => {
  assert.equal((await call('/api/posts')).status, 401);
  assert.equal((await call('/api/login', { method: 'POST', body: { email: 'admin@test.ch', password: 'falsch' } })).status, 401);
  const admin = (await call('/api/login', { method: 'POST', body: { email: 'admin@test.ch', password: 'admin-pass-123' } })).cookie;

  const post = await call('/api/posts', { method: 'POST', cookie: admin, body: { kind: 'offer', title: 'Rosé de Provence', price: 'CHF 19.–', image_url: 'javascript:alert(1)' } });
  assert.equal(post.status, 201);
  const added = await call('/api/members', { method: 'POST', cookie: admin, body: { name: 'Marie', email: 'Marie@Test.ch' } });
  assert.equal(added.status, 201);
  assert.equal((await call('/api/members', { method: 'POST', cookie: admin, body: { name: 'X', email: 'marie@test.ch' } })).status, 409);

  const member = (await call('/api/login', { method: 'POST', body: { email: 'marie@test.ch', password: added.data.tempPassword } })).cookie;
  const me = await call('/api/me', { cookie: member });
  assert.equal(me.data.must_change_password, 1);
  const list = await call('/api/posts', { cookie: member });
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].image_url, '', 'unsichere URL wird verworfen');
  assert.equal((await call('/api/posts', { method: 'POST', cookie: member, body: { title: 'x' } })).status, 403);
  assert.equal((await call('/api/members', { cookie: member })).status, 403);

  assert.equal((await call('/api/password', { method: 'POST', cookie: member, body: { current: added.data.tempPassword, next: 'neues-passwort' } })).status, 200);
  assert.equal((await call('/api/logout', { method: 'POST', cookie: member, body: {} })).status, 200);
  assert.equal((await call('/api/me', { cookie: member })).status, 401);
});
