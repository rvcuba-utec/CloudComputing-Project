"""Punto de entrada de FastAPI: cableado de CORS, routers y creación de tablas.

Este archivo no contiene lógica de negocio; solo conecta las piezas. La lógica
vive en los routers y, si crece, en una futura capa ``services/``.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  # registra los modelos antes de create_all
from .config import settings
from .database import Base, engine
from .routers import auth, direcciones, usuarios

# Crea las tablas al arrancar (solo aceptable en local; en producción se
# gestionará el esquema con migraciones).
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CloudShop · Microservicio de Usuarios",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(direcciones.router)


@app.get("/health", tags=["health"], summary="Verifica que el servicio responde")
def health():
    return {"status": "ok"}
