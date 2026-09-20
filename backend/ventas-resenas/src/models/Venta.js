const { Schema, model } = require('mongoose');

const ItemVentaSchema = new Schema(
  {
    producto_id: { type: Number, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    precio_unitario: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const VentaSchema = new Schema(
  {
    usuario_id: { type: Number, required: true, index: true },
    items: { type: [ItemVentaSchema], required: true, validate: (v) => Array.isArray(v) && v.length > 0 },
    total: { type: Number, required: true, min: 0 },
    estado: {
      type: String,
      enum: ['pendiente', 'confirmada', 'fallida', 'cancelada'],
      default: 'pendiente',
      index: true,
    },
    direccion_envio: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' } },
);

module.exports = model('Venta', VentaSchema);
