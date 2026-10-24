// Meldet alle Geräte vom Fernzugriff ab (zum Beispiel nach einem verlorenen Handy).
// Danach den Server neu starten: systemctl --user restart tourpost
// Passwort und Authenticator-Schlüssel bleiben, mit "npm run remote-setup" lassen sie sich zusätzlich ersetzen.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'remote-sessions.json');
try { fs.unlinkSync(file); console.log('Alle Sitzungen gelöscht. Jetzt den Server neu starten: systemctl --user restart tourpost'); }
catch { console.log('Es gab keine gespeicherten Sitzungen. Zur Sicherheit den Server trotzdem neu starten (beendet die Sitzungen im Speicher).'); }
