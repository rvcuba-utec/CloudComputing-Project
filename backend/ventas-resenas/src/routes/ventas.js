const { Router } = require('express');
const mongoose = require('mongoose');
const Venta = require('../models/Venta');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

const router = Router();

function esIdValido(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function puedeVerVenta(user, venta) {
  return user.rol === 'admin' || Number(user.id) === venta.usuario_id;
}

// POST /ventas — crea una venta. Si quien llama no es admin, se ignora cualquier
// usuario_id del body y se usa el del token (evita que un usuario compre "a nombre" de otro).
router.post('/ventas', requireAuth, asyncHandler(async (req, res) => {
  const { items, direccion_envio, total, usuario_id } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: { code: 'REQUEST_INVALIDA', message: "Se requiere una lista 'items' no vacía" } });
  }
  for (const item of items) {
    if (!item || typeof item.producto_id !== 'number' || typeof item.cantidad !== 'number' || item.cantidad < 1) {
      return res.status(400).json({ error: { code: 'ITEM_INVALIDO', message: 'Cada item requiere producto_id y cantidad (entero positivo)' } });
    }
  }
  if (typeof total !== 'number' || total < 0) {
    return res.status(400).json({ error: { code: 'TOTAL_INVALIDO', message: "Se requiere 'total' numérico" } });
  }

  const usuarioFinal = req.user.rol === 'admin' && typeof usuario_id === 'number' ? usuario_id : Number(req.user.id);

  const venta = await Venta.create({
    usuario_id: usuarioFinal,
    items,
    total,
    direccion_envio: direccion_envio || '',
  });

  return res.status(201).json({ data: venta });
}));

// GET /ventas — solo administradores: todas las ventas del sistema, paginadas.
router.get('/ventas', requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const [data, total] = await Promise.all([
    Venta.find().sort({ creado_en: -1 }).skip((page - 1) * limit).limit(limit),
    Venta.countDocuments(),
  ]);

  return res.json({ data, total, page, limit });
}));

// GET /ventas/:id — el dueño de la venta o un admin.
router.get('/ventas/:id', requireAuth, asyncHandler(async (req, res) => {
  if (!esIdValido(req.params.id)) {
    return res.status(400).json({ error: { code: 'PARAMETRO_INVALIDO', message: 'Identificador de venta inválido' } });
  }
  const venta = await Venta.findById(req.params.id);
  if (!venta) {
    return res.status(404).json({ error: { code: 'VENTA_NO_ENCONTRADA', message: 'No existe la venta solicitada' } });
  }
  if (!puedeVerVenta(req.user, venta)) {
    return res.status(403).json({ error: { code: 'PERMISO_DENEGADO', message: 'No tienes permiso para ver esta venta' } });
  }
  return res.json({ data: venta });
}));

// PATCH /ventas/:id/estado — usado por MS4 (Órdenes) para mover el estado de la venta
// durante la orquestación de una compra. Solo el dueño (el usuario que compró, cuyo
// token reenvía MS4) o un admin puede moverlo.
router.patch('/ventas/:id/estado', requireAuth, asyncHandler(async (req, res) => {
  if (!esIdValido(req.params.id)) {
    return res.status(400).json({ error: { code: 'PARAMETRO_INVALIDO', message: 'Identificador de venta inválido' } });
  }
  const { estado } = req.body || {};
  const estadosValidos = ['pendiente', 'confirmada', 'fallida', 'cancelada'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: { code: 'ESTADO_INVALIDO', message: `'estado' debe ser uno de: ${estadosValidos.join(', ')}` } });
  }

  const venta = await Venta.findById(req.params.id);
  if (!venta) {
    return res.status(404).json({ error: { code: 'VENTA_NO_ENCONTRADA', message: 'No existe la venta solicitada' } });
  }
  if (!puedeVerVenta(req.user, venta)) {
    return res.status(403).json({ error: { code: 'PERMISO_DENEGADO', message: 'No tienes permiso para modificar esta venta' } });
  }

  venta.estado = estado;
  await venta.save();
  return res.json({ data: venta });
}));

// GET /usuarios/:usuarioId/ventas — historial de compras de un usuario (dueño o admin).
router.get('/usuarios/:usuarioId/ventas', requireAuth, asyncHandler(async (req, res) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!Number.isInteger(usuarioId) || usuarioId < 1) {
    return res.status(400).json({ error: { code: 'PARAMETRO_INVALIDO', message: 'Identificador de usuario inválido' } });
  }
  if (req.user.rol !== 'admin' && Number(req.user.id) !== usuarioId) {
    return res.status(403).json({ error: { code: 'PERMISO_DENEGADO', message: 'No tienes permiso para ver estas compras' } });
  }

  const ventas = await Venta.find({ usuario_id: usuarioId }).sort({ creado_en: -1 });
  return res.json({ data: ventas, total: ventas.length });
}));

module.exports = router;
