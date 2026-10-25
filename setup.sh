#!/usr/bin/env bash
# TourPost – Einrichtung auf einem neuen Rechner.
# Aufruf: ./setup.sh [Optionen]   (Hilfe: ./setup.sh --help)
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<'HILFE'
TourPost – Einrichtung auf einem neuen Rechner

Aufruf:  ./setup.sh [Optionen]

Ohne Optionen passiert Folgendes:
  1. Node.js prüfen (fehlt es, wird es per nvm ohne sudo installiert) und npm install
  2. uploads/ anlegen und .env aus .env.example erstellen (bestehende .env bleibt unverändert)
  3. im Terminal fragen, ob der Fernzugriff von unterwegs ein- oder ausgeschaltet werden soll
  4. den Server als systemd-Benutzerdienst einrichten und starten (startet automatisch, bei Absturz neu)
  5. die Adresse fürs Handy und einen QR-Code anzeigen

Optionen:
  --firewall     Port in ufw für das Heimnetz freigeben (braucht sudo)
  --tunnel       cloudflared installieren (öffentliche Adresse für Instagram)
  --remote       Fernzugriff direkt einschalten (kein Passwort), danach ein Handy per QR-Code koppeln
                 (installiert auch cloudflared)
  --no-remote    Rückfrage zum Fernzugriff überspringen
  --no-service   keinen Dienst einrichten, der Server wird dann von Hand mit "npm start" gestartet
  --service      Dienst einrichten (ist schon der Standard, die Option bleibt aus Gewohnheit erhalten)
  -h, --help     diese Hilfe anzeigen

Beispiele:
  ./setup.sh                         Erstinstallation mit allen Rückfragen
  ./setup.sh --firewall              zusätzlich Port für das WLAN freigeben
  ./setup.sh --remote                Fernzugriff einrichten
  ./setup.sh --no-service --no-remote  nur Abhängigkeiten und Konfiguration, ohne Dienst und ohne Rückfrage

Mehr dazu in der README.md (Abschnitte „Einrichtung & Nutzung" und „Fernzugriff von unterwegs").
HILFE
}

WANT_FIREWALL=0
WANT_SERVICE=1
WANT_TUNNEL=0
WANT_REMOTE=0
ASK_REMOTE=1
for arg in "$@"; do
  case "$arg" in
    --firewall) WANT_FIREWALL=1 ;;
    --service)  WANT_SERVICE=1 ;;   # Standard, bleibt als Option erhalten
    --no-service) WANT_SERVICE=0 ;;
    --tunnel)   WANT_TUNNEL=1 ;;
    --remote)   WANT_REMOTE=1; WANT_TUNNEL=1 ;;   # braucht cloudflared
    --no-remote) ASK_REMOTE=0 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "Unbekannte Option: $arg"; echo; usage; exit 1 ;;
  esac
done

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }

# ---------- Node.js ----------
NVM_VERSION="v0.40.8"
NODE_WANTED=24

node_ok() {
  command -v node >/dev/null && command -v npm >/dev/null \
    && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]
}

# Installiert Node.js über nvm – nur im Home-Verzeichnis, ohne sudo.
install_node() {
  command -v curl >/dev/null || { echo "curl fehlt – bitte installieren und ./setup.sh neu starten."; exit 1; }
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "    nvm $NVM_VERSION wird installiert …"
    curl -fsSo- "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
  fi
  # nvm.sh verträgt kein "set -u"
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  echo "    Node.js $NODE_WANTED wird installiert …"
  nvm install "$NODE_WANTED"
  nvm use "$NODE_WANTED" >/dev/null
  set -u
}

step "Node.js prüfen"
if node_ok; then
  ok "Node $(node -v)"
else
  warn "Node.js (ab Version 18) fehlt oder ist zu alt – wird automatisch installiert."
  install_node
  node_ok || { echo "Node.js-Installation fehlgeschlagen."; exit 1; }
  ok "Node $(node -v) installiert"
  warn "Neues Terminal öffnen (oder: . ~/.nvm/nvm.sh), damit 'npm start' dort funktioniert."
fi

# ---------- Abhängigkeiten ----------
step "Abhängigkeiten installieren"
npm install --no-audit --no-fund --loglevel=error
ok "npm install fertig"

# ---------- Ordner und .env ----------
step "Ordner und Konfiguration"
mkdir -p uploads
ok "Ordner uploads/"
if [ -f .env ]; then
  ok ".env existiert schon – bleibt unverändert"
else
  cp .env.example .env
  ok ".env aus .env.example erstellt (IG_MODE=test, es wird nichts gepostet)"
fi

PORT=$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)
PORT=${PORT:-3000}

# ---------- IP-Adresse ----------
lan_ip() {
  if command -v ip >/dev/null; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}'
  elif command -v ipconfig >/dev/null; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
  fi
}
IP=$(lan_ip || true)

# ---------- Rückfrage: Fernzugriff ----------
# Nur im Terminal und nur, wenn --remote / --no-remote nicht schon etwas festlegen.
ask_yn() { local a; read -r -p "    $1 [j/N] " a; case "$a" in j|J|ja|Ja|JA|y|Y|yes) return 0 ;; *) return 1 ;; esac; }
set_remote_mode() {
  node -e "require('./server/util').setEnvVar('REMOTE_MODE', process.argv[1])" "$1"
  [ "$WANT_SERVICE" = 1 ] || warn "Ohne Dienst gilt die Änderung erst nach einem Neustart des Servers (npm start)."
}

if [ "$ASK_REMOTE" = 1 ] && [ "$WANT_REMOTE" = 0 ] && [ -t 0 ]; then
  step "Fernzugriff (von unterwegs)"
  REMOTE_CUR=$(grep -E '^REMOTE_MODE=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)
  if [ "$REMOTE_CUR" = tunnel ]; then
    ok "Fernzugriff ist eingeschaltet (Handys werden per QR-Code gekoppelt: npm run remote-pair)"
    if ask_yn "Ausschalten (nur noch im Heimnetz erreichbar)?"; then
      set_remote_mode off; ok "Fernzugriff ausgeschaltet (REMOTE_MODE=off)"
    fi
  else
    echo "    Die App ist im Heimnetz (WLAN) erreichbar. Sie lässt sich zusätzlich von unterwegs öffnen."
    echo "    Ein Handy kommt nur per QR-Code hinein, den du am PC erzeugst, ohne Passwort. Der Router braucht keine Freigabe."
    if ask_yn "Fernzugriff jetzt einrichten?"; then
      WANT_REMOTE=1; WANT_TUNNEL=1
    else
      ok "Übersprungen. Später: ./setup.sh --remote"
    fi
  fi
fi

# ---------- Firewall ----------
if [ "$WANT_FIREWALL" = 1 ]; then
  step "Firewall"
  if command -v ufw >/dev/null && [ -n "$IP" ]; then
    SUBNET="${IP%.*}.0/24"
    sudo ufw allow from "$SUBNET" to any port "$PORT" proto tcp
    ok "Port $PORT für $SUBNET freigegeben"
  else
    warn "ufw nicht gefunden oder IP unbekannt – Firewall bitte selbst anpassen."
  fi
fi

# ---------- systemd-Dienst ----------
if [ "$WANT_SERVICE" = 1 ]; then
  step "Autostart (systemd-Benutzerdienst)"
  if ! command -v systemctl >/dev/null; then
    warn "systemctl nicht gefunden – Autostart übersprungen, Server mit 'npm start' starten."
    WANT_SERVICE=0
  elif [ -z "${XDG_RUNTIME_DIR:-}" ] || ! systemctl --user show-environment >/dev/null 2>&1; then
    warn "Keine systemd-Benutzersitzung erreichbar – Autostart übersprungen, Server mit 'npm start' starten."
    WANT_SERVICE=0
  else
    # läuft schon ein Server (z. B. von Hand gestartet), würde der Dienst am belegten Port scheitern
    if ! systemctl --user is-active --quiet tourpost.service && ss -ltn 2>/dev/null | grep -qE "[:.]$PORT\s"; then
      warn "Port $PORT ist belegt (läuft schon ein Server?). Den alten Server beenden, sonst startet der Dienst nicht."
    fi
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/tourpost.service" <<EOF
[Unit]
Description=TourPost Server
After=network-online.target

[Service]
WorkingDirectory=$PWD
# cloudflared (Tunnel für Instagram) liegt oft in ~/.local/bin, das der Dienst sonst nicht im PATH hat
Environment=PATH=$HOME/.local/bin:$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin
ExecStart=$(command -v node) server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable tourpost.service >/dev/null 2>&1
    systemctl --user restart tourpost.service
    ok "Dienst 'tourpost' läuft und startet automatisch (Protokoll: journalctl --user -u tourpost -f)"
    if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ]; then
      ok "Start auch ohne Anmeldung aktiv (linger)"
    else
      warn "Damit der Server auch ohne Login nach einem Neustart startet:  sudo loginctl enable-linger $USER"
    fi
  fi
fi

# ---------- cloudflared (Tunnel) ----------
# Lädt die fertige Datei ohne sudo nach ~/.local/bin (Linux).
download_cloudflared() {
  case "$(uname -m)" in
    x86_64)        CF_ARCH=amd64 ;;
    aarch64|arm64) CF_ARCH=arm64 ;;
    *)             CF_ARCH="" ;;
  esac
  if [ "$(uname -s)" = Linux ] && [ -n "$CF_ARCH" ] && command -v curl >/dev/null; then
    mkdir -p "$HOME/.local/bin"
    curl -fsSL -o "$HOME/.local/bin/cloudflared" \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" || return 1
    chmod +x "$HOME/.local/bin/cloudflared"
    ok "cloudflared nach ~/.local/bin installiert"
    case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) warn "~/.local/bin ist nicht im PATH – neues Terminal öffnen oder PATH ergänzen." ;; esac
  else
    return 1
  fi
}

if [ "$WANT_TUNNEL" = 1 ]; then
  step "cloudflared (Tunnel für Instagram)"
  if command -v cloudflared >/dev/null; then
    ok "cloudflared ist schon installiert ($(cloudflared --version 2>&1 | head -1))"
  elif command -v pacman >/dev/null && sudo pacman -S --needed --noconfirm cloudflared; then
    ok "cloudflared installiert"
  elif command -v brew >/dev/null && brew install cloudflared; then
    ok "cloudflared installiert"
  else
    warn "Paketmanager hat nicht geklappt oder fehlt – lade die Datei direkt herunter."
    download_cloudflared || warn "Installation nicht möglich – siehe https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  fi
fi

# ---------- Fernzugriff ----------
if [ "$WANT_REMOTE" = 1 ]; then
  step "Fernzugriff einschalten"
  node scripts/remote-setup.js
  rm -f data/remote-url.json   # damit unten nicht eine alte Adresse als „fertig" gilt
  if [ "$WANT_SERVICE" = 1 ] && command -v systemctl >/dev/null; then
    systemctl --user restart tourpost.service && ok "Dienst neu gestartet, die Adresse für unterwegs kommt per ntfy aufs Handy (NTFY_TOPIC) und steht im Protokoll"
    if [ -t 0 ] && grep -qE '^REMOTE_MODE=tunnel' .env && ask_yn "Jetzt ein Handy per QR-Code koppeln (kein Passwort am Handy nötig)?"; then
      echo "    Warte, bis der Tunnel steht …"
      for _ in $(seq 1 90); do [ -f data/remote-url.json ] && break; sleep 1; done
      node scripts/remote-pair.js || warn "Später nachholen mit:  npm run remote-pair"
    fi
  fi
fi

# ---------- Fertig ----------
step "Fertig"
if [ -n "$IP" ]; then
  URL="http://$IP:$PORT"
else
  URL="http://<IP-des-Rechners>:$PORT"
  warn "IP-Adresse konnte nicht ermittelt werden."
fi

if [ "$WANT_SERVICE" = 0 ]; then
  echo "Server starten:   npm start"
else
  echo "Server läuft als Dienst:  systemctl --user status|restart|stop tourpost"
fi
echo "Im Handy-Browser: $URL   (Handy im selben WLAN)"
if [ "$WANT_TUNNEL" = 1 ]; then
  echo "Tunnel für Instagram: startet der Server im Live-Modus (IG_MODE=live) selbst, nur auf den Medienserver (Port ${MEDIA_PORT:-3001})."
fi

if [ -n "$IP" ]; then
  echo
  node scripts/qr.js "$URL"
  echo
  echo "Den Code mit der Handy-Kamera scannen oder das Bild auf dem PC öffnen."
  echo "(Gilt nur für diesen Rechner und dieses Netz – bei neuer IP ./setup.sh erneut ausführen.)"
fi
