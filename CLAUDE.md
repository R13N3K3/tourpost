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

## Regeln

- **Keine Zugangsdaten** (`.env`, Tokens, SSH-Schlüssel) committen oder im Chat ausgeben.
- Ein Video darf nie zweimal gepostet werden: Duplikatsperre über den SHA-256-Hash und das Protokoll `data/log.jsonl` nicht umgehen oder abschwächen.
- Die Live-Uploads für Instagram sind nach der Doku geschrieben, aber noch nicht mit einem echten Konto getestet. YouTube und TikTok laufen nur im Testmodus. Das nicht als „fertig" darstellen.
- Es gibt noch **keinen Zugangsschutz**. Den Server nicht ungeschützt ins Internet stellen.
- Commit-Nachrichten auf Deutsch, am Ende die Co-Authored-By-Zeile der aktuellen Sitzung.
- `text.html` im Projektordner ist eine alte Vorlage (Tailwind, anderes Design) und nicht Teil der App. Sie liegt aus dem ersten Commit im Repo. Nicht mit der App verwechseln und nicht ändern, löschen nur auf Wunsch des Nutzers.
