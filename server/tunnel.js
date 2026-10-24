// Startet bei Bedarf einen Cloudflare-Schnelltunnel (ohne Konto) auf einen lokalen Port und liest die
// öffentliche Adresse aus. Fällt der Tunnel aus, wird er neu gestartet (die Adresse ändert sich dann).
// Es gibt zwei Tunnel mit getrennten Zielen:
//   - Medien-Tunnel (Standard-Export): nur der Medienserver, Instagram holt das Video von dort ab
//   - Fern-Tunnel (create): nur die Fern-Tür mit Login, siehe remote.js
const { spawn } = require('child_process');
const { notify } = require('./notify');

const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;
const READY_TIMEOUT_MS = 90_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// enabled: () => bool, wird beim Start geprüft; probePath/probeStatus: wie erkennt man, dass der Tunnel antwortet
function create({ name, enabled, probePath, probeStatus, onUrl }) {
  let active = false, child = null, url = null, delay = 2000, stopping = false, port = 0;

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
        console.log(`${name}: ${url}`);
        if (onUrl) Promise.resolve(onUrl(url)).catch(() => {});
      }
    });
    child.on('error', err => {
      console.error(`${name} konnte nicht gestartet werden:`, err.message);
      active = false;
      child = null;
      notify({ title: 'Tunnel fehlt', message: `cloudflared nicht startbar (${name}): ${err.message}`, priority: 4, tags: ['x'] });
    });
    child.on('exit', code => {
      child = null;
      url = null;
      if (stopping || !active) return;
      console.error(`${name} beendet (Code ${code}), Neustart in ${delay / 1000} s`);
      setTimeout(launch, delay);
      delay = Math.min(delay * 2, 60_000);
    });
  }

  function start(targetPort) {
    if (!enabled()) return false;
    port = targetPort;
    active = true;
    launch();
    const stop = () => { stopping = true; child?.kill(); };
    process.on('exit', stop);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });
    return true;
  }

  async function reachable(u) {
    try {
      const res = await fetch(`${u}${probePath}`, { signal: AbortSignal.timeout(8000), redirect: 'manual' });
      return res.status === probeStatus;
    } catch {
      return false;
    }
  }

  // Wartet, bis der Tunnel wirklich antwortet, und liefert dann die Adresse.
  async function ready() {
    const end = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < end) {
      if (url && await reachable(url)) return url;
      await sleep(2000);
    }
    child?.kill();   // hängt der Tunnel, wird er über den exit-Handler neu gestartet
    throw new Error('Der Tunnel ist nicht erreichbar (cloudflared). Er wird neu gestartet, bitte später erneut versuchen.');
  }

  return { start, ready, isActive: () => active, current: () => url };
}

// Medien-Tunnel: nur im Live-Modus und nur, wenn keine feste PUBLIC_BASE_URL in der .env steht.
// Der Medienserver antwortet auf /media/test mit 404; Cloudflare-Fehlerseiten (530 …) haben andere Codes.
const media = create({
  name: 'Tunnel',
  enabled: () => !process.env.PUBLIC_BASE_URL && process.env.IG_MODE === 'live',
  probePath: '/media/test',
  probeStatus: 404,
});

module.exports = {
  create,
  start(port) {
    if (process.env.PUBLIC_BASE_URL) return console.log(`Feste öffentliche Adresse: ${process.env.PUBLIC_BASE_URL}`);
    media.start(port);
  },
  // Öffentliche Basisadresse für Instagram
  async baseUrl(fallback) {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
    if (!media.isActive()) return fallback;
    return media.ready();
  },
  current: () => process.env.PUBLIC_BASE_URL || media.current(),
};
