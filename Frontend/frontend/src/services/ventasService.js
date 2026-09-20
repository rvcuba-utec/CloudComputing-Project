import { api, isDemo } from './api';

// Demo data vive solo en memoria de esta pestaña, igual que el resto de servicios demo.
let demoVentas = [];
let demoResenas = [];
let nextVentaId = 1;
let nextResenaId = 1;

export const ventasService = {
  // Solo demo: en modo real, las ventas las crea MS4 (Órdenes) al confirmar una compra
  // (ver ordenesService.confirmar); el frontend nunca llama POST /ventas directamente,
  // porque eso saltaría la reserva de stock en MS2.
  async crearDemo(usuarioId, items, total, direccionEnvio) {
    const venta = { _id: String(nextVentaId++), usuario_id: usuarioId, items, total, estado: 'confirmada', direccion_envio: direccionEnvio || '', creado_en: new Date().toISOString() };
    demoVentas = [venta, ...demoVentas];
    return venta;
  },
  async misVentas(usuarioId) {
    if (!isDemo) {
      const res = await api(`/usuarios/${encodeURIComponent(usuarioId)}/ventas`);
      return res.data || [];
    }
    return demoVentas.filter(v => String(v.usuario_id) === String(usuarioId));
  },
  async todas() {
    if (!isDemo) {
      const res = await api('/ventas?page=1&limit=100');
      return res.data || [];
    }
    return demoVentas;
  },
  async obtener(id) {
    if (!isDemo) {
      const res = await api(`/ventas/${encodeURIComponent(id)}`);
      return res.data;
    }
    return demoVentas.find(v => v._id === String(id)) || null;
  },
  async resenas(productoId) {
    if (!isDemo) return api(`/productos/${encodeURIComponent(productoId)}/resenas`);
    const items = demoResenas.filter(r => String(r.producto_id) === String(productoId));
    const promedio = items.length ? items.reduce((s, r) => s + r.calificacion, 0) / items.length : 0;
    return { data: items, total: items.length, promedio: Number(promedio.toFixed(2)) };
  },
  async crearResena(productoId, usuarioId, { calificacion, comentario }) {
    if (!isDemo) {
      const res = await api(`/productos/${encodeURIComponent(productoId)}/resenas`, { method: 'POST', body: JSON.stringify({ calificacion, comentario }) });
      return res.data;
    }
    if (demoResenas.some(r => String(r.producto_id) === String(productoId) && String(r.usuario_id) === String(usuarioId))) {
      throw new Error('Ya reseñaste este producto.');
    }
    const resena = { _id: String(nextResenaId++), producto_id: productoId, usuario_id: usuarioId, calificacion, comentario: comentario || '', creado_en: new Date().toISOString() };
    demoResenas = [resena, ...demoResenas];
    return resena;
  },
};
