// Ein Testlauf ("Nur Test") postet nichts, auch wenn die Plattformen auf live stehen.
process.env.IG_MODE = 'live';
process.env.YT_MODE = 'live';
process.env.TT_MODE = 'live';
process.env.IG_USER_ID = '1';
process.env.IG_ACCESS_TOKEN = 'darf-nie-benutzt-werden';
process.env.PORT = '0';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const realFetch = global.fetch;
const calls = [];
global.fetch = (url, ...rest) => {
  if (/instagram\.com|googleapis\.com|tiktokapis\.com|oauth2/.test(String(url))) { calls.push(String(url)); throw new Error('Im Testlauf darf keine Plattform angefragt werden: ' + url); }
  return realFetch(url, ...rest);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tourpost-test-'));
process.env.DATA_DIR = dir;                       // eigener Datenordner, nie die echten Daten
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
const { execFileSync } = require('child_process');
const video = path.join(dir, 'v.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=720x1280:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);

let server, base;
test.before(async () => {
  // beim Import startet nichts (kein Medienserver, kein Tunnel, kein Planer), nur die Routen
  const app = require('../server/index.js');
  server = app.listen(0); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server?.close(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 100).unref(); });

const upload = (when, title = 'Testlauf') => {
  const form = new FormData();
  form.append('video', new Blob([fs.readFileSync(video)], { type: 'video/mp4' }), 'v.mp4');
  form.append('title', title);
  form.append('when', when);
  ['instagram', 'youtube', 'tiktok'].forEach(p => form.append('platforms', p));
  return realFetch(base + '/api/videos', { method: 'POST', body: form });
};
const warte = async id => { for (let i = 0; i < 60; i++) { const it = await (await realFetch(`${base}/api/queue/${id}`)).json(); if (['done', 'error'].includes(it.status)) return it; await new Promise(r => setTimeout(r, 500)); } throw new Error('Zeitüberschreitung'); };

test('Nur Test: nichts wird an Plattformen geschickt, Ergebnis ist als Test gekennzeichnet', async () => {
  const r = await upload('test');
  assert.equal(r.status, 200);
  const it = await warte((await r.json()).id);
  assert.equal(it.status, 'done');
  assert.equal(it.test, true);
  for (const s of Object.values(it.steps)) assert.match(s.text, /Test erfolgreich/);
  assert.deepEqual(calls, []);
});

test('Testläufe zählen nicht für die Duplikatsperre, auch nicht mehrfach hintereinander', async () => {
  for (let i = 0; i < 2; i++) {
    const r = await upload('test');
    assert.equal(r.status, 200);
    await warte((await r.json()).id);
  }
  const log = await (await realFetch(base + '/api/log')).json();
  assert.ok(log.length >= 3 && log.every(e => e.test === true));
  // dasselbe Video lässt sich danach noch normal in den Vorrat legen
  const echt = await upload('draft', 'echt');
  assert.equal(echt.status, 200);
});
