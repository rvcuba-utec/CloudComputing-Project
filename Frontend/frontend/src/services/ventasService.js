import { api, isDemo } from './api';
import { cached, invalidate } from './cache';

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
    invalidate('ventas:');
    return venta;
  },
  async misVentas(usuarioId) {
    return cached(`ventas:usuario:${usuarioId}`, async () => {
      if (!isDemo) {
        const res = await api(`/usuarios/${encodeURIComponent(usuarioId)}/ventas`);
        return res.data || [];
      }
      return demoVentas.filter(v => String(v.usuario_id) === String(usuarioId));
    }, { ttl: 30 * 1000 });
  },
  async todas({ page = 1, limit = 20 } = {}) {
    return cached(`ventas:todas:${page}:${limit}`, async () => {
      if (!isDemo) {
        const res = await api(`/ventas?page=${page}&limit=${limit}`);
        const total = res.total ?? (res.data || []).length;
        const usedLimit = res.limit ?? limit;
        // El backend de ventas devuelve total pero no pages: lo calculamos aquí.
        return { data: res.data || [], total, page: res.page ?? page, pages: res.pages ?? Math.max(1, Math.ceil(total / usedLimit)) };
      }
      const start = (page - 1) * limit;
      return { data: demoVentas.slice(start, start + limit), total: demoVentas.length, page, pages: Math.max(1, Math.ceil(demoVentas.length / limit)) };
    }, { ttl: 30 * 1000 });
  },
  async obtener(id) {
    if (!isDemo) {
      const res = await api(`/ventas/${encodeURIComponent(id)}`);
      return res.data;
    }
    return demoVentas.find(v => v._id === String(id)) || null;
  },
  async resenas(productoId) {
    return cached(`resenas:${productoId}`, async () => {
      if (!isDemo) return api(`/productos/${encodeURIComponent(productoId)}/resenas`);
      const items = demoResenas.filter(r => String(r.producto_id) === String(productoId));
      const promedio = items.length ? items.reduce((s, r) => s + r.calificacion, 0) / items.length : 0;
      return { data: items, total: items.length, promedio: Number(promedio.toFixed(2)) };
    });
  },
  async crearResena(productoId, usuarioId, { calificacion, comentario }) {
    if (!isDemo) {
      const res = await api(`/productos/${encodeURIComponent(productoId)}/resenas`, { method: 'POST', body: JSON.stringify({ calificacion, comentario }) });
      invalidate(`resenas:${productoId}`);
      return res.data;
    }
    if (demoResenas.some(r => String(r.producto_id) === String(productoId) && String(r.usuario_id) === String(usuarioId))) {
      throw new Error('Ya reseñaste este producto.');
    }
    const resena = { _id: String(nextResenaId++), producto_id: productoId, usuario_id: usuarioId, calificacion, comentario: comentario || '', creado_en: new Date().toISOString() };
    demoResenas = [resena, ...demoResenas];
    invalidate(`resenas:${productoId}`);
    return resena;
  },
};
