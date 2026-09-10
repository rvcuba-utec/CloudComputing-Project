"""Esquemas Pydantic para direcciones de envío."""

from pydantic import BaseModel, ConfigDict, Field


class DireccionCreate(BaseModel):
    direccion: str = Field(..., min_length=1, max_length=255)
    distrito: str = Field(..., min_length=1, max_length=120)
    ciudad: str = Field(..., min_length=1, max_length=120)
    pais: str = Field(..., min_length=1, max_length=80)


class DireccionOut(DireccionCreate):
    id: int
    usuario_id: int

    model_config = ConfigDict(from_attributes=True)
