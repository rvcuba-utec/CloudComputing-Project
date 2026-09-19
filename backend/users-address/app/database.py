"""Conexión a la base de datos PostgreSQL.

El motor y la sesión se construyen a partir de ``DATABASE_URL`` (siempre desde
variables de entorno), de modo que mañana pueda apuntar a la VM de datos dentro
de la VPC sin modificar código.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Generador de sesiones de base de datos para la inyección de dependencias."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
