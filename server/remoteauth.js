// Zugangsdaten für den Fernzugriff: Passwort (scrypt-Hash) und TOTP-Schlüssel in data/remote-auth.json.
// Angelegt wird das lokal mit "npm run remote-setup", Passwort und Schlüssel laufen nie über den Chat.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'remote-auth.json');
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const MIN_PASSWORD = 12;

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return { salt: salt.toString('hex'), hash: hash.toString('hex'), params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p } };
}

function checkPassword(password, record) {
  const params = { ...record.params, maxmem: SCRYPT.maxmem };
  const hash = crypto.scryptSync(String(password), Buffer.from(record.salt, 'hex'), 64, params);
  return crypto.timingSafeEqual(hash, Buffer.from(record.hash, 'hex'));
}

function load(file = DEFAULT_FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function save(data, file = DEFAULT_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Kopplung per QR-Code: ein Einmal-Link, der am PC erzeugt wird (npm run remote-pair). Nur der Hash liegt in
// data/remote-pairing.json, der Link gilt 10 Minuten und genau einmal. Alles synchron, damit er nicht doppelt gilt.
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

module.exports = { hashPassword, checkPassword, load, save, createPairing, consumePairing, MIN_PASSWORD, DEFAULT_FILE, PAIR_FILE };
