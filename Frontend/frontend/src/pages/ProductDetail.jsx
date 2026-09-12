import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { productService } from '../services/productService';
import { useFetch } from '../hooks/useFetch';
import { money } from '../utils/format';
import ProductVisual from '../components/ProductVisual';
import RequestState from '../components/RequestState';
export default function ProductDetail() {
  const { id } = useParams();
  const loader = useCallback(() => productService.get(id), [id]);
  const request = useFetch(loader);
  const p = request.data;
  return <main className="container page"><Link className="back" to="/productos"><ArrowLeft size={17}/> Volver al catálogo</Link><RequestState {...request}/>{p ? <div className="detail"><div className="detail-picture"><ProductVisual product={p}/></div><section><p className="eyebrow">{p.categoria}{p.marca ? ` / ${p.marca}` : ''}</p><h1>{p.nombre}</h1><p className="detail-price">{money(p.precio)}{p.precio_oferta ? <s className="old-price">{money(p.precio_oferta)}</s> : null}</p>{p.descripcion && <p className="description">{p.descripcion}</p>}<div className="availability"><span className={p.stock > 0 ? 'stock' : 'sold-out'}>{p.stock > 0 ? 'En stock' : 'Agotado'}</span><span>{p.stock} unidades disponibles</span></div><h2 className="small-heading">Detalles</h2><dl>{p.sku && <div><dt>SKU</dt><dd>{p.sku}</dd></div>}{p.marca && <div><dt>Marca</dt><dd>{p.marca}</dd></div>}<div><dt>Categoría</dt><dd>{p.categoria}</dd></div></dl><Link className="button secondary" to="/productos">Seguir explorando</Link></section></div> : !request.loading && !request.error && <div className="notice"><h1>Producto no encontrado</h1><p>El producto no está disponible en el catálogo.</p></div>}</main>;
}
