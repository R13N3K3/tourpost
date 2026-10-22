# Schlüssel besorgen: Instagram und YouTube

Konkrete Schritte, damit TourPost auf Instagram und YouTube posten darf. Die Menünamen bei Meta und Google ändern sich öfter, im Zweifel sinngemäß suchen. Zugangsdaten gehören nur in die `.env`, nie in den Chat und nie ins Repo.

Stand: **Instagram** und **YouTube** sind mit echten Konten durchgespielt, der Live-Upload hat jeweils geklappt. Bei YouTube stammen die Menünamen aus der Google-Doku und können sich von der Oberfläche unterscheiden.

---

## Instagram

Es wird die **Instagram API mit Instagram-Login** benutzt. Eine Facebook-Seite ist nicht nötig.

**Voraussetzung:** Das Instagram-Konto ist ein **Creator- oder Business-Konto** (Instagram-App → Einstellungen → Kontotyp). Zum Registrieren braucht man ein Facebook-Konto.

### 1. Als Entwickler registrieren
1. [developers.facebook.com](https://developers.facebook.com) öffnen und mit dem Facebook-Konto anmelden.
2. **Erste Schritte** klicken, Bedingungen akzeptieren, Telefonnummer per SMS bestätigen.
3. Danach erscheint oben **Meine Apps**. Leitet `developers.facebook.com/apps` auf die Startseite zurück, ist die Registrierung noch nicht abgeschlossen.

> Die Seiten unter „Tools" (Graph API Explorer, Token Debugger …) werden nicht gebraucht.

### 2. App anlegen
1. **Meine Apps → App erstellen**, Name und Kontakt-E-Mail eingeben.
2. Bei den **Anwendungsfällen** links den Filter **„Content-Management"** (oder „Alle") wählen. Der Filter „Empfohlen" zeigt Instagram nicht.
3. **„Messaging und Content auf Instagram verwalten"** ankreuzen und weiter. Ein Unternehmensportfolio ist nicht nötig, die Anforderungen müssen im Entwicklungsmodus nicht erfüllt werden.

### 3. Berechtigungen
Im Dashboard den Anwendungsfall öffnen (**Anpassen**) und links **Berechtigungen und Features** wählen. Dort hinzufügen:
- `instagram_business_basic`
- `instagram_business_content_publish`

**Wichtig:** `content_publish` steht in der Liste von Schritt 1 der API-Einrichtung **nicht** drin und muss hier extra hinzugefügt werden, **bevor** das Token erzeugt wird. Sonst scheitert das Posten, und das Token muss neu erzeugt werden.

### 4. Das Konto als Tester eintragen
1. In **API-Einrichtung mit Instagram-Login** bei Schritt 2 auf den Link **„Rollen"** klicken (oder App-Rollen → Rollen).
2. **Personen hinzufügen** → ganz unten **Instagram-Tester** → Instagram-Benutzernamen eingeben → Hinzufügen.
3. In Instagram die Einladung annehmen: Einstellungen → Apps und Websites → **Tester-Einladungen**.

### 5. Token erzeugen
1. Zurück zur **API-Einrichtung mit Instagram-Login**, Seite neu laden.
2. Schritt 2: **Konto hinzufügen**, bei Instagram anmelden und erlauben.
3. **Token generieren**. Das Token sofort in die `.env` eintragen:
   ```
   IG_ACCESS_TOKEN=<Token>
   ```
   Pro Schlüssel darf nur **eine** Zeile in der `.env` stehen. Eine zusätzliche leere Zeile `IG_ACCESS_TOKEN=` würde das Token überdecken.

Die Webhooks (Schritt 3) und die Instagram-App-ID mit Geheimcode werden nicht gebraucht.

### 6. Konto-ID holen und Token prüfen
```
curl "https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=<TOKEN>"
```
Die Antwort muss `user_id` und `username` enthalten. Die `user_id` kommt in die `.env`:
```
IG_USER_ID=<user_id>
```
(Nicht das Feld `id`, sondern `user_id`.)

### 7. Öffentliche Adresse fürs Video
Instagram holt das Video selbst von einer öffentlichen HTTPS-Adresse ab.
- `./setup.sh --tunnel` installiert `cloudflared`.
- `PUBLIC_BASE_URL` in der `.env` **leer lassen**: Im Live-Modus startet der Server den Tunnel selbst und startet ihn bei Ausfall neu.
- Eigene Domain vorhanden? Dann einen benannten Cloudflare-Tunnel einrichten und die Adresse als `PUBLIC_BASE_URL` eintragen.

### 8. Live gehen und testen
1. `IG_MODE=live` in die `.env`, Server neu starten (er verlängert das Token beim Start automatisch).
2. Ein kurzes **Hochkant-Video** (9:16, MP4, über 3 Sekunden) nur für Instagram posten, „Sofort".
3. Das Reel in Instagram prüfen und löschen. Die Duplikatsperre merkt sich das Video nach einem erfolgreichen Post.

### Typische Fehler
| Meldung | Ursache |
|---|---|
| Instagram konnte das Video nicht verarbeiten (ERROR) | Tunnel nicht erreichbar, oder Video nicht im Hochformat 9:16 |
| Fehler zu fehlender Berechtigung | `instagram_business_content_publish` fehlte beim Erzeugen des Tokens |
| Token ungültig | Zeichen beim Kopieren verloren, oder doppelte Zeile in der `.env` |
| Kein „Instagram" bei den Anwendungsfällen | Filter „Empfohlen" aktiv, auf „Content-Management" oder „Alle" wechseln |

---

## YouTube

Das Video landet auf dem Kanal des Google-Kontos, mit dem man sich anmeldet. Zum Testen den eigenen Kanal nehmen.

### 1. Projekt und API
1. [console.cloud.google.com](https://console.cloud.google.com) öffnen, oben **Projekt auswählen → Neues Projekt**, Name frei.
2. **APIs & Dienste → Bibliothek**, nach **YouTube Data API v3** suchen und **Aktivieren**.

### 2. Zustimmungsbildschirm
1. **APIs & Dienste → OAuth-Zustimmungsbildschirm** (in neueren Oberflächen „Google Auth Platform").
2. Nutzertyp **Extern**, App-Name und E-Mail frei wählbar.
3. Das eigene Google-Konto als **Testnutzer** eintragen.

### 3. Zugangsdaten
1. **Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**, Anwendungstyp **Desktop-App**.
2. Client-ID und Client-Secret in die `.env`:
   ```
   YT_CLIENT_ID=<Client-ID>
   YT_CLIENT_SECRET=<Client-Secret>
   ```

### 4. Refresh-Token holen
1. Auf dem PC im Projektordner: `npm run youtube-auth`.
2. Den ausgegebenen Link **im Browser auf diesem Rechner** öffnen (die Rückkehr geht an `127.0.0.1`), mit dem YouTube-Konto anmelden.
3. Bei der Warnung „nicht verifiziert": **Erweitert → Weiter**.
4. Das Skript schreibt `YT_REFRESH_TOKEN` selbst in die `.env`.

### 5. Live gehen und testen
1. In der `.env`: `YT_MODE=live` und `YT_PRIVACY=private`, Server neu starten.
2. Wegwerf-Video nur für YouTube posten („Sofort"), im YouTube Studio prüfen (hochkant, höchstens 3 Minuten, wird als Short erkannt), dann löschen.
3. Erst danach `YT_PRIVACY=public`.

### Wichtig danach
- Im **Testmodus** des Zustimmungsbildschirms läuft das Token nach **7 Tagen** ab. Dann den Bildschirm auf **„In Produktion"** stellen und `npm run youtube-auth` erneut ausführen.
- Uploads aus nicht geprüften API-Projekten setzt Google auf **privat**, auch bei `YT_PRIVACY=public`. Dafür gibt es ein Prüfformular von Google.
- Tageskontingent: 10.000 Einheiten, ein Upload kostet etwa 1.600. Das reicht für 1–2 Videos pro Woche.
