const mongoose = require('mongoose');
const config = require('./config');

async function conectarBD() {
  const intentosMaximos = 30;
  for (let intento = 1; intento <= intentosMaximos; intento += 1) {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
      console.log('[db] conexión a MongoDB establecida');
      return;
    } catch (error) {
      console.log(`[db] intento de conexión ${intento}/${intentosMaximos} fallido: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('no fue posible conectar a MongoDB tras varios intentos');
}

module.exports = { conectarBD };
