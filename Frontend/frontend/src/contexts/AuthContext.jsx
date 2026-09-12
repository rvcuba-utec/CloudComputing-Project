import { createContext, useState } from 'react';
import { authService } from '../services/authService';
import { setToken } from '../services/api';
export const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  async function authenticate(type, values) {
    const result = await authService[type](values);
    setToken(result.access_token);
    setUser(result.user);
  }
  function logout() { setUser(null); setToken(null); }
  return <AuthContext.Provider value={{ user, setUser, authenticate, logout }}>{children}</AuthContext.Provider>;
}
