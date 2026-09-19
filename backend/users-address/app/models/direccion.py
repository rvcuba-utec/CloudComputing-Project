"""Modelo ORM de la tabla ``direcciones_envio``."""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, text
from sqlalchemy.orm import relationship

from ..database import Base


class Direccion(Base):
    __tablename__ = "direcciones_envio"

    id = Column(Integer, primary_key=True, autoincrement=True)
    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    direccion = Column(String(255), nullable=False)
    distrito = Column(String(120), nullable=False)
    ciudad = Column(String(120), nullable=False)
    pais = Column(String(80), nullable=False)
    es_principal = Column(Boolean, nullable=False, server_default=text("false"))

    usuario = relationship("Usuario", back_populates="direcciones")
