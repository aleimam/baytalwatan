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
const https  = require('https');
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

/* ---------- UETR wire-transfer tracking ----------
   Public search + per-source results + informational arrival queue.
   Tracking source: Ohmyfin REST (POST https://ohmyfin.ai/api/track, header "KEY: <key>").
   Key comes from OHMYFIN_API_KEY (env, never in the repo). No key -> source reports "unavailable". */
const UETR_FILE   = process.env.UETR_FILE || path.join(DATA_DIR, 'bayt_uetr.json');
const OHMYFIN_KEY = process.env.OHMYFIN_API_KEY || '';
const UETR_WIN_START = process.env.UETR_WIN_START || '2026-06-23';   // Cairo-local date window for the queue
const UETR_WIN_END   = process.env.UETR_WIN_END   || '2026-07-02';
const UETR_TRIALS_KEEP = 20000;
const loadUetr = () => { const d = readJSON(UETR_FILE, null); return (d && d.byUetr) ? d : { byUetr: {}, trials: [] }; };
const saveUetr = (d) => writeJSON(UETR_FILE, d);
const isUetr = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

function cairoParts(iso){
  if (!iso) return null; const d = new Date(iso); if (isNaN(d)) return null;
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = {}; for (const part of f.formatToParts(d)) p[part.type] = part.value;
    return { date: `${p.year}-${p.month}-${p.day}`, text: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
  } catch (e) { return { date: iso.slice(0, 10), text: iso.slice(0, 16).replace('T', ' ') }; }
}
const toCairoText = (iso) => { const c = cairoParts(iso); return c ? c.text : null; };
function inCairoWindow(iso){ const c = cairoParts(iso); return !!(c && c.date >= UETR_WIN_START && c.date <= UETR_WIN_END); }

/* one tracking source -> { name, ok, state, raw, lastupdate, details[], reason } */
function ohmyfinTrack({ uetr, amount, currency, date }){
  return new Promise(resolve => {
    if (!OHMYFIN_KEY) return resolve({ name: 'Ohmyfin', ok: false, state: 'unavailable', reason: 'no_api_key' });
    let payload;
    try { payload = JSON.stringify({ uetr, amount: Number(amount) || 0, currency: String(currency || ''), date: String(date || '') }); }
    catch (e) { return resolve({ name: 'Ohmyfin', ok: false, state: 'unavailable', reason: 'bad_input' }); }
    const opts = { method: 'POST', hostname: 'ohmyfin.ai', path: '/api/track', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'KEY': OHMYFIN_KEY } };
    const rq = https.request(opts, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        let j = null; try { j = JSON.parse(d); } catch (e) {}
        if (r.statusCode >= 400 || !j) {
          const msg = (j && (j.message || j.error)) || ('http_' + r.statusCode);
          if (/subscription|trial/i.test(msg)) return resolve({ name: 'Ohmyfin', ok: false, state: 'unavailable', reason: 'subscription' });
          if (r.statusCode === 401 || r.statusCode === 403) return resolve({ name: 'Ohmyfin', ok: false, state: 'unavailable', reason: 'auth' });
          return resolve({ name: 'Ohmyfin', ok: false, state: 'error', reason: msg });
        }
        const map = { 'success': 'delivered', 'in progress': 'in_progress', 'on hold': 'on_hold', 'rejected': 'rejected', 'unknown': 'unknown' };
        const state = map[String(j.status || '').toLowerCase()] || 'unknown';
        const details = Array.isArray(j.details) ? j.details.slice(0, 40).map(x => ({ bank: clip(x.bank, 80), swift: clip(x.swift, 16), status: clip(x.status, 40), reason: clip(x.reason, 120), route: clip(x.route, 80) })) : [];
        resolve({ name: 'Ohmyfin', ok: true, state, raw: String(j.status || ''), lastupdate: j.lastupdate || null, details, limits: j.limits || null });
      });
    });
    rq.on('error', e => resolve({ name: 'Ohmyfin', ok: false, state: 'error', reason: e.code || 'network' }));
    rq.setTimeout(12000, () => { rq.destroy(); resolve({ name: 'Ohmyfin', ok: false, state: 'error', reason: 'timeout' }); });
    rq.write(payload); rq.end();
  });
}
const UETR_SOURCES = [ohmyfinTrack];   // slot additional sources here (each returns the same shape)

const STATE_RANK = { delivered: 5, rejected: 4, on_hold: 3, in_progress: 2, unknown: 1, unavailable: 0, error: 0 };
function normalizeUetr(results){
  const perSource = results.map(r => ({ name: r.name, ok: !!r.ok, state: r.state || 'unknown', raw: r.raw || '', lastupdate: r.lastupdate || null, lastupdateCairo: toCairoText(r.lastupdate), details: r.details || [], reason: r.reason || null }));
  const best = perSource.filter(s => s.ok).sort((a, b) => (STATE_RANK[b.state] || 0) - (STATE_RANK[a.state] || 0))[0];
  const conclusion = best ? best.state : (perSource.some(s => s.reason === 'no_api_key') ? 'unconfigured' : 'unavailable');
  const found = !!best && ['delivered', 'in_progress', 'on_hold', 'rejected'].includes(best.state);
  const deliveredTimes = perSource.filter(s => s.state === 'delivered' && s.lastupdate).map(s => s.lastupdate).sort();
  const deliveryAt = deliveredTimes.length ? deliveredTimes[0] : null;
  const agreement = new Set(perSource.filter(s => s.ok).map(s => s.state)).size <= 1;
  return { perSource, conclusion, found, deliveryAt, agreement };
}
function uetrQueue(byUetr, thisUetr){
  const inWin = Object.values(byUetr).filter(r => r.deliveryAt && inCairoWindow(r.deliveryAt)).sort((a, b) => new Date(a.deliveryAt) - new Date(b.deliveryAt));
  const idx = thisUetr ? inWin.findIndex(r => r.uetr === thisUetr) : -1;
  return { position: idx >= 0 ? idx + 1 : null, total: inWin.length, windowStart: UETR_WIN_START, windowEnd: UETR_WIN_END };
}
function cairoDateToIso(dateStr){ if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null; const d = new Date(dateStr + 'T12:00:00+03:00'); return isNaN(d) ? null : d.toISOString(); }
const uetrResult = (n) => n.found ? 'found' : (n.conclusion === 'unconfigured' || n.conclusion === 'unavailable' ? 'pending' : 'failed');
async function handleUetr(req, res, action){
  const store = loadUetr();
  if (action === 'admin') {
    const me = currentUser(req); if (!me || me.role !== 'admin') return json(res, 403, { error: 'admin only' });
    return json(res, 200, aggregateUetr(store));
  }
  const body = await readBody(req);
  const uetr = String(body.uetr || '').trim().toLowerCase();
  if (!isUetr(uetr)) return json(res, 200, { error: 'invalid_uetr' });
  const me = currentUser(req), ip = clientIp(req), now = new Date().toISOString();
  if (action === 'report') {   // link-out flow: buyer reports what the free tracker showed
    const rec = store.byUetr[uetr];
    if (!rec) return json(res, 200, { error: 'not_searched' });
    const st = String(body.status || '');
    if (st === 'delivered') { rec.result = 'found'; rec.conclusion = 'delivered'; rec.deliveryAt = cairoDateToIso(clip(body.deliveredDate, 12).trim()) || rec.deliveryAt || now; }
    else if (st === 'in_progress') { rec.result = 'found'; rec.conclusion = 'in_progress'; rec.deliveryAt = null; }
    else if (st === 'not_found') { rec.result = 'failed'; rec.conclusion = 'not_found'; rec.deliveryAt = null; }
    else return json(res, 200, { error: 'bad_status' });
    rec.userReported = true; rec.reportedAt = now;
    saveUetr(store);
    return json(res, 200, { ok: true, conclusion: rec.conclusion, deliveryAtCairo: toCairoText(rec.deliveryAt), queue: uetrQueue(store.byUetr, uetr) });
  }
  const bank = clip(body.bank, 80).trim();
  const existing = store.byUetr[uetr];
  if (existing) {   // repeat: show the prior result; while not yet delivered, re-query so the order updates. Never a second queue entry.
    if (!existing.deliveryAt) {
      const re = normalizeUetr(await Promise.all(UETR_SOURCES.map(fn => fn({ uetr, amount: existing.amount, currency: existing.currency, date: existing.date }))));
      existing.result = uetrResult(re);
      existing.conclusion = re.conclusion; existing.agreement = re.agreement; existing.deliveryAt = re.deliveryAt; existing.sources = re.perSource; existing.refreshedAt = now;
    }
    store.trials.push({ uetr, at: now, result: existing.result, repeat: true, bank, user: me ? me.email : null, ip });
    if (store.trials.length > UETR_TRIALS_KEEP + 2000) store.trials = store.trials.slice(-UETR_TRIALS_KEEP);
    saveUetr(store);
    return json(res, 200, { repeat: true, firstSearchedAtCairo: toCairoText(existing.searchedAt), sources: existing.sources, conclusion: existing.conclusion, agreement: existing.agreement !== false, deliveryAtCairo: toCairoText(existing.deliveryAt), queue: uetrQueue(store.byUetr, uetr) });
  }
  const norm = normalizeUetr(await Promise.all(UETR_SOURCES.map(fn => fn({ uetr, amount: body.amount, currency: clip(body.currency, 8).toUpperCase().trim(), date: clip(body.date, 12).trim() }))));
  const rec = { uetr, bank, amount: Number(body.amount) || null, currency: clip(body.currency, 8).toUpperCase().trim(), date: clip(body.date, 12).trim(), searchedAt: now, ip, user: me ? me.email : null, result: uetrResult(norm), conclusion: norm.conclusion, agreement: norm.agreement, deliveryAt: norm.deliveryAt, sources: norm.perSource };
  store.byUetr[uetr] = rec;
  store.trials.push({ uetr, at: now, result: rec.result, repeat: false, bank, user: me ? me.email : null, ip });
  if (store.trials.length > UETR_TRIALS_KEEP + 2000) store.trials = store.trials.slice(-UETR_TRIALS_KEEP);
  saveUetr(store);
  return json(res, 200, { repeat: false, searchedAtCairo: toCairoText(now), sources: norm.perSource, conclusion: norm.conclusion, agreement: norm.agreement, deliveryAtCairo: toCairoText(norm.deliveryAt), queue: uetrQueue(store.byUetr, uetr) });
}
function aggregateUetr(store){
  const byUetr = store.byUetr || {}, trials = store.trials || [];
  const recs = Object.values(byUetr);
  const inWin = recs.filter(r => r.deliveryAt && inCairoWindow(r.deliveryAt)).sort((a, b) => new Date(a.deliveryAt) - new Date(b.deliveryAt));
  const queue = inWin.map((r, i) => ({ pos: i + 1, uetr: r.uetr, bank: r.bank, currency: r.currency, amount: r.amount, deliveryAtCairo: toCairoText(r.deliveryAt), conclusion: r.conclusion }));
  const summary = {
    uniqueUetr: recs.length,
    found: recs.filter(r => r.result === 'found').length,
    failed: recs.filter(r => r.result === 'failed').length,
    pending: recs.filter(r => r.result === 'pending').length,
    trials: trials.length,
    repeats: trials.filter(t => t.repeat).length,
    inWindow: inWin.length
  };
  const recent = trials.slice(-600).reverse().map(t => ({ uetr: t.uetr, atCairo: toCairoText(t.at), result: t.result, repeat: !!t.repeat, bank: t.bank || '', user: t.user || null }));
  return { summary, queue, trials: recent };
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
    const em = String(body.email || '').toLowerCase(), id = body.id != null ? +body.id : null;
    const users = loadUsers();
    const u = users.find(x => (em && x.email === em) || (id != null && x.id === id));
    if (u) { u.role = body.role === 'admin' ? 'admin' : 'user'; saveUsers(users); return json(res, 200, { ok: true, user: publicUser(u) }); }
    return json(res, 200, { ok: false, error: 'user not found' });
  }
  if (action === 'delete_user') {
    const em = String(body.email || '').toLowerCase(), id = body.id != null ? +body.id : null;
    const before = loadUsers();
    const after = before.filter(x => !((em && x.email === em) || (id != null && x.id === id)));
    saveUsers(after);
    return json(res, 200, { ok: after.length < before.length });
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
    if (u.pathname === '/api/uetr')  return await handleUetr(req, res, action);
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
