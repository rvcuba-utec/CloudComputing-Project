export default function RequestState({ loading, error, retry }) {
  if (loading) return <div className="notice" role="status">Cargando…</div>;
  if (error) return <div className="notice error" role="alert"><p>{error}</p><button onClick={retry}>Volver a intentar</button></div>;
  return null;
}
