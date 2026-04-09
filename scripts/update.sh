#!/bin/bash
# PhotoFlow - Update Script
# Auf dem Lenovo ausführen: sudo bash /opt/photoflow/scripts/update.sh

set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
  echo "Bitte als root: sudo bash /opt/photoflow/scripts/update.sh"
  exit 1
fi

info "Stoppe Service..."
systemctl stop photoflow

info "Hole neueste Dateien von GitHub..."
cd /opt/photoflow
git config --global --add safe.directory /opt/photoflow
git fetch origin main
git reset --hard origin/main

info "Python-Pakete aktualisieren..."
source venv/bin/activate
pip install -r backend/requirements.txt -q
deactivate

info "Frontend bauen..."
cd /opt/photoflow/frontend
npm install --silent
npm run build

info "Starte Service..."
systemctl start photoflow
sleep 2

if systemctl is-active --quiet photoflow; then
  log "PhotoFlow läuft!"
  echo ""
  echo -e "  Browser: ${CYAN}http://$(hostname -I | awk '{print $1}'):8080${NC}"
else
  echo "Fehler! Log:"
  journalctl -u photoflow -n 20
fi
