import { useCallback, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { authService } from '../services/authService';
import RequestState from '../components/RequestState';
export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const loader = useCallback(async () => ({ profile: await authService.profile(user.id), addresses: await authService.addresses(user.id) }), [user.id]);
  const request = useFetch(loader);
  const [showAddress, setShowAddress] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e, address = false) {
    e.preventDefault(); setError(''); setMessage('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (Object.values(values).some(v => !v.trim())) { setError('Completa los campos sin dejar solo espacios.'); return; }
    setBusy(true);
    try {
      if (address) { await authService.addAddress(user.id, values); setShowAddress(false); }
      else setUser(await authService.update(user.id, values));
      setMessage(address ? 'Dirección guardada.' : 'Tus datos se actualizaron.'); request.retry();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="container page"><div className="page-heading"><div><p className="eyebrow">MI CUENTA</p><h1>Hola, {user.nombre.split(' ')[0]}.</h1></div><button className="text-button" onClick={logout}>Cerrar sesión ↗</button></div><RequestState {...request}/><div aria-live="polite">{message && <p className="success">{message}</p>}</div>{error && <p role="alert" className="error">{error}</p>}{request.data && <div className="profile-layout"><section><h2>Datos personales</h2><form onSubmit={save}><label>Nombre completo<input name="nombre" required maxLength={100} defaultValue={request.data.profile.nombre}/></label><label>Correo electrónico<input type="email" readOnly value={request.data.profile.email}/><small>El correo identifica tu cuenta.</small></label><button className="button" disabled={busy}>Guardar cambios</button></form></section><section><div className="section-heading"><h2>Direcciones</h2><button className="text-button" onClick={() => setShowAddress(!showAddress)}>{showAddress ? 'Cancelar' : '+ Agregar'}</button></div>{request.data.addresses.length ? request.data.addresses.map(a => <address key={a.id}><strong>{a.direccion}</strong><br/>{a.distrito}, {a.ciudad}<br/>{a.pais}</address>) : <p className="empty-address">Aún no tienes direcciones guardadas.<br/>Agrega tu primera dirección de envío.</p>}{showAddress && <form onSubmit={e => save(e, true)}><label>Dirección<input name="direccion" autoComplete="street-address" placeholder="Av. Principal 123, departamento 402" required maxLength={200}/></label><div className="form-row"><label>Distrito<input name="distrito" required maxLength={80}/></label><label>Ciudad<input name="ciudad" autoComplete="address-level2" required maxLength={80}/></label></div><label>País<input name="pais" defaultValue="Perú" autoComplete="country-name" required maxLength={80}/></label><button className="button" disabled={busy}>Guardar dirección</button></form>}</section></div>}</main>;
}
