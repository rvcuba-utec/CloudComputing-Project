"""Configuración de MS5 (Analítica). Sin base de datos relacional propia: consulta
Athena sobre el catálogo Glue construido a partir del data lake en S3 (blueprint §9)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Mismo secreto que MS1: este servicio solo verifica el JWT, no tiene BD de usuarios.
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    AWS_REGION: str = "us-east-1"
    ATHENA_DATABASE: str = "cloudshop_analytics"
    ATHENA_WORKGROUP: str = "primary"
    ATHENA_OUTPUT_S3: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origen.strip() for origen in self.CORS_ORIGINS.split(",") if origen.strip()]

    @property
    def athena_configurado(self) -> bool:
        """True si hay suficiente configuración para lanzar una consulta a Athena."""
        return bool(self.ATHENA_OUTPUT_S3.strip())


settings = Settings()
