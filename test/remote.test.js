// Tests für die Fern-Tür: nichts kommt ohne gekoppeltes Gerät an die App, Kopplung nur per Einmal-Link, Sperren und Schutzmaßnahmen greifen.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const auth = require('../server/remoteauth');
const { createGate } = require('../server/remote');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tourpost-remote-'));
const pairFile = path.join(dir, 'pair.json');
const sessionFile = path.join(dir, 'sessions.json');
const DAY = 864e5;
let clock = Date.UTC(2026, 9, 25, 12, 0, 0);
const alerts = [];
const gate = createGate({ pairFile, sessionFile, now: () => clock, alert: a => alerts.push(a) });

const inner = express();
inner.get('/', (req, res) => res.send('geheime App'));
inner.get('/api/queue', (req, res) => res.json(['geheim']));
inner.post('/api/videos', (req, res) => res.json({ ok: true }));
const outer = express();
outer.use(gate.router);
outer.use(inner);

let server, base;
test.before(async () => { server = http.createServer(outer).listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
const get = (url, cookie) => fetch(base + url, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
const cookieFrom = res => res.headers.get('set-cookie')?.split(';')[0];
// koppelt ein "Gerät" und liefert dessen Cookie
async function koppeln(headers = {}) {
  const { token } = auth.createPairing(pairFile, clock);
  const r = await post('/api/remote/pair', { token }, headers);
  assert.equal(r.status, 200);
  return cookieFrom(r);
}

test('ohne gekoppeltes Gerät kommt nichts an die App', async () => {
  const root = await get('/');
  assert.equal(root.status, 401);
  assert.match(await root.text(), /nicht gekoppelt/);
  assert.equal((await get('/api/queue')).status, 401);
  const js = await get('/irgendwas.js');
  assert.equal(js.status, 401);
  assert.notEqual(await js.text(), 'geheime App');
  assert.equal((await post('/api/videos', {})).status, 401);
  assert.equal((await get('/login')).status, 401);              // es gibt keine Anmeldeseite mehr
  assert.equal((await post('/api/remote/login', { password: 'x' })).status, 401);
  const css = await get('/remote.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(css.headers.get('x-frame-options'), 'DENY');
  assert.equal(css.headers.get('cache-control'), 'no-store');
});

test('Kopplung per QR-Link: sicheres Cookie, App erreichbar, nur einmal gültig', async () => {
  assert.equal((await get('/pair/' + 'a'.repeat(64))).status, 200);   // die Seite lädt, verbraucht aber nichts
  const { token } = auth.createPairing(pairFile, clock);
  assert.equal((await get('/pair/' + token)).status, 200);
  const r = await post('/api/remote/pair', { token });
  assert.equal(r.status, 200);
  const raw = r.headers.get('set-cookie');
  assert.match(raw, /Max-Age=7776000/);   // 90 Tage
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /Secure/i);
  assert.match(raw, /SameSite=Lax/i);
  const cookie = cookieFrom(r);
  assert.equal(await (await get('/', cookie)).text(), 'geheime App');
  assert.deepEqual(await (await get('/api/queue', cookie)).json(), ['geheim']);
  assert.ok(alerts.some(a => /gekoppelt/.test(a.title)));
  assert.equal((await post('/api/remote/pair', { token })).status, 401);   // zweites Mal geht nicht
});

test('abgelaufene, falsche und fremde Anfragen werden abgelehnt', async () => {
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

test('Raten wird nach fünf Fehlversuchen gesperrt, auch für den richtigen Link', async () => {
  clock += 31 * 60_000;
  const { token } = auth.createPairing(pairFile, clock);
  const ip = { 'cf-connecting-ip': '203.0.113.50' };
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/remote/pair', { token: 'f'.repeat(64) }, ip)).status, 401);
  assert.equal((await post('/api/remote/pair', { token }, ip)).status, 429);
  assert.equal((await post('/api/remote/pair', { token }, { 'cf-connecting-ip': '198.51.100.7' })).status, 200);   // andere Adresse ist nicht betroffen
  clock += 16 * 60_000;
  const { token: t2 } = auth.createPairing(pairFile, clock);
  assert.equal((await post('/api/remote/pair', { token: t2 }, ip)).status, 200);   // nach 15 Minuten wieder frei
});

test('Schreibzugriffe von fremden Seiten werden abgelehnt', async () => {
  clock += 31 * 60_000;
  const cookie = await koppeln();
  assert.equal((await fetch(base + '/api/videos', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://boese.example', 'Content-Length': '2' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/videos', { method: 'POST', headers: { Cookie: cookie }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/videos', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
});

test('zu große Uploads werden vorab abgelehnt', async () => {
  clock += 31 * 60_000;
  const cookie = await koppeln();
  const status = await new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', path: '/api/videos',
      headers: { Cookie: cookie, Origin: base, 'Content-Length': String(101 * 1048576), 'Content-Type': 'multipart/form-data; boundary=x' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve('fehler'));
    req.flushHeaders();
    setTimeout(() => req.destroy(), 1500);
  });
  assert.equal(status, 413);
});

test('Sitzungen halten Tage, laufen aber nach 30 Tagen Leerlauf und spätestens nach 90 Tagen ab', async () => {
  clock += 31 * 60_000;
  let cookie = await koppeln();
  for (let tag = 1; tag <= 3; tag++) { clock += DAY / 2; assert.equal((await get('/api/queue', cookie)).status, 200); }   // über Nacht, noch drin
  clock += 31 * DAY;                                                       // 31 Tage nichts getan
  assert.equal((await get('/api/queue', cookie)).status, 401);
  clock += 60_000;
  cookie = await koppeln();
  for (let i = 0; i < 91; i++) { clock += DAY; await get('/api/queue', cookie); }   // täglich benutzt, aber nach 90 Tagen trotzdem Schluss
  assert.equal((await get('/api/queue', cookie)).status, 401);
});

test('Abmelden macht das Cookie wertlos, Sitzungen überleben einen Neustart', async () => {
  clock += 31 * 60_000;
  const cookie = await koppeln();
  const cookie2 = await koppeln();
  // „Neustart“: ein zweites Gate liest dieselbe Sitzungsdatei
  const neu = createGate({ pairFile, sessionFile, now: () => clock, alert() {} });
  const o = express(); o.use(neu.router); o.use(inner);
  const s = http.createServer(o).listen(0, '127.0.0.1');
  await new Promise(r => s.once('listening', r));
  const b2 = `http://127.0.0.1:${s.address().port}`;
  assert.equal((await fetch(b2 + '/api/queue', { headers: { Cookie: cookie2 } })).status, 200);
  s.close();
  assert.equal((await post('/api/remote/logout', {}, { Cookie: cookie })).status, 200);
  assert.equal((await get('/api/queue', cookie)).status, 401);
  assert.equal((await get('/api/queue', cookie2)).status, 200);            // andere Geräte bleiben angemeldet
});
