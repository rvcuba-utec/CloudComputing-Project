import { createContext, useRef, useState } from 'react';
import { authService } from '../services/authService';
import { setToken } from '../services/api';
import { clearCache } from '../services/cache';

export const AuthContext = createContext(null);

// La sesión se guarda en localStorage para sobrevivir recargas y reinicios del
// navegador. Solo se persiste el usuario público (sin contraseña) y, en modo real,
// el token de acceso.
const STORAGE_KEY = 'cs:sesion';

function leerSesion() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function guardarSesion(user, accessToken) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, access_token: accessToken ?? null }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* modo privado o sin cuota: la sesión seguirá viva solo en memoria */ }
}

export function AuthProvider({ children }) {
  const sesionInicial = leerSesion();
  const tokenRef = useRef(sesionInicial?.access_token ?? null);
  // Rehidratamos el token en el cliente API durante el primer render, antes de que
  // los componentes hijos monten y disparen peticiones, para no perder la sesión al recargar.
  if (tokenRef.current) setToken(tokenRef.current);

  const [user, setUserState] = useState(sesionInicial?.user ?? null);

  function setUser(next) {
    setUserState(prev => {
      const value = typeof next === 'function' ? next(prev) : next;
      guardarSesion(value, tokenRef.current);
      return value;
    });
  }

  async function authenticate(type, values) {
    const result = await authService[type](values);
    tokenRef.current = result.access_token ?? null;
    setToken(result.access_token);
    setUser(result.user);
  }

  function logout() {
    tokenRef.current = null;
    setUser(null);
    setToken(null);
    clearCache();
  }

  const isAdmin = user?.rol === 'admin';
  return <AuthContext.Provider value={{ user, setUser, authenticate, logout, isAdmin }}>{children}</AuthContext.Provider>;
}
