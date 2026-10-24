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

module.exports = { hashPassword, checkPassword, load, save, MIN_PASSWORD, DEFAULT_FILE };
