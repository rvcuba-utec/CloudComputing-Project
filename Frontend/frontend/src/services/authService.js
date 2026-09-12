import { api, isDemo } from './api';
// Demo data lives in this tab's memory; no passwords or tokens are persisted.
let users = [{ id: 'demo', nombre: 'Alex García', email: 'demo@cloudshop.pe', password: 'CloudShop123' }];
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
    const user = { ...values, email: values.email.toLowerCase().trim(), id: crypto.randomUUID() };
    users.push(user);
    return { user: publicUser(user), access_token: null };
  },
  async profile(id) { return isDemo ? publicUser(users.find(u => u.id === id)) : api(`/usuarios/${encodeURIComponent(id)}`); },
  async update(id, values) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(values) });
    users = users.map(u => u.id === id ? { ...u, ...values } : u);
    return publicUser(users.find(u => u.id === id));
  },
  async addresses(id) { return isDemo ? (addresses[id] || []) : api(`/usuarios/${encodeURIComponent(id)}/direcciones`); },
  async addAddress(id, values) {
    if (!isDemo) return api(`/usuarios/${encodeURIComponent(id)}/direcciones`, { method: 'POST', body: JSON.stringify(values) });
    const address = { ...values, id: crypto.randomUUID() };
    addresses[id] = [...(addresses[id] || []), address];
    return address;
  },
};
