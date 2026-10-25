# TourPost – Hinweise für Claude

Handy-Web-App (Node/Express), die Videos als Instagram Reel, YouTube Short und auf TikTok veröffentlicht. Oberfläche und Texte sind auf **Deutsch**. Details zu Aufbau und Bedienung stehen in der `README.md`.

## Gehört zu Tourbuchung

Dieses Projekt (**TourPost**, `~/Schreibtisch/tourpost`) und **Tourbuchung** (`~/Schreibtisch/tourbuchung`, eigenes Repository `R13N3K3/tourbuchung`, eigene `CLAUDE.md`) gehören inhaltlich zusammen: Beide dienen demselben Veranstalter für seine Pilztouren. TourPost macht die Werbung (Videos auf Instagram, YouTube, TikTok), Tourbuchung nimmt Anmeldungen und Zahlungen entgegen. Technisch sind sie **getrennt**: eigener Code, eigene Datenbank/Daten, eigene `.env`, eigener Port (TourPost 3000, Tourbuchung 3200), keine gemeinsamen Zugangsdaten.

- Die Seite „Touren" in dieser App (`public/touren.html`) ist noch ein Platzhalter. Sie könnte später auf die Anmeldeseite von Tourbuchung verlinken oder deren freie Termine anzeigen. Noch nicht gebaut.
- **Sicherheit bleibt getrennt:** Tourbuchung ist bewusst öffentlich erreichbar (mit Passwort für `/admin/`). TourPost hat keinen Zugangsschutz und darf **nie** über denselben Tunnel oder dieselbe Adresse erreichbar sein. Durch einen Tunnel nach außen darf bei TourPost weiterhin nur der Medienserver (Port `MEDIA_PORT`).
- Änderungen, die beide betreffen (zum Beispiel gemeinsamer Name des Veranstalters, Texte, Links), in beiden Projekten nachziehen und in der jeweils anderen `CLAUDE.md` vermerken.

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
- **Nie mit den echten Daten.** Eine Kopie von `server/`, `public/`, `package.json` und `node_modules` in ein Wegwerf-Verzeichnis legen, dort auf einem anderen Port starten und Beispieldaten über die API anlegen (ein fertiges Video, ein paar im Vorrat, Wochenplan Freitags/Sonntags 12:00). Das echte `data/` darf nicht verändert werden.
- Firefox macht das Bild, bevor `fetch` fertig ist. Nur in der Wegwerf-Kopie `api()` in `public/js/vorrat.js` auf einen **synchronen** `XMLHttpRequest` umstellen, damit die Vorrat-Seite vollständig gerendert wird. Diese Änderung nie in das echte Projekt übernehmen.
- Danach das Bild ansehen und prüfen, bevor es committet wird.
- **Versionsparameter in der README erhöhen:** GitHub zwischenspeichert README-Bilder (camo), ein ausgetauschtes Bild erscheint sonst oft stundenlang noch alt. Deshalb steht an den Bild-Links in der README `?v=<Zahl>` (zurzeit `?v=2`). Bei jedem neuen Screenshot die Zahl bei allen vier Links um eins erhöhen, im selben Commit.

## Server

- Starten: `node server/index.js` (Port 3000, `PORT` änderbar). Nach Änderungen an `server/` den Server **neu starten**. Statische Dateien in `public/` brauchen keinen Neustart.
- Alten Server beenden über die PID auf Port 3000 (`ss -ltnp`), **nicht** mit `pkill` (trifft die eigene Shell).
- `DEBUG_REQUESTS=1` protokolliert jede Anfrage mit Dauer.
- Tests: `npm test` (Fern-Tür mit Login, Sperren, Sitzungen).
- Zustand liegt in `data/` (`queue.json`, `settings.json`, `log.jsonl`) und ist nicht im Repo. `uploads/` und `.env` ebenfalls nicht.

## Todo

- **Telegram-Bot**: Liefert Status-Updates zu Uploads (Vorrat → wird gepostet → erfolgreich/fehlgeschlagen, Links zu den Beiträgen) und andere Kennzahlen wie Likes und Views pro Video und Plattform. Kennzahlen müssen dafür per API der Plattformen abgefragt werden (Instagram Insights, YouTube Data/Analytics API, TikTok API). Kann die bestehenden ntfy-Benachrichtigungen (`server/notify.js`) ergänzen oder ersetzen. Bot-Token und Chat-ID kommen in die `.env`, nie ins Repo.

- **Schlüssel beschaffen und testen** (Anleitung in `docs/anleitung-schluessel.md` und in der `README.md`): Instagram und YouTube sind live durchgespielt. Offen ist TikTok (Developer-Portal, Sandbox, Audit): die Schritte mit der aktuellen Doku abgleichen und beim ersten Durchlauf korrigieren. Jeweils zuerst `…_MODE=test`, dann Live-Test mit einem Wegwerf-Video (die Duplikatsperre sperrt es danach). Der Nutzer sollte die Konten selbst anlegen, Claude gibt keine Zugangsdaten aus.


## YouTube einrichten (Schritte für den Nutzer)

Der Code ist fertig (`server/youtube.js`, `scripts/youtube-auth.js`), und live getestet. Das Video landet auf dem Kanal des Google-Kontos, mit dem man sich anmeldet. Zum Testen den eigenen Kanal nehmen.

1. Auf console.cloud.google.com ein **Projekt** anlegen.
2. „APIs & Dienste" → **YouTube Data API v3** aktivieren.
3. **OAuth-Zustimmungsbildschirm** einrichten (Nutzertyp „Extern", Name und E-Mail frei) und das eigene Google-Konto als **Testnutzer** eintragen.
4. „Anmeldedaten" → **OAuth-Client-ID** erstellen, Typ **Desktop-App**. Client-ID und Client-Secret in die `.env` als `YT_CLIENT_ID` und `YT_CLIENT_SECRET` eintragen (nie in den Chat).
5. Auf dem PC `npm run youtube-auth` ausführen, den Link im Browser öffnen und anmelden (bei „nicht verifiziert": Erweitert → Weiter). Das Skript trägt `YT_REFRESH_TOKEN` in die `.env` ein.
6. `YT_MODE=live` und `YT_PRIVACY=private` setzen, Server neu starten, ein Wegwerf-Video nur für YouTube posten („Sofort"), im YouTube Studio prüfen und danach löschen.
7. Später: Zustimmungsbildschirm auf „In Produktion" stellen (sonst läuft das Token nach 7 Tagen ab). Uploads aus ungeprüften Projekten setzt Google auf privat, dafür gibt es ein Prüfformular.

## TikTok einrichten (Schritte für den Nutzer)

Der Code ist fertig (`server/tiktok.js`, `scripts/tiktok-auth.js`, Direct Post mit FILE_UPLOAD), aber noch nicht live getestet. Menünamen im Portal ändern sich, sinngemäß suchen.

1. developers.tiktok.com → App anlegen, Produkte **Login Kit** und **Content Posting API** (Direct Post) hinzufügen, Berechtigungen `user.info.basic` und `video.publish`.
2. Bei Login Kit eine **Redirect-URI** (https) eintragen und als `TT_REDIRECT_URI` in die `.env`. `TT_CLIENT_KEY` und `TT_CLIENT_SECRET` ebenfalls in die `.env` (nie in den Chat).
3. Das eigene TikTok-Konto als Testnutzer (Sandbox / Target User) eintragen.
4. `npm run tiktok-auth`, Link öffnen, erlauben, die komplette Adresse aus der Adresszeile ins Terminal einfügen. Das Skript schreibt `TT_REFRESH_TOKEN` (ca. 365 Tage gültig, der Server erneuert es selbst).
5. `TT_MODE=live`, `TT_PRIVACY=SELF_ONLY`, Server neu starten, Wegwerf-Video nur für TikTok posten, in der App prüfen, löschen.
6. Ohne **App-Audit** bleibt alles privat (`SELF_ONLY`), eventuell muss das Konto privat sein (`unaudited_client_can_only_post_to_private_accounts`). Nach dem Audit `TT_PRIVACY=PUBLIC_TO_EVERYONE`. Das Audit beantragt der Nutzer im Portal.

## Regeln

- **Keine Zugangsdaten** (`.env`, Tokens, SSH-Schlüssel) committen oder im Chat ausgeben.
- **Persönliche Nachrichten an Dritte** (zum Beispiel an den Kumpel) und Mailadressen gehören nicht ins Repo. Sie liegen lokal in `notizen/` (per `.gitignore` ausgeschlossen).
- Ein Video darf nie zweimal gepostet werden: Duplikatsperre über den SHA-256-Hash und das Protokoll `data/log.jsonl` nicht umgehen oder abschwächen.
- Die Live-Uploads für Instagram und YouTube sind mit echten Konten getestet (Instagram-Tokenverlängerung ebenfalls). TikTok ist nur gegen eine Attrappe geprüft, die Videos bleiben bis zum App-Audit privat. TikTok nicht als „fertig" darstellen.
- `server/media.js` ist der Medienserver (Port `MEDIA_PORT`, nur 127.0.0.1, liefert ausschließlich `/media/<24 Hex>.<endung>`). Durch den **Medien-Tunnel** darf nur dieser Port ins Internet, nie die App auf Port 3000. Den Medienserver nicht um weitere Routen erweitern.
- **Fernzugriff** (`server/remote.js`, `REMOTE_MODE=tunnel`): eine zweite, getrennte Tür (`REMOTE_PORT`, 3002) mit eigenem Fern-Tunnel, **jede** Anfrage dort geht durch Login mit Passwort und TOTP-Code. Den Fern-Tunnel nie auf Port 3000 oder den Medienserver zeigen lassen und die Anmeldung nicht abschwächen oder Ausnahmen einbauen (außer `/login` und seine zwei Dateien in `server/remote/`). Änderungen an `remote.js` immer mit `npm test` prüfen. Passwort und Schlüssel (`data/remote-auth.json`) nie ausgeben.
- Port 3000 (Heimnetz) hat **keinen Zugangsschutz**. Den Server nicht ungeschützt ins Internet stellen. Von außen nur über den Fernzugriff mit Login.
- Commit-Nachrichten auf Deutsch, am Ende die Co-Authored-By-Zeile der aktuellen Sitzung.
- `text.html` im Projektordner ist eine alte Vorlage (Tailwind, anderes Design) und nicht Teil der App. Sie liegt aus dem ersten Commit im Repo. Nicht mit der App verwechseln und nicht ändern, löschen nur auf Wunsch des Nutzers.
