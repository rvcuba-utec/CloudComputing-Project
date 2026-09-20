"""Dependencias compartidas: resolución de las claims del usuario autenticado.

A diferencia de MS1, este servicio no tiene base de datos propia, así que no puede
verificar que el usuario siga existiendo; solo confía en el JWT firmado por MS1.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


class UsuarioClaims:
    def __init__(self, id: int, rol: str, token: str):
        self.id = id
        self.rol = rol
        self.token = token


def get_current_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UsuarioClaims:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acceso no proporcionado.",
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acceso inválido o expirado.",
        )

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin identificador de usuario válido.",
        )

    return UsuarioClaims(id=user_id, rol=payload.get("rol", "usuario"), token=credentials.credentials)
