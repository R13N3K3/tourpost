// Erzeugt den QR-Code zur Adresse des Servers: Bild (qr-lokal.png) + Ausgabe im Terminal.
// Aufruf: node scripts/qr.js <URL>
const QRCode = require('qrcode');
const path = require('path');

const url = process.argv[2];
if (!url) {
  console.error('Aufruf: node scripts/qr.js <URL>');
  process.exit(1);
}

const file = path.join(__dirname, '..', 'qr-lokal.png');

(async () => {
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  await QRCode.toFile(file, url, { width: 400, margin: 2 });
  console.log(`QR-Code als Bild gespeichert: ${file}`);
})();
