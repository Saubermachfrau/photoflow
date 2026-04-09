"""
PhotoFlow Backend - FastAPI Hauptanwendung
"""
import asyncio
import json
import os
import subprocess
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .api import cards, files, images, ai_analysis, nas, system
from .services.config import get_config

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/Shutdown Events"""
    config = get_config()
    # Verzeichnisse sicherstellen
    for path in [
        config["app"]["local_staging"],
        config["app"]["trash_dir"],
        config["app"]["thumbnails_dir"],
    ]:
        Path(path).mkdir(parents=True, exist_ok=True)
    yield

app = FastAPI(
    title="PhotoFlow API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routen
app.include_router(cards.router, prefix="/api/cards", tags=["cards"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(ai_analysis.router, prefix="/api/ai", tags=["ai"])
app.include_router(nas.router, prefix="/api/nas", tags=["nas"])
app.include_router(system.router, prefix="/api/system", tags=["system"])

# Frontend statische Dateien
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index = frontend_dist / "index.html"
        return FileResponse(str(index))
