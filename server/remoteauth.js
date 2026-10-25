// Kopplung per QR-Code: der einzige Weg in den Fernzugriff. Ein Einmal-Link wird am PC erzeugt (npm run remote-pair),
// nur sein Hash liegt in data/remote-pairing.json. Er gilt 10 Minuten und genau einmal. Es gibt kein Passwort.
// Alles synchron, damit er nicht doppelt gilt.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PAIR_FILE = path.join(__dirname, '..', 'data', 'remote-pairing.json');
const PAIR_TTL_MS = 10 * 60e3;
const sha = s => crypto.createHash('sha256').update(s).digest();

function createPairing(file = PAIR_FILE, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ hash: sha(token).toString('hex'), expires: now + PAIR_TTL_MS }), { mode: 0o600 });
  return { token, expires: now + PAIR_TTL_MS };
}

function consumePairing(token, file = PAIR_FILE, now = Date.now()) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  let rec;
  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return false; }
  if (now > rec.expires) { try { fs.unlinkSync(file); } catch {} return false; }
  const ok = crypto.timingSafeEqual(sha(token), Buffer.from(rec.hash, 'hex'));
  if (ok) { try { fs.unlinkSync(file); } catch {} }
  return ok;
}

module.exports = { createPairing, consumePairing, PAIR_FILE };
