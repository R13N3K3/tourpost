#!/usr/bin/env bash
# TourPost – Einrichtung auf einem neuen Rechner.
# Aufruf:  ./setup.sh [--firewall] [--service]
#   --firewall  Port in ufw für das Heimnetz freigeben (braucht sudo)
#   --service   Server als systemd-Benutzerdienst einrichten (startet automatisch)
set -euo pipefail

cd "$(dirname "$0")"

WANT_FIREWALL=0
WANT_SERVICE=0
for arg in "$@"; do
  case "$arg" in
    --firewall) WANT_FIREWALL=1 ;;
    --service)  WANT_SERVICE=1 ;;
    -h|--help)  sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $arg (siehe --help)"; exit 1 ;;
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
  if command -v systemctl >/dev/null; then
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/tourpost.service" <<EOF
[Unit]
Description=TourPost Server
After=network-online.target

[Service]
WorkingDirectory=$PWD
ExecStart=$(command -v node) server/index.js
Restart=on-failure

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now tourpost.service
    ok "Dienst 'tourpost' läuft und startet automatisch"
    warn "Damit er auch ohne Login startet:  sudo loginctl enable-linger $USER"
  else
    warn "systemctl nicht gefunden – Autostart übersprungen."
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
fi
echo "Im Handy-Browser: $URL   (Handy im selben WLAN)"

if command -v qrencode >/dev/null && [ -n "$IP" ]; then
  echo
  qrencode -t UTF8 -m 2 "$URL"
else
  echo "(Für einen QR-Code im Terminal: qrencode installieren)"
fi
