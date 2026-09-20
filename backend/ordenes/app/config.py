"""Configuración del orquestador de órdenes (MS4). Sin base de datos propia."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Mismo secreto que MS1 (Backend/users-address): este servicio no tiene su propia
    # base de usuarios, solo verifica el JWT que el frontend ya obtuvo de MS1.
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # URLs internas de los microservicios que este orquestador consume.
    CATALOGO_URL: str = "http://localhost:8080"
    VENTAS_URL: str = "http://localhost:8002"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origen.strip() for origen in self.CORS_ORIGINS.split(",") if origen.strip()]


settings = Settings()
