const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const { conectarBD } = require('./db');
const ventasRouter = require('./routes/ventas');
const resenasRouter = require('./routes/resenas');

const app = express();

app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

app.get('/health', (req, res) => {
  const conectado = mongoose.connection.readyState === 1;
  res.status(conectado ? 200 : 503).json({ status: conectado ? 'UP' : 'DOWN', database: conectado ? 'CONNECTED' : 'DISCONNECTED' });
});

app.use(ventasRouter);
app.use(resenasRouter);

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NO_ENCONTRADO', message: 'Ruta no encontrada' } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error interno del servidor' } });
});

conectarBD()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[main] servicio de ventas y reseñas escuchando en :${config.port}`);
    });
  })
  .catch((error) => {
    console.error('[main]', error.message);
    process.exit(1);
  });
