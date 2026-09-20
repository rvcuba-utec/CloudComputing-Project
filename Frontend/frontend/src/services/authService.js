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
  async profile(id) { return isDemo ? publicUser(users.find(u => String(u.id) === String(id))) : api(`/usuarios/${encodeURIComponent(id)}`); },
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
  async listUsers() {
    if (!isDemo) return api('/usuarios?page=1&limit=100');
    return { data: users.map(publicUser), total: users.length, page: 1, limit: users.length };
  },
  async setRol(id, rol) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}/rol`, { method: 'PATCH', body: JSON.stringify({ rol }) });
    users = users.map(u => String(u.id) === String(id) ? { ...u, rol } : u);
    return publicUser(users.find(u => String(u.id) === String(id)));
  },
};
