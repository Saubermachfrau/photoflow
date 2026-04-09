"""
EXIF-Daten auslesen für Datum und Kamerahersteller
"""
import subprocess
import json
import re
from datetime import datetime
from pathlib import Path

def get_shoot_date(file_path: Path) -> str:
    """Aufnahmedatum aus EXIF auslesen, Fallback auf Dateidatum"""
    try:
        result = subprocess.run(
            ["exiftool", "-json", "-DateTimeOriginal", "-CreateDate", "-FileModifyDate", str(file_path)],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data:
                for field in ["DateTimeOriginal", "CreateDate"]:
                    dt_str = data[0].get(field, "")
                    if dt_str:
                        # Format: "2025:12:09 14:30:00" → "2025-12-09"
                        match = re.match(r'(\d{4}):(\d{2}):(\d{2})', dt_str)
                        if match:
                            return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
    except Exception:
        pass
    
    # Fallback: Dateiänderungsdatum
    try:
        mtime = file_path.stat().st_mtime
        dt = datetime.fromtimestamp(mtime)
        return dt.strftime("%Y-%m-%d")
    except:
        return datetime.now().strftime("%Y-%m-%d")

def get_camera_brand(file_path: Path, brand_map: dict) -> str:
    """Kamerahersteller aus EXIF auslesen"""
    try:
        result = subprocess.run(
            ["exiftool", "-json", "-Make", "-Model", "-DeviceMake", str(file_path)],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data:
                make = data[0].get("Make", "") or data[0].get("DeviceMake", "")
                model = data[0].get("Model", "")
                combined = f"{make} {model}".upper()
                
                for key, brand in brand_map.items():
                    if key.upper() in combined:
                        return brand
    except Exception:
        pass
    
    return "UNKNOWN"

def get_full_exif(file_path: Path) -> dict:
    """Alle EXIF-Daten als Dictionary"""
    try:
        result = subprocess.run(
            ["exiftool", "-json", "-G", str(file_path)],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return data[0] if data else {}
    except Exception:
        pass
    return {}
