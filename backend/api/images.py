"""
API: Bilder im Staging-Bereich verwalten
Thumbnails, EXIF-Anzeige, Löschen (in Papierkorb)
"""
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
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
            folders.append({
                "name": item.name,
                "path": str(item.relative_to(staging)),
                "count": count
            })
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
    safe_name = path.replace('/', '_').replace(' ', '_')
    thumb_path = thumb_dir / f"{safe_name}_{size}.jpg"
    thumb_path.parent.mkdir(parents=True, exist_ok=True)

    if thumb_path.exists():
        return FileResponse(str(thumb_path), media_type="image/jpeg")

    ext = img_path.suffix.lower()
    success = False

    # ── Strategie 1: Embedded JPEG aus RAW extrahieren (schnellste Methode) ──
    if ext in {'.arw', '.cr2', '.cr3', '.nef', '.raf', '.dng'}:
        tmp_jpg = thumb_dir / f"{safe_name}_embedded.jpg"
        result = subprocess.run(
            ["exiftool", "-b", "-JpgFromRaw", "-w", str(tmp_jpg), str(img_path)],
            capture_output=True, timeout=20
        )
        # exiftool schreibt die Datei mit anderem Namen
        possible = thumb_dir / f"{img_path.stem}.jpg"
        if possible.exists():
            tmp_jpg = possible

        if tmp_jpg.exists() and tmp_jpg.stat().st_size > 0:
            result2 = subprocess.run([
                "convert", str(tmp_jpg),
                "-thumbnail", f"{size}x{size}>",
                "-quality", "85",
                str(thumb_path)
            ], capture_output=True, timeout=15)
            tmp_jpg.unlink(missing_ok=True)
            if result2.returncode == 0 and thumb_path.exists():
                success = True

    # ── Strategie 2: dcraw für ARW/CR2/NEF ──────────────────────────────────
    if not success and ext in {'.arw', '.cr2', '.nef', '.raf'}:
        dcraw_result = subprocess.run(
            ["dcraw", "-c", "-h", "-w", "-q", "0", str(img_path)],
            capture_output=True, timeout=30
        )
        if dcraw_result.returncode == 0 and dcraw_result.stdout:
            convert_result = subprocess.run(
                ["convert", "ppm:-",
                 "-thumbnail", f"{size}x{size}>",
                 "-quality", "85",
                 str(thumb_path)],
                input=dcraw_result.stdout,
                capture_output=True, timeout=20
            )
            if convert_result.returncode == 0 and thumb_path.exists():
                success = True

    # ── Strategie 3: vipsthumbnail (für DNG, JPEG, PNG) ─────────────────────
    if not success:
        result = subprocess.run([
            "vipsthumbnail", str(img_path),
            "--size", f"{size}x{size}",
            "-o", str(thumb_path) + "[Q=85]"
        ], capture_output=True, timeout=30)
        if result.returncode == 0 and thumb_path.exists():
            success = True

    # ── Strategie 4: ImageMagick convert ────────────────────────────────────
    if not success:
        result = subprocess.run([
            "convert",
            f"{img_path}[0]",
            "-thumbnail", f"{size}x{size}>",
            "-quality", "85",
            str(thumb_path)
        ], capture_output=True, timeout=30)
        if result.returncode == 0 and thumb_path.exists():
            success = True

    # ── Strategie 5: ffmpeg (letzter Ausweg) ────────────────────────────────
    if not success:
        result = subprocess.run([
            "ffmpeg", "-i", str(img_path),
            "-vf", f"scale={size}:{size}:force_original_aspect_ratio=decrease",
            "-q:v", "3", "-frames:v", "1",
            str(thumb_path), "-y"
        ], capture_output=True, timeout=30)
        if result.returncode == 0 and thumb_path.exists():
            success = True

    if not success or not thumb_path.exists():
        raise HTTPException(status_code=500, detail=f"Thumbnail konnte nicht erstellt werden für {img_path.name}")

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

    important = {
        "Kamera": (exif.get("EXIF:Make", "") + " " + exif.get("EXIF:Model", "")).strip(),
        "Datum": exif.get("EXIF:DateTimeOriginal", ""),
        "Belichtung": exif.get("EXIF:ExposureTime", ""),
        "Blende": exif.get("EXIF:FNumber", ""),
        "ISO": exif.get("EXIF:ISO", ""),
        "Brennweite": exif.get("EXIF:FocalLength", ""),
        "GPS": (exif.get("GPS:GPSLatitude", "") + " " + exif.get("GPS:GPSLongitude", "")).strip(),
        "Auflösung": f"{exif.get('EXIF:ExifImageWidth', '')}x{exif.get('EXIF:ExifImageHeight', '')}",
    }

    return {
        "important": {k: v for k, v in important.items() if v and v.strip() and v != "x"},
        "full": exif
    }


@router.post("/delete")
async def delete_images(req: DeleteRequest):
    """Bilder in Papierkorb verschieben"""
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
    """Papierkorb-Inhalt"""
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
        cmd.append("-Subject=")
        cmd.append("-Keywords=")
        for tag in req.tags:
            if tag:
                cmd.extend([f"-Subject={tag}", f"-Keywords={tag}"])

    if req.rating is not None:
        cmd.append(f"-Rating={req.rating}")

    if req.label:
        cmd.append(f"-Label={req.label}")

    cmd.append(str(img_path))

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
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
        if not partner.exists():
            partner = src.with_suffix(ext.upper())
        if partner.exists():
            try:
                dest = trash / partner.relative_to(staging)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(partner), str(dest))
            except:
                pass
            break
