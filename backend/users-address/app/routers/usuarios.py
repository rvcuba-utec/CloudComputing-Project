"""Endpoints del perfil de usuario: consulta y edición."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.deps import get_current_user, require_admin
from ..database import get_db
from ..models import Usuario
from ..schemas.usuario import UsuarioListOut, UsuarioOut, UsuarioRolUpdate, UsuarioUpdate

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get(
    "/me",
    response_model=UsuarioOut,
    summary="Perfil del usuario autenticado (desde el token)",
)
def get_me(current: Usuario = Depends(get_current_user)):
    return current


@router.get(
    "",
    response_model=UsuarioListOut,
    summary="Lista todos los usuarios (solo administradores)",
)
def listar_usuarios(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    total = db.query(func.count(Usuario.id)).scalar()
    usuarios = (
        db.query(Usuario)
        .order_by(Usuario.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return UsuarioListOut(data=usuarios, total=total, page=page, limit=limit)


@router.get(
    "/{usuario_id}",
    response_model=UsuarioOut,
    summary="Obtiene el perfil de un usuario",
)
def get_usuario(
    usuario_id: int,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id and current.rol != "admin":
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
    summary="Actualiza el perfil de un usuario",
)
def update_usuario(
    usuario_id: int,
    payload: UsuarioUpdate,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id and current.rol != "admin":
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


@router.patch(
    "/{usuario_id}/rol",
    response_model=UsuarioOut,
    summary="Cambia el rol de un usuario (solo administradores)",
)
def cambiar_rol(
    usuario_id: int,
    payload: UsuarioRolUpdate,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    usuario.rol = payload.rol
    db.commit()
    db.refresh(usuario)

    return usuario
