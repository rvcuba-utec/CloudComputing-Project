import { NavLink, Link } from 'react-router-dom';
import { ArrowUpRight, UserRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
export default function Navbar() {
  const { user } = useAuth();
  return <><div className="topline"><div className="container">Tecnología que va contigo.<span>CloudShop / Perú</span></div></div><header><div className="container nav"><Link className="brand" to="/" aria-label="CloudShop, inicio">cloudshop<span>↗</span></Link><nav aria-label="Navegación principal"><NavLink to="/productos">Productos</NavLink><NavLink to={user ? '/perfil' : '/login'}><UserRound size={17}/><span>{user ? 'Mi cuenta' : 'Iniciar sesión'}</span><ArrowUpRight size={14}/></NavLink></nav></div></header></>;
}
