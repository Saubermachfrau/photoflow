"""
API: System-Monitoring
CPU, RAM, Festplatte, Temperaturen
"""
import psutil
import os
from pathlib import Path
from fastapi import APIRouter
from ..services.config import get_config

router = APIRouter()

@router.get("/stats")
async def system_stats():
    """Aktuelle Systemauslastung"""
    config = get_config()
    
    cpu = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory()
    
    # Festplatten
    disks = {}
    try:
        ssd = psutil.disk_usage("/")
        disks["SSD"] = {
            "total": ssd.total,
            "used": ssd.used,
            "free": ssd.free,
            "percent": ssd.percent,
            "human": f"{ssd.free // (1024**3)} GB frei"
        }
    except:
        pass
    
    # Staging-Bereich
    staging = config["app"]["local_staging"]
    try:
        stage_usage = psutil.disk_usage(staging)
        disks["Staging"] = {
            "total": stage_usage.total,
            "used": stage_usage.used,
            "free": stage_usage.free,
            "percent": stage_usage.percent
        }
    except:
        pass
    
    # NAS
    nas_mount = config["nas"]["mount_point"]
    try:
        if os.path.ismount(nas_mount):
            nas_usage = psutil.disk_usage(nas_mount)
            disks["NAS"] = {
                "total": nas_usage.total,
                "used": nas_usage.used,
                "free": nas_usage.free,
                "percent": nas_usage.percent,
                "human": f"{nas_usage.free // (1024**3)} GB frei"
            }
    except:
        pass
    
    # CPU-Temperatur (Linux)
    temp = None
    try:
        temps = psutil.sensors_temperatures()
        for name, entries in temps.items():
            if entries:
                temp = round(entries[0].current, 1)
                break
    except:
        pass
    
    # Netzwerk
    net = psutil.net_io_counters()
    
    return {
        "cpu_percent": round(cpu, 1),
        "ram": {
            "total": ram.total,
            "used": ram.used,
            "free": ram.available,
            "percent": ram.percent
        },
        "disks": disks,
        "cpu_temp": temp,
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv
        }
    }
