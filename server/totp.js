// Zeitbasierte Einmalcodes (TOTP, RFC 6238) für Authenticator-Apps. Ohne Zusatzpaket.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.replace(/[\s=-]/g, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Ungültiger Schlüssel.');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const newSecret = () => base32(crypto.randomBytes(20));

function hotp(secret, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = (h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

// Liefert den Zeitschritt des gültigen Codes oder null. Erlaubt ±1 Schritt (Uhrabweichung).
// Mit "after" werden bereits benutzte Schritte abgelehnt, ein Code gilt also nur einmal.
function verify(secret, code, { now = Date.now(), after = -1, window = 1 } = {}) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const cur = stepAt(now);
  let found = null;
  for (let s = cur - window; s <= cur + window; s++) {
    // alle Schritte vergleichen, damit die Dauer nicht verrät, welcher passt
    const ok = crypto.timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(String(code)));
    if (ok && s > after) found = s;
  }
  return found;
}

const otpauthUrl = (secret, account, issuer = 'TourPost') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

module.exports = { newSecret, hotp, verify, stepAt, base32, unbase32, otpauthUrl };
