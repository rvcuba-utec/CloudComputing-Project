import { api, isDemo } from './api';
import { demoProducts } from './productService';
import { ventasService } from './ventasService';

function itemsDemo(items) {
  return items.map(({ producto_id, cantidad }) => {
    const producto = demoProducts.find(p => String(p.id) === String(producto_id));
    const disponible = Boolean(producto) && producto.activo && producto.stock >= cantidad;
    const precioUnitario = producto ? producto.precio : 0;
    return {
      producto_id,
      nombre: producto?.nombre || 'Producto no encontrado',
      cantidad,
      precio_unitario: precioUnitario,
      subtotal: Number((precioUnitario * cantidad).toFixed(2)),
      disponible,
      stock_disponible: producto?.stock ?? 0,
    };
  });
}

export const ordenesService = {
  async previsualizar(items) {
    if (!isDemo) return api('/ordenes/previsualizar', { method: 'POST', body: JSON.stringify({ items }) });
    const itemsOut = itemsDemo(items);
    return { items: itemsOut, total: Number(itemsOut.reduce((s, i) => s + i.subtotal, 0).toFixed(2)), todo_disponible: itemsOut.every(i => i.disponible) };
  },
  async confirmar(usuarioId, items, direccionEnvio) {
    if (!isDemo) return api('/ordenes/confirmar', { method: 'POST', body: JSON.stringify({ items, direccion_envio: direccionEnvio }) });

    const itemsOut = itemsDemo(items);
    const faltante = itemsOut.find(i => !i.disponible);
    if (faltante) throw new Error(`No hay stock suficiente de "${faltante.nombre}".`);

    for (const item of itemsOut) {
      const producto = demoProducts.find(p => String(p.id) === String(item.producto_id));
      if (producto) producto.stock -= item.cantidad;
    }

    const total = Number(itemsOut.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const ventaItems = itemsOut.map(({ producto_id, cantidad, precio_unitario }) => ({ producto_id, cantidad, precio_unitario }));
    const venta = await ventasService.crearDemo(usuarioId, ventaItems, total, direccionEnvio);
    return { orden_id: venta._id, estado: venta.estado, total };
  },
  async estado(id) {
    if (!isDemo) return api(`/ordenes/${encodeURIComponent(id)}/estado`);
    const venta = await ventasService.obtener(id);
    if (!venta) throw new Error('No existe una orden con ese identificador.');
    return { orden_id: venta._id, estado: venta.estado, total: venta.total, items: venta.items };
  },
  async cancelar(id) {
    if (!isDemo) return api(`/ordenes/${encodeURIComponent(id)}/cancelar`, { method: 'POST' });
    throw new Error("No se puede cancelar: la orden ya fue confirmada (el modelo de inventario no admite reingreso de stock).");
  },
};
