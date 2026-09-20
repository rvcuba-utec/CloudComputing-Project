"""Punto de entrada de FastAPI para MS5 (Analítica)."""

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import analitica

app = FastAPI(title="CloudShop · Microservicio de Analítica", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(analitica.router)


@app.get("/health", tags=["health"], summary="Verifica que el servicio responde")
def health():
    # No depende de Athena/AWS a propósito: así el ALB no marca el servicio DOWN solo
    # porque falten credenciales, algo esperable fuera de la VM de producción.
    return {"status": "ok"}


@app.get("/health/athena", tags=["health"], summary="Verifica credenciales AWS y acceso a Athena")
def health_athena():
    try:
        identidad = boto3.client("sts", region_name=settings.AWS_REGION).get_caller_identity()
        return {"status": "ok", "account": identidad.get("Account"), "athena_configurado": settings.athena_configurado}
    except (BotoCoreError, ClientError) as error:
        return {"status": "error", "detail": str(error)}
