"""Endpoints del perfil de usuario: consulta y edición."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Usuario
from ..schemas.usuario import UsuarioOut, UsuarioUpdate

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get(
    "/me",
    response_model=UsuarioOut,
    summary="Perfil del usuario autenticado (desde el token)",
)
def get_me(current: Usuario = Depends(get_current_user)):
    return current


@router.get(
    "/{usuario_id}",
    response_model=UsuarioOut,
    summary="Obtiene el perfil del usuario autenticado",
)
def get_usuario(
    usuario_id: int,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver este perfil.",
        )

    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    return usuario


@router.patch(
    "/{usuario_id}",
    response_model=UsuarioOut,
    summary="Actualiza el perfil del usuario autenticado",
)
def update_usuario(
    usuario_id: int,
    payload: UsuarioUpdate,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para editar este perfil.",
        )

    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    if payload.nombre is not None:
        usuario.nombre = payload.nombre
    if payload.estado is not None:
        usuario.estado = payload.estado
    if payload.nombre is None and payload.estado is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debes enviar al menos 'nombre' o 'estado'.",
        )
    db.commit()
    db.refresh(usuario)

    return usuario
