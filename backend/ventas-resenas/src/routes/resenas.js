const { Router } = require('express');
const Resena = require('../models/Resena');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = Router();

// GET /productos/:productoId/resenas — público: lista reseñas de un producto + promedio.
router.get('/productos/:productoId/resenas', asyncHandler(async (req, res) => {
  const productoId = Number(req.params.productoId);
  if (!Number.isInteger(productoId) || productoId < 1) {
    return res.status(400).json({ error: { code: 'PARAMETRO_INVALIDO', message: 'Identificador de producto inválido' } });
  }

  const resenas = await Resena.find({ producto_id: productoId }).sort({ creado_en: -1 });
  const promedio = resenas.length
    ? resenas.reduce((suma, r) => suma + r.calificacion, 0) / resenas.length
    : 0;

  return res.json({ data: resenas, total: resenas.length, promedio: Number(promedio.toFixed(2)) });
}));

// POST /productos/:productoId/resenas — el usuario autenticado reseña el producto
// (una vez por usuario y producto).
router.post('/productos/:productoId/resenas', requireAuth, asyncHandler(async (req, res) => {
  const productoId = Number(req.params.productoId);
  if (!Number.isInteger(productoId) || productoId < 1) {
    return res.status(400).json({ error: { code: 'PARAMETRO_INVALIDO', message: 'Identificador de producto inválido' } });
  }

  const { calificacion, comentario } = req.body || {};
  if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: { code: 'CALIFICACION_INVALIDA', message: "'calificacion' debe ser un entero entre 1 y 5" } });
  }

  try {
    const resena = await Resena.create({
      producto_id: productoId,
      usuario_id: Number(req.user.id),
      calificacion,
      comentario: comentario || '',
    });
    return res.status(201).json({ data: resena });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: { code: 'RESENA_DUPLICADA', message: 'Ya reseñaste este producto' } });
    }
    throw error;
  }
}));

module.exports = router;
