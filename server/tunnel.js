// Startet bei Bedarf einen Cloudflare-Schnelltunnel (ohne Konto) auf den Medienserver und liest die
// öffentliche Adresse aus. Instagram holt das Video von dort ab. Fällt der Tunnel aus, wird er neu
// gestartet (die Adresse ändert sich dann, sie wird bei jedem Upload frisch gelesen).
// Läuft nur im Live-Modus und nur, wenn keine feste PUBLIC_BASE_URL in der .env steht.
const { spawn } = require('child_process');
const { notify } = require('./notify');

const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;
const READY_TIMEOUT_MS = 90_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let active = false;
let child = null;
let url = null;
let delay = 2000;
let stopping = false;
let port = 3001;

function launch() {
  const bin = process.env.CLOUDFLARED_BIN || 'cloudflared';
  child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let buf = '';
  child.stderr.on('data', d => {
    buf = (buf + d).slice(-4000);
    const m = buf.match(URL_RE);
    if (m && m[0] !== url) {
      url = m[0];
      delay = 2000;
      console.log(`Tunnel: ${url}`);
    }
  });
  child.on('error', err => {
    console.error('Tunnel konnte nicht gestartet werden:', err.message);
    active = false;
    child = null;
    notify({ title: 'Tunnel fehlt', message: `cloudflared nicht startbar: ${err.message}`, priority: 4, tags: ['x'] });
  });
  child.on('exit', code => {
    child = null;
    url = null;
    if (stopping || !active) return;
    console.error(`Tunnel beendet (Code ${code}), Neustart in ${delay / 1000} s`);
    setTimeout(launch, delay);
    delay = Math.min(delay * 2, 60_000);
  });
}

function start(mediaPort) {
  if (process.env.PUBLIC_BASE_URL) return console.log(`Feste öffentliche Adresse: ${process.env.PUBLIC_BASE_URL}`);
  if (process.env.IG_MODE !== 'live') return;
  port = mediaPort;
  active = true;
  launch();
  const stop = () => { stopping = true; child?.kill(); };
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });
}

// Der Medienserver antwortet auf /media/test mit 404; Cloudflare-Fehlerseiten (530 …) haben andere Codes.
async function reachable(u) {
  try {
    const res = await fetch(`${u}/media/test`, { signal: AbortSignal.timeout(8000) });
    return res.status === 404;
  } catch {
    return false;
  }
}

// Öffentliche Basisadresse für Instagram; wartet, bis der Tunnel wirklich erreichbar ist.
async function baseUrl(fallback) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (!active) return fallback;
  const end = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < end) {
    if (url && await reachable(url)) return url;
    await sleep(2000);
  }
  child?.kill();   // hängt der Tunnel, wird er über den exit-Handler neu gestartet
  throw new Error('Der Tunnel ist nicht erreichbar (cloudflared). Er wird neu gestartet, bitte später erneut versuchen.');
}

module.exports = { start, baseUrl, current: () => process.env.PUBLIC_BASE_URL || url };
