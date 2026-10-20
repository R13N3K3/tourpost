# TourPost

Handy-Web-App, um ein Video von unterwegs automatisch als Instagram Reel, YouTube Short und auf TikTok zu veröffentlichen. Das Smartphone ist die Fernbedienung, ein kleiner Node-Server übernimmt den Upload.

## Einrichtung & Nutzung

Du brauchst Linux oder macOS mit `git` und `curl` und ein Handy im selben WLAN. Node.js wird bei Bedarf automatisch installiert.

```bash
git clone https://github.com/R13N3K3/tourpost.git
cd tourpost
./setup.sh
npm start
```

1. `./setup.sh` richtet alles ein und zeigt einen **QR-Code** für diesen Rechner.
2. Mit der Handy-Kamera scannen. Die App öffnet sich im Browser.
3. Optional „Zum Startbildschirm hinzufügen", dann startet sie wie eine App.
4. „Video verteilen" → Video wählen, Titel, Text und Hashtags eintragen → Plattformen wählen → „Absenden".

Lädt die Seite nicht? Dann `./setup.sh --firewall` ausführen und prüfen, dass das Handy im selben WLAN ist (nicht Mobilfunk, kein Gast-WLAN). Weitere Option: `./setup.sh --service` startet den Server automatisch mit dem Rechner.

## Vorschau

<table>
  <tr>
    <td align="center"><b>Hauptmenü</b></td>
    <td align="center"><b>Video verteilen</b></td>
    <td align="center"><b>Pilztouren</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/index.png" width="240" alt="Hauptmenü"></td>
    <td><img src="docs/screenshots/video.png" width="240" alt="Video verteilen"></td>
    <td><img src="docs/screenshots/touren.png" width="240" alt="Pilztouren"></td>
  </tr>
</table>

## So funktioniert's

1. Video in der App wählen, Titel, Beschreibung und Hashtags eintragen, Plattformen wählen, „Absenden".
2. Der Server arbeitet die Plattformen nacheinander ab und zeigt den Status pro Plattform an.
3. Instagram holt das Video über eine öffentliche URL ab und veröffentlicht es als Reel (Graph API). YouTube und TikTok bekommen die Datei direkt vom Server.
4. Danach wird das Video auf dem Server gelöscht.

Die geheimen Zugangsdaten liegen nur auf dem Server (`.env`), nie in der App.

## Projektstruktur

```
setup.sh  Einrichtung auf einem neuen Rechner
public/   App (HTML, CSS, JS, PWA) – Hauptmenü, Video-Seite, Pilztouren-Platzhalter
server/   Express-Server + ein Modul pro Plattform (instagram.js, youtube.js, tiktok.js)
scripts/  Hilfsskripte (QR-Code)
docs/     Screenshots für die README
```

Neue Unterseiten werden in `public/js/nav.js` eingetragen, neue Plattformen als Modul in `server/`.

## Konfiguration (`.env`)

| Variable | Bedeutung |
|---|---|
| `IG_MODE` | Instagram: `test` simuliert nur, `live` postet wirklich |
| `YT_MODE` | YouTube: `test` oder `live` (Live noch nicht eingerichtet) |
| `TT_MODE` | TikTok: `test` oder `live` (Live noch nicht eingerichtet) |
| `IG_USER_ID` | Instagram-Business-/Creator-User-ID |
| `IG_ACCESS_TOKEN` | langlebiges Meta-Access-Token |
| `PUBLIC_BASE_URL` | öffentliche HTTPS-Adresse des Servers (z. B. Cloudflare Tunnel) |
| `PORT` | Port, Standard 3000 |

Für den Live-Modus braucht es ein Instagram-Business- oder Creator-Konto, eine Meta-Developer-App und eine öffentlich erreichbare HTTPS-URL, damit Instagram das Video abholen kann. Die `.env` gehört nie ins Repo (steht in der `.gitignore`).

## Status

Prototyp. Alle drei Plattformen laufen im Testmodus (Upload, Status pro Plattform, Fehlermeldungen). Live ist bisher nur Instagram programmiert, aber noch nicht mit einem echten Konto getestet. YouTube (Google-Login) und TikTok (Login, App-Prüfung) sind noch nicht angebunden. Es gibt noch keinen Zugangsschutz – den Server nicht ungeschützt ins Internet stellen.

## Geplant

- Instagram live testen, danach YouTube und TikTok anbinden
- Videoprüfung vor dem Upload (Format, Länge, Seitenverhältnis)
- Videos im Voraus hochladen und planen
- Zugangsschutz
- Kundenansicht für gebuchte Pilztouren
