"""
API: Bilder im Staging-Bereich verwalten
Thumbnails, EXIF-Anzeige, Löschen (in Papierkorb)
"""
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from ..services.config import get_config
from ..services.exif_reader import get_full_exif

router = APIRouter()

PHOTO_EXTS = {'.arw', '.dng', '.jpg', '.jpeg', '.png', '.cr2', '.cr3', '.nef', '.raf', '.tiff', '.tif'}

class DeleteRequest(BaseModel):
    paths: List[str]

class TagUpdateRequest(BaseModel):
    path: str
    tags: List[str]
    rating: Optional[int] = None
    label: Optional[str] = None

@router.get("/list")
async def list_images(folder: str = ""):
    """Bilder im Staging auflisten"""
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    
    base = staging / folder if folder else staging
    if not base.exists():
        return {"folders": [], "images": []}
    
    folders = []
    images = []
    
    for item in sorted(base.iterdir()):
        if item.is_dir():
            count = sum(1 for f in item.rglob("*") if f.suffix.lower() in PHOTO_EXTS)
            folders.append({"name": item.name, "path": str(item.relative_to(staging)), "count": count})
        elif item.is_file() and item.suffix.lower() in PHOTO_EXTS:
            stat = item.stat()
            images.append({
                "name": item.name,
                "path": str(item.relative_to(staging)),
                "size": stat.st_size,
                "modified": stat.st_mtime,
                "ext": item.suffix.lower(),
                "is_raw": item.suffix.lower() in {'.arw', '.dng', '.cr2', '.cr3', '.nef', '.raf'}
            })
    
    return {"folders": folders, "images": images}

@router.get("/thumbnail")
async def get_thumbnail(path: str, size: int = 400):
    """Thumbnail generieren und zurückgeben"""
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    thumb_dir = Path(config["app"]["thumbnails_dir"])
    
    img_path = staging / path
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")
    
    # Thumbnail-Cache-Pfad
    thumb_name = f"{path.replace('/', '_')}_{size}.jpg"
    thumb_path = thumb_dir / thumb_name
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    
    if not thumb_path.exists():
        # Mit vipsthumbnail oder ffmpeg (für RAW: dcraw vorher)
        ext = img_path.suffix.lower()
        
        if ext in {'.arw', '.cr2', '.cr3', '.nef', '.raf'}:
            # RAW: erst mit dcraw in PPM konvertieren, dann Thumbnail
            ppm_path = thumb_dir / f"{thumb_name}.ppm"
            dcraw_result = subprocess.run(
                ["dcraw", "-c", "-h", "-w", str(img_path)],
                capture_output=True
            )
            if dcraw_result.returncode == 0:
                with open(str(ppm_path), "wb") as f:
                    f.write(dcraw_result.stdout)
                subprocess.run([
                    "vipsthumbnail", str(ppm_path),
                    "--size", f"{size}x{size}",
                    "-o", str(thumb_path) + "[Q=85]"
                ], capture_output=True)
                ppm_path.unlink(missing_ok=True)
            else:
                # Fallback: Embedded JPEG aus RAW extrahieren
                subprocess.run([
                    "exiftool", "-b", "-JpgFromRaw", "-w", str(thumb_dir / f"{thumb_name}_raw.jpg"), str(img_path)
                ], capture_output=True)
                raw_jpg = thumb_dir / f"{thumb_name}_raw.jpg"
                if raw_jpg.exists():
                    subprocess.run([
                        "vipsthumbnail", str(raw_jpg),
                        "--size", f"{size}x{size}",
                        "-o", str(thumb_path) + "[Q=85]"
                    ], capture_output=True)
                    raw_jpg.unlink(missing_ok=True)
        elif ext == '.dng':
            # DNG direkt mit vipsthumbnail
            result = subprocess.run([
                "vipsthumbnail", str(img_path),
                "--size", f"{size}x{size}",
                "-o", str(thumb_path) + "[Q=85]"
            ], capture_output=True)
            if result.returncode != 0:
                # Fallback exiftool
                subprocess.run([
                    "exiftool", "-b", "-ThumbnailImage", "-w", str(thumb_path), str(img_path)
                ], capture_output=True)
        else:
            subprocess.run([
                "vipsthumbnail", str(img_path),
                "--size", f"{size}x{size}",
                "-o", str(thumb_path) + "[Q=85]"
            ], capture_output=True)
    
    if not thumb_path.exists():
        raise HTTPException(status_code=500, detail="Thumbnail konnte nicht erstellt werden")
    
    return FileResponse(str(thumb_path), media_type="image/jpeg")

@router.get("/exif")
async def get_exif(path: str):
    """EXIF-Daten für ein Bild"""
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    img_path = staging / path
    
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")
    
    exif = get_full_exif(img_path)
    
    # Wichtigste Felder extrahieren
    important = {
        "Camera": exif.get("EXIF:Make", "") + " " + exif.get("EXIF:Model", ""),
        "Datum": exif.get("EXIF:DateTimeOriginal", ""),
        "Belichtung": exif.get("EXIF:ExposureTime", ""),
        "Blende": exif.get("EXIF:FNumber", ""),
        "ISO": exif.get("EXIF:ISO", ""),
        "Brennweite": exif.get("EXIF:FocalLength", ""),
        "GPS": f"{exif.get('GPS:GPSLatitude', '')} {exif.get('GPS:GPSLongitude', '')}",
        "Auflösung": f"{exif.get('EXIF:ExifImageWidth', '')}x{exif.get('EXIF:ExifImageHeight', '')}",
    }
    
    return {"important": {k: v for k, v in important.items() if v and v.strip()}, "full": exif}

@router.post("/delete")
async def delete_images(req: DeleteRequest):
    """Bilder in Papierkorb verschieben (nicht permanent löschen)"""
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    trash = Path(config["app"]["trash_dir"])
    trash.mkdir(parents=True, exist_ok=True)
    
    moved = []
    errors = []
    
    for path in req.paths:
        src = staging / path
        if not src.exists():
            errors.append(f"Nicht gefunden: {path}")
            continue
        
        try:
            dest = trash / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            moved.append(path)
            
            # Auch RAW-Partner verschieben (z.B. ARW wenn JPEG gelöscht wird)
            _move_raw_partner(src, staging, trash)
        except Exception as e:
            errors.append(f"{path}: {str(e)}")
    
    return {"moved": moved, "errors": errors}

@router.post("/restore")
async def restore_from_trash(req: DeleteRequest):
    """Bilder aus Papierkorb wiederherstellen"""
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    trash = Path(config["app"]["trash_dir"])
    
    restored = []
    for path in req.paths:
        src = trash / path
        dest = staging / path
        if src.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))
            restored.append(path)
    
    return {"restored": restored}

@router.get("/trash")
async def list_trash():
    """Papierkorb-Inhalt anzeigen"""
    config = get_config()
    trash = Path(config["app"]["trash_dir"])
    
    images = []
    for f in trash.rglob("*"):
        if f.is_file() and f.suffix.lower() in PHOTO_EXTS:
            images.append({"name": f.name, "path": str(f.relative_to(trash))})
    
    return {"images": images}

@router.post("/tags")
async def update_tags(req: TagUpdateRequest):
    """XMP-Tags und Bewertung schreiben"""
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    img_path = staging / req.path
    
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")
    
    cmd = ["exiftool", "-overwrite_original"]
    
    if req.tags:
        # Bestehende Tags löschen und neue setzen
        cmd.append("-Subject=")
        for tag in req.tags:
            cmd.extend([f"-Subject={tag}", f"-Keywords={tag}"])
    
    if req.rating is not None:
        cmd.append(f"-Rating={req.rating}")
    
    if req.label:
        cmd.append(f"-Label={req.label}")
    
    cmd.append(str(img_path))
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Tag-Fehler: {result.stderr}")
    
    return {"success": True}

def _move_raw_partner(src: Path, staging: Path, trash: Path):
    """RAW/JPEG-Partner mitverschieben"""
    raw_exts = ['.arw', '.dng', '.cr2', '.cr3', '.nef', '.raf']
    jpg_exts = ['.jpg', '.jpeg']
    
    current_ext = src.suffix.lower()
    partner_exts = raw_exts if current_ext in jpg_exts else jpg_exts
    
    for ext in partner_exts:
        partner = src.with_suffix(ext)
        if partner.exists():
            dest = trash / partner.relative_to(staging)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(partner), str(dest))
            break
