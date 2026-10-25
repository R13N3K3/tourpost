// Tests für die Fern-Tür: nichts kommt ohne Passwort UND Einmalcode an die App, Sperren und Schutzmaßnahmen greifen.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const totp = require('../server/totp');
const auth = require('../server/remoteauth');
const { createGate } = require('../server/remote');

const PASSWORD = 'ein-langes-test-passwort';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tourpost-remote-'));
const authFile = path.join(dir, 'auth.json');
const secret = totp.newSecret();
auth.save({ password: auth.hashPassword(PASSWORD), totpSecret: secret }, authFile);

let clock = Date.UTC(2026, 9, 25, 12, 0, 0);
const alerts = [];
const pairFile = path.join(dir, 'pair.json');
const gate = createGate({ authFile, pairFile, sessionFile: path.join(dir, 'sessions.json'), now: () => clock, alert: a => alerts.push(a) });

const inner = express();
inner.get('/', (req, res) => res.send('geheime App'));
inner.get('/api/queue', (req, res) => res.json(['geheim']));
inner.post('/api/videos', (req, res) => res.json({ ok: true }));
const outer = express();
outer.use(gate.router);
outer.use(inner);

let server, base, host;
test.before(async () => { server = http.createServer(outer).listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); host = `127.0.0.1:${server.address().port}`; base = 'http://' + host; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const code = (offset = 0) => totp.hotp(secret, totp.stepAt(clock) + offset);
const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
const login = (over = {}, headers = {}) => post('/api/remote/login', { password: PASSWORD, code: code(), ...over }, headers);
const cookieFrom = res => res.headers.get('set-cookie')?.split(';')[0];
const get = (url, cookie) => fetch(base + url, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });

test('TOTP stimmt mit dem Testvektor aus RFC 6238 überein', () => {
  const s = totp.base32(Buffer.from('12345678901234567890'));
  assert.equal(totp.hotp(s, Math.floor(59 / 30), 8), '94287082');
});

test('ohne Anmeldung kommt nichts an die App', async () => {
  const root = await get('/');
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/login');
  assert.equal((await get('/api/queue')).status, 401);
  const js = await get('/irgendwas.js');
  assert.ok([302, 401].includes(js.status));   // Weiterleitung zur Anmeldung oder Abweisung, jedenfalls kein Inhalt
  assert.notEqual(await js.text(), 'geheime App');
  assert.equal((await post('/api/videos', {})).status, 401);
  const l = await get('/login');
  assert.equal(l.status, 200);
  assert.match(l.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(l.headers.get('x-frame-options'), 'DENY');
  assert.equal(l.headers.get('cache-control'), 'no-store');
});

test('falsches Passwort und falscher Code scheitern gleich', async () => {
  clock += 60_000;
  const a = await login({ password: 'falsch-falsch-falsch' });
  const b = await login({ code: '000000' });
  const c = await login({ code: undefined });
  for (const r of [a, b, c]) assert.equal(r.status, 401);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(a.headers.get('set-cookie'), null);
});

test('richtige Anmeldung setzt ein sicheres Cookie und öffnet die App', async () => {
  clock += 2 * 3600e3 * 0 + 31 * 60_000;   // aus der Sperre der vorigen Fehlversuche heraus
  const r = await login();
  assert.equal(r.status, 200);
  const raw = r.headers.get('set-cookie');
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /Secure/i);
  assert.match(raw, /SameSite=Lax/i);
  const cookie = cookieFrom(r);
  assert.equal(await (await get('/', cookie)).text(), 'geheime App');
  assert.deepEqual(await (await get('/api/queue', cookie)).json(), ['geheim']);
  // schon angemeldet: die Anmeldeseite leitet direkt in die App
  const l = await get('/login', cookie);
  assert.equal(l.status, 302);
  assert.equal(l.headers.get('location'), '/');
  assert.ok(alerts.some(a => /Anmeldung von außen/.test(a.title)));
  // Abmelden macht das Cookie wertlos
  assert.equal((await post('/api/remote/logout', {}, { Cookie: cookie })).status, 200);
  assert.equal((await get('/api/queue', cookie)).status, 401);
});

test('ein Einmalcode gilt nur einmal', async () => {
  clock += 60_000;
  const c = code();
  assert.equal((await login({ code: c })).status, 200);
  assert.equal((await login({ code: c })).status, 401);
});

test('Sperre nach fünf Fehlversuchen, auch mit richtigen Daten', async () => {
  clock += 31 * 60_000;
  for (let i = 0; i < 5; i++) assert.equal((await login({ password: 'falsch-falsch-falsch' }, { 'cf-connecting-ip': '203.0.113.9' })).status, 401);
  assert.equal((await login({}, { 'cf-connecting-ip': '203.0.113.9' })).status, 429);
  assert.equal((await login({}, { 'cf-connecting-ip': '198.51.100.7' })).status, 200);   // andere Adresse ist nicht betroffen
  clock += 16 * 60_000;
  assert.equal((await login({}, { 'cf-connecting-ip': '203.0.113.9' })).status, 200);   // nach 15 Minuten wieder frei
});

test('Schreibzugriffe von fremden Seiten werden abgelehnt', async () => {
  clock += 60_000;
  const cookie = cookieFrom(await login());
  const fremd = await fetch(base + '/api/videos', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://boese.example', 'Content-Length': '2' }, body: '{}' });
  assert.equal(fremd.status, 403);
  const ohne = await fetch(base + '/api/videos', { method: 'POST', headers: { Cookie: cookie }, body: '{}' });
  assert.equal(ohne.status, 403);
  const eigen = await fetch(base + '/api/videos', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(eigen.status, 200);
});

test('zu große Uploads werden vorab abgelehnt', async () => {
  clock += 60_000;
  const cookie = cookieFrom(await login());
  const status = await new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', path: '/api/videos',
      headers: { Cookie: cookie, Origin: base, 'Content-Length': String(101 * 1048576), 'Content-Type': 'multipart/form-data; boundary=x' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve('fehler'));
    req.flushHeaders();
    setTimeout(() => req.destroy(), 1500);
  });
  assert.equal(status, 413);
});

test('Sitzungen laufen ab (Leerlauf und Gesamtdauer)', async () => {
  clock += 60_000;
  let cookie = cookieFrom(await login());
  clock += 2 * 3600e3 + 1000;                              // länger als 2 Stunden nichts getan
  assert.equal((await get('/api/queue', cookie)).status, 401);
  clock += 60_000;
  cookie = cookieFrom(await login());
  for (let i = 0; i < 7; i++) { clock += 119 * 60_000; assert.equal((await get('/api/queue', cookie)).status, i < 6 ? 200 : 401); }   // aktiv gehalten, aber nach 12 Stunden ist trotzdem Schluss
});

test('ohne eingerichtete Zugangsdaten ist keine Anmeldung möglich', async () => {
  const leer = createGate({ authFile: path.join(dir, 'gibt-es-nicht.json'), now: () => clock, alert() {} });
  const o = express(); o.use(leer.router); o.use(inner);
  const s = http.createServer(o).listen(0, '127.0.0.1');
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const r = await fetch(b + '/api/remote/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: b }, body: JSON.stringify({ password: PASSWORD, code: code() }) });
  s.close();
  assert.equal(r.status, 401);
});

test('„Gerät merken": Sitzung hält Tage, aber nicht für immer', async () => {
  clock += 60_000;
  const cookie = cookieFrom(await login({ remember: true }));
  clock += 60_000;   // neuer Einmalcode nötig
  assert.match((await login({ remember: true })).headers.get('set-cookie') || '', /Max-Age=7776000/);
  for (let tag = 1; tag <= 3; tag++) { clock += 10 * 3600e3 * 2.4; assert.equal((await get('/api/queue', cookie)).status, 200); }   // über Nacht, noch drin
  clock += 31 * 864e5;                                                    // 31 Tage nichts getan
  assert.equal((await get('/api/queue', cookie)).status, 401);
  clock += 60_000;
  const c2 = cookieFrom(await login({ remember: true }));
  for (let i = 0; i < 91; i++) { clock += 864e5; await get('/api/queue', c2); }   // täglich benutzt, aber nach 90 Tagen trotzdem Schluss
  assert.equal((await get('/api/queue', c2)).status, 401);
});

test('Kopplung per QR-Code: einmal, nur kurz gültig, ohne Passwort am Handy', async () => {
  // die Kopplungsseite lädt ohne Anmeldung, die App dahinter nicht
  assert.equal((await get('/pair/' + 'a'.repeat(64))).status, 200);
  assert.equal((await get('/remote-pair.js')).status, 200);
  assert.equal((await get('/api/queue')).status, 401);

  clock += 31 * 60_000;
  const { token } = auth.createPairing(pairFile, clock);
  const r = await post('/api/remote/pair', { token });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Max-Age=7776000/);   // 90 Tage
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  const cookie = cookieFrom(r);
  assert.deepEqual(await (await get('/api/queue', cookie)).json(), ['geheim']);
  assert.ok(alerts.some(a => /gekoppelt/.test(a.title)));
  assert.equal((await post('/api/remote/pair', { token })).status, 401);   // zweites Mal geht nicht
});

test('Kopplung: abgelaufen, falsch und von fremden Seiten wird abgelehnt', async () => {
  clock += 31 * 60_000;
  const alt = auth.createPairing(pairFile, clock);
  clock += 11 * 60_000;                                                   // älter als 10 Minuten
  assert.equal((await post('/api/remote/pair', { token: alt.token })).status, 401);
  const neu = auth.createPairing(pairFile, clock);
  assert.equal((await post('/api/remote/pair', { token: neu.token }, { Origin: 'https://boese.example' })).status, 403);
  assert.equal((await post('/api/remote/pair', { token: 'kein-token' })).status, 401);
  assert.equal((await post('/api/remote/pair', { token: '0'.repeat(64) })).status, 401);
  assert.equal((await post('/api/remote/pair', {})).status, 401);
  assert.equal((await post('/api/remote/pair', { token: neu.token })).status, 200);   // der richtige gilt weiterhin
});

test('Kopplung: Raten wird nach fünf Fehlversuchen gesperrt', async () => {
  clock += 31 * 60_000;
  const { token } = auth.createPairing(pairFile, clock);
  const ip = { 'cf-connecting-ip': '203.0.113.50' };
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/remote/pair', { token: 'f'.repeat(64) }, ip)).status, 401);
  assert.equal((await post('/api/remote/pair', { token }, ip)).status, 429);   // auch der richtige Link geht dann nicht
});
