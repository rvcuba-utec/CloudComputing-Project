import { api, isDemo } from './api';

export const demoCategories = [
  { id: 1, nombre: 'Laptops', descripcion: '' },
  { id: 2, nombre: 'Audio', descripcion: '' },
  { id: 3, nombre: 'Accesorios', descripcion: '' },
  { id: 4, nombre: 'Monitores', descripcion: '' },
];

export const demoProducts = [
  { id: 1, nombre: 'Laptop Studio 14', marca: 'CLOUDSHOP SELECT', categoria: 'Laptops', categoria_id: 1, sku: 'DEMO-0001', precio: 3299, precio_oferta: 3699, stock: 8, descripcion: 'Una laptop ligera para estudiar, trabajar y llevar tus proyectos a cualquier lugar.', imagen_url: '', tipo: 'laptop', color: '#7c8f82' },
  { id: 2, nombre: 'Audífonos Wireless Pro', marca: 'CLOUDSHOP SELECT', categoria: 'Audio', categoria_id: 2, sku: 'DEMO-0002', precio: 249, precio_oferta: null, stock: 24, descripcion: 'Audio inalámbrico y un diseño cómodo para acompañarte durante el día.', imagen_url: '', tipo: 'headphones', color: '#c4b69e' },
  { id: 3, nombre: 'Teclado mecánico K75', marca: 'CLOUDSHOP SELECT', categoria: 'Accesorios', categoria_id: 3, sku: 'DEMO-0003', precio: 289, precio_oferta: null, stock: 12, descripcion: 'Un formato compacto que deja más espacio en tu escritorio sin renunciar a lo esencial.', imagen_url: '', tipo: 'keyboard', color: '#bac7ba' },
  { id: 4, nombre: 'Monitor View 27', marca: 'CLOUDSHOP SELECT', categoria: 'Monitores', categoria_id: 4, sku: 'DEMO-0004', precio: 899, precio_oferta: null, stock: 5, descripcion: 'Más espacio para tus ideas. Una pantalla amplia para trabajar y disfrutar tu contenido.', imagen_url: '', tipo: 'monitor', color: '#a3b4be' },
  { id: 5, nombre: 'Mouse inalámbrico M3', marca: 'CLOUDSHOP SELECT', categoria: 'Accesorios', categoria_id: 3, sku: 'DEMO-0005', precio: 119, precio_oferta: null, stock: 0, descripcion: 'Precisión y comodidad en un mouse compacto, pensado para el uso diario.', imagen_url: '', tipo: 'mouse', color: '#c5bcaa' },
  { id: 6, nombre: 'Parlante portátil Mini', marca: 'CLOUDSHOP SELECT', categoria: 'Audio', categoria_id: 2, sku: 'DEMO-0006', precio: 159, precio_oferta: null, stock: 18, descripcion: 'Tu música, donde estés. Un parlante pequeño y fácil de llevar.', imagen_url: '', tipo: 'speaker', color: '#9eafa0' },
];

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
    if (isDemo) return demoList(params);
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.categoria_id) query.set('categoria_id', params.categoria_id);
    query.set('page', String(params.page || 1));
    query.set('limit', String(params.limit || 24));
    const res = await api(`/api/catalogo/productos?${query.toString()}`);
    return { data: (res.data || []).map(normalizar), total: res.total, page: res.page, limit: res.limit, pages: res.pages };
  },
  async get(id) {
    if (isDemo) return demoProducts.find(p => String(p.id) === String(id)) || null;
    const res = await api(`/api/catalogo/productos/${encodeURIComponent(id)}`);
    return res.data ? normalizar(res.data) : null;
  },
  async categories() {
    if (isDemo) return demoCategories;
    const res = await api('/api/catalogo/categorias');
    return res.data || [];
  },
};
