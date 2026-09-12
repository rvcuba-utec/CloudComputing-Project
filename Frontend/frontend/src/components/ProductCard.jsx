import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import ProductVisual from './ProductVisual';
import { money } from '../utils/format';
export default function ProductCard({ product }) {
  return <Link className="product-card" to={`/productos/${product.id}`}><div className="product-picture"><ProductVisual product={product}/><span className="picture-arrow"><ArrowUpRight size={19}/></span></div><div className="product-meta">{product.categoria}<span className={product.stock > 0 ? 'stock' : 'sold-out'}>{product.stock > 0 ? 'Disponible' : 'Agotado'}</span></div><h2>{product.nombre}</h2><p className="price">{money(product.precio)}{product.precio_oferta ? <s className="old-price">{money(product.precio_oferta)}</s> : null}</p></Link>;
}
