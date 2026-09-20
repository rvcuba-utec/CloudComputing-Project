const { Schema, model } = require('mongoose');

const ResenaSchema = new Schema(
  {
    producto_id: { type: Number, required: true, index: true },
    usuario_id: { type: Number, required: true },
    calificacion: { type: Number, required: true, min: 1, max: 5 },
    comentario: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: { createdAt: 'creado_en', updatedAt: false } },
);

// Un usuario solo puede reseñar una vez el mismo producto.
ResenaSchema.index({ producto_id: 1, usuario_id: 1 }, { unique: true });

module.exports = model('Resena', ResenaSchema);
