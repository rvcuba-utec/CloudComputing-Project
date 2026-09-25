// Caché de lectura del frontend. Vive en memoria (rápido) y se respalda en
// sessionStorage para sobrevivir recargas dentro de la misma pestaña; se limpia
// al cerrar la pestaña. No toca el backend: solo memoiza respuestas de lectura
// con un TTL e invalidación por prefijo cuando ocurre una escritura.

const PREFIX = 'cs:cache:';
const DEFAULT_TTL = 60 * 1000; // 1 minuto
const memoria = new Map();

const ahora = () => Date.now();

function leerSession(clave) {
  try {
    const raw = sessionStorage.getItem(PREFIX + clave);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function escribirSession(clave, entrada) {
  // Modo privado o cuota agotada: la caché sigue viva en memoria.
  try { sessionStorage.setItem(PREFIX + clave, JSON.stringify(entrada)); } catch { /* ignore */ }
}

function borrar(clave) {
  memoria.delete(clave);
  try { sessionStorage.removeItem(PREFIX + clave); } catch { /* ignore */ }
}

function obtenerEntrada(clave) {
  let entrada = memoria.get(clave);
  if (!entrada) {
    entrada = leerSession(clave);
    if (entrada) memoria.set(clave, entrada);
  }
  if (!entrada) return null;
  if (entrada.expira <= ahora()) { borrar(clave); return null; }
  return entrada;
}

// Copia la entrada almacenada para que quien la consuma no mute la caché.
function copiar(valor) {
  if (valor == null || typeof valor !== 'object') return valor;
  if (typeof structuredClone === 'function') return structuredClone(valor);
  return JSON.parse(JSON.stringify(valor));
}

// Read-through: devuelve el valor cacheado si sigue fresco; si no, ejecuta el
// loader, lo guarda y lo devuelve. Nunca cachea rechazos.
export async function cached(clave, loader, { ttl = DEFAULT_TTL } = {}) {
  const hit = obtenerEntrada(clave);
  if (hit) return copiar(hit.valor);
  const valor = await loader();
  const entrada = { valor, expira: ahora() + ttl };
  memoria.set(clave, entrada);
  escribirSession(clave, entrada);
  return copiar(valor);
}

// Invalida todas las claves cuyo nombre empiece por `prefijo` (o toda la caché
// si se llama sin argumentos).
export function invalidate(prefijo = '') {
  for (const clave of [...memoria.keys()]) {
    if (clave.startsWith(prefijo)) borrar(clave);
  }
  // También limpia entradas que solo estén en sessionStorage (otra recarga/pestaña).
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const full = sessionStorage.key(i);
      if (full?.startsWith(PREFIX) && full.slice(PREFIX.length).startsWith(prefijo)) {
        sessionStorage.removeItem(full);
      }
    }
  } catch { /* ignore */ }
}

// Vacía toda la caché (p. ej. al cerrar sesión).
export function clearCache() { invalidate(''); }
