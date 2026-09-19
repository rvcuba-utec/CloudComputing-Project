"""Configuración del servicio mediante variables de entorno.

Todos los valores sensibles (URL de base de datos, secreto JWT y orígenes CORS)
se leen desde variables de entorno o desde un archivo ``.env``. No se hardcodean
credenciales ni secretos en el código.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros de configuración del Microservicio de Usuarios."""

    # Cadena de conexión a PostgreSQL. Debe apuntar a la BD ``cloudshop_usuarios``.
    DATABASE_URL: str

    # Secreto para firmar los tokens JWT (HS256).
    JWT_SECRET: str

    # Algoritmo de firma del JWT.
    JWT_ALGORITHM: str = "HS256"

    # Tiempo de vida del token, en minutos.
    JWT_EXPIRE_MINUTES: int = 60

    # Orígenes permitidos para CORS, separados por coma.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Devuelve los orígenes CORS como una lista limpia."""
        return [origen.strip() for origen in self.CORS_ORIGINS.split(",") if origen.strip()]


settings = Settings()
