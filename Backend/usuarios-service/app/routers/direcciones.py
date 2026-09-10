"""Endpoints de direcciones de envío del usuario."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Direccion, Usuario
from ..schemas.direccion import DireccionCreate, DireccionOut

router = APIRouter(prefix="/usuarios", tags=["direcciones"])


@router.get(
    "/{usuario_id}/direcciones",
    response_model=list[DireccionOut],
    summary="Lista las direcciones de envío del usuario",
)
def listar_direcciones(
    usuario_id: int,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver estas direcciones.",
        )

    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    return usuario.direcciones


@router.post(
    "/{usuario_id}/direcciones",
    response_model=DireccionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una dirección de envío para el usuario",
)
def crear_direccion(
    usuario_id: int,
    payload: DireccionCreate,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para crear direcciones para este usuario.",
        )

    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado.",
        )

    direccion = Direccion(usuario_id=usuario.id, **payload.model_dump())
    db.add(direccion)
    db.commit()
    db.refresh(direccion)

    return direccion
