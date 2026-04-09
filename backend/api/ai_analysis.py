"""
API: KI-Bildanalyse mit Ollama LLaVA
Lokal, kein Internet nötig
Verschlagwortung + Lightroom-Presets
"""
import asyncio
import base64
import json
import subprocess
from pathlib import Path
from typing import List, Optional
import httpx
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from ..services.config import get_config

router = APIRouter()
analysis_jobs: dict = {}

class AnalyzeRequest(BaseModel):
    paths: List[str]
    generate_presets: bool = True

class TagOverrideRequest(BaseModel):
    path: str
    tags: List[str]

@router.get("/status")
async def ai_status():
    """Ollama-Status prüfen"""
    config = get_config()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{config['ai']['ollama_url']}/api/tags")
            if r.status_code == 200:
                models = [m["name"] for m in r.json().get("models", [])]
                has_llava = any("llava" in m for m in models)
                return {
                    "available": True,
                    "models": models,
                    "llava_ready": has_llava,
                    "message": "KI bereit" if has_llava else "LLaVA nicht geladen. Führe aus: ollama pull llava:7b"
                }
    except Exception:
        pass
    return {"available": False, "llava_ready": False, "message": "Ollama nicht erreichbar"}

@router.post("/analyze")
async def start_analysis(req: AnalyzeRequest):
    """KI-Analyse starten"""
    job_id = f"ai_{len(analysis_jobs)}"
    analysis_jobs[job_id] = {"status": "running", "progress": 0, "results": {}}
    
    asyncio.create_task(_analyze_images(job_id, req.paths, req.generate_presets))
    return {"job_id": job_id}

@router.get("/jobs/{job_id}")
async def get_analysis_job(job_id: str):
    if job_id not in analysis_jobs:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")
    return analysis_jobs[job_id]

@router.websocket("/ws/{job_id}")
async def analysis_websocket(websocket: WebSocket, job_id: str):
    await websocket.accept()
    try:
        while True:
            if job_id in analysis_jobs:
                await websocket.send_json(analysis_jobs[job_id])
                if analysis_jobs[job_id]["status"] in ("done", "error"):
                    break
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass

async def _analyze_images(job_id: str, paths: List[str], generate_presets: bool):
    config = get_config()
    staging = Path(config["app"]["local_staging"])
    model = config["ai"]["model"]
    ollama_url = config["ai"]["ollama_url"]
    
    total = len(paths)
    results = {}
    
    for i, rel_path in enumerate(paths):
        img_path = staging / rel_path
        if not img_path.exists():
            continue
        
        analysis_jobs[job_id].update({
            "progress": int((i / total) * 100),
            "current": rel_path,
            "status": "running"
        })
        
        try:
            tags, mood, description = await _analyze_single(img_path, ollama_url, model)
            
            # XMP-Tags schreiben
            _write_xmp_tags(img_path, tags + [mood])
            
            results[rel_path] = {
                "tags": tags,
                "mood": mood,
                "description": description,
                "status": "done"
            }
            
            # Lightroom-Preset generieren
            if generate_presets and tags:
                await _generate_preset(tags, mood, description, config)
            
        except Exception as e:
            results[rel_path] = {"status": "error", "error": str(e)}
    
    analysis_jobs[job_id].update({
        "status": "done",
        "progress": 100,
        "results": results
    })

async def _analyze_single(img_path: Path, ollama_url: str, model: str):
    """Einzelnes Bild mit LLaVA analysieren"""
    # Bild für API vorbereiten (JPEG-Thumbnail für RAW)
    img_data = _prepare_image_for_ai(img_path)
    
    prompt = """Analysiere dieses Foto professionell für einen Fotografen.

Antworte NUR mit folgendem JSON-Format (kein anderer Text):
{
  "tags": ["Tag1", "Tag2", "Tag3", ...],
  "mood": "Stimmung des Bildes",
  "description": "Kurze Beschreibung",
  "subjects": ["Hauptmotiv1", "Hauptmotiv2"],
  "environment": "Umgebung/Ort",
  "time_of_day": "Tageszeit"
}

Tags sollen sein: Tiere (Fuchs, Katze...), Landschaft, Gebäude, Menschen, Pflanzen, Wetter, Licht, etc.
Auf Deutsch bitte. Maximal 12 Tags."""
    
    payload = {
        "model": model,
        "prompt": prompt,
        "images": [img_data],
        "stream": False
    }
    
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{ollama_url}/api/generate", json=payload)
        r.raise_for_status()
        response_text = r.json().get("response", "{}")
    
    # JSON aus Antwort extrahieren
    try:
        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            tags = data.get("tags", []) + data.get("subjects", [])
            # Duplikate entfernen
            tags = list(dict.fromkeys(t.strip() for t in tags if t.strip()))
            mood = data.get("mood", "Neutral")
            description = data.get("description", "")
            return tags[:15], mood, description
    except:
        pass
    
    return ["Foto"], "Neutral", ""

def _prepare_image_for_ai(img_path: Path) -> str:
    """Bild als Base64 vorbereiten, RAW-Konvertierung falls nötig"""
    raw_exts = {'.arw', '.cr2', '.cr3', '.nef', '.raf'}
    ext = img_path.suffix.lower()
    
    if ext in raw_exts:
        # RAW mit dcraw konvertieren
        result = subprocess.run(
            ["dcraw", "-c", "-h", "-w", str(img_path)],
            capture_output=True, timeout=30
        )
        if result.returncode == 0:
            # PPM zu JPEG konvertieren
            convert_result = subprocess.run(
                ["convert", "ppm:-", "-resize", "1024x1024>", "-quality", "85", "jpeg:-"],
                input=result.stdout, capture_output=True, timeout=15
            )
            if convert_result.returncode == 0:
                return base64.b64encode(convert_result.stdout).decode()
    elif ext == '.dng':
        result = subprocess.run(
            ["convert", str(img_path), "-resize", "1024x1024>", "-quality", "85", "jpeg:-"],
            capture_output=True, timeout=15
        )
        if result.returncode == 0:
            return base64.b64encode(result.stdout).decode()
    
    # JPEG/PNG direkt
    with open(img_path, "rb") as f:
        data = f.read()
    
    # Bei zu großen Bildern skalieren
    if len(data) > 2 * 1024 * 1024:
        result = subprocess.run(
            ["convert", str(img_path), "-resize", "1024x1024>", "-quality", "80", "jpeg:-"],
            capture_output=True, timeout=15
        )
        if result.returncode == 0:
            data = result.stdout
    
    return base64.b64encode(data).decode()

def _write_xmp_tags(img_path: Path, tags: list):
    """XMP-Sidecar-Datei schreiben"""
    xmp_path = img_path.with_suffix(".xmp")
    
    # XMP mit exiftool schreiben
    cmd = ["exiftool", "-overwrite_original"]
    for tag in tags:
        if tag:
            cmd.extend([f"-Subject={tag}", f"-Keywords={tag}"])
    cmd.append(str(img_path))
    
    subprocess.run(cmd, capture_output=True, timeout=15)
    
    # Separates XMP-Sidecar (für RAW-Dateien)
    if img_path.suffix.lower() in {'.arw', '.cr2', '.cr3', '.nef', '.raf', '.dng'}:
        cmd_xmp = ["exiftool", "-overwrite_original", "-tagsfromfile", str(img_path),
                   "-xmp:all", str(xmp_path)]
        subprocess.run(cmd_xmp, capture_output=True, timeout=15)

async def _generate_preset(tags: list, mood: str, description: str, config: dict):
    """Lightroom-Preset als XMP generieren"""
    nas_mount = Path(config["nas"]["mount_point"])
    presets_path = nas_mount / "Lightroom" / "Presets"
    
    if not presets_path.exists():
        return
    
    # Preset-Name aus Haupttags
    main_tag = tags[0] if tags else "Allgemein"
    preset_name = f"PhotoFlow_{main_tag}_{mood}".replace(" ", "_")
    preset_file = presets_path / f"{preset_name}.xmp"
    
    if preset_file.exists():
        return
    
    # Preset-Einstellungen basierend auf Stimmung
    settings = _get_preset_settings(mood, tags)
    
    xmp_content = f'''<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    crs:Version="15.3"
    crs:ProcessVersion="15.3"
    crs:PresetType="Normal"
    crs:Cluster=""
    crs:UUID=""
    crs:SupportsAmount="False"
    crs:SupportsColor="True"
    crs:SupportsMonochrome="True"
    crs:SupportsHighDynamicRange="True"
    crs:SupportsNormalDynamicRange="True"
    crs:SupportsSceneReferred="True"
    crs:SupportsOutputReferred="True"
    crs:CameraModelRestriction=""
    crs:CopyrightInfo=""
    crs:ContactInfo=""
    crs:GrainAmount="0"
    crs:Name="{preset_name}"
    crs:Description="Auto-generiert für: {', '.join(tags[:5])} | Stimmung: {mood}"
    crs:Exposure2012="{settings['exposure']}"
    crs:Contrast2012="{settings['contrast']}"
    crs:Highlights2012="{settings['highlights']}"
    crs:Shadows2012="{settings['shadows']}"
    crs:Whites2012="{settings['whites']}"
    crs:Blacks2012="{settings['blacks']}"
    crs:Clarity2012="{settings['clarity']}"
    crs:Dehaze="{settings['dehaze']}"
    crs:Vibrance="{settings['vibrance']}"
    crs:Saturation="{settings['saturation']}"
    crs:Temperature="{settings['temperature']}"
    crs:Tint="{settings['tint']}"
    crs:Sharpness="{settings['sharpness']}"
    crs:LuminanceSmoothing="{settings['noise_lum']}"
    crs:ColorNoiseReduction="{settings['noise_color']}">
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>'''
    
    try:
        preset_file.write_text(xmp_content, encoding="utf-8")
    except Exception:
        pass

def _get_preset_settings(mood: str, tags: list) -> dict:
    """Preset-Einstellungen basierend auf Stimmung"""
    mood_lower = mood.lower()
    tags_lower = [t.lower() for t in tags]
    
    # Standard
    settings = {
        "exposure": "0.00", "contrast": "10", "highlights": "-20",
        "shadows": "+20", "whites": "0", "blacks": "0",
        "clarity": "10", "dehaze": "0", "vibrance": "15",
        "saturation": "0", "temperature": "5500", "tint": "0",
        "sharpness": "40", "noise_lum": "0", "noise_color": "25"
    }
    
    if any(w in mood_lower for w in ["warm", "golden", "sunset", "sonnenuntergang", "abend"]):
        settings.update({"temperature": "6500", "vibrance": "20", "highlights": "-30", "shadows": "+30"})
    elif any(w in mood_lower for w in ["kalt", "blue", "blau", "winter", "nebel"]):
        settings.update({"temperature": "4500", "tint": "-5", "clarity": "15"})
    elif any(w in mood_lower for w in ["dramatisch", "dramatic", "dunkel", "dark"]):
        settings.update({"contrast": "25", "highlights": "-50", "shadows": "-10", "blacks": "-20"})
    elif any(w in mood_lower for w in ["hell", "bright", "fröhlich", "happy"]):
        settings.update({"exposure": "+0.30", "highlights": "-20", "shadows": "+40", "vibrance": "25"})
    
    # Tier-Fotos: schärfer
    if any(t in tags_lower for t in ["fuchs", "katze", "hund", "vogel", "tier", "animal"]):
        settings.update({"sharpness": "60", "clarity": "15"})
    
    # Landschaft: Weitwinkel-Anpassungen
    if any(t in tags_lower for t in ["landschaft", "landscape", "wald", "forest", "berg"]):
        settings.update({"dehaze": "15", "clarity": "20", "vibrance": "20"})
    
    return settings
