// Schaltet den Fernzugriff ein (REMOTE_MODE=tunnel). Es gibt kein Passwort und keine Anmeldeseite:
// Geräte kommen nur per QR-Code hinein, der am PC erzeugt wird (npm run remote-pair).
// Aufruf: npm run remote-setup     Ausschalten: REMOTE_MODE=off in der .env und Server neu starten.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { setEnvVar } = require('../server/util');

console.log('Fernzugriff einschalten\n');
try {
  execFileSync(process.env.CLOUDFLARED_BIN || 'cloudflared', ['--version'], { stdio: 'ignore' });
} catch {
  console.log('! cloudflared ist nicht installiert. Zuerst:  ./setup.sh --tunnel\n');
}

setEnvVar('REMOTE_MODE', 'tunnel');
console.log('✓ REMOTE_MODE=tunnel gesetzt.');

// Zugangsdaten aus der früheren Version mit Passwort werden nicht mehr gebraucht
for (const f of ['remote-auth.json']) {
  const file = path.join(__dirname, '..', 'data', f);
  if (fs.existsSync(file)) { fs.unlinkSync(file); console.log(`✓ Alte Datei data/${f} (Passwort-Anmeldung) entfernt.`); }
}

console.log('\nNächste Schritte:');
console.log('  1. Server neu starten:    systemctl --user restart tourpost');
console.log('  2. Handy koppeln:         npm run remote-pair   (QR-Code mit der Handy-Kamera scannen)');
console.log('\nDie Adresse für unterwegs ändert sich bei jedem Start des Tunnels. Sie kommt per ntfy aufs Handy (NTFY_TOPIC) und');
console.log('steht im Protokoll (journalctl --user -u tourpost). Nach einem Neustart den Handy-Code neu erzeugen.');
