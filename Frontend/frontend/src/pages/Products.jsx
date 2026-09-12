import { useCallback, useEffect, useState } from 'react';
import { Search, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFetch } from '../hooks/useFetch';
import { productService } from '../services/productService';
import ProductCard from '../components/ProductCard';
import RequestState from '../components/RequestState';

export default function Products() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState('default');
  const [available, setAvailable] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesRequest = useFetch(productService.categories);
  const categories = categoriesRequest.data || [];

  const loadProducts = useCallback(() => productService.list({ q: query, categoria_id: categoryId, page }), [query, categoryId, page]);
  const request = useFetch(loadProducts, `${query}|${categoryId}|${page}`);

  const items = (request.data?.data || [])
    .filter(p => !available || p.stock > 0)
    .sort((a, b) => sort === 'asc' ? a.precio - b.precio : sort === 'desc' ? b.precio - a.precio : 0);

  const total = request.data?.total ?? 0;
  const pages = request.data?.pages ?? 1;

  function selectCategory(id) { setCategoryId(id); setPage(1); }

  return <main className="container">
    <section className="intro"><div><p className="eyebrow">TU PRÓXIMO UPGRADE</p><h1>Lo que necesitas.<br/><span>Sin dar tantas vueltas.</span></h1><p>Encuentra tecnología para trabajar, estudiar<br className="desktop-break"/> y disfrutar a tu manera.</p></div><a className="intro-link" href="#catalogo">Explora el catálogo <ArrowDown size={18}/></a></section>
    <section id="catalogo" className="catalog">
      <div className="catalog-heading"><h2>Elige tu próximo equipo</h2><label className="search"><Search size={19}/><input aria-label="Buscar productos" placeholder="¿Qué estás buscando?" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
      <div className="filters">
        <div className="categories" aria-label="Categorías">
          <button aria-pressed={categoryId === ''} className={categoryId === '' ? 'selected' : ''} onClick={() => selectCategory('')}>Todos</button>
          {categories.map(c => <button key={c.id} aria-pressed={categoryId === String(c.id)} className={categoryId === String(c.id) ? 'selected' : ''} onClick={() => selectCategory(String(c.id))}>{c.nombre}</button>)}
        </div>
        <label className="sort">Ordenar por <select aria-label="Ordenar productos" value={sort} onChange={e => setSort(e.target.value)}><option value="default">Destacados</option><option value="asc">Menor precio</option><option value="desc">Mayor precio</option></select></label>
      </div>
      <div className="results"><span aria-live="polite">{total} productos</span><label><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)}/> Solo disponibles</label></div>
      <RequestState {...request}/>
      {!request.loading && !request.error && (items.length ? <div className="product-grid">{items.map(p => <ProductCard key={p.id} product={p}/>)}</div> : <div className="notice"><h3>No encontramos productos</h3><p>Prueba con otra búsqueda o categoría.</p><button onClick={() => { setSearch(''); setQuery(''); setCategoryId(''); setAvailable(false); }}>Limpiar filtros</button></div>)}
      {!request.loading && !request.error && items.length > 0 && pages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16}/> Anterior</button><span>Página {page} de {pages}</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Siguiente <ChevronRight size={16}/></button></div>}
    </section>
  </main>;
}
