# PhotoFlow – Vollständige Anleitung

## Inhaltsverzeichnis
1. [Installation](#installation)
2. [Erster Start](#erster-start)
3. [Workflow](#workflow)
4. [Tastaturkürzel](#tastaturkürzel)
5. [Lightroom Plugin](#lightroom-plugin)
6. [NAS einrichten](#nas-einrichten)
7. [Fehlerbehebung](#fehlerbehebung)

---

## Installation

### Voraussetzungen
- Ubuntu 24 Server (frisch installiert)
- SSH-Zugang zum Lenovo
- Ugreen NAS im Netzwerk erreichbar
- Internetverbindung für die Installation

### Schritte

```bash
# 1. Per SSH verbinden
ssh benutzer@LENOVO_IP

# 2. Repository klonen
git clone https://github.com/DEIN_USERNAME/photoflow.git
cd photoflow

# 3. Installationsscript starten
sudo bash scripts/install.sh
```

Das Script fragt dich nach:
- **NAS IP-Adresse** (z.B. 192.168.1.100)
- **NAS Export-Pfad** (/volume2)
- **Port** für die UI (Standard: 8080)

Die Installation dauert ca. 10-20 Minuten (LLaVA Download ~5 GB).

---

## Erster Start

Nach der Installation öffne im Browser:
```
http://LENOVO_IP:8080
```

Die IP-Adresse des Lenovo findest du mit:
```bash
hostname -I
```

---

## Workflow

### Schritt 1: Karte einstecken & mounten
1. Speicherkarte in den Lexar RW530 einstecken
2. In der UI → **Karten** Tab
3. Auf **Aktualisieren** klicken
4. Karte mit **Mounten** aktivieren
5. Karte wird automatisch gescannt

### Schritt 2: Kopieren
- **Fotos kopieren** → kommen auf die interne SSD (Staging)
- **Videos → NAS** → gehen direkt auf das NAS mit Ordnerstruktur `DATUM_HERSTELLER`

### Schritt 3: Culling
1. Tab **Culling** öffnen
2. Grid-Größe nach Wunsch wählen
3. Bilder durchsehen:
   - `X` oder `Del` → zum Löschen markieren
   - Doppelklick → Vollbild
   - Sterne für Bewertung
4. **Markierte löschen** → kommen in Papierkorb (nicht endgültig!)
5. `Ctrl+Z` → Letztes Löschen rückgängig

### Schritt 4: KI-Analyse
1. Tab **KI** öffnen
2. **Bilder analysieren** klicken
3. Warten (ca. 5-15 Sekunden pro Bild)
4. Tags prüfen und bei Bedarf anpassen
5. Optional: Tags manuell hinzufügen/entfernen

### Schritt 5: Auf NAS kopieren
1. Tab **NAS** öffnen
2. **Verbinden** klicken
3. **Auf NAS kopieren** klicken
4. Fortschritt beobachten (Checksummen werden verifiziert)

---

## Tastaturkürzel

| Taste | Aktion |
|-------|--------|
| `→` / `←` | Nächstes / Vorheriges (Vollbild) |
| `Delete` / `X` | Zum Löschen markieren |
| `F` | Vollbild öffnen |
| `Esc` | Vollbild schließen |
| `Space` | Vollbild toggle |
| `1`–`5` | Stern-Bewertung |
| `I` | EXIF-Info ein/aus |
| `Ctrl+A` | Alle auswählen |
| `Ctrl+Z` | Letztes Löschen rückgängig |
| `Shift+?` | Shortcut-Übersicht |

---

## Lightroom Plugin

### Installation
1. Ordner `lightroom-plugin/PhotoFlow.lrplugin` auf deinen Windows/Mac-PC kopieren
2. Lightroom Classic öffnen
3. **Datei → Plug-in-Manager → Hinzufügen**
4. Den `PhotoFlow.lrplugin` Ordner auswählen

### Smart Collections
Das Plugin erstellt automatisch folgende Collections:

**Status:**
- ⭐ Neue Bilder (letzte 30 Tage, noch unbearbeitet)
- 🔧 Noch zu bearbeiten (1-2 Sterne)
- ✅ Bearbeitet (3+ Sterne)
- 💎 Favoriten (5 Sterne)

**Kategorien:**
- Tiere: Fuchs, Hund, Katze, Vogel, Reh, Wildschwein
- Landschaft: Berge, Wald, Gewässer, Sonnenuntergang
- Architektur, Menschen, Pflanzen

**Zeitraum:**
- Diese Woche, Diesen Monat, Letztes Quartal

### Workflow mit Lightroom
1. NAS als Netzlaufwerk in Windows/Mac einbinden
2. Lightroom → Katalog auf NAS-Pfad `/volume2/Bilder` zeigen lassen
3. Neue Bilder erscheinen automatisch in "⭐ Neue Bilder"
4. Nach Bearbeitung: Bewertung auf 3+ Sterne → wandert in "✅ Bearbeitet"

---

## NAS einrichten

### Ugreen DXP2800 NFS-Freigabe
1. NAS Web-Interface öffnen (http://NAS_IP)
2. **Dateidienste → NFS aktivieren**
3. **Freigegebene Ordner** → Ordner auswählen → NFS-Berechtigungen
4. IP des Lenovo eintragen (oder `*` für alle)
5. Berechtigungen: `Read/Write`, `no_root_squash`

### Benötigte NFS-Exporte
```
/volume2        → Gesamter Export
/volume2/Bilder → Fotos
/volume2/Videos → Videos
/volume2/Lightroom/Presets → Lightroom Presets
```

---

## Fehlerbehebung

### Service startet nicht
```bash
sudo systemctl status photoflow
sudo journalctl -u photoflow -n 50
```

### LLaVA nicht verfügbar
```bash
# Status prüfen
ollama list

# Modell laden
ollama pull llava:7b

# Ollama Service-Status
sudo systemctl status ollama
```

### NFS-Mount schlägt fehl
```bash
# NFS-Tools prüfen
sudo apt install nfs-common

# Manuell testen
sudo mount -t nfs NAS_IP:/volume2 /mnt/test
```

### Karte wird nicht erkannt
```bash
# USB-Geräte anzeigen
lsblk -o NAME,SIZE,LABEL,FSTYPE,MOUNTPOINT,TRAN

# udisks2 Status
systemctl status udisks2
```

### Thumbnails funktionieren nicht (RAW)
```bash
# dcraw testen
dcraw -i /pfad/zur/datei.ARW

# vips testen
vipsheader /pfad/zur/datei.jpg
```

### Update
```bash
sudo bash /opt/photoflow/scripts/update.sh
```

---

## Verzeichnisstruktur

```
/opt/photoflow/          → Installationsverzeichnis
/var/lib/photoflow/
  staging/               → Bilder auf SSD (temporär)
  trash/                 → Papierkorb
  thumbnails/            → Thumbnail-Cache
/mnt/photoflow-nas/      → NAS Mount-Punkt
/etc/systemd/system/photoflow.service
```
