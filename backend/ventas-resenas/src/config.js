require('dotenv').config();

function requerido(nombre) {
  const valor = process.env[nombre];
  if (!valor || !valor.trim()) {
    throw new Error(`Falta definir la variable de entorno ${nombre}`);
  }
  return valor;
}

const config = {
  port: process.env.PORT || '8002',
  mongoUri: requerido('MONGO_URI'),
  jwtSecret: requerido('JWT_SECRET'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean),
};

module.exports = config;
