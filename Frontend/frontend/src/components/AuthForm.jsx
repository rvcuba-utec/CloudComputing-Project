import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AuthForm({ register = false }) {
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (register && values.password !== values.confirm) { setError('Las contraseñas no coinciden.'); return; }
    delete values.confirm;
    if (register && !values.nombre.trim()) { setError('Ingresa tu nombre.'); return; }
    setBusy(true);
    try { await authenticate(register ? 'register' : 'login', values); navigate('/perfil'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="container auth-layout"><aside><p className="eyebrow">TU ESPACIO EN CLOUDSHOP</p><h1>Todo empieza<br/>por lo esencial.</h1><div className="auth-stamp">C<span>↗</span></div></aside><section className="auth-form"><h2>{register ? 'Crea tu cuenta' : 'Iniciar sesión'}</h2><p>{register ? 'Completa tus datos para comenzar.' : 'Ingresa a tu cuenta de CloudShop.'}</p><form onSubmit={submit}>{register && <label>Nombre completo<input name="nombre" autoComplete="name" required maxLength={100}/></label>}<label>Correo electrónico<input name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required/></label><label>Contraseña<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} required/>{register && <small>Usa al menos 8 caracteres.</small>}</label>{register && <label>Confirma tu contraseña<input name="confirm" type="password" autoComplete="new-password" required minLength={8}/></label>}{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={busy}>{busy ? 'Un momento…' : register ? 'Crear cuenta' : 'Iniciar sesión'}</button></form><p className="auth-switch">{register ? '¿Ya tienes una cuenta?' : '¿Primera vez por aquí?'} <Link to={register ? '/login' : '/registro'}>{register ? 'Inicia sesión' : 'Crea una cuenta'}</Link></p></section></main>;
}
