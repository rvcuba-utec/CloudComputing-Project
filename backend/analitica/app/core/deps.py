"""Dependencias compartidas: resolución de las claims del usuario autenticado.

Igual que MS4, este servicio no tiene base de datos propia y solo confía en el JWT
firmado por MS1. Las rutas de analítica exponen métricas de negocio, así que además
exigen rol "admin".
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


class UsuarioClaims:
    def __init__(self, id: int, rol: str):
        self.id = id
        self.rol = rol


def get_current_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UsuarioClaims:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token de acceso no proporcionado.")

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token de acceso inválido o expirado.")

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sin identificador de usuario válido.")

    return UsuarioClaims(id=user_id, rol=payload.get("rol", "usuario"))


def require_admin(claims: UsuarioClaims = Depends(get_current_claims)) -> UsuarioClaims:
    if claims.rol != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta acción requiere permisos de administrador.")
    return claims
