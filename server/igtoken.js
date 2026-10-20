// Verlängert das Instagram-Token automatisch. Langlebige Tokens gelten ca. 60 Tage und lassen sich
// verlängern, solange sie noch gültig und mindestens 24 Stunden alt sind. Das neue Token wird in die
// .env geschrieben, der Zeitpunkt in data/igtoken.json.
const fs = require('fs');
const path = require('path');
const { setEnvVar } = require('./util');
const { notify } = require('./notify');

const FILE = path.join(__dirname, '..', 'data', 'igtoken.json');
const DAY = 86400e3;
const REFRESH_AFTER = 20 * DAY;   // spätestens nach 20 Tagen verlängern, dann bleiben ~40 Tage zum Wiederholen
const WARN_BEFORE = 10 * DAY;
const CHECK_MS = 6 * 3600e3;

let state = { refreshedAt: null, expiresAt: null, failures: 0, lastError: null, notifiedAt: null };
try { state = { ...state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

async function refresh() {
  const url = 'https://graph.instagram.com/refresh_access_token?' + new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: process.env.IG_ACCESS_TOKEN,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
  return json;
}

async function maintain(now = Date.now()) {
  if (process.env.IG_MODE !== 'live' || !process.env.IG_ACCESS_TOKEN) return;

  if (!state.refreshedAt || now - state.refreshedAt > REFRESH_AFTER) {
    try {
      const j = await refresh();
      if (j.access_token !== process.env.IG_ACCESS_TOKEN) setEnvVar('IG_ACCESS_TOKEN', j.access_token);
      state = { ...state, refreshedAt: now, expiresAt: now + (j.expires_in || 60 * 86400) * 1000, failures: 0, lastError: null };
      console.log('Instagram-Token verlängert, gültig bis', new Date(state.expiresAt).toLocaleDateString('de-DE'));
    } catch (err) {
      state.failures++;
      state.lastError = err.message;
      console.error('Instagram-Token konnte nicht verlängert werden:', err.message);
    }
    save();
  }

  // Warnen: Verlängerung klappt dauerhaft nicht, oder das bekannte Ablaufdatum rückt näher
  const soon = state.expiresAt && state.expiresAt - now < WARN_BEFORE;
  const failing = state.failures >= 6 || (state.failures > 0 && soon);
  if ((failing || (soon && state.failures > 0)) && (!state.notifiedAt || now - state.notifiedAt > DAY)) {
    state.notifiedAt = now;
    save();
    const left = state.expiresAt ? ` Es läuft am ${new Date(state.expiresAt).toLocaleDateString('de-DE')} ab.` : '';
    await notify({
      title: 'Instagram-Token läuft ab',
      message: `Das Token konnte nicht verlängert werden (${state.lastError}).${left} Neues Token in der Meta-App erzeugen und in die .env eintragen.`,
      priority: 4, tags: ['warning'],
    });
  }
}

function start() {
  maintain().catch(err => console.error('Token-Pflege:', err));
  setInterval(() => maintain().catch(err => console.error('Token-Pflege:', err)), CHECK_MS);
}

const info = () => ({ refreshedAt: state.refreshedAt, expiresAt: state.expiresAt, failures: state.failures, lastError: state.lastError });

module.exports = { start, maintain, info };
