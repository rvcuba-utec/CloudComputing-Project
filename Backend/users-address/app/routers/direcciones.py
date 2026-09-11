"""Endpoints de direcciones de envío del usuario."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.deps import get_current_user
from ..database import get_db
from ..models import Direccion, Usuario
from ..schemas.direccion import DireccionCreate, DireccionOut, DireccionUpdate

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

    ya_tiene = (
        db.query(Direccion).filter(Direccion.usuario_id == usuario.id).count() > 0
    )
    direccion = Direccion(
        usuario_id=usuario.id,
        es_principal=not ya_tiene,
        **payload.model_dump(),
    )
    db.add(direccion)
    db.commit()
    db.refresh(direccion)

    return direccion


def _obtener_direccion_propia(db: Session, usuario_id: int, direccion_id: int) -> Direccion:
    direccion = (
        db.query(Direccion)
        .filter(Direccion.id == direccion_id, Direccion.usuario_id == usuario_id)
        .first()
    )
    if direccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dirección no encontrada.",
        )
    return direccion


@router.patch(
    "/{usuario_id}/direcciones/{direccion_id}",
    response_model=DireccionOut,
    summary="Marca una dirección como principal (desmarca las demás)",
)
def marcar_direccion_principal(
    usuario_id: int,
    direccion_id: int,
    payload: DireccionUpdate,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para editar estas direcciones.",
        )

    _obtener_direccion_propia(db, usuario_id, direccion_id)

    if not payload.es_principal:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Este endpoint solo permite marcar 'es_principal=true'.",
        )

    db.query(Direccion).filter(
        Direccion.usuario_id == usuario_id,
        Direccion.id != direccion_id,
    ).update({"es_principal": False})

    direccion = _obtener_direccion_propia(db, usuario_id, direccion_id)
    direccion.es_principal = True
    db.commit()
    db.refresh(direccion)

    return direccion


@router.delete(
    "/{usuario_id}/direcciones/{direccion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Elimina una dirección de envío del usuario",
)
def eliminar_direccion(
    usuario_id: int,
    direccion_id: int,
    current: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.id != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para eliminar direcciones de este usuario.",
        )

    direccion = _obtener_direccion_propia(db, usuario_id, direccion_id)
    db.delete(direccion)
    db.commit()

    return None
