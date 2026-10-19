# TourPost

Handy-Web-App, um ein Video von unterwegs automatisch auf Instagram (später YouTube, TikTok) zu veröffentlichen. Das Smartphone ist die Fernbedienung, ein kleiner Node-Server übernimmt den Upload.

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

1. Video in der App wählen, Beschreibung und Hashtags eintragen, „Absenden".
2. Der Server stellt das Video kurz unter einer öffentlichen URL bereit.
3. Instagram holt es ab und veröffentlicht es als Reel (Graph API), danach wird das Video gelöscht.

Die geheimen Zugangsdaten liegen nur auf dem Server (`.env`), nie in der App.

## Projektstruktur

```
public/   App (HTML, CSS, JS, PWA) – Hauptmenü, Video-Seite, Pilztouren-Platzhalter
server/   Express-Server + Plattform-Module (instagram.js)
```

Neue Unterseiten werden in `public/js/nav.js` eingetragen, neue Plattformen als Modul in `server/`.

## Starten

```
npm install
cp .env.example .env
node server/index.js
```

Danach im Browser `http://localhost:3000` öffnen, vom Handy im selben WLAN `http://<IP-des-Rechners>:3000`.

## Konfiguration (`.env`)

| Variable | Bedeutung |
|---|---|
| `IG_MODE` | `test` simuliert nur, `live` postet wirklich |
| `IG_USER_ID` | Instagram-Business-/Creator-User-ID |
| `IG_ACCESS_TOKEN` | langlebiges Meta-Access-Token |
| `PUBLIC_BASE_URL` | öffentliche HTTPS-Adresse des Servers (z. B. Cloudflare Tunnel) |
| `PORT` | Port, Standard 3000 |

Für den Live-Modus braucht es ein Instagram-Business- oder Creator-Konto, eine Meta-Developer-App und eine öffentlich erreichbare HTTPS-URL, damit Instagram das Video abholen kann.

## Status

Prototyp. Testmodus läuft, der Live-Upload ist noch nicht mit einem echten Konto getestet. Es gibt noch keinen Zugangsschutz – den Server nicht ungeschützt ins Internet stellen.

## Geplant

- Zugangsschutz
- YouTube und TikTok
- Kundenansicht für gebuchte Pilztouren
