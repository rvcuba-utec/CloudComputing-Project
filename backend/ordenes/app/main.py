"""Punto de entrada de FastAPI para MS4 (Órdenes). Sin base de datos: solo cablea CORS y rutas."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import ordenes

app = FastAPI(title="CloudShop · Microservicio de Órdenes", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(ordenes.router)


@app.get("/health", tags=["health"], summary="Verifica que el servicio responde")
def health():
    return {"status": "ok"}
