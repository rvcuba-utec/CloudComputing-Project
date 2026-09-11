"""Esquemas Pydantic para usuarios (entradas y salidas de la API)."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UsuarioBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=120)
    email: EmailStr


class UsuarioCreate(UsuarioBase):
    password: str = Field(..., min_length=8, max_length=128)


class UsuarioLogin(BaseModel):
    email: EmailStr
    password: str


class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=120)
    estado: Optional[Literal["activo", "inactivo"]] = None


class UsuarioOut(BaseModel):
    id: int
    nombre: str
    email: EmailStr
    estado: str

    model_config = ConfigDict(from_attributes=True)


class UsuarioConToken(BaseModel):
    user: UsuarioOut
    access_token: str
