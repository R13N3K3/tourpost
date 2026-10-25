// Richtet den Fernzugriff ein: Passwort festlegen und den Schlüssel für die Authenticator-App erzeugen.
// Aufruf: npm run remote-setup     (erneut ausgeführt ersetzt es Passwort und Schlüssel und beendet alle Sitzungen)
// Passwort und Schlüssel bleiben auf diesem Rechner (data/remote-auth.json), sie dürfen nie in den Chat.
const crypto = require('crypto');
const readline = require('readline');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const totp = require('../server/totp');
const auth = require('../server/remoteauth');
const { setEnvVar } = require('../server/util');

// Eingabe ohne Anzeige der Zeichen
function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); };
    }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  console.log('Fernzugriff einrichten\n');
  if (auth.load()) console.log('Es gibt schon Zugangsdaten. Sie werden ersetzt, alle angemeldeten Geräte werden abgemeldet.\n');

  // Das Passwort wird nur einmal gebraucht: Handys koppelst du später per QR-Code (npm run remote-pair).
  // Einfach Enter drücken, dann erzeugt das Skript ein starkes zufälliges Passwort und zeigt es einmal an.
  let pw = await ask(`Passwort (mindestens ${auth.MIN_PASSWORD} Zeichen) oder Enter für ein zufälliges: `, { hidden: true });
  if (pw === '') {
    const letters = 'abcdefghjkmnpqrstuvwxyz23456789';   // ohne verwechselbare Zeichen
    pw = Array.from({ length: 4 }, () => Array.from(crypto.randomBytes(4), b => letters[b % letters.length]).join('')).join('-');
    console.log(`\nDein Passwort:  ${pw}\nJetzt in den Passwortmanager legen oder notieren. Es wird nicht noch einmal angezeigt.`);
  } else if (pw.length < auth.MIN_PASSWORD) {
    console.error(`Zu kurz, bitte mindestens ${auth.MIN_PASSWORD} Zeichen.`);
    process.exit(1);
  }

  const secret = totp.newSecret();
  const url = totp.otpauthUrl(secret, 'Fernzugriff');
  console.log('\nScanne diesen Code mit einer Authenticator-App (zum Beispiel Aegis, Google Authenticator oder 2FAS):\n');
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  console.log(`Oder gib den Schlüssel von Hand ein: ${secret}\n`);

  for (let i = 0; i < 3; i++) {
    const code = (await ask('Zur Kontrolle: aktueller 6-stelliger Code aus der App: ')).trim();
    if (totp.verify(secret, code) !== null) {
      auth.save({ password: auth.hashPassword(pw), totpSecret: secret, created: new Date().toISOString() });
      try { fs.unlinkSync(path.join(__dirname, '..', 'data', 'remote-sessions.json')); } catch {}
      console.log('\n✓ Zugangsdaten gespeichert (data/remote-auth.json).');
      if ((await ask('Fernzugriff jetzt aktivieren (REMOTE_MODE=tunnel in der .env)? [j/N] ')).trim().toLowerCase().startsWith('j')) {
        setEnvVar('REMOTE_MODE', 'tunnel');
        console.log('✓ REMOTE_MODE=tunnel gesetzt. Server neu starten: systemctl --user restart tourpost');
        console.log('  Die Adresse für unterwegs kommt per ntfy aufs Handy (NTFY_TOPIC) und steht im Protokoll.');
        console.log('  Handy koppeln ohne Tippen: nach dem Neustart  npm run remote-pair  und den QR-Code scannen.');
      } else {
        console.log('Aktivieren später mit REMOTE_MODE=tunnel in der .env, ausschalten mit REMOTE_MODE=off.');
      }
      return;
    }
    console.error('Code stimmt nicht. Passt die Uhrzeit auf dem Handy? Noch einmal versuchen.');
  }
  console.error('Abgebrochen, es wurde nichts gespeichert.');
  process.exit(1);
})();
