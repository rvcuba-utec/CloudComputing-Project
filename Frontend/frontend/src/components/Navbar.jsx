import { NavLink, Link } from 'react-router-dom';
import { ArrowUpRight, ShoppingBag, UserRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
export default function Navbar() {
  const { user, isAdmin } = useAuth();
  const { cantidadTotal } = useCart();
  return <><div className="topline"><div className="container">Todo lo que buscas, en un solo lugar.<span>CloudShop / Perú</span></div></div><header><div className="container nav"><Link className="brand" to="/" aria-label="CloudShop, inicio">cloudshop<span>↗</span></Link><nav aria-label="Navegación principal"><NavLink to="/productos">Productos</NavLink><NavLink className="cart-nav-link" to="/carrito"><ShoppingBag size={17}/><span>Carrito</span>{cantidadTotal > 0 && <strong className="cart-badge" aria-label={`${cantidadTotal} productos en el carrito`}>{cantidadTotal}</strong>}</NavLink>{isAdmin && <NavLink to="/admin"><ShieldCheck size={17}/><span>Admin</span></NavLink>}<NavLink to={user ? '/perfil' : '/login'}><UserRound size={17}/><span>{user ? 'Mi cuenta' : 'Iniciar sesión'}</span><ArrowUpRight size={14}/></NavLink></nav></div></header></>;
}
