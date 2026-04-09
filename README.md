# 📷 PhotoFlow

**Professionelles Foto & Video Verwaltungssystem für deinen Lenovo ThinkCentre**

PhotoFlow ist ein vollständiges, browser-basiertes Workflow-System für Fotografen. Stecke eine Speicherkarte ein, öffne deinen Browser, und erledige dein komplettes Culling, KI-Verschlagwortung und NAS-Backup – alles ohne Monitor am Server.

---

## 🚀 Schnellstart

```bash
# 1. Repository klonen
git clone https://github.com/DEIN_USERNAME/photoflow.git
cd photoflow

# 2. Installation starten (als root oder mit sudo)
sudo bash scripts/install.sh

# 3. Browser öffnen
http://LENOVO_IP:8080
```

---

## ✨ Features

- 🎨 **Professionelle Culling-UI** – Dark/Light/Dimm-Themes, Grid & Vollbild
- 📁 **Automatische Ordnerstruktur** – `2025-12-09_SONY`, `2026-04-12_DJI-Drohne`
- 🤖 **Lokale KI** (Ollama/LLaVA) – Verschlagwortung, Stimmung, Lightroom-Presets
- 💾 **NAS-Integration** – NFS-Mount, Checksummen, sichere Übertragung
- ⌨️ **Tastatur-Shortcuts** – wie Lightroom
- 📊 **System-Monitor** – CPU, RAM, Festplatte live
- 🗑️ **Sicherer Papierkorb** – nichts geht verloren

## 🗂️ Workflow

```
Karte einstecken → UI öffnen → Mounten → Kopieren
→ Culling → KI-Analyse → Tags prüfen → NAS kopieren
```

## ⌨️ Shortcuts

| Taste | Aktion |
|-------|--------|
| `→` / `←` | Nächstes / Vorheriges Bild |
| `Del` / `X` | Bild zum Löschen markieren |
| `Space` | Vollbild togglen |
| `S` | Bild mit Stern markieren |
| `1-5` | Stern-Bewertung setzen |
| `Ctrl+A` | Alle auswählen |
| `Ctrl+Z` | Löschen rückgängig |
| `F` | Vollbild |
| `C` | Vergleichsmodus |
| `I` | EXIF-Info togglen |

---

## 📋 Voraussetzungen

- Ubuntu 24 Server (frisch installiert)
- Internetverbindung für die Installation
- Ugreen NAS erreichbar im Netzwerk
- Lexar RW530 Kartenleser (USB)

---

## 📖 Dokumentation

Siehe [docs/](docs/) für detaillierte Anleitungen.
