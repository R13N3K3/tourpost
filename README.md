# TourPost

Handy-Web-App, um ein Video von unterwegs automatisch als Instagram Reel, YouTube Short und auf TikTok zu veröffentlichen. Das Smartphone ist die Fernbedienung, ein kleiner Node-Server übernimmt den Upload.

## Einrichtung & Nutzung

Du brauchst Linux oder macOS mit `git` und `curl` und ein Handy im selben WLAN. Node.js wird bei Bedarf automatisch installiert.

```bash
git clone https://github.com/R13N3K3/tourpost.git
cd tourpost
./setup.sh
```

1. `./setup.sh` richtet alles ein, startet den Server als **Dienst** (systemd-Benutzerdienst, startet automatisch und bei Absturz neu) und zeigt einen **QR-Code** für diesen Rechner. Damit der Server auch ohne Anmeldung nach einem Neustart läuft, einmal `sudo loginctl enable-linger $USER` ausführen. Ohne Dienst: `./setup.sh --no-service` und dann `npm start`.
2. Mit der Handy-Kamera scannen. Die App öffnet sich im Browser.
3. Optional „Zum Startbildschirm hinzufügen", dann startet sie wie eine App.
4. Unter **Vorrat** den **Wochenplan** einstellen: Wochentage und Uhrzeit wählen, „Automatisch aus dem Vorrat posten" einschalten, speichern.
5. Unter **Video verteilen** Videos hochladen (Titel, Text, Hashtags, Plattformen) und **„In den Vorrat"** wählen.

Ab jetzt postet der Server selbstständig: Zu jedem Termin des Wochenplans nimmt er das **älteste** Video aus dem Vorrat und veröffentlicht es. Du musst nur dafür sorgen, dass der Vorrat nicht leer läuft.

Lädt die Seite nicht? Dann `./setup.sh --firewall` ausführen und prüfen, dass das Handy im selben WLAN ist (nicht Mobilfunk, kein Gast-WLAN). Weitere Optionen: `./setup.sh --no-service` richtet keinen Autostart-Dienst ein, `./setup.sh --remote` richtet den **Fernzugriff von unterwegs** ein (Login mit Passwort und Authenticator-Code, siehe „Fernzugriff von unterwegs"), `./setup.sh --tunnel` installiert `cloudflared` (nur für Instagram nötig, siehe unten).

### API-Schlüssel eintragen

Alle Zugangsdaten stehen in der Datei **`.env`** im Projektordner (`./setup.sh` legt sie aus `.env.example` an). Es gibt noch keine Eingabemaske in der App.

1. `.env` in einem Editor öffnen, zum Beispiel `nano .env`.
2. Die Werte hinter dem `=` eintragen, ohne Anführungszeichen und ohne Leerzeichen.
3. Speichern und den **Server neu starten** (`Strg+C`, dann `npm start`; beim Dienst `systemctl --user restart tourpost`). Die `.env` wird nur beim Start gelesen.

| Eintrag | Bedeutung |
|---|---|
| `IG_MODE` | `test` = es wird nichts gepostet (simuliert), `live` = echter Instagram-Upload |
| `IG_USER_ID` | Instagram-Konto-ID (Business- oder Creator-Konto) |
| `IG_ACCESS_TOKEN` | Instagram-Token aus der Meta-Developer-App (ca. 60 Tage gültig) |
| `PUBLIC_BASE_URL` | Optional: feste HTTPS-Adresse des **Medienservers** (eigener Cloudflare-Tunnel). Leer lassen, dann startet der Server im Live-Modus selbst einen Schnelltunnel (`server/tunnel.js`). Instagram lädt das Video von dort ab |
| `MEDIA_PORT` | Port des Medienservers, Standard 3001 |
| `REMOTE_MODE` | `off` = nur Heimnetz (Standard), `tunnel` = zusätzlich Fernzugriff für per QR-Code gekoppelte Geräte (siehe „Fernzugriff von unterwegs") |
| `REMOTE_PORT` | Port der Fern-Tür, Standard 3002 (nur lokal, nur auf diesen zeigt der Fern-Tunnel) |
| `YT_MODE` | `test` oder `live` für YouTube |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET` | OAuth-Client aus der Google Cloud Console |
| `YT_REFRESH_TOKEN` | Wird von `npm run youtube-auth` eingetragen, nicht von Hand |
| `YT_PRIVACY` | `public`, `unlisted` oder `private` (zum Testen `private`) |
| `TT_MODE` | `test` oder `live` für TikTok |
| `TT_CLIENT_KEY`, `TT_CLIENT_SECRET` | Aus der App im TikTok-Developer-Portal |
| `TT_REDIRECT_URI` | https-Adresse, in der TikTok-App als Redirect-URI eingetragen |
| `TT_REFRESH_TOKEN` | Wird von `npm run tiktok-auth` eingetragen und vom Server selbst erneuert |
| `TT_PRIVACY` | `SELF_ONLY` (bis zum Audit) oder `PUBLIC_TO_EVERYONE` |
| `NTFY_TOPIC` | Optional: Thema für Push-Nachrichten aufs Handy (siehe „Benachrichtigungen") |

Zum Ausprobieren erst mit `IG_MODE=test` testen und erst dann auf `live` stellen. Die `.env` enthält Geheimnisse und ist per `.gitignore` vom Repository ausgeschlossen. Nie weitergeben oder committen.

### Wo bekomme ich die Schlüssel her, und wie teste ich?

> **Stand:** Instagram und YouTube sind mit echten Konten durchgespielt (Live-Upload geklappt). Die TikTok-Schritte stammen noch aus der Plattform-Dokumentation und sind nicht getestet. Menüs und Regeln der Plattformen ändern sich, im Zweifel die aktuelle Doku prüfen. Vorher überall `…_MODE=test` lassen. Eine ausführliche Anleitung mit allen Stolperstellen steht in [docs/anleitung-schluessel.md](docs/anleitung-schluessel.md).

**Instagram** (live getestet)
Läuft über die **Instagram API mit Instagram-Login**. Es wird **keine Facebook-Seite** gebraucht, das Konto muss nur **Creator oder Business** sein.
1. Auf [developers.facebook.com](https://developers.facebook.com) eine **App** anlegen (Typ „Business") und den Anwendungsfall **„Instagram API mit Instagram-Login"** hinzufügen. Die Menünamen ändern sich bei Meta öfter, im Zweifel danach suchen.
2. Das Instagram-Konto als **Instagram-Tester** der App hinzufügen und die Einladung in der Instagram-App annehmen (Einstellungen → Apps und Websites → Tester-Einladungen).
3. Im App-Dashboard bei der Instagram-Einrichtung für dieses Konto ein **Token generieren**, mit der Berechtigung `instagram_business_content_publish` (zusätzlich `instagram_business_basic`). Das ist `IG_ACCESS_TOKEN` und gilt ca. 60 Tage. Der Server **verlängert es automatisch** (`server/igtoken.js`, im Live-Modus beim Start und alle 6 Stunden geprüft, Verlängerung nach spätestens 20 Tagen, neues Token wird in der `.env` gespeichert). Läuft der Server länger als ca. 60 Tage nicht, muss das Token neu erzeugt werden. Schlägt die Verlängerung dauerhaft fehl, kommt eine ntfy-Nachricht. Die Verlängerung hat live funktioniert (`data/igtoken.json` bekommt ein Ablaufdatum).
4. `IG_USER_ID` ist die Instagram-Konto-ID. Sie steht beim Token-Erzeugen im Dashboard oder kommt von: `curl "https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=<TOKEN>"` (Feld `user_id`).
5. `PUBLIC_BASE_URL`: Instagram holt das Video selbst von einer öffentlichen HTTPS-Adresse. Dafür läuft neben der App ein kleiner **Medienserver** (Port `MEDIA_PORT`, Standard 3001, nur lokal erreichbar), der ausschließlich `/media/<zufälliger-Dateiname>` ausliefert. **Nur diesen Port** durch einen Cloudflare Tunnel ins Internet stellen, nie die App (Port 3000). Der Tunnel braucht keine Portfreigabe im Router, weil er die Verbindung von deinem PC nach außen aufbaut.
   - **Automatisch (Standard):** `PUBLIC_BASE_URL` leer lassen und `cloudflared` installieren (`./setup.sh --tunnel`). Im Live-Modus (`IG_MODE=live`) startet der Server den Schnelltunnel selbst, liest die `https://….trycloudflare.com`-Adresse aus, prüft vor jedem Instagram-Upload, dass sie erreichbar ist, und startet den Tunnel bei Ausfall neu. Die Adresse ändert sich dabei, das stört nicht, weil sie bei jedem Upload frisch gelesen wird. Schnelltunnel haben aber keine Verfügbarkeitszusage von Cloudflare.
   - **Fest:** Wer eine eigene Domain hat, richtet einen benannten Tunnel ein und trägt die Adresse als `PUBLIC_BASE_URL` ein. Dann startet der Server keinen eigenen Tunnel.
   - Damit alles ohne Zutun läuft, den Server als Dienst laufen lassen (das macht `./setup.sh` standardmäßig, der Tunnel startet mit dem Server).
- **Testen:** (1) Adresse prüfen (beim Schnelltunnel steht sie in der Serverausgabe als `Tunnel: …`): `<Adresse>/media/test` muss „404“ liefern (der Tunnel erreicht den Medienserver), die App selbst (`<Adresse>/api/status`) darf von außen **nicht** erreichbar sein. (2) Token prüfen: der `curl` aus Schritt 4 muss `user_id` und `username` liefern. (3) `IG_MODE=live` setzen und **ein kurzes Wegwerf-Video** nur für Instagram posten (Hochformat 9:16, MP4, über 3 Sekunden), danach das Reel auf Instagram wieder löschen. Achtung: Die Duplikatsperre merkt sich dieses Video, es lässt sich nicht noch einmal hochladen.
- Solange die Meta-App im Entwicklermodus ist, funktioniert sie nur für Konten, die als Tester eingetragen sind. Das reicht hier, ein App-Review ist nicht nötig.

**YouTube** (live getestet)
1. In der [Google Cloud Console](https://console.cloud.google.com) ein **Projekt** anlegen und unter „APIs & Dienste" die **YouTube Data API v3** aktivieren.
2. **OAuth-Zustimmungsbildschirm** einrichten (extern, Name und E-Mail frei wählbar). Das eigene Google-Konto als **Testnutzer** eintragen. Der Testmodus lässt das Token nach 7 Tagen ablaufen, deshalb später auf „In Produktion" stellen.
3. Unter „Anmeldedaten" eine **OAuth-Client-ID** vom Typ **Desktop-App** erstellen. Client-ID und Client-Secret in die `.env` als `YT_CLIENT_ID` und `YT_CLIENT_SECRET` eintragen.
4. Auf dem PC `npm run youtube-auth` ausführen, den angezeigten Link im Browser öffnen und mit dem YouTube-Konto anmelden (bei „nicht verifiziert" auf „Erweitert" und „Weiter" klicken). Das Skript trägt `YT_REFRESH_TOKEN` selbst in die `.env` ein.
5. `YT_MODE=live` setzen, `YT_PRIVACY=private` zum Testen, Server neu starten.
- **Testen:** Ein Wegwerf-Video nur für YouTube hochladen („Sofort"). Im YouTube Studio prüfen, ob es da ist und als Short erkannt wird (hochkant, höchstens 3 Minuten). Danach löschen, die Duplikatsperre merkt sich das Video. Erst dann `YT_PRIVACY=public`.
- Uploads aus nicht geprüften API-Projekten setzt Google zunächst auf **privat**, auch bei `YT_PRIVACY=public`. Dafür gibt es ein Prüfformular von Google. Das Tageskontingent (10.000 Einheiten, ein Upload ca. 1.600) reicht für 1–2 Videos pro Woche.

**TikTok** (Code vorhanden, noch nie live getestet)
Solange TikTok nicht live getestet ist, ist es auf der Video-Seite **standardmäßig abgewählt** (Haken bei Bedarf selbst setzen). Nach dem ersten erfolgreichen Test in `public/video.html` das `checked` wieder ergänzen.
Läuft über die **Content Posting API** (Direct Post, die Datei wird direkt vom Server hochgeladen, ohne öffentliche Adresse).
1. Auf [developers.tiktok.com](https://developers.tiktok.com) anmelden und eine **App** anlegen. Die Produkte **Login Kit** und **Content Posting API** hinzufügen, bei der Content Posting API **Direct Post** aktivieren. Berechtigungen: `user.info.basic` und `video.publish`.
2. Bei Login Kit eine **Redirect-URI** eintragen: eine beliebige `https`-Adresse, die du kontrollierst oder die einfach eine (Fehler-)Seite zeigt. Dieselbe Adresse als `TT_REDIRECT_URI` in die `.env`. **Client Key** und **Client Secret** der App als `TT_CLIENT_KEY` und `TT_CLIENT_SECRET` eintragen.
3. Das TikTok-Konto als **Testnutzer** der App eintragen (Sandbox bzw. „Target Users", je nach Portal-Ansicht).
4. `npm run tiktok-auth` ausführen, den Link im Browser öffnen, bei TikTok erlauben, dann die komplette Adresse aus der Adresszeile (sie enthält `?code=…`) in das Terminal einfügen. Das Skript trägt `TT_REFRESH_TOKEN` in die `.env` ein. Es gilt ca. 365 Tage, der Server erneuert den Zugriff selbst (der Access-Token gilt nur 24 Stunden).
5. `TT_MODE=live` und `TT_PRIVACY=SELF_ONLY` setzen, Server neu starten.
- **Testen:** Ein Wegwerf-Video nur für TikTok posten („Sofort") und in der TikTok-App prüfen. Danach löschen, die Duplikatsperre merkt sich das Video.
- **Wichtig:** Ohne bestandenes **App-Audit** von TikTok sind alle Videos **nur für den Autor sichtbar** (`SELF_ONLY`). Die API meldet dazu eventuell `unaudited_client_can_only_post_to_private_accounts`, dann muss das TikTok-Konto auf **privat** gestellt sein. Erst nach dem Audit `TT_PRIVACY=PUBLIC_TO_EVERYONE` setzen. Pro Konto gilt ein Tageslimit für API-Posts.

## Vorschau

<table>
  <tr>
    <td align="center"><b>Hauptmenü</b></td>
    <td align="center"><b>Video verteilen</b></td>
    <td align="center"><b>Vorrat &amp; Planung</b></td>
    <td align="center"><b>Touren</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/index.png?v=3" width="180" alt="Hauptmenü"></td>
    <td><img src="docs/screenshots/video.png?v=3" width="180" alt="Video verteilen"></td>
    <td><img src="docs/screenshots/vorrat.png?v=3" width="180" alt="Vorrat und Planung"></td>
    <td><img src="docs/screenshots/touren.png?v=3" width="180" alt="Touren"></td>
  </tr>
</table>

## So funktioniert's

- **Vorrat:** Hochgeladene Videos warten auf dem Server. Die Reihenfolge ist „ältestes zuerst". Die App zeigt zu jedem Video den voraussichtlichen Termin und wie lange der Vorrat reicht.
- **Wochenplan:** Pro Wochentag eine Uhrzeit (Standard: Freitag und Sonntag um 12:00, änderbar). Alle 10 Sekunden prüft der Server, ob ein Termin da ist, und veröffentlicht dann **ein** Video. Zeiten gelten in der Zeitzone des Servers. Verpasste Termine (Server war aus) holt er bis zu 12 Stunden später nach, ältere nicht.
- **Weitere Optionen beim Hochladen:** „Zu einem festen Zeitpunkt" für ein einzelnes Video, „Sofort veröffentlichen" und **„Nur Test (nichts wird veröffentlicht)"**. Der Testlauf lädt das Video hoch, prüft es (Videoprüfung) und simuliert die Plattformen, **auch wenn `IG_MODE`/`YT_MODE`/`TT_MODE` auf `live` stehen**. Es wird nichts gepostet, das Video wird danach gelöscht und zählt nicht für die Sperre gegen doppeltes Posten, du kannst dasselbe Video also später echt posten. Praktisch, um nach einer Änderung (zum Beispiel Fernzugriff oder Tunnel) den ganzen Weg zu prüfen.
- **Zwei Modi:** Im **Heimnetz** (Standard) ist die App über das WLAN erreichbar, ohne Login. Mit dem **Fernzugriff** kommst du zusätzlich von unterwegs hinein, nur auf einem Handy, das du am PC per QR-Code gekoppelt hast (ohne Passwort, 90 Tage angemeldet). Einrichtung und Absicherung stehen unter „Fernzugriff von unterwegs".
- **Videoprüfung:** Beim Hochladen prüft der Server das Video mit `ffprobe` (muss installiert sein, sonst entfällt die Prüfung). Abgelehnt wird eine Datei, die kein lesbares Video ist, und für Instagram ein Video unter 3 Sekunden. Als gelbe **Warnung** (der Upload klappt trotzdem) erscheinen Querformat, YouTube-Videos über 3 Minuten, Instagram-Videos über 15 Minuten und ein anderer Codec als H.264. Die Warnungen stehen auf der Video-Seite und im Vorrat am Video.
- **Veröffentlichen:** Instagram holt das Video über eine öffentliche URL ab und zeigt es als Reel (Instagram API). YouTube und TikTok bekommen die Datei direkt vom Server. Danach wird die Videodatei gelöscht.

### Fernzugriff von unterwegs (zweiter Modus)

Standard ist der **Heimnetz-Modus**: Die App ist nur im WLAN erreichbar, ohne Login. Zusätzlich lässt sich ein **Fernzugriff** einschalten, damit du auch unterwegs Videos hochladen kannst, ohne dass der Router etwas freigeben muss (der Tunnel baut die Verbindung von deinem PC nach außen auf).

Es gibt **keine Anmeldeseite und kein Passwort**. Ein Handy kommt nur über einen **QR-Code** hinein, den du am PC erzeugst:

```bash
./setup.sh               # fragt, ob der Fernzugriff eingeschaltet werden soll (oder gezielt: ./setup.sh --remote)
npm run remote-pair      # zeigt den QR-Code, mit der Handy-Kamera scannen
```

Danach ist das Handy bis zu **90 Tage** angemeldet (30 Tage ohne Nutzung), und du öffnest die öffentliche Adresse einfach wie eine normale Seite (am besten als Lesezeichen oder Homescreen-Symbol). Die **Adresse** kommt per ntfy aufs Handy (dafür `NTFY_TOPIC` setzen) und steht im Protokoll (`journalctl --user -u tourpost`). Sie ändert sich bei jedem Start des Tunnels, nach einem Neustart des Servers muss das Handy deshalb neu gekoppelt werden. Ein weiteres Handy koppelst du genauso. Ausschalten: `REMOTE_MODE=off` und Server neu starten. Handy verloren? `npm run remote-revoke` und Server neu starten meldet alle Geräte ab.

So ist es abgesichert:
- **Der Zugang entsteht nur am PC.** Der Link im QR-Code ist ein 256-Bit-Zufallswert, gilt **10 Minuten und genau einmal** und wird nur lokal erzeugt (als Hash in `data/remote-pairing.json`). Es gibt keinen Weg, ihn über das Netz anzufordern.
- **Eigene Fern-Tür:** Der Tunnel zeigt nur auf einen eigenen Anschluss (`REMOTE_PORT`, 3002), und dort geht **jede** Anfrage durch die Prüfung auf ein gekoppeltes Gerät. Der Heimnetz-Port 3000 und der Medienserver sind nie über diese Adresse erreichbar. Ohne Kopplung sieht man nur eine Hinweisseite.
- **Das Öffnen des Links verbraucht ihn nicht** (Link-Vorschauen schaden nicht), erst die Seite löst ihn im Hintergrund ein.
- **Sperren:** Nach 5 Fehlversuchen von einer Adresse 15 Minuten gesperrt, nach 20 Fehlversuchen insgesamt pro Stunde für alle. Fehler dauern immer gleich lang.
- **Sitzung:** zufälliges Cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, damit auch Links von außen wie aus einer ntfy-Meldung angemeldet ankommen; Schreibzugriffe schützt die Origin-Prüfung), serverseitig gespeichert. Oben in der App steht „Abmelden".
- **Weitere Schutzmaßnahmen:** Anfragen von fremden Seiten werden abgelehnt, Sicherheits-Header (CSP, HSTS, kein Einbetten), keine Zwischenspeicherung.
- **Meldungen aufs Handy:** wenn ein neues Gerät gekoppelt wird und bei Fehlversuchen (höchstens alle 10 Minuten).
- **Upload bis 100 MB:** Cloudflare lässt im kostenlosen Tarif etwa so viel pro Anfrage zu. Größere Videos lehnt der Server vorab mit einer klaren Meldung ab (im Heimnetz gehen bis 500 MB).

Grenzen: Wer ein gekoppeltes, entsperrtes Handy hat, kommt bis zu 90 Tage in die App (dann `remote-revoke`). Ohne Zugriff auf den PC kann man kein neues Gerät koppeln, auch du nicht, wenn du unterwegs bist und der Server neu gestartet wurde. Der Schnelltunnel hat keine Verfügbarkeitszusage, und Cloudflare sieht den Verkehr. Die Absicherung ist mit Tests geprüft, aber nicht von Dritten.

### Benachrichtigungen

Der Server meldet sich per Push aufs Handy, wenn
- der Vorrat knapp wird (Schwelle einstellbar, Standard: 2 Videos oder weniger) oder leer ist,
- ein Termin ohne Video bleibt,
- eine Veröffentlichung fehlschlägt.

Eingerichtet wird das mit [ntfy](https://ntfy.sh), einer kostenlosen App für Android und iPhone:
1. ntfy-App installieren und ein **schwer erratbares Thema** abonnieren, zum Beispiel `tourpost-x7k2m9q4`.
2. Dasselbe Thema in die `.env` eintragen: `NTFY_TOPIC=tourpost-x7k2m9q4`, Server neu starten.
3. In der App unter „Vorrat" auf „Testnachricht" tippen.

Wer das Thema kennt, kann mitlesen. Die Nachrichten enthalten Videotitel. Für mehr Privatsphäre gibt es einen eigenen ntfy-Server (`NTFY_SERVER`). Ohne `NTFY_TOPIC` zeigt die App die Warnung nur auf der Vorrat-Seite an.

**Kein doppeltes Posten**
- Jede Veröffentlichung wird dauerhaft in `data/log.jsonl` protokolliert (Zeit, Titel, Plattform, Ergebnis). Das Protokoll bleibt auch erhalten, wenn ein Video aus dem Vorrat gelöscht wird.
- Jedes Video bekommt beim Upload einen Fingerabdruck (SHA-256 des Inhalts). Ein bereits veröffentlichtes oder schon im Vorrat liegendes Video wird abgelehnt, auch wenn es umbenannt wurde.
- Klappt eine Plattform nicht, werden beim erneuten Versuch nur die fehlgeschlagenen Plattformen wiederholt. Bereits veröffentlichte werden übersprungen.
- Wird der Server mitten in einer Veröffentlichung beendet, wiederholt er sie nicht automatisch, sondern markiert sie als „Unterbrochen". Du prüfst dann selbst, ob das Video schon online ist.
- Verpasste Termine (Server war aus) werden beim nächsten Start nachgeholt.
- Testläufe (`IG_MODE=test` usw.) zählen für die Sperre nicht, damit du beim Ausprobieren dasselbe Video mehrfach nutzen kannst.

Die geheimen Zugangsdaten liegen nur auf dem Server (`.env`), nie in der App.

## Projektstruktur

```
setup.sh  Einrichtung auf einem neuen Rechner
public/   App (HTML, CSS, JS, PWA) – Hauptmenü, Video-Seite, Touren-Platzhalter
server/   Express-Server mit Planer und Wochenplan (schedule.js, settings.js), Fernzugriff für gekoppelte Geräte (remote.js, remoteauth.js), Vorrat (queue.js), Protokoll (log.js), Videoprüfung (videocheck.js),
          Benachrichtigung (notify.js), Medienserver (media.js, liefert nur Videodateien für den Tunnel aus), Tunnel (tunnel.js, startet cloudflared) und ein Modul pro Plattform (instagram.js, youtube.js, tiktok.js)
data/     Vorrat, Wochenplan und Protokoll (queue.json, settings.json, log.jsonl), nicht im Repo
scripts/  Hilfsskripte (QR-Code, Fernzugriff einschalten und koppeln, YouTube- und TikTok-Anmeldung)
docs/     Screenshots für die README
```

Neue Unterseiten werden in `public/js/nav.js` eingetragen, neue Plattformen als Modul in `server/`.

## Konfiguration (`.env`)

| Variable | Bedeutung |
|---|---|
| `IG_MODE` | Instagram: `test` simuliert nur, `live` postet wirklich |
| `YT_MODE` | YouTube: `test` oder `live` (Live getestet) |
| `TT_MODE` | TikTok: `test` oder `live` (Live noch nicht eingerichtet) |
| `IG_USER_ID` | Instagram-Business-/Creator-User-ID |
| `IG_ACCESS_TOKEN` | langlebiges Meta-Access-Token |
| `PUBLIC_BASE_URL` | feste öffentliche Adresse des Medienservers, leer = automatischer Schnelltunnel |
| `NTFY_TOPIC` | ntfy-Thema für Push-Nachrichten (leer = aus) |
| `REMOTE_MODE` | `off` oder `tunnel`: Fernzugriff für per QR-Code gekoppelte Geräte |
| `NTFY_SERVER` | eigener ntfy-Server, Standard `https://ntfy.sh` |
| `PORT` | Port, Standard 3000 |

Für den Live-Modus braucht es ein Instagram-Business- oder Creator-Konto, eine Meta-Developer-App und eine öffentlich erreichbare HTTPS-URL, damit Instagram das Video abholen kann. Die `.env` gehört nie ins Repo (steht in der `.gitignore`).

## Status

Prototyp. Alle drei Plattformen laufen im Testmodus (Upload, Vorrat, Wochenplan mit Autopilot, Status pro Plattform, Protokoll, Duplikatschutz, Warnungen). Instagram und YouTube sind live mit echten Konten getestet. TikTok ist programmiert, aber noch nicht mit einem echten Konto getestet (nur gegen eine Attrappe der Schnittstelle). TikTok-Videos bleiben bis zum App-Audit privat. Im Heimnetz-Modus (Port 3000) gibt es keinen Zugangsschutz, den Port nie ins Internet stellen. Über den Fernzugriff ist die App nur für per QR-Code gekoppelte Geräte erreichbar.

## Geplant

- TikTok live testen (erst nach dem App-Audit öffentlich)
- Zugangsschutz auch im Heimnetz-Modus (optional)
- Kundenansicht für gebuchte Touren
