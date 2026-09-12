import { useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return <><a className="skip-link" href="#content">Saltar al contenido</a><Navbar/><div id="content" tabIndex={-1}><Routes><Route path="/" element={<Navigate to="/productos" replace/>}/><Route path="/productos" element={<Products/>}/><Route path="/productos/:id" element={<ProductDetail/>}/><Route path="/login" element={user ? <Navigate to="/perfil" replace/> : <Login/>}/><Route path="/registro" element={user ? <Navigate to="/perfil" replace/> : <Register/>}/><Route path="/perfil" element={user ? <Profile/> : <Navigate to="/login" replace/>}/><Route path="*" element={<main className="container page"><h1>Esta página no existe.</h1><Link to="/productos">Volver al catálogo</Link></main>}/></Routes></div><footer className="container"><Link className="brand" to="/">cloudshop<span>↗</span></Link><p>Tecnología para tu día a día.</p><span>© 2026 CloudShop</span></footer></>;
}
