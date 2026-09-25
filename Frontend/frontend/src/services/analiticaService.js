import { api } from './api';
import { cached } from './cache';

export const analiticaService = {
  async consultar(nombre) {
    // Las consultas de analítica son costosas (hasta 45s), así que se cachean unos
    // minutos para no repetirlas al volver a abrir el panel.
    return cached(`analitica:${nombre}`, async () => {
      const respuesta = await api(`/analitica/${nombre}`, { timeoutMs: 45000 });
      if (!Array.isArray(respuesta?.data)) {
        throw new Error('La respuesta de analítica no contiene una lista de resultados.');
      }
      return respuesta.data;
    }, { ttl: 5 * 60 * 1000 });
  },
};
