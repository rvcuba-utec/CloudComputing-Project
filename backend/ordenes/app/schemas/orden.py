"""Esquemas Pydantic del orquestador de órdenes."""

from typing import Optional

from pydantic import BaseModel, Field


class ItemOrden(BaseModel):
    producto_id: int = Field(..., ge=1)
    cantidad: int = Field(..., ge=1)


class OrdenRequest(BaseModel):
    items: list[ItemOrden] = Field(..., min_length=1)
    direccion_envio: Optional[str] = None


class ItemPrevisualizado(BaseModel):
    producto_id: int
    nombre: str
    cantidad: int
    precio_unitario: float
    subtotal: float
    disponible: bool
    stock_disponible: int


class PrevisualizacionOut(BaseModel):
    items: list[ItemPrevisualizado]
    total: float
    todo_disponible: bool


class OrdenOut(BaseModel):
    orden_id: str
    estado: str
    total: float


class EstadoOrdenOut(BaseModel):
    orden_id: str
    estado: str
    total: float
    items: list[dict]
