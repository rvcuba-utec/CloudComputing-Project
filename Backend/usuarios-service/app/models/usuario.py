"""Modelo ORM de la tabla ``usuarios``.

Los modelos SQLAlchemy son la única fuente de verdad del esquema, de modo que
la VM de ingesta pueda leer esta misma base de datos sin SQL manual desincronizado.
"""

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    # timezone=True para que la ingesta no tenga problemas de zona horaria.
    creado_en = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    direcciones = relationship(
        "Direccion",
        back_populates="usuario",
        cascade="all, delete-orphan",
    )
