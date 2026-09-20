"""Verificación del JWT emitido por MS1. Este servicio no firma tokens, solo los lee."""

from jose import jwt

from ..config import settings


def decode_access_token(token: str) -> dict:
    """Decodifica y valida un token JWT. Lanza ``JWTError`` si es inválido o expiró."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
