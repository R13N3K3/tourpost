# TourPost – Hinweise für Claude

Handy-Web-App (Node/Express), die Videos als Instagram Reel, YouTube Short und auf TikTok veröffentlicht. Oberfläche und Texte sind auf **Deutsch**. Details zu Aufbau und Bedienung stehen in der `README.md`.

## Bei Änderungen an der Oberfläche automatisch tun

Ändert sich etwas, das man in der App sieht (HTML, CSS, Texte, neue oder geänderte Seiten in `public/`):

1. **Screenshots neu aufnehmen** (`docs/screenshots/`: `index`, `video`, `vorrat`, `touren`, bei neuen Seiten ergänzen).
2. **`README.md` anpassen**, wenn sich Ablauf, Funktionen oder Bilder geändert haben (Vorschau-Tabelle, Einrichtung, Konfiguration, Status/Geplant).
3. Beides zusammen mit der Änderung **committen**.
4. **Nicht pushen**, bevor der Nutzer es verlangt. Erst fragen oder auf „push" warten.

Der Nutzer muss nicht jedes Mal daran erinnern.

### So entstehen die Screenshots

- Mit **Firefox headless** (nicht Chromium, das sieht bei diesem Design verzerrt aus), Fenstergröße Handy-Breite 390 px:
  `firefox --headless --no-remote --profile <leeres-Profil> --window-size=390,<Höhe> --screenshot <absoluter-Pfad>.png <URL>`
  Der Pfad muss absolut sein, und `--no-remote` ist nötig.
- Höhen: Start ca. 1000, Video ca. 1450, Vorrat ca. 2500, Touren ca. 1000.
- **Nie mit den echten Daten.** Eine Kopie von `server/`, `public/`, `package.json` und `node_modules` in ein Wegwerf-Verzeichnis legen, dort auf einem anderen Port starten und Beispieldaten über die API anlegen (ein fertiges Video, ein paar im Vorrat, Wochenplan Dienstags/Freitags 18:00). Das echte `data/` darf nicht verändert werden.
- Firefox macht das Bild, bevor `fetch` fertig ist. Nur in der Wegwerf-Kopie `api()` in `public/js/vorrat.js` auf einen **synchronen** `XMLHttpRequest` umstellen, damit die Vorrat-Seite vollständig gerendert wird. Diese Änderung nie in das echte Projekt übernehmen.
- Danach das Bild ansehen und prüfen, bevor es committet wird.

## Server

- Starten: `node server/index.js` (Port 3000, `PORT` änderbar). Nach Änderungen an `server/` den Server **neu starten**. Statische Dateien in `public/` brauchen keinen Neustart.
- Alten Server beenden über die PID auf Port 3000 (`ss -ltnp`), **nicht** mit `pkill` (trifft die eigene Shell).
- `DEBUG_REQUESTS=1` protokolliert jede Anfrage mit Dauer.
- Zustand liegt in `data/` (`queue.json`, `settings.json`, `log.jsonl`) und ist nicht im Repo. `uploads/` und `.env` ebenfalls nicht.

## Todo

- **Telegram-Bot**: Liefert Status-Updates zu Uploads (Vorrat → wird gepostet → erfolgreich/fehlgeschlagen, Links zu den Beiträgen) und andere Kennzahlen wie Likes und Views pro Video und Plattform. Kennzahlen müssen dafür per API der Plattformen abgefragt werden (Instagram Insights, YouTube Data/Analytics API, TikTok API). Kann die bestehenden ntfy-Benachrichtigungen (`server/notify.js`) ergänzen oder ersetzen. Bot-Token und Chat-ID kommen in die `.env`, nie ins Repo.

- **Schlüssel beschaffen und testen** (Anleitung steht in der `README.md` unter „Wo bekomme ich die Schlüssel her, und wie teste ich?", ist noch **ungeprüft**): Die Schritte für Instagram (Meta-App mit Instagram-Login, Token, `IG_USER_ID`, Cloudflare Tunnel), YouTube (Google OAuth) und TikTok (Developer-Portal, Sandbox, Audit) mit der aktuellen Doku abgleichen und beim ersten Durchlauf korrigieren. Jeweils zuerst `…_MODE=test`, dann Live-Test mit einem Wegwerf-Video (die Duplikatsperre sperrt es danach). Der Nutzer sollte die Konten selbst anlegen, Claude gibt keine Zugangsdaten aus.

## Regeln

- **Keine Zugangsdaten** (`.env`, Tokens, SSH-Schlüssel) committen oder im Chat ausgeben.
- Ein Video darf nie zweimal gepostet werden: Duplikatsperre über den SHA-256-Hash und das Protokoll `data/log.jsonl` nicht umgehen oder abschwächen.
- Die Live-Uploads für Instagram und YouTube sind nach der Doku geschrieben, aber noch nicht mit echten Konten getestet (YouTube nur gegen eine Attrappe geprüft). TikTok läuft nur im Testmodus. Das nicht als „fertig" darstellen.
- `server/media.js` ist der Medienserver (Port `MEDIA_PORT`, nur 127.0.0.1, liefert ausschließlich `/media/<24 Hex>.<endung>`). **Nur dieser Port** darf durch den Tunnel ins Internet, nie die App auf Port 3000. Den Medienserver nicht um weitere Routen erweitern.
- Es gibt noch **keinen Zugangsschutz**. Den Server nicht ungeschützt ins Internet stellen.
- Commit-Nachrichten auf Deutsch, am Ende die Co-Authored-By-Zeile der aktuellen Sitzung.
- `text.html` im Projektordner ist eine alte Vorlage (Tailwind, anderes Design) und nicht Teil der App. Sie liegt aus dem ersten Commit im Repo. Nicht mit der App verwechseln und nicht ändern, löschen nur auf Wunsch des Nutzers.
