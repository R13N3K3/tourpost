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

- **Instagram-Token-Verlängerung live prüfen**: `server/igtoken.js` verlängert das Token automatisch (nach der Doku `refresh_access_token`, ungeprüft, nur gegen eine Attrappe getestet). Beim ersten Live-Lauf kontrollieren, dass `data/igtoken.json` ein Ablaufdatum bekommt und die `.env` ein neues Token enthält.

## Nachricht an den Kumpel (Instagram-Zugang)

Zum Weiterschicken, wenn der Nutzer das Token braucht. Lockerer Ton ist gewollt. `<DEINE-MAIL>` vor dem Senden durch die Mailadresse des Nutzers ersetzen (steht absichtlich nicht im öffentlichen Repo).

> hey, wegen instagram brauch ich einmal nen zugang von dir damit die app deine reels posten kann. dauert so 15-20 min und n passwort brauch ich nicht, nur am ende nen "token"
>
> du brauchst dafür n normales facebook profil (nur zum anmelden bei meta, ne facebook seite brauchst du nicht)
>
> 1. geh auf developers.facebook.com und melde dich mit facebook an, registrier dich als entwickler (kann sein dass er nach handynummer oder mail fragt)
> 2. "App erstellen", typ Business, name egal z.b. TourPost
> 3. füg "Instagram API mit Instagram-Login" hinzu
> 4. bei App-Rollen → Rollen dein instagram konto als Instagram-Tester eintragen, dann in der insta app die einladung annehmen (einstellungen → apps und websites → tester-einladungen)
> 5. im dashboard bei der instagram einrichtung ein token generieren. wichtig: instagram_business_basic und instagram_business_content_publish müssen dabei sein
>
> das token schickst du mir bitte per mail an <DEINE-MAIL> (nicht in den chat) und löschst die mail danach bei dir auch aus gesendet und papierkorb. wer das token hat kann auf deinem konto posten
>
> musst du nur einmal machen, die app verlängert das token danach selber. wenn du bei nem schritt was anderes siehst als bei mir steht, schick mir n screenshot (aber ohne token)
>
> noch ne frage: hast du eigentlich auch schon nen youtube kanal und tiktok? wir machen erstmal nur instagram, aber dann weiß ich wie es danach weitergeht

Das Token trägt der Nutzer selbst in die `.env` ein und schickt es nie in den Chat.

## YouTube einrichten (Schritte für den Nutzer)

Der Code ist fertig (`server/youtube.js`, `scripts/youtube-auth.js`), aber noch nicht live getestet. Das Video landet auf dem Kanal des Google-Kontos, mit dem man sich anmeldet. Zum Testen den eigenen Kanal nehmen.

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
- Ein Video darf nie zweimal gepostet werden: Duplikatsperre über den SHA-256-Hash und das Protokoll `data/log.jsonl` nicht umgehen oder abschwächen.
- Die Live-Uploads für Instagram, YouTube und TikTok sind nach der Doku geschrieben, aber noch nicht mit echten Konten getestet (YouTube und TikTok nur gegen eine Attrappe geprüft). TikTok-Videos bleiben bis zum App-Audit privat. Das nicht als „fertig" darstellen.
- `server/media.js` ist der Medienserver (Port `MEDIA_PORT`, nur 127.0.0.1, liefert ausschließlich `/media/<24 Hex>.<endung>`). **Nur dieser Port** darf durch den Tunnel ins Internet, nie die App auf Port 3000. Den Medienserver nicht um weitere Routen erweitern.
- Es gibt noch **keinen Zugangsschutz**. Den Server nicht ungeschützt ins Internet stellen.
- Commit-Nachrichten auf Deutsch, am Ende die Co-Authored-By-Zeile der aktuellen Sitzung.
- `text.html` im Projektordner ist eine alte Vorlage (Tailwind, anderes Design) und nicht Teil der App. Sie liegt aus dem ersten Commit im Repo. Nicht mit der App verwechseln und nicht ändern, löschen nur auf Wunsch des Nutzers.
