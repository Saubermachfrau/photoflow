#!/bin/bash
# PhotoFlow - Installationsscript
# Für Ubuntu 24 Server (frisch installiert)
# Ausführen mit: sudo bash scripts/install.sh

set -e  # Sofort abbrechen bei Fehler

# ─── Farben ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/photoflow"
SERVICE_USER="photoflow"
LOG_FILE="/var/log/photoflow-install.log"

# ─── Logging ───────────────────────────────────────────────────────────────────
log() { echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[!]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1" | tee -a "$LOG_FILE"; }
header() { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n" | tee -a "$LOG_FILE"; }

# ─── Root-Check ────────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  error "Bitte als root ausführen: sudo bash scripts/install.sh"
fi

# ─── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
cat << 'EOF'
  ____  _           _       _____ _
 |  _ \| |__   ___ | |_ ___|  ___| | _____      __
 | |_) | '_ \ / _ \| __/ _ \ |_  | |/ _ \ \ /\ / /
 |  __/| | | | (_) | || (_) |  _| | | (_) \ V  V /
 |_|   |_| |_|\___/ \__\___/_|   |_|\___/ \_/\_/

EOF
echo -e "${NC}"
echo -e "${BOLD}PhotoFlow Installationsscript v1.0${NC}"
echo -e "Für Ubuntu 24 Server | Lenovo ThinkCentre M910q"
echo ""
echo -e "${YELLOW}Log-Datei: $LOG_FILE${NC}"
echo ""

# ─── Konfiguration abfragen ────────────────────────────────────────────────────
header "Konfiguration"

read -p "$(echo -e ${BOLD})NAS IP-Adresse [192.168.1.100]: $(echo -e ${NC})" NAS_IP
NAS_IP=${NAS_IP:-192.168.1.100}

read -p "$(echo -e ${BOLD})NAS NFS Export Pfad [/volume2]: $(echo -e ${NC})" NAS_EXPORT
NAS_EXPORT=${NAS_EXPORT:-/volume2}

read -p "$(echo -e ${BOLD})Port für PhotoFlow UI [8080]: $(echo -e ${NC})" APP_PORT
APP_PORT=${APP_PORT:-8080}

echo ""
echo -e "${BOLD}Konfiguration:${NC}"
echo -e "  NAS IP:         ${CYAN}$NAS_IP${NC}"
echo -e "  NAS Export:     ${CYAN}$NAS_EXPORT${NC}"
echo -e "  App Port:       ${CYAN}$APP_PORT${NC}"
echo -e "  Install Dir:    ${CYAN}$INSTALL_DIR${NC}"
echo ""
read -p "Korrekt? (j/n) [j]: " CONFIRM
CONFIRM=${CONFIRM:-j}
if [[ ! "$CONFIRM" =~ ^[jJyY]$ ]]; then
  echo "Installation abgebrochen."
  exit 0
fi

# ─── System Update ─────────────────────────────────────────────────────────────
header "System-Update"
apt-get update -qq 2>&1 | tee -a "$LOG_FILE"
apt-get upgrade -y -qq 2>&1 | tee -a "$LOG_FILE"
log "System aktualisiert"

# ─── Basis-Pakete ──────────────────────────────────────────────────────────────
header "Basis-Pakete installieren"
apt-get install -y -qq \
  curl wget git build-essential \
  python3 python3-pip python3-venv python3-dev \
  libvips-dev libvips-tools \
  exiftool \
  udisks2 \
  nfs-common \
  rsync \
  xxhash \
  libraw-dev \
  dcraw \
  ffmpeg \
  imagemagick \
  libmagic1 \
  libjpeg-turbo8-dev \
  nodejs npm \
  2>&1 | tee -a "$LOG_FILE"
log "Basis-Pakete installiert"

# Node.js 20 LTS (falls zu alt)
node_version=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$node_version" ] || [ "$node_version" -lt 18 ]; then
  info "Node.js aktualisieren auf v20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tee -a "$LOG_FILE"
  apt-get install -y nodejs 2>&1 | tee -a "$LOG_FILE"
fi
log "Node.js $(node --version) installiert"

# ─── Ollama installieren ───────────────────────────────────────────────────────
header "Ollama (KI) installieren"
if ! command -v ollama &> /dev/null; then
  curl -fsSL https://ollama.ai/install.sh | sh 2>&1 | tee -a "$LOG_FILE"
  log "Ollama installiert"
else
  log "Ollama bereits installiert"
fi

# Ollama Service starten
systemctl enable ollama 2>/dev/null || true
systemctl start ollama
sleep 3

# LLaVA Modell herunterladen
info "LLaVA Modell herunterladen (ca. 4.7 GB - das dauert)..."
ollama pull llava:7b 2>&1 | tee -a "$LOG_FILE" || warn "LLaVA konnte nicht geladen werden - manuell nachholen: ollama pull llava:7b"
log "Ollama LLaVA bereit"

# ─── Benutzer anlegen ──────────────────────────────────────────────────────────
header "Service-Benutzer anlegen"
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd -r -m -d "$INSTALL_DIR" -s /bin/bash "$SERVICE_USER"
  log "Benutzer '$SERVICE_USER' angelegt"
else
  log "Benutzer '$SERVICE_USER' existiert bereits"
fi

# Benutzer zu Gruppen hinzufügen
usermod -a -G plugdev,disk "$SERVICE_USER" 2>/dev/null || true

# ─── Installationsverzeichnis ─────────────────────────────────────────────────
header "Installationsverzeichnis einrichten"
mkdir -p "$INSTALL_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cp -r "$PROJECT_DIR"/* "$INSTALL_DIR/" 2>/dev/null || true
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
log "Dateien nach $INSTALL_DIR kopiert"

# ─── Python Backend ───────────────────────────────────────────────────────────
header "Python Backend einrichten"
cd "$INSTALL_DIR"

python3 -m venv venv 2>&1 | tee -a "$LOG_FILE"
source venv/bin/activate

pip install --upgrade pip -q 2>&1 | tee -a "$LOG_FILE"
pip install \
  fastapi==0.115.0 \
  uvicorn[standard]==0.30.0 \
  python-multipart==0.0.9 \
  aiofiles==23.2.1 \
  pillow==10.4.0 \
  pyvips==2.2.3 \
  exifread==3.0.0 \
  pyexiv2==2.15.0 \
  psutil==6.0.0 \
  watchdog==4.0.2 \
  httpx==0.27.2 \
  xxhash==3.5.0 \
  python-magic==0.4.27 \
  websockets==13.1 \
  2>&1 | tee -a "$LOG_FILE"
log "Python-Abhängigkeiten installiert"
deactivate

# ─── Frontend bauen ───────────────────────────────────────────────────────────
header "Frontend bauen"
cd "$INSTALL_DIR/frontend"
npm install 2>&1 | tee -a "$LOG_FILE"
npm run build 2>&1 | tee -a "$LOG_FILE"
log "Frontend gebaut"

# ─── Konfigurationsdatei ──────────────────────────────────────────────────────
header "Konfiguration schreiben"
cat > "$INSTALL_DIR/config.json" << CONFIGEOF
{
  "nas": {
    "ip": "$NAS_IP",
    "export_path": "$NAS_EXPORT",
    "mount_point": "/mnt/photoflow-nas",
    "bilder_path": "$NAS_EXPORT/Bilder",
    "videos_path": "$NAS_EXPORT/Videos",
    "presets_path": "$NAS_EXPORT/Lightroom/Presets"
  },
  "app": {
    "port": $APP_PORT,
    "host": "0.0.0.0",
    "local_staging": "/var/lib/photoflow/staging",
    "trash_dir": "/var/lib/photoflow/trash",
    "thumbnails_dir": "/var/lib/photoflow/thumbnails"
  },
  "camera_brands": {
    "SONY": "SONY",
    "ILCE": "SONY",
    "ZV": "SONY",
    "DJI": "DJI-Drohne",
    "FC": "DJI-Drohne",
    "Action": "DJI-Action",
    "Osmo": "DJI-Action",
    "Canon": "Canon",
    "Nikon": "Nikon",
    "FUJIFILM": "Fujifilm"
  },
  "ai": {
    "model": "llava:7b",
    "ollama_url": "http://localhost:11434"
  }
}
CONFIGEOF

# Arbeitsverzeichnisse anlegen
mkdir -p /var/lib/photoflow/{staging,trash,thumbnails}
chown -R "$SERVICE_USER:$SERVICE_USER" /var/lib/photoflow
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/config.json"
log "Konfiguration geschrieben"

# ─── NFS Mount einrichten ─────────────────────────────────────────────────────
header "NFS einrichten"
mkdir -p /mnt/photoflow-nas
chown "$SERVICE_USER:$SERVICE_USER" /mnt/photoflow-nas

# fstab Eintrag (noauto – wird per UI gemountet)
FSTAB_ENTRY="$NAS_IP:$NAS_EXPORT /mnt/photoflow-nas nfs defaults,noauto,nofail,x-systemd.automount,timeo=14,_netdev 0 0"
if ! grep -q "photoflow-nas" /etc/fstab; then
  echo "" >> /etc/fstab
  echo "# PhotoFlow NAS" >> /etc/fstab
  echo "$FSTAB_ENTRY" >> /etc/fstab
  log "NFS fstab Eintrag hinzugefügt"
else
  log "NFS fstab Eintrag existiert bereits"
fi

# ─── udev Regeln für Kartenleser ──────────────────────────────────────────────
header "udev Regeln für Kartenleser"
cat > /etc/udev/rules.d/99-photoflow-cardreader.rules << 'UDEVEOF'
# Lexar RW530 und allgemeine USB-Speichergeräte
ACTION=="add", SUBSYSTEM=="block", KERNEL=="sd[b-z]*", ENV{ID_BUS}=="usb", \
  RUN+="/bin/bash -c 'echo card_inserted > /tmp/photoflow_card_event'"
ACTION=="remove", SUBSYSTEM=="block", KERNEL=="sd[b-z]*", ENV{ID_BUS}=="usb", \
  RUN+="/bin/bash -c 'echo card_removed > /tmp/photoflow_card_event'"
UDEVEOF
udevadm control --reload-rules 2>/dev/null || true
log "udev Regeln installiert"

# ─── Systemd Service ──────────────────────────────────────────────────────────
header "Systemd Service einrichten"
cat > /etc/systemd/system/photoflow.service << SERVICEEOF
[Unit]
Description=PhotoFlow - Foto Verwaltungssystem
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port $APP_PORT --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=PHOTOFLOW_CONFIG=$INSTALL_DIR/config.json

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable photoflow
systemctl start photoflow
log "PhotoFlow Service gestartet"

# ─── Firewall ─────────────────────────────────────────────────────────────────
if command -v ufw &> /dev/null; then
  ufw allow "$APP_PORT/tcp" comment "PhotoFlow UI" 2>/dev/null || true
  log "Firewall-Regel für Port $APP_PORT hinzugefügt"
fi

# ─── Fertig ───────────────────────────────────────────────────────────────────
header "Installation abgeschlossen!"

SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}✅ PhotoFlow wurde erfolgreich installiert!${NC}"
echo ""
echo -e "${BOLD}Öffne im Browser:${NC}"
echo -e "  ${CYAN}http://$SERVER_IP:$APP_PORT${NC}"
echo ""
echo -e "${BOLD}Nützliche Befehle:${NC}"
echo -e "  Status prüfen:    ${YELLOW}sudo systemctl status photoflow${NC}"
echo -e "  Logs anzeigen:    ${YELLOW}sudo journalctl -u photoflow -f${NC}"
echo -e "  Neustart:         ${YELLOW}sudo systemctl restart photoflow${NC}"
echo -e "  Update:           ${YELLOW}sudo bash $INSTALL_DIR/scripts/update.sh${NC}"
echo ""
echo -e "${YELLOW}Hinweis: LLaVA KI-Modell lädt beim ersten Start (ca. 5 GB)${NC}"
echo -e "${YELLOW}         Ollama: ollama pull llava:7b${NC}"
echo ""
