import { useCallback, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { productService } from '../services/productService';
import { authService } from '../services/authService';
import { ventasService } from '../services/ventasService';
import RequestState from '../components/RequestState';
import { money } from '../utils/format';

const TABS = [
  { id: 'productos', label: 'Productos' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'ordenes', label: 'Órdenes' },
];

export default function Admin() {
  const [tab, setTab] = useState('productos');
  return <main className="container page">
    <div className="page-heading"><div><p className="eyebrow">PANEL DE ADMINISTRACIÓN</p><h1>Administrar CloudShop</h1></div></div>
    <nav className="admin-tabs" aria-label="Secciones de administración">
      {TABS.map(t => <button key={t.id} aria-pressed={tab === t.id} className={tab === t.id ? 'selected' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </nav>
    {tab === 'productos' && <AdminProductos/>}
    {tab === 'categorias' && <AdminCategorias/>}
    {tab === 'usuarios' && <AdminUsuarios/>}
    {tab === 'ordenes' && <AdminOrdenes/>}
  </main>;
}

function AdminProductos() {
  const [reloadKey, setReloadKey] = useState(0);
  const loadProducts = useCallback(() => productService.list({ limit: 100 }), [reloadKey]);
  const productsReq = useFetch(loadProducts, reloadKey);
  const categoriesReq = useFetch(productService.categories);
  const categories = categoriesReq.data || [];
  const [editing, setEditing] = useState(null); // null | 'new' | <id>
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => setReloadKey(k => k + 1);
  const productos = productsReq.data?.data || [];
  const productoEditando = editing && editing !== 'new' ? productos.find(p => String(p.id) === String(editing)) : null;

  async function submit(e) {
    e.preventDefault(); setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      if (editing === 'new') await productService.createProduct(values);
      else await productService.updateProduct(editing, values);
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function desactivar(id) {
    if (!window.confirm('¿Desactivar este producto? Dejará de aparecer en el catálogo activo.')) return;
    await productService.deleteProduct(id);
    reload();
  }

  return <section className="admin-section">
    <div className="section-heading"><h2>Productos</h2><button className="text-button" onClick={() => setEditing(editing === 'new' ? null : 'new')}>{editing === 'new' ? 'Cancelar' : '+ Nuevo producto'}</button></div>
    {(editing === 'new' || productoEditando) && <form className="admin-form" onSubmit={submit}>
      <div className="form-row">
        <label>Nombre<input name="nombre" required maxLength={150} defaultValue={productoEditando?.nombre}/></label>
        <label>SKU<input name="sku" required={editing === 'new'} disabled={!!productoEditando} defaultValue={productoEditando?.sku}/></label>
      </div>
      <div className="form-row">
        <label>Categoría<select name="categoria_id" required defaultValue={productoEditando?.categoria_id || ''}><option value="" disabled>Elige una categoría</option>{categories.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Marca<input name="marca" defaultValue={productoEditando?.marca}/></label>
      </div>
      <div className="form-row">
        <label>Precio (S/)<input name="precio" type="number" min="0" step="0.01" required defaultValue={productoEditando?.precio}/></label>
        {!productoEditando && <label>Stock inicial<input name="stock_disponible" type="number" min="0" defaultValue={0}/></label>}
      </div>
      <label>Descripción<textarea name="descripcion" rows={3} defaultValue={productoEditando?.descripcion}/></label>
      <label>URL de imagen<input name="imagen_url" type="url" placeholder="https://..." defaultValue={productoEditando?.imagen_url}/></label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="button" disabled={busy}>{editing === 'new' ? 'Crear producto' : 'Guardar cambios'}</button>
    </form>}
    <RequestState {...productsReq}/>
    {!productsReq.loading && !productsReq.error && <table className="admin-table">
      <thead><tr><th>Nombre</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th/></tr></thead>
      <tbody>{productos.map(p => <tr key={p.id}>
        <td>{p.nombre}</td><td>{p.sku}</td><td>{p.categoria}</td><td>{money(p.precio)}</td><td>{p.stock}</td>
        <td><span className={p.activo === false ? 'sold-out' : 'stock'}>{p.activo === false ? 'Inactivo' : 'Activo'}</span></td>
        <td className="admin-actions"><button className="text-button" onClick={() => setEditing(p.id)}>Editar</button>{p.activo !== false && <button className="text-button" onClick={() => desactivar(p.id)}>Desactivar</button>}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function AdminCategorias() {
  const [reloadKey, setReloadKey] = useState(0);
  const loadCategories = useCallback(() => productService.categories(), [reloadKey]);
  const categoriesReq = useFetch(loadCategories, reloadKey);
  const categories = categoriesReq.data || [];
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => setReloadKey(k => k + 1);
  const categoriaEditando = editing && editing !== 'new' ? categories.find(c => String(c.id) === String(editing)) : null;

  async function submit(e) {
    e.preventDefault(); setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      if (editing === 'new') await productService.createCategory(values);
      else await productService.updateCategory(editing, values);
      setEditing(null);
      reload();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta categoría?')) return;
    try { await productService.deleteCategory(id); reload(); }
    catch (err) { window.alert(err.message); }
  }

  return <section className="admin-section">
    <div className="section-heading"><h2>Categorías</h2><button className="text-button" onClick={() => setEditing(editing === 'new' ? null : 'new')}>{editing === 'new' ? 'Cancelar' : '+ Nueva categoría'}</button></div>
    {(editing === 'new' || categoriaEditando) && <form className="admin-form" onSubmit={submit}>
      <div className="form-row">
        <label>Nombre<input name="nombre" required maxLength={100} defaultValue={categoriaEditando?.nombre}/></label>
        <label>Descripción<input name="descripcion" maxLength={255} defaultValue={categoriaEditando?.descripcion}/></label>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="button" disabled={busy}>{editing === 'new' ? 'Crear categoría' : 'Guardar cambios'}</button>
    </form>}
    <RequestState {...categoriesReq}/>
    {!categoriesReq.loading && !categoriesReq.error && <table className="admin-table">
      <thead><tr><th>Nombre</th><th>Descripción</th><th/></tr></thead>
      <tbody>{categories.map(c => <tr key={c.id}>
        <td>{c.nombre}</td><td>{c.descripcion}</td>
        <td className="admin-actions"><button className="text-button" onClick={() => setEditing(c.id)}>Editar</button><button className="text-button" onClick={() => eliminar(c.id)}>Eliminar</button></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function AdminUsuarios() {
  const { user: currentUser } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const loadUsers = useCallback(() => authService.listUsers(), [reloadKey]);
  const usersReq = useFetch(loadUsers, reloadKey);
  const reload = () => setReloadKey(k => k + 1);

  async function cambiarRol(id, rol) {
    await authService.setRol(id, rol);
    reload();
  }

  async function cambiarEstado(id, estado) {
    await authService.update(id, { estado });
    reload();
  }

  return <section className="admin-section">
    <div className="section-heading"><h2>Usuarios</h2></div>
    <RequestState {...usersReq}/>
    {!usersReq.loading && !usersReq.error && <table className="admin-table">
      <thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Rol</th><th/></tr></thead>
      <tbody>{(usersReq.data?.data || []).map(u => <tr key={u.id}>
        <td>{u.nombre}</td><td>{u.email}</td>
        <td><span className={u.estado === 'inactivo' ? 'sold-out' : 'stock'}>{u.estado}</span></td>
        <td>{u.rol}</td>
        <td className="admin-actions">
          {String(u.id) !== String(currentUser.id) && <button className="text-button" onClick={() => cambiarRol(u.id, u.rol === 'admin' ? 'usuario' : 'admin')}>{u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>}
          <button className="text-button" onClick={() => cambiarEstado(u.id, u.estado === 'inactivo' ? 'activo' : 'inactivo')}>{u.estado === 'inactivo' ? 'Reactivar' : 'Desactivar'}</button>
        </td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

function AdminOrdenes() {
  const ordersReq = useFetch(ventasService.todas);
  return <section className="admin-section">
    <div className="section-heading"><h2>Órdenes y ventas</h2></div>
    <RequestState {...ordersReq}/>
    {!ordersReq.loading && !ordersReq.error && (ordersReq.data?.length
      ? <table className="admin-table">
          <thead><tr><th>ID</th><th>Usuario</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
          <tbody>{ordersReq.data.map(v => <tr key={v._id}>
            <td>{v._id}</td><td>{v.usuario_id}</td><td>{money(v.total)}</td><td>{v.estado}</td>
            <td>{new Date(v.creado_en).toLocaleString('es-PE')}</td>
          </tr>)}</tbody>
        </table>
      : <div className="notice"><p>Todavía no hay órdenes registradas.</p></div>)}
  </section>;
}
