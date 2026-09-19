"""Endpoints de autenticación: registro e inicio de sesión."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.security import create_access_token, hash_password, verify_password
from ..database import get_db
from ..models import Usuario
from ..schemas.usuario import UsuarioConToken, UsuarioCreate, UsuarioLogin, UsuarioOut

router = APIRouter(prefix="/usuarios/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UsuarioConToken,
    status_code=status.HTTP_201_CREATED,
    summary="Registra un nuevo usuario",
)
def register(payload: UsuarioCreate, db: Session = Depends(get_db)):
    existe = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if existe:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo electrónico.",
        )

    usuario = Usuario(
        nombre=payload.nombre,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    token = create_access_token(usuario.id)
    return UsuarioConToken(user=UsuarioOut.model_validate(usuario), access_token=token)


@router.post(
    "/login",
    response_model=UsuarioConToken,
    summary="Inicia sesión y devuelve un token JWT",
)
def login(payload: UsuarioLogin, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if usuario is None or not verify_password(payload.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    token = create_access_token(usuario.id)
    return UsuarioConToken(user=UsuarioOut.model_validate(usuario), access_token=token)
