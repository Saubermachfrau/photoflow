#!/bin/bash
# PhotoFlow - Update Script
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

INSTALL_DIR="/opt/photoflow"

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root ausführen: sudo bash scripts/update.sh"
  exit 1
fi

echo -e "${BOLD}${CYAN}PhotoFlow Update${NC}"
echo ""

info "Service stoppen..."
systemctl stop photoflow

info "Git pull..."
cd "$INSTALL_DIR"
git pull origin main

info "Python-Abhängigkeiten aktualisieren..."
source venv/bin/activate
pip install -r backend/requirements.txt -q
deactivate

info "Frontend neu bauen..."
cd "$INSTALL_DIR/frontend"
npm install
npm run build

info "Service starten..."
systemctl start photoflow

log "Update abgeschlossen!"
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "  ${CYAN}http://$SERVER_IP:$(grep port /opt/photoflow/config.json | head -1 | grep -o '[0-9]*')${NC}"
