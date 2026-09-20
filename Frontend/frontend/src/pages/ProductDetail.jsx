import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { productService } from '../services/productService';
import { ordenesService } from '../services/ordenesService';
import { ventasService } from '../services/ventasService';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { money } from '../utils/format';
import ProductVisual from '../components/ProductVisual';
import RequestState from '../components/RequestState';

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const loader = useCallback(() => productService.get(id), [id]);
  const request = useFetch(loader);
  const p = request.data;

  const [cantidad, setCantidad] = useState(1);
  const [comprando, setComprando] = useState(false);
  const [mensajeCompra, setMensajeCompra] = useState('');
  const [errorCompra, setErrorCompra] = useState('');

  const [reviewsKey, setReviewsKey] = useState(0);
  const reviewsLoader = useCallback(() => ventasService.resenas(id), [id, reviewsKey]);
  const reviewsRequest = useFetch(reviewsLoader, reviewsKey);
  const [calificacion, setCalificacion] = useState(5);
  const [enviandoResena, setEnviandoResena] = useState(false);
  const [errorResena, setErrorResena] = useState('');

  async function comprar() {
    setErrorCompra(''); setMensajeCompra(''); setComprando(true);
    try {
      await ordenesService.confirmar(user.id, [{ producto_id: p.id, cantidad }]);
      setMensajeCompra('¡Compra confirmada! Revisa "Mis compras" en tu perfil.');
      request.retry();
    } catch (err) { setErrorCompra(err.message); } finally { setComprando(false); }
  }

  async function enviarResena(e) {
    e.preventDefault(); setErrorResena('');
    const form = e.currentTarget; // React nulla e.currentTarget tras el primer await
    const comentario = new FormData(form).get('comentario');
    setEnviandoResena(true);
    try {
      await ventasService.crearResena(id, user.id, { calificacion, comentario });
      form.reset();
      setCalificacion(5);
      setReviewsKey(k => k + 1);
    } catch (err) { setErrorResena(err.message); } finally { setEnviandoResena(false); }
  }

  return <main className="container page">
    <Link className="back" to="/productos"><ArrowLeft size={17}/> Volver al catálogo</Link>
    <RequestState {...request}/>
    {p ? <div className="detail">
      <div className="detail-picture"><ProductVisual product={p}/></div>
      <section>
        <p className="eyebrow">{p.categoria}{p.marca ? ` / ${p.marca}` : ''}</p>
        <h1>{p.nombre}</h1>
        <p className="detail-price">{money(p.precio)}{p.precio_oferta ? <s className="old-price">{money(p.precio_oferta)}</s> : null}</p>
        {p.descripcion && <p className="description">{p.descripcion}</p>}
        <div className="availability"><span className={p.stock > 0 ? 'stock' : 'sold-out'}>{p.stock > 0 ? 'En stock' : 'Agotado'}</span><span>{p.stock} unidades disponibles</span></div>

        {p.stock > 0 && <div className="purchase-box">
          <label>Cantidad<input type="number" min={1} max={p.stock} value={cantidad} onChange={e => setCantidad(Math.min(p.stock, Math.max(1, Number(e.target.value) || 1)))}/></label>
          {user
            ? <button className="button" disabled={comprando} onClick={comprar}>{comprando ? 'Procesando…' : `Comprar por ${money(p.precio * cantidad)}`}</button>
            : <Link className="button" to="/login">Inicia sesión para comprar</Link>}
          {mensajeCompra && <p className="success">{mensajeCompra}</p>}
          {errorCompra && <p role="alert" className="error">{errorCompra}</p>}
        </div>}

        <h2 className="small-heading">Detalles</h2>
        <dl>{p.sku && <div><dt>SKU</dt><dd>{p.sku}</dd></div>}{p.marca && <div><dt>Marca</dt><dd>{p.marca}</dd></div>}<div><dt>Categoría</dt><dd>{p.categoria}</dd></div></dl>
        <Link className="button secondary" to="/productos">Seguir explorando</Link>

        <h2 className="small-heading">Reseñas{reviewsRequest.data?.total ? ` (${reviewsRequest.data.total} · promedio ${reviewsRequest.data.promedio}/5)` : ''}</h2>
        <RequestState {...reviewsRequest}/>
        {!reviewsRequest.loading && !reviewsRequest.error && (reviewsRequest.data?.data?.length
          ? <ul className="reviews-list">{reviewsRequest.data.data.map(r => <li key={r._id}><strong>{'★'.repeat(r.calificacion)}{'☆'.repeat(5 - r.calificacion)}</strong>{r.comentario && <p>{r.comentario}</p>}</li>)}</ul>
          : <p className="empty-address">Aún no hay reseñas para este producto.</p>)}
        {user && <form className="review-form" onSubmit={enviarResena}>
          <label>Tu calificación<select value={calificacion} onChange={e => setCalificacion(Number(e.target.value))}>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} estrella{n > 1 ? 's' : ''}</option>)}</select></label>
          <label>Comentario<textarea name="comentario" rows={2} maxLength={1000}/></label>
          {errorResena && <p role="alert" className="error">{errorResena}</p>}
          <button className="button secondary" disabled={enviandoResena}>{enviandoResena ? 'Enviando…' : 'Publicar reseña'}</button>
        </form>}
      </section>
    </div> : !request.loading && !request.error && <div className="notice"><h1>Producto no encontrado</h1><p>El producto no está disponible en el catálogo.</p></div>}
  </main>;
}
