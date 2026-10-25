// Überwachung des Tunnels: startet neu, wenn er läuft, aber nicht antwortet, und nur dann, wenn das Internet geht.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { create } = require('../server/tunnel');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tourpost-tunnel-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Attrappe für cloudflared: schreibt jeden Start in eine Datei, meldet eine Adresse und bleibt am Leben
function fakeBin(name) {
  const log = path.join(dir, name + '.starts');
  const bin = path.join(dir, name + '.sh');
  fs.writeFileSync(bin, `#!/bin/sh\necho x >> "${log}"\necho "https://fake-$$.trycloudflare.com" >&2\nexec sleep 60\n`, { mode: 0o755 });
  const starts = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').length : 0;
  return { bin, starts };
}

test('Tunnel antwortet nicht, Internet geht: nach zwei Fehlprüfungen wird neu gestartet', async () => {
  const f = fakeBin('a');
  const urls = [];
  const t = create({ name: 'T', enabled: () => true, probePath: '/x', probeStatus: 200, bin: f.bin, probe: async () => false, internet: async () => true, checkMs: 60, restartDelayMs: 100, onUrl: u => urls.push(u) });
  t.start(1234);
  await sleep(1200);
  assert.ok(f.starts() >= 2, `mindestens ein Neustart erwartet, Starts: ${f.starts()}`);
  assert.ok(urls.length >= 2);          // jeder Start liefert eine neue Adresse
  assert.notEqual(urls[0], urls[1]);
});

test('Tunnel antwortet: es wird nicht neu gestartet', async () => {
  const f = fakeBin('b');
  const t = create({ name: 'T', enabled: () => true, probePath: '/x', probeStatus: 200, bin: f.bin, probe: async () => true, internet: async () => true, checkMs: 60, restartDelayMs: 100 });
  t.start(1234);
  await sleep(800);
  assert.equal(f.starts(), 1);
});

test('Kein Internet: kein Neustart, denn cloudflared verbindet sich dann selbst neu', async () => {
  const f = fakeBin('c');
  const t = create({ name: 'T', enabled: () => true, probePath: '/x', probeStatus: 200, bin: f.bin, probe: async () => false, internet: async () => false, checkMs: 60, restartDelayMs: 100 });
  t.start(1234);
  await sleep(800);
  assert.equal(f.starts(), 1);
});

test('Eine einzelne Fehlprüfung reicht nicht für einen Neustart', async () => {
  const f = fakeBin('d');
  let n = 0;
  const t = create({ name: 'T', enabled: () => true, probePath: '/x', probeStatus: 200, bin: f.bin, probe: async () => ++n % 2 === 0, internet: async () => true, checkMs: 60, restartDelayMs: 100 });
  t.start(1234);
  await sleep(900);                      // abwechselnd Fehler und Erfolg: der Zähler wird immer zurückgesetzt
  assert.equal(f.starts(), 1);
});
