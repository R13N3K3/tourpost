// Koppelt ein Handy per QR-Code mit dem Fernzugriff, ohne dass dort Passwort und Code getippt werden müssen.
// Aufruf am PC: npm run remote-pair, dann den QR-Code mit der Handy-Kamera scannen. Der Link gilt 10 Minuten und einmal.
// Das Handy bleibt danach 90 Tage angemeldet. Der Fernzugriff muss laufen (REMOTE_MODE=tunnel, Server gestartet).
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const auth = require('../server/remoteauth');

const urlFile = path.join(__dirname, '..', 'data', 'remote-url.json');
let info;
try { info = JSON.parse(fs.readFileSync(urlFile, 'utf8')); } catch {}
if (!auth.load()) { console.error('Der Fernzugriff ist noch nicht eingerichtet. Bitte zuerst: npm run remote-setup'); process.exit(1); }
if (!info?.url) {
  console.error('Keine Adresse für unterwegs gefunden. Läuft der Server mit REMOTE_MODE=tunnel? (systemctl --user status tourpost)');
  console.error('Nach dem Start dauert es einige Sekunden, bis der Tunnel steht.');
  process.exit(1);
}

const { token } = auth.createPairing();
const link = `${info.url}/pair/${token}`;
(async () => {
  console.log('Scanne diesen QR-Code mit der Kamera deines Handys (gilt 10 Minuten, nur einmal):\n');
  console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
  console.log('Falls das Scannen nicht klappt, öffne diesen Link auf dem Handy:');
  console.log(link + '\n');
  console.log('Nach dem Scannen ist das Handy 90 Tage angemeldet. Den Link nicht weitergeben.');
})();
