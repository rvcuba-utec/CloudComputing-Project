import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import ProductVisual from '../components/ProductVisual';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { authService } from '../services/authService';
import { ordenesService } from '../services/ordenesService';
import { money } from '../utils/format';

function direccionTexto(direccion) {
  return [direccion.direccion, direccion.distrito, direccion.ciudad, direccion.pais].filter(Boolean).join(', ');
}

export default function Cart() {
  const { user } = useAuth();
  const { items, actualizarCantidad, quitar, vaciar, subtotal } = useCart();
  const [previsualizacion, setPrevisualizacion] = useState(null);
  const [direcciones, setDirecciones] = useState([]);
  const [direccion, setDireccion] = useState('');
  const [validando, setValidando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const payload = useMemo(() => items.map(item => ({ producto_id: item.producto_id, cantidad: item.cantidad })), [items]);

  useEffect(() => {
    let vigente = true;
    if (!user) { setDirecciones([]); setDireccion(''); return () => { vigente = false; }; }
    authService.addresses(user.id).then(data => {
      if (!vigente) return;
      const opciones = Array.isArray(data) ? data : [];
      setDirecciones(opciones);
      if (opciones[0]) setDireccion(direccionTexto(opciones[0]));
    }).catch(() => { if (vigente) setDirecciones([]); });
    return () => { vigente = false; };
  }, [user]);

  useEffect(() => {
    let vigente = true;
    if (!user || !payload.length) { setPrevisualizacion(null); return () => { vigente = false; }; }
    setValidando(true);
    setError('');
    ordenesService.previsualizar(payload)
      .then(data => { if (vigente) setPrevisualizacion(data); })
      .catch(err => { if (vigente) { setPrevisualizacion(null); setError(err.message); } })
      .finally(() => { if (vigente) setValidando(false); });
    return () => { vigente = false; };
  }, [payload, user]);

  function cambiarCantidad(productoId, cantidad) {
    setMensaje('');
    actualizarCantidad(productoId, cantidad);
  }

  function eliminar(productoId) {
    setMensaje('');
    quitar(productoId);
  }

  async function confirmar() {
    setError(''); setMensaje(''); setConfirmando(true);
    try {
      const validacion = await ordenesService.previsualizar(payload);
      setPrevisualizacion(validacion);
      if (!validacion.todo_disponible) throw new Error('Uno o más productos ya no tienen stock suficiente. Ajusta el carrito antes de continuar.');
      const orden = await ordenesService.confirmar(user.id, payload, direccion || undefined);
      vaciar();
      setMensaje(`¡Compra confirmada! Orden ${orden.orden_id}. Puedes revisarla en “Mi cuenta”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmando(false);
    }
  }

  if (!items.length) return <main className="container page cart-empty">
    <ShoppingBag size={42}/>
    <h1>{mensaje ? 'Compra realizada' : 'Tu carrito está vacío'}</h1>
    {mensaje && <p className="success">{mensaje}</p>}
    <p>{mensaje ? 'El inventario y tu historial de compras ya fueron actualizados.' : 'Explora el catálogo y agrega los productos que quieras comprar.'}</p>
    <div className="cart-empty-actions"><Link className="button" to="/productos">Ir al catálogo</Link>{mensaje && <Link className="button secondary" to="/perfil">Ver mis compras</Link>}</div>
  </main>;

  const total = previsualizacion?.total ?? subtotal;
  const disponibilidad = new Map((previsualizacion?.items || []).map(item => [String(item.producto_id), item]));

  return <main className="container page">
    <div className="page-heading cart-heading"><div><p className="eyebrow">TU SELECCIÓN</p><h1>Carrito de compras</h1></div><button className="text-button" onClick={vaciar}>Vaciar carrito</button></div>
    <div className="cart-layout">
      <section className="cart-items" aria-label="Productos en el carrito">
        {items.map(item => {
          const validado = disponibilidad.get(String(item.producto_id));
          return <article className="cart-item" key={item.producto_id}>
            <Link className="cart-item-picture" to={`/productos/${item.producto_id}`}><ProductVisual product={item}/></Link>
            <div className="cart-item-info"><p className="eyebrow">{item.categoria || 'PRODUCTO'}</p><h2><Link to={`/productos/${item.producto_id}`}>{item.nombre}</Link></h2><p>{money(validado?.precio_unitario ?? item.precio)} por unidad</p>{validado && !validado.disponible && <p className="cart-warning">Stock disponible: {validado.stock_disponible}</p>}</div>
            <div className="cart-quantity" aria-label={`Cantidad de ${item.nombre}`}><button aria-label="Disminuir cantidad" onClick={() => cambiarCantidad(item.producto_id, item.cantidad - 1)}><Minus size={15}/></button><input aria-label="Cantidad" type="number" min="1" max={item.stock} value={item.cantidad} onChange={e => cambiarCantidad(item.producto_id, e.target.value)}/><button aria-label="Aumentar cantidad" disabled={item.cantidad >= item.stock} onClick={() => cambiarCantidad(item.producto_id, item.cantidad + 1)}><Plus size={15}/></button></div>
            <strong className="cart-item-total">{money((validado?.precio_unitario ?? item.precio) * item.cantidad)}</strong>
            <button className="cart-remove" aria-label={`Quitar ${item.nombre}`} onClick={() => eliminar(item.producto_id)}><Trash2 size={17}/></button>
          </article>;
        })}
      </section>

      <aside className="cart-summary">
        <p className="eyebrow">RESUMEN</p>
        <div><span>Productos</span><strong>{items.reduce((suma, item) => suma + item.cantidad, 0)}</strong></div>
        <div><span>Subtotal</span><strong>{money(total)}</strong></div>
        <div><span>Envío</span><strong>Por coordinar</strong></div>
        {user && direcciones.length > 0 && <label>Dirección de envío<select value={direccion} onChange={e => setDireccion(e.target.value)}>{direcciones.map(d => { const texto = direccionTexto(d); return <option key={d.id} value={texto}>{texto}</option>; })}</select></label>}
        {validando && <p className="cart-status">Validando precio y stock…</p>}
        {previsualizacion && !previsualizacion.todo_disponible && <p className="error">Revisa los productos sin stock suficiente.</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {user
          ? <button className="button cart-checkout" disabled={validando || confirmando || previsualizacion?.todo_disponible === false} onClick={confirmar}>{confirmando ? 'Confirmando compra…' : `Confirmar por ${money(total)}`}</button>
          : <Link className="button cart-checkout" to="/login" state={{ from: '/carrito' }}>Inicia sesión para comprar</Link>}
        <Link className="cart-continue" to="/productos">← Seguir comprando</Link>
      </aside>
    </div>
  </main>;
}
