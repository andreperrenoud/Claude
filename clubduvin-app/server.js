// Bouiboui.vin – Le Club du Vin
// Mitglieder-App: Login, Angebote, News, Admin-Bereich.
// Keine externen Abhängigkeiten: Node >= 22.5 (node:sqlite, node:crypto, node:http).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'club.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 30;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('offer','news')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '',
    valid_until TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    author_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------- Passwörter & Sessions ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function tempPassword() {
  // gut lesbar, ohne verwechselbare Zeichen
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('');
}

function createSession(memberId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO sessions (token_hash, member_id, expires_at)
              VALUES (?, ?, datetime('now', ?))`).run(sha256(token), memberId, `+${SESSION_DAYS} days`);
  return token;
}
function sessionCookie(token, maxAge) {
  return `club_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${COOKIE_SECURE ? '; Secure' : ''}`;
}
function currentMember(req) {
  const m = /(?:^|;\s*)club_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  return db.prepare(`SELECT m.id, m.email, m.name, m.role, m.must_change_password
      FROM sessions s JOIN members m ON m.id = s.member_id
      WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND m.active = 1`).get(sha256(m[1])) || null;
}

// Einfache Bremse gegen Passwort-Raten: max. 10 Fehlversuche / 15 Min. pro IP
const failedLogins = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (failedLogins.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  failedLogins.set(ip, list);
  return list.length >= 10;
}

// ---------- Ersteinrichtung: Admin-Konto ----------
if (!db.prepare(`SELECT 1 FROM members WHERE role = 'admin' LIMIT 1`).get()) {
  const email = process.env.ADMIN_EMAIL || 'mail@bouiboui.vin';
  const pw = process.env.ADMIN_PASSWORD || tempPassword();
  db.prepare(`INSERT INTO members (email, name, password_hash, role, must_change_password)
              VALUES (?, 'Bouiboui Admin', ?, 'admin', ?)`).run(email, hashPassword(pw), process.env.ADMIN_PASSWORD ? 0 : 1);
  console.log(`\n  Admin-Konto angelegt:\n    E-Mail:   ${email}\n    Passwort: ${pw}\n  (Bitte nach dem ersten Login ändern.)\n`);
}

// ---------- HTTP-Helfer ----------
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const str = (v, max = 5000) => String(v ?? '').trim().slice(0, max);
function safeUrl(v) {
  const s = str(v, 1000);
  if (!s) return '';
  try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function postFields(b) {
  return {
    kind: b.kind === 'news' ? 'news' : 'offer',
    title: str(b.title, 200),
    body: str(b.body, 10000),
    image_url: safeUrl(b.image_url),
    link_url: safeUrl(b.link_url),
    price: str(b.price, 50),
    valid_until: /^\d{4}-\d{2}-\d{2}$/.test(str(b.valid_until)) ? str(b.valid_until) : '',
    pinned: b.pinned ? 1 : 0,
  };
}

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname; const method = req.method;
  // CSRF-Schutz: schreibende Anfragen nur als JSON vom eigenen Origin
  if (method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Ungültige Herkunft' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON erwartet' });
  }

  if (p === '/api/login' && method === 'POST') {
    const ip = req.socket.remoteAddress;
    if (tooManyAttempts(ip)) return send(res, 429, { error: 'Zu viele Versuche. Bitte später erneut versuchen.' });
    const b = await readJson(req);
    const row = db.prepare(`SELECT * FROM members WHERE email = ? AND active = 1`).get(str(b.email, 200));
    if (!row || !verifyPassword(str(b.password, 200), row.password_hash)) {
      failedLogins.get(ip).push(Date.now());
      return send(res, 401, { error: 'E-Mail oder Passwort ist falsch.' });
    }
    const token = createSession(row.id);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
  }

  const me = currentMember(req);
  if (p === '/api/logout' && method === 'POST') {
    const m = /(?:^|;\s*)club_session=([^;]+)/.exec(req.headers.cookie || '');
    if (m) db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(sha256(m[1]));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if (!me) return send(res, 401, { error: 'Bitte anmelden.' });

  if (p === '/api/me' && method === 'GET') return send(res, 200, me);

  if (p === '/api/password' && method === 'POST') {
    const b = await readJson(req);
    const row = db.prepare(`SELECT password_hash FROM members WHERE id = ?`).get(me.id);
    if (!verifyPassword(str(b.current, 200), row.password_hash)) return send(res, 400, { error: 'Aktuelles Passwort ist falsch.' });
    const next = str(b.next, 200);
    if (next.length < 8) return send(res, 400, { error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
    db.prepare(`UPDATE members SET password_hash = ?, must_change_password = 0 WHERE id = ?`).run(hashPassword(next), me.id);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/posts' && method === 'GET') {
    const kind = url.searchParams.get('kind');
    const rows = db.prepare(`SELECT p.*, m.name AS author FROM posts p LEFT JOIN members m ON m.id = p.author_id
        WHERE (? IS NULL OR p.kind = ?)
        ORDER BY p.pinned DESC, p.created_at DESC LIMIT 200`).all(kind, kind);
    return send(res, 200, rows);
  }

  // ---- ab hier nur Admin ----
  if (me.role !== 'admin') return send(res, 403, { error: 'Nur für Administratoren.' });

  if (p === '/api/posts' && method === 'POST') {
    const f = postFields(await readJson(req));
    if (!f.title) return send(res, 400, { error: 'Titel fehlt.' });
    const r = db.prepare(`INSERT INTO posts (kind, title, body, image_url, link_url, price, valid_until, pinned, author_id)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(f.kind, f.title, f.body, f.image_url, f.link_url, f.price, f.valid_until, f.pinned, me.id);
    return send(res, 201, { id: Number(r.lastInsertRowid) });
  }
  let m = /^\/api\/posts\/(\d+)$/.exec(p);
  if (m && method === 'PUT') {
    const f = postFields(await readJson(req));
    if (!f.title) return send(res, 400, { error: 'Titel fehlt.' });
    db.prepare(`UPDATE posts SET kind=?, title=?, body=?, image_url=?, link_url=?, price=?, valid_until=?, pinned=?, updated_at=datetime('now') WHERE id=?`)
      .run(f.kind, f.title, f.body, f.image_url, f.link_url, f.price, f.valid_until, f.pinned, Number(m[1]));
    return send(res, 200, { ok: true });
  }
  if (m && method === 'DELETE') {
    db.prepare(`DELETE FROM posts WHERE id = ?`).run(Number(m[1]));
    return send(res, 200, { ok: true });
  }

  if (p === '/api/members' && method === 'GET') {
    return send(res, 200, db.prepare(`SELECT id, email, name, role, active, created_at FROM members ORDER BY name`).all());
  }
  if (p === '/api/members' && method === 'POST') {
    const b = await readJson(req);
    const email = str(b.email, 200).toLowerCase(); const name = str(b.name, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return send(res, 400, { error: 'Name und gültige E-Mail angeben.' });
    const pw = tempPassword();
    try {
      db.prepare(`INSERT INTO members (email, name, password_hash, role) VALUES (?,?,?,?)`)
        .run(email, name, hashPassword(pw), b.role === 'admin' ? 'admin' : 'member');
    } catch { return send(res, 409, { error: 'Diese E-Mail ist bereits Mitglied.' }); }
    return send(res, 201, { email, tempPassword: pw });
  }
  m = /^\/api\/members\/(\d+)\/(reset|toggle)$/.exec(p);
  if (m && method === 'POST') {
    const id = Number(m[1]);
    if (id === me.id) return send(res, 400, { error: 'Das eigene Konto bitte über „Passwort ändern“ verwalten.' });
    if (m[2] === 'reset') {
      const pw = tempPassword();
      db.prepare(`UPDATE members SET password_hash = ?, must_change_password = 1 WHERE id = ?`).run(hashPassword(pw), id);
      db.prepare(`DELETE FROM sessions WHERE member_id = ?`).run(id);
      return send(res, 200, { tempPassword: pw });
    }
    db.prepare(`UPDATE members SET active = 1 - active WHERE id = ?`).run(id);
    db.prepare(`DELETE FROM sessions WHERE member_id = ?`).run(id);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Nicht gefunden' });
}

// ---------- Statische Dateien ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serveStatic(req, res, url) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Serverfehler' });
  }
});
if (require.main === module) server.listen(PORT, () => console.log(`Club du Vin läuft auf http://localhost:${PORT}`));
module.exports = { server, db };
