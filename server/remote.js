// Fernzugriff (zweiter Modus, REMOTE_MODE=tunnel): Die App ist zusätzlich über eine Cloudflare-Adresse erreichbar,
// aber nur für Geräte, die am PC per QR-Code gekoppelt wurden (npm run remote-pair). Es gibt keine Anmeldeseite und kein
// Passwort. Die Fern-Tür ist ein eigener lokaler Anschluss (REMOTE_PORT, Standard 3002), nur auf den zeigt der
// Fern-Tunnel. Port 3000 (Heimnetz) und der Medienserver sind davon getrennt. Alles, was über diese Tür kommt, braucht
// eine gültige Sitzung, ohne Ausnahmen außer der Kopplungsseite und den Hinweisdateien (eigene Dateien, keine der App).
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const auth = require('./remoteauth');
const { notify } = require('./notify');

const COOKIE = 'tp_session';
const SESSION_MAX_MS = 90 * 24 * 3600e3;   // absolut
const SESSION_IDLE_MS = 30 * 24 * 3600e3;  // ohne Aktivität
const MAX_UPLOAD_MB = 100;                 // Cloudflare lässt im kostenlosen Tarif etwa 100 MB pro Anfrage zu
const IP_FAILS = 5;                        // Fehlversuche pro Adresse, danach Sperre
const GLOBAL_FAILS = 20;                   // Fehlversuche insgesamt pro Stunde, danach Sperre für alle
const LOCK_MS = 15 * 60e3;
const FAIL_DELAY_MS = 600;                 // jede Fehlermeldung kommt gleich spät
const PAGES_DIR = path.join(__dirname, 'remote');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function createGate({ pairFile = auth.PAIR_FILE, sessionFile, now = () => Date.now(), alert = notify } = {}) {
  const sessions = new Map();            // sha256(Token) -> { created, last }
  const fails = new Map();               // IP -> { count, until }
  let globalFails = [];                  // Zeitpunkte
  let globalUntil = 0;
  let lastAlert = 0;

  if (sessionFile) {
    try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(sessionFile, 'utf8')))) sessions.set(k, v); } catch {}
  }
  function persist() {
    if (!sessionFile) return;
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile + '.tmp', JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
    fs.renameSync(sessionFile + '.tmp', sessionFile);
  }

  const ipOf = req => (req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unbekannt').toString().slice(0, 64);
  const cookieOf = req => (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);

  function sessionOf(req) {
    const token = cookieOf(req);
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const key = sha(token);
    const s = sessions.get(key);
    if (!s) return null;
    const t = now();
    if (t - s.created > SESSION_MAX_MS || t - s.last > SESSION_IDLE_MS) { sessions.delete(key); persist(); return null; }
    if (t - s.last > 60_000) { s.last = t; persist(); }
    return { key, ...s };
  }

  function locked(ip) {
    const t = now();
    if (t < globalUntil) return true;
    const f = fails.get(ip);
    return !!(f && f.count >= IP_FAILS && t < f.until);
  }

  function recordFail(ip) {
    const t = now();
    const f = fails.get(ip);
    fails.set(ip, { count: f && t < f.until ? f.count + 1 : 1, until: t + LOCK_MS });   // Zähler läuft 15 Minuten nach dem letzten Fehlversuch ab
    globalFails = globalFails.filter(x => t - x < 3600e3).concat(t);
    if (globalFails.length >= GLOBAL_FAILS) globalUntil = t + LOCK_MS;
    if (t - lastAlert > 10 * 60e3) {   // höchstens eine Meldung pro 10 Minuten
      lastAlert = t;
      alert({ title: 'TourPost: Fehlgeschlagene Kopplung', message: `Fernzugriff, Adresse ${ip}. Fehlversuche: ${fails.get(ip).count}.`, priority: 4, tags: ['warning'] });
    }
  }

  function setHeaders(req, res, next) {
    res.set({
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    next();
  }

  // Schutz gegen Anfragen von fremden Seiten: Schreibzugriffe nur, wenn sie von dieser Adresse selbst kommen
  function sameOrigin(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    const ok = origin ? (() => { try { return new URL(origin).host === host; } catch { return false; } })()
      : req.headers['sec-fetch-site'] === 'same-origin';
    if (!ok) return res.status(403).json({ error: 'Anfrage abgelehnt.' });
    next();
  }

  // Ohne gültige Sitzung kommt nichts durch. Browser sehen eine Hinweisseite, die Schnittstelle bekommt 401.
  function guard(req, res, next) {
    const s = sessionOf(req);
    if (s) { req.session = s; return next(); }
    if (req.method === 'GET' && req.accepts(['html', 'json']) === 'html' && !req.path.startsWith('/api/')) {
      return res.status(401).sendFile(path.join(PAGES_DIR, 'locked.html'));
    }
    res.status(401).json({ error: 'Dieses Gerät ist nicht gekoppelt.' });
  }

  const router = express.Router();
  router.use(setHeaders);

  // Kopplung per QR-Code: die Seite lädt ohne Anmeldung, das Einlösen geschieht per POST (so verbrauchen Link-Vorschauen den Code nicht)
  router.get('/pair/:token', (req, res) => res.sendFile(path.join(PAGES_DIR, 'pair.html')));
  router.get('/remote-pair.js', (req, res) => res.sendFile(path.join(PAGES_DIR, 'pair.js')));
  router.get('/remote.css', (req, res) => res.sendFile(path.join(PAGES_DIR, 'remote.css')));

  router.post('/api/remote/pair', sameOrigin, express.json({ limit: '2kb' }), async (req, res) => {
    const ip = ipOf(req);
    if (locked(ip)) {
      await sleep(FAIL_DELAY_MS);
      return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' });
    }
    if (!auth.consumePairing(req.body?.token, pairFile, now())) {
      recordFail(ip);
      await sleep(FAIL_DELAY_MS);
      return res.status(401).json({ error: 'Der Link ist abgelaufen oder wurde schon benutzt.' });
    }
    fails.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(sha(token), { created: now(), last: now() });
    persist();
    // SameSite=Lax, damit auch Links von außen (ntfy, andere Apps) angemeldet ankommen. Schreibzugriffe schützt die Origin-Prüfung,
    // und alle GET-Routen der App sind lesend.
    res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_MS });
    alert({ title: 'TourPost: Neues Gerät gekoppelt', message: `Per QR-Code gekoppelt, Adresse ${ip} (angemeldet bis zu 90 Tage).`, priority: 3, tags: ['iphone'] });
    res.json({ ok: true });
  });

  router.post('/api/remote/logout', sameOrigin, (req, res) => {
    const s = sessionOf(req);
    if (s) { sessions.delete(s.key); persist(); }
    res.clearCookie(COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
    res.json({ ok: true });
  });

  router.use(guard);
  router.get('/api/remote/me', (req, res) => res.json({ ok: true, maxUploadMb: MAX_UPLOAD_MB }));

  // Alles ab hier nur mit gültiger Sitzung. Vor die App wird die Größenprüfung für Uploads gesetzt.
  router.use(sameOrigin, (req, res, next) => {
    if (req.method === 'POST' && req.path === '/api/videos') {
      const len = Number(req.headers['content-length']);
      if (!Number.isFinite(len) || len > MAX_UPLOAD_MB * 1048576) {
        return res.status(413).json({ error: `Über den Fernzugriff sind Videos bis ${MAX_UPLOAD_MB} MB möglich. Dieses ist größer, bitte im Heimnetz hochladen oder das Video verkleinern.` });
      }
    }
    next();
  });

  return {
    router,
    sessionCount: () => sessions.size,
    revokeAll() { sessions.clear(); persist(); },
  };
}

function start(app) {
  if (process.env.REMOTE_MODE !== 'tunnel') return null;
  const gate = createGate({ sessionFile: path.join(__dirname, '..', 'data', 'remote-sessions.json') });
  // aktuelle Adresse für "npm run remote-pair" (baut daraus den QR-Code). Beim Start zuerst die alte löschen.
  const urlFile = path.join(__dirname, '..', 'data', 'remote-url.json');
  try { fs.unlinkSync(urlFile); } catch {}
  const outer = express();
  outer.disable('x-powered-by');
  outer.use(gate.router);
  outer.use(app);                         // erst nach erfolgreicher Kopplung erreicht eine Anfrage die App

  const port = Number(process.env.REMOTE_PORT) || 3002;
  const server = http.createServer(outer);
  server.requestTimeout = 10 * 60e3;      // Uploads über Mobilfunk dürfen länger dauern
  server.listen(port, '127.0.0.1', () => console.log(`Fern-Tür (nur für gekoppelte Geräte) auf http://127.0.0.1:${port}`));

  const { create } = require('./tunnel');
  const tunnel = create({
    name: 'Fern-Tunnel',
    enabled: () => true,
    probePath: '/remote.css',
    probeStatus: 200,
    onUrl: url => {
      fs.mkdirSync(path.dirname(urlFile), { recursive: true });
      fs.writeFileSync(urlFile, JSON.stringify({ url, time: new Date().toISOString() }));
      return notify({ title: 'TourPost: Adresse für unterwegs', message: `${url}\nNeues Gerät koppeln: am PC "npm run remote-pair" und den QR-Code scannen.`, priority: 3, tags: ['globe_with_meridians'] });
    },
  });
  tunnel.start(port);
  return { server, tunnel, gate };
}

module.exports = { createGate, start, MAX_UPLOAD_MB };
