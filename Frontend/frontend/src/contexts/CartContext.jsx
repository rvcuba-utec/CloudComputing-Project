import { createContext, useEffect, useMemo, useState } from 'react';

export const CartContext = createContext(null);

const STORAGE_KEY = 'cs:carrito';

function leerCarrito() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(leerCarrito);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch { /* El carrito seguirá disponible en memoria durante esta sesión. */ }
  }, [items]);

  function agregar(producto, cantidad = 1) {
    const limite = Math.max(0, Number(producto.stock) || 0);
    const incremento = Math.max(1, Number(cantidad) || 1);
    if (!limite) return;

    setItems(actuales => {
      const existente = actuales.find(item => String(item.producto_id) === String(producto.id));
      if (existente) {
        return actuales.map(item => String(item.producto_id) === String(producto.id)
          ? { ...item, cantidad: Math.min(limite, item.cantidad + incremento), stock: limite, precio: Number(producto.precio) }
          : item);
      }
      return [...actuales, {
        producto_id: producto.id,
        nombre: producto.nombre,
        categoria: producto.categoria || '',
        precio: Number(producto.precio),
        stock: limite,
        imagen_url: producto.imagen_url || '',
        tipo: producto.tipo,
        color: producto.color,
        cantidad: Math.min(limite, incremento),
      }];
    });
  }

  function actualizarCantidad(productoId, cantidad) {
    setItems(actuales => actuales.map(item => {
      if (String(item.producto_id) !== String(productoId)) return item;
      const nuevaCantidad = Math.min(item.stock, Math.max(1, Number(cantidad) || 1));
      return { ...item, cantidad: nuevaCantidad };
    }));
  }

  function quitar(productoId) {
    setItems(actuales => actuales.filter(item => String(item.producto_id) !== String(productoId)));
  }

  function vaciar() { setItems([]); }

  const value = useMemo(() => ({
    items,
    agregar,
    actualizarCantidad,
    quitar,
    vaciar,
    cantidadTotal: items.reduce((total, item) => total + item.cantidad, 0),
    subtotal: items.reduce((total, item) => total + item.precio * item.cantidad, 0),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
