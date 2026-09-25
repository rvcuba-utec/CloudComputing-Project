import { api, isDemo } from './api';
import { cached, invalidate } from './cache';

export let demoCategories = [
  { id: 1, nombre: 'Laptops', descripcion: '' },
  { id: 2, nombre: 'Audio', descripcion: '' },
  { id: 3, nombre: 'Accesorios', descripcion: '' },
  { id: 4, nombre: 'Monitores', descripcion: '' },
];

export let demoProducts = [
  { id: 1, nombre: 'Laptop Studio 14', marca: 'CLOUDSHOP SELECT', categoria: 'Laptops', categoria_id: 1, sku: 'DEMO-0001', precio: 3299, precio_oferta: 3699, stock: 8, descripcion: 'Una laptop ligera para estudiar, trabajar y llevar tus proyectos a cualquier lugar.', imagen_url: '', tipo: 'laptop', color: '#7c8f82', activo: true },
  { id: 2, nombre: 'Audífonos Wireless Pro', marca: 'CLOUDSHOP SELECT', categoria: 'Audio', categoria_id: 2, sku: 'DEMO-0002', precio: 249, precio_oferta: null, stock: 24, descripcion: 'Audio inalámbrico y un diseño cómodo para acompañarte durante el día.', imagen_url: '', tipo: 'headphones', color: '#c4b69e', activo: true },
  { id: 3, nombre: 'Teclado mecánico K75', marca: 'CLOUDSHOP SELECT', categoria: 'Accesorios', categoria_id: 3, sku: 'DEMO-0003', precio: 289, precio_oferta: null, stock: 12, descripcion: 'Un formato compacto que deja más espacio en tu escritorio sin renunciar a lo esencial.', imagen_url: '', tipo: 'keyboard', color: '#bac7ba', activo: true },
  { id: 4, nombre: 'Monitor View 27', marca: 'CLOUDSHOP SELECT', categoria: 'Monitores', categoria_id: 4, sku: 'DEMO-0004', precio: 899, precio_oferta: null, stock: 5, descripcion: 'Más espacio para tus ideas. Una pantalla amplia para trabajar y disfrutar tu contenido.', imagen_url: '', tipo: 'monitor', color: '#a3b4be', activo: true },
  { id: 5, nombre: 'Mouse inalámbrico M3', marca: 'CLOUDSHOP SELECT', categoria: 'Accesorios', categoria_id: 3, sku: 'DEMO-0005', precio: 119, precio_oferta: null, stock: 0, descripcion: 'Precisión y comodidad en un mouse compacto, pensado para el uso diario.', imagen_url: '', tipo: 'mouse', color: '#c5bcaa', activo: true },
  { id: 6, nombre: 'Parlante portátil Mini', marca: 'CLOUDSHOP SELECT', categoria: 'Audio', categoria_id: 2, sku: 'DEMO-0006', precio: 159, precio_oferta: null, stock: 18, descripcion: 'Tu música, donde estés. Un parlante pequeño y fácil de llevar.', imagen_url: '', tipo: 'speaker', color: '#9eafa0', activo: true },
];
let nextProductId = 7;
let nextCategoryId = 5;

function normalizar(producto) {
  return {
    id: producto.id,
    nombre: producto.nombre,
    marca: producto.marca || '',
    categoria: producto.categoria_nombre || producto.categoria || '',
    categoria_id: producto.categoria_id,
    sku: producto.sku || '',
    precio: Number(producto.precio),
    precio_oferta: producto.precio_oferta && Number(producto.precio_oferta) > 0 ? Number(producto.precio_oferta) : null,
    stock: Number(producto.stock_disponible ?? producto.stock ?? 0),
    descripcion: producto.descripcion || '',
    imagen_url: producto.imagen_url || '',
    origen_url: producto.origen_url || '',
    activo: producto.activo,
  };
}

function demoList({ q = '', categoria_id = '', page = 1, limit = 24 } = {}) {
  let items = demoProducts;
  if (categoria_id) items = items.filter(p => p.categoria_id === Number(categoria_id));
  if (q) items = items.filter(p => `${p.nombre} ${p.marca}`.toLowerCase().includes(q.toLowerCase()));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  return { data: items.slice(start, start + limit), total, page, limit, pages };
}

export const productService = {
  async list(params = {}) {
    const { q = '', categoria_id = '', page = 1, limit = 24 } = params;
    return cached(`productos:list:${q}|${categoria_id}|${page}|${limit}`, async () => {
      if (isDemo) return demoList(params);
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.categoria_id) query.set('categoria_id', params.categoria_id);
      query.set('page', String(params.page || 1));
      query.set('limit', String(params.limit || 24));
      const res = await api(`/api/catalogo/productos?${query.toString()}`);
      return { data: (res.data || []).map(normalizar), total: res.total, page: res.page, limit: res.limit, pages: res.pages };
    });
  },
  async get(id) {
    return cached(`productos:get:${id}`, async () => {
      if (isDemo) return demoProducts.find(p => String(p.id) === String(id)) || null;
      const res = await api(`/api/catalogo/productos/${encodeURIComponent(id)}`);
      return res.data ? normalizar(res.data) : null;
    });
  },
  async categories() {
    return cached('categorias:list', async () => {
      if (isDemo) return demoCategories;
      const res = await api('/api/catalogo/categorias');
      return res.data || [];
    });
  },
  // --- Administración (solo admin) ---
  // Los formularios entregan valores de FormData (siempre strings); la API espera
  // JSON tipado (categoria_id/precio numéricos), así que se convierten aquí antes de enviar.
  async createProduct(values) {
    const payload = {
      categoria_id: Number(values.categoria_id),
      sku: values.sku,
      nombre: values.nombre,
      descripcion: values.descripcion || '',
      marca: values.marca || '',
      imagen_url: values.imagen_url || '',
      precio: Number(values.precio),
      stock_disponible: Number(values.stock_disponible || 0),
    };
    if (!isDemo) {
      const res = await api('/api/catalogo/productos', { method: 'POST', body: JSON.stringify(payload) });
      invalidate('productos:');
      return normalizar(res.data);
    }
    const categoria = demoCategories.find(c => c.id === payload.categoria_id);
    const producto = {
      id: nextProductId++,
      nombre: payload.nombre,
      marca: payload.marca,
      categoria: categoria?.nombre || '',
      categoria_id: payload.categoria_id,
      sku: payload.sku || `DEMO-${String(nextProductId).padStart(4, '0')}`,
      precio: payload.precio,
      precio_oferta: null,
      stock: payload.stock_disponible,
      descripcion: payload.descripcion,
      imagen_url: payload.imagen_url || '',
      activo: true,
    };
    demoProducts = [...demoProducts, producto];
    invalidate('productos:');
    return producto;
  },
  async updateProduct(id, values) {
    const payload = {};
    if (values.nombre !== undefined) payload.nombre = values.nombre;
    if (values.categoria_id !== undefined) payload.categoria_id = Number(values.categoria_id);
    if (values.marca !== undefined) payload.marca = values.marca;
    if (values.precio !== undefined) payload.precio = Number(values.precio);
    if (values.descripcion !== undefined) payload.descripcion = values.descripcion;
    if (values.imagen_url !== undefined) payload.imagen_url = values.imagen_url;

    if (!isDemo) {
      const res = await api(`/api/catalogo/productos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      invalidate('productos:');
      return normalizar(res.data);
    }
    const categoria = payload.categoria_id !== undefined ? demoCategories.find(c => c.id === payload.categoria_id) : null;
    demoProducts = demoProducts.map(p => String(p.id) === String(id)
      ? { ...p, ...payload, categoria: categoria ? categoria.nombre : p.categoria }
      : p);
    invalidate('productos:');
    return demoProducts.find(p => String(p.id) === String(id));
  },
  async deleteProduct(id) {
    if (!isDemo) {
      const res = await api(`/api/catalogo/productos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidate('productos:');
      return res;
    }
    demoProducts = demoProducts.map(p => String(p.id) === String(id) ? { ...p, activo: false } : p);
    invalidate('productos:');
    return { message: 'Producto desactivado correctamente' };
  },
  async createCategory(values) {
    if (!isDemo) {
      const res = await api('/api/catalogo/categorias', { method: 'POST', body: JSON.stringify(values) });
      invalidarCatalogo();
      return res.data;
    }
    const categoria = { id: nextCategoryId++, nombre: values.nombre, descripcion: values.descripcion || '' };
    demoCategories = [...demoCategories, categoria];
    invalidarCatalogo();
    return categoria;
  },
  async updateCategory(id, values) {
    if (!isDemo) {
      const res = await api(`/api/catalogo/categorias/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(values) });
      invalidarCatalogo();
      return res.data;
    }
    demoCategories = demoCategories.map(c => String(c.id) === String(id) ? { ...c, ...values } : c);
    invalidarCatalogo();
    return demoCategories.find(c => String(c.id) === String(id));
  },
  async deleteCategory(id) {
    if (!isDemo) {
      const res = await api(`/api/catalogo/categorias/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidarCatalogo();
      return res;
    }
    if (demoProducts.some(p => String(p.categoria_id) === String(id))) {
      throw new Error('No se puede eliminar: hay productos asignados a esta categoría.');
    }
    demoCategories = demoCategories.filter(c => String(c.id) !== String(id));
    invalidarCatalogo();
    return { message: 'Categoría eliminada correctamente' };
  },
};

// El nombre de la categoría aparece denormalizado en los productos, así que un
// cambio de categorías también invalida las listas/detalles de productos.
function invalidarCatalogo() {
  invalidate('categorias:');
  invalidate('productos:');
}
