import { api, isDemo } from './api';
// Demo data lives in this tab's memory; no passwords or tokens are persisted.
let users = [
  { id: 1, nombre: 'Admin CloudShop', email: 'admin@cloudshop.pe', password: 'AdminPass123', rol: 'admin', estado: 'activo' },
  { id: 2, nombre: 'Alex García', email: 'demo@cloudshop.pe', password: 'CloudShop123', rol: 'usuario', estado: 'activo' },
];
let nextId = 3;
const addresses = {};
const publicUser = ({ password, ...user }) => user;
export const authService = {
  async login(values) {
    if (!isDemo) return api('/usuarios/auth/login', { method: 'POST', body: JSON.stringify(values) });
    const user = users.find(u => u.email === values.email.toLowerCase().trim() && u.password === values.password);
    if (!user) throw new Error('El correo o la contraseña no son correctos.');
    return { user: publicUser(user), access_token: null };
  },
  async register(values) {
    if (!isDemo) return api('/usuarios/auth/register', { method: 'POST', body: JSON.stringify(values) });
    if (users.some(u => u.email === values.email.toLowerCase().trim())) throw new Error('Ya existe una cuenta con ese correo.');
    const user = { ...values, email: values.email.toLowerCase().trim(), id: nextId++, rol: 'usuario', estado: 'activo' };
    users.push(user);
    return { user: publicUser(user), access_token: null };
  },
  async profile(id) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}`);
    const user = users.find(u => String(u.id) === String(id));
    if (user) return publicUser(user);
    // Tras recargar, la lista demo se reinicia; recuperamos el usuario de la sesión persistida.
    try {
      const sesion = JSON.parse(localStorage.getItem('cs:sesion') || 'null');
      if (sesion?.user && String(sesion.user.id) === String(id)) return sesion.user;
    } catch { /* ignore */ }
    return null;
  },
  async update(id, values) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(values) });
    users = users.map(u => String(u.id) === String(id) ? { ...u, ...values } : u);
    return publicUser(users.find(u => String(u.id) === String(id)));
  },
  async addresses(id) { return isDemo ? (addresses[id] || []) : api(`/usuarios/${encodeURIComponent(id)}/direcciones`); },
  async addAddress(id, values) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}/direcciones`, { method: 'POST', body: JSON.stringify(values) });
    const address = { ...values, id: crypto.randomUUID() };
    addresses[id] = [...(addresses[id] || []), address];
    return address;
  },
  // --- Administración (solo admin) ---
  async listUsers({ page = 1, limit = 20 } = {}) {
    if (!isDemo) {
      const res = await api(`/usuarios?page=${page}&limit=${limit}`);
      const usedLimit = res.limit ?? limit;
      const total = res.total ?? (res.data || []).length;
      // El backend de usuarios devuelve total pero no pages: lo calculamos aquí.
      return { data: res.data || [], total, page: res.page ?? page, limit: usedLimit, pages: res.pages ?? Math.max(1, Math.ceil(total / usedLimit)) };
    }
    const start = (page - 1) * limit;
    return { data: users.map(publicUser).slice(start, start + limit), total: users.length, page, limit, pages: Math.max(1, Math.ceil(users.length / limit)) };
  },
  async setRol(id, rol) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}/rol`, { method: 'PATCH', body: JSON.stringify({ rol }) });
    users = users.map(u => String(u.id) === String(id) ? { ...u, rol } : u);
    return publicUser(users.find(u => String(u.id) === String(id)));
  },
};
