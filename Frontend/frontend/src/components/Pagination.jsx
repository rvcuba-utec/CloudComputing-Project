import { ChevronLeft, ChevronRight } from 'lucide-react';

// Controles Anterior/Siguiente reutilizables. No se muestra si solo hay una página.
export default function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return <div className="pagination">
    <button disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16}/> Anterior</button>
    <span>Página {page} de {pages}</span>
    <button disabled={page >= pages} onClick={() => onChange(page + 1)}>Siguiente <ChevronRight size={16}/></button>
  </div>;
}
