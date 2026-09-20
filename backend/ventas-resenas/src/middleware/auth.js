const jwt = require('jsonwebtoken');
const config = require('../config');

// Verifica el mismo JWT HS256 emitido por MS1 (Backend/users-address). El claim "rol"
// permite autorizar sin consultar la base de datos de usuarios.
function requireAuth(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const [tipo, token] = cabecera.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: { code: 'TOKEN_FALTANTE', message: 'Se requiere un token de acceso Bearer' } });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: String(payload.sub), rol: payload.rol };
    return next();
  } catch (error) {
    return res.status(401).json({ error: { code: 'TOKEN_INVALIDO', message: 'Token de acceso inválido o expirado' } });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ error: { code: 'PERMISO_DENEGADO', message: 'Esta acción requiere permisos de administrador' } });
    }
    return next();
  });
}

module.exports = { requireAuth, requireAdmin };
