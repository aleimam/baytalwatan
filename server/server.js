#!/usr/bin/env node
/* ============================================================================
   Bayt Alwatan — minimal auth/admin API (PURE NODE, zero dependencies).
   - No npm install, no native modules, no build tools required.
   - Runs behind nginx:  proxy /api/  ->  http://127.0.0.1:PORT
   - Stores users + settings as JSON files OUTSIDE the web root.
   - Sessions are stateless, signed (HMAC) HttpOnly cookies.

   Run:   PORT=3000 DATA_DIR=/home/bayt node server/server.js
   Seed admin (password stays in your shell, never in the repo):
          node server/server.js seed-admin aleimam@live.com 'PASSWORD' 'Admin'
   ========================================================================== */
'use strict';
const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const url     = require('url');

const PORT        = parseInt(process.env.PORT || '3000', 10);
const HOST        = process.env.HOST || '127.0.0.1';
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '..', '..'); // outside webroot by default
const USERS_FILE  = process.env.USERS_FILE    || path.join(DATA_DIR, 'bayt_users.json');
const SETT_FILE   = process.env.SETTINGS_FILE || path.join(DATA_DIR, 'bayt_settings.json');
const SECRET_FILE = process.env.SECRET_FILE   || path.join(DATA_DIR, 'bayt_session_secret');
const VISITS_FILE = process.env.VISITS_FILE   || path.join(DATA_DIR, 'bayt_visits.jsonl');
const WISH_FILE   = process.env.WISH_FILE     || path.join(DATA_DIR, 'bayt_wishlists.json');
const WEBROOT     = process.env.WEBROOT || ''; // optional: also serve static files (handy for local dev)
const SESSION_DAYS = 30;
const VISITS_KEEP  = 30000;   // cap the visit log to the most recent N events

/* ---------- tiny JSON store (atomic writes) ---------- */
function readJSON(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeJSON(file, obj){ const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, file); }
const loadUsers    = () => readJSON(USERS_FILE, []);
const saveUsers    = (u) => writeJSON(USERS_FILE, u);
const loadSettings = () => readJSON(SETT_FILE, {});
const saveSettings = (s) => writeJSON(SETT_FILE, s);

/* ---------- session secret (generated once, persisted) ---------- */
function getSecret(){
  try { return fs.readFileSync(SECRET_FILE, 'utf8'); }
  catch (e) {
    const s = crypto.randomBytes(48).toString('hex');
    try { fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); } catch (_) {}
    return s;
  }
}
const SECRET = getSecret();

/* ---------- password hashing (scrypt — built in, no native build) ---------- */
function hashPassword(pw){
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(pw), salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + dk.toString('hex');
}
function verifyPassword(pw, stored){
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const dk = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64);
    const a = Buffer.from(hashHex, 'hex');
    return a.length === dk.length && crypto.timingSafeEqual(a, dk);
  } catch (e) { return false; }
}

/* ---------- stateless sessions (signed cookie) ---------- */
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
function makeToken(user){
  const payload = { uid: user.id, email: user.email, exp: Date.now() + SESSION_DAYS * 864e5 };
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b + '.' + sign(b);
}
function readToken(token){
  if (!token || token.indexOf('.') < 0) return null;
  const [b, sig] = token.split('.');
  if (sign(b) !== sig) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')); return p.exp < Date.now() ? null : p; }
  catch (e) { return null; }
}
function parseCookies(req){
  const o = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function currentUser(req){
  const p = readToken(parseCookies(req).bw_sess);
  if (!p) return null;
  return loadUsers().find(x => x.id === p.uid || x.email === p.email) || null;
}
function setSessionCookie(res, user, secure){
  res.setHeader('Set-Cookie', `bw_sess=${encodeURIComponent(makeToken(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}
const clearSessionCookie = (res) => res.setHeader('Set-Cookie', 'bw_sess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');

/* ---------- helpers ---------- */
const publicUser = (u) => u ? { id: u.id, full_name: u.full_name, email: u.email, phone: u.phone, role: u.role || 'user' } : null;
function json(res, code, obj){ res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function readBody(req){ return new Promise(resolve => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } }); }); }
const nextId = (users) => users.reduce((m, u) => Math.max(m, u.id || 0), 0) + 1;
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ''));

/* ---------- visitor tracking ---------- */
function clientIp(req){
  const xff = req.headers['x-forwarded-for'];
  const ip = xff ? String(xff).split(',')[0].trim() : (req.socket.remoteAddress || '');
  return ip.replace('::ffff:', '');
}
function parseUA(ua){
  ua = ua || '';
  let os = '—';
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11'; else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android'; else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS'; else if (/Linux/i.test(ua)) os = 'Linux';
  let br = '—';
  if (/Edg\//i.test(ua)) br = 'Edge'; else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
  else if (/Chrome\//i.test(ua)) br = 'Chrome'; else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Safari\//i.test(ua)) br = 'Safari';
  const dev = /Mobile|Android|iPhone|iPod/i.test(ua) ? 'Mobile' : (/iPad|Tablet/i.test(ua) ? 'Tablet' : 'Desktop');
  return { os, br, dev };
}
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
async function handleTrack(req, res){
  const b = await readBody(req);
  const me = currentUser(req);
  const ua = req.headers['user-agent'] || '';
  const p = parseUA(ua);
  const rec = {
    ts: new Date().toISOString(), sid: clip(b.sid, 40), ip: clientIp(req),
    os: p.os, br: p.br, dev: p.dev, ua: clip(ua, 280),
    path: clip(b.path, 160), ref: clip(b.ref, 200), scr: clip(b.scr, 20),
    lang: clip(b.lang, 12), tz: clip(b.tz, 40),
    dur: Math.max(0, Math.min(86400, parseInt(b.dur, 10) || 0)),
    views: Math.max(0, Math.min(100000, parseInt(b.views, 10) || 0)),
    user: me ? me.email : null
  };
  try { fs.appendFileSync(VISITS_FILE, JSON.stringify(rec) + '\n'); } catch (e) {}
  res.writeHead(204); res.end();
}
function readVisitEvents(){
  let lines;
  try { lines = fs.readFileSync(VISITS_FILE, 'utf8').split('\n'); } catch (e) { return []; }
  if (lines.length > VISITS_KEEP + 2000) {           // occasional trim to keep the file bounded
    lines = lines.slice(-VISITS_KEEP);
    try { fs.writeFileSync(VISITS_FILE, lines.join('\n')); } catch (e) {}
  }
  const out = [];
  for (const l of lines) { if (!l) continue; try { out.push(JSON.parse(l)); } catch (e) {} }
  return out;
}
function aggregateVisits(){
  const ev = readVisitEvents();
  const S = {};
  for (const e of ev){
    const sid = e.sid || (e.ip + '|' + clip(e.ts, 13));
    const s = S[sid] || (S[sid] = { sid, first: e.ts, last: e.ts, ip: e.ip, os: e.os, br: e.br, dev: e.dev, path: e.path, ref: e.ref, scr: e.scr, lang: e.lang, tz: e.tz, dur: 0, views: 1, user: e.user || null });
    s.last = e.ts; if (e.dur > s.dur) s.dur = e.dur; if (e.views > s.views) s.views = e.views; if (e.user) s.user = e.user;
  }
  const list = Object.values(S).sort((a, b) => (a.last < b.last ? 1 : -1));
  const totalDur = list.reduce((a, s) => a + s.dur, 0);
  const dayAgo = Date.now() - 864e5;
  const summary = {
    sessions: list.length,
    uniqueIps: new Set(list.map(s => s.ip)).size,
    registered: list.filter(s => s.user).length,
    last24h: list.filter(s => new Date(s.last).getTime() > dayAgo).length,
    avgDur: list.length ? Math.round(totalDur / list.length) : 0,
    totalDur
  };
  return { summary, sessions: list.slice(0, 800) };
}

/* ---------- wishlists (per user) ---------- */
const loadWish = () => readJSON(WISH_FILE, {});
const saveWish = (w) => writeJSON(WISH_FILE, w);
function newWid(){ return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
async function handleWishlists(req, res, action){
  const me = currentUser(req);
  if (!me) return json(res, 401, { error: 'login required' });
  const all = loadWish();
  const mine = all[me.email] || (all[me.email] = []);
  if (action === '' || action === 'list') return json(res, 200, { wishlists: mine });
  const body = await readBody(req);
  const id = clip(body.id, 40);
  const wl = mine.find(w => w.id === id);
  const now = new Date().toISOString();
  if (action === 'create') {
    if (mine.length >= 40) return json(res, 200, { error: 'too many wishlists', wishlists: mine });
    const w = { id: newWid(), name: clip(body.name, 60).trim() || 'قائمتي', plots: [], created_at: now, updated_at: now };
    mine.push(w); saveWish(all); return json(res, 200, { wishlists: mine, created: w.id });
  }
  if (action === 'rename') { if (wl) { wl.name = clip(body.name, 60).trim() || wl.name; wl.updated_at = now; saveWish(all); } return json(res, 200, { wishlists: mine }); }
  if (action === 'delete') { all[me.email] = mine.filter(w => w.id !== id); saveWish(all); return json(res, 200, { wishlists: all[me.email] }); }
  if (action === 'add')    { if (wl) { const p = clip(body.plot, 40); if (p && wl.plots.indexOf(p) < 0) { wl.plots.push(p); wl.updated_at = now; saveWish(all); } } return json(res, 200, { wishlists: mine }); }
  if (action === 'remove') { if (wl) { const p = clip(body.plot, 40); wl.plots = wl.plots.filter(x => x !== p); wl.updated_at = now; saveWish(all); } return json(res, 200, { wishlists: mine }); }
  return json(res, 400, { error: 'unknown action' });
}
function aggregateWishlists(){
  const all = loadWish();
  const lists = [], freq = {};
  let savedPlots = 0;
  for (const email in all) {
    for (const w of all[email]) {
      lists.push({ user: email, id: w.id, name: w.name, count: (w.plots || []).length, plots: w.plots || [], created_at: w.created_at });
      savedPlots += (w.plots || []).length;
      for (const p of (w.plots || [])) freq[p] = (freq[p] || 0) + 1;
    }
  }
  const topPlots = Object.entries(freq).map(([plot, count]) => ({ plot, count })).sort((a, b) => b.count - a.count).slice(0, 150);
  const summary = { wishlists: lists.length, users: Object.keys(all).length, savedPlots, uniquePlots: Object.keys(freq).length };
  return { summary, lists: lists.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 600), topPlots };
}

/* ---------- auth ---------- */
async function handleAuth(req, res, action, secure){
  if (action === 'me')     { const u = currentUser(req); return json(res, 200, u ? { auth: true, user: publicUser(u) } : { auth: false }); }
  if (action === 'logout') { clearSessionCookie(res); return json(res, 200, { auth: false }); }
  const body = await readBody(req);
  if (action === 'register') {
    const full_name = String(body.full_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    if (!full_name || !isEmail(email) || password.length < 6)
      return json(res, 200, { auth: false, error: 'بيانات غير صحيحة — تحقق من الاسم والبريد وكلمة المرور (6 أحرف على الأقل).' });
    const users = loadUsers();
    if (users.some(u => u.email === email))
      return json(res, 200, { auth: false, error: 'هذا البريد مسجّل بالفعل. سجّل الدخول بدلاً من ذلك.' });
    const u = { id: nextId(users), full_name, email, phone, password_hash: hashPassword(password), created_at: new Date().toISOString(), role: 'user' };
    users.push(u); saveUsers(users);
    setSessionCookie(res, u, secure);
    return json(res, 200, { auth: true, user: publicUser(u) });
  }
  if (action === 'login') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const u = loadUsers().find(x => x.email === email);
    if (!u || !verifyPassword(password, u.password_hash))
      return json(res, 200, { auth: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
    setSessionCookie(res, u, secure);
    return json(res, 200, { auth: true, user: publicUser(u) });
  }
  return json(res, 400, { error: 'unknown action' });
}

/* ---------- admin ---------- */
async function handleAdmin(req, res, action){
  if (action === 'settings_get') return json(res, 200, { settings: loadSettings() }); // public
  const me = currentUser(req);
  if (!me || me.role !== 'admin') return json(res, 403, { error: 'admin only' });
  if (action === 'users') return json(res, 200, { users: loadUsers().map(publicUser) });
  if (action === 'visits') return json(res, 200, aggregateVisits());
  if (action === 'wishlists') return json(res, 200, aggregateWishlists());
  const body = await readBody(req);
  if (action === 'set_role') {
    const users = loadUsers();
    const u = users.find(x => x.email === String(body.email || '').toLowerCase());
    if (u) { u.role = body.role === 'admin' ? 'admin' : 'user'; saveUsers(users); }
    return json(res, 200, { ok: true });
  }
  if (action === 'delete_user') {
    const em = String(body.email || '').toLowerCase();
    saveUsers(loadUsers().filter(x => x.email !== em));
    return json(res, 200, { ok: true });
  }
  if (action === 'settings_set') {
    const s = Object.assign(loadSettings(), body.settings || {});
    saveSettings(s);
    return json(res, 200, { ok: true, settings: s });
  }
  return json(res, 400, { error: 'unknown action' });
}

/* ---------- optional static serving (local dev convenience) ---------- */
const MIME = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp','.gif':'image/gif' };
function serveStatic(req, res){
  if (!WEBROOT) { res.writeHead(404); return res.end('not found'); }
  let p = decodeURIComponent((url.parse(req.url).pathname || '/'));
  if (p === '/' || p === '') p = '/index.html';
  const full = path.join(WEBROOT, path.normalize(p));
  if (!full.startsWith(path.resolve(WEBROOT))) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- CLI: seed admin (keeps password out of the repo) ---------- */
if (process.argv[2] === 'seed-admin') {
  const email = (process.argv[3] || '').toLowerCase();
  const password = process.argv[4] || '';
  const name = process.argv[5] || 'Administrator';
  if (!email || !password) { console.error("usage: node server.js seed-admin EMAIL PASSWORD [NAME]"); process.exit(1); }
  const users = loadUsers();
  let u = users.find(x => x.email === email);
  if (u) { u.role = 'admin'; u.password_hash = hashPassword(password); if (name) u.full_name = name; }
  else users.push({ id: nextId(users), full_name: name, email, phone: '', password_hash: hashPassword(password), created_at: new Date().toISOString(), role: 'admin' });
  saveUsers(users);
  console.log('Admin seeded:', email, '(users file:', USERS_FILE + ')');
  process.exit(0);
}

/* ---------- router ---------- */
const SRV = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const action = u.query.action || '';
  const secure = (req.headers['x-forwarded-proto'] === 'https');
  try {
    if (u.pathname === '/api/ping')  return json(res, 200, { ok: true });
    if (u.pathname === '/api/track') return await handleTrack(req, res);
    if (u.pathname === '/api/wishlists') return await handleWishlists(req, res, action);
    if (u.pathname === '/api/auth')  return await handleAuth(req, res, action, secure);
    if (u.pathname === '/api/admin') return await handleAdmin(req, res, action);
    return serveStatic(req, res);
  } catch (e) {
    json(res, 500, { error: 'server error' });
  }
});
SRV.on('error', (e) => { console.error('[bayt-api] listen error:', e.code === 'EADDRINUSE' ? `port ${PORT} already in use` : e.message); process.exit(1); });
SRV.listen(PORT, HOST, () => console.log(`Bayt Alwatan API on http://${HOST}:${PORT}  (users: ${USERS_FILE})`));
