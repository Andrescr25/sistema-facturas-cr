/**
 * Adaptador EPA (cr.epaenlinea.com) — Fase 3 de la estrategia de precios.
 * Expone GraphQL público (es una tienda Magento), sin autenticación,
 * confirmado en vivo durante la investigación de esta fase: 9.987
 * productos accesibles, robots.txt no restringe el catálogo.
 *
 * Usa `variables` de GraphQL (no interpolación de string) para el término
 * de búsqueda — evita cualquier problema de escape si un nombre de
 * producto trae comillas u otros caracteres especiales.
 */

const axios = require('axios');
const { USER_AGENT, TIMEOUT_MS, BloqueoDetectado } = require('./comun');

const URL_GRAPHQL = 'https://cr.epaenlinea.com/graphql';
const FUENTE = 'epa';

const URL_BASE = 'https://cr.epaenlinea.com';

const QUERY = `
  query BuscarProductos($texto: String!, $pageSize: Int!) {
    products(search: $texto, pageSize: $pageSize) {
      total_count
      items {
        name
        sku
        url_key
        small_image { url }
        price_range { minimum_price { final_price { value } } }
      }
    }
  }
`;

/**
 * @param {string} textoBusqueda
 * @param {number} pageSize
 * @returns {Promise<Array<{fuente:'epa', skuExterno:string, nombreExterno:string, precio:number, imagenUrl:string, urlProducto:string}>>}
 */
async function buscarEnEpa(textoBusqueda, pageSize = 5) {
  try {
    const res = await axios.post(
      URL_GRAPHQL,
      { query: QUERY, variables: { texto: textoBusqueda, pageSize } },
      { headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, timeout: TIMEOUT_MS }
    );

    const items = res.data?.data?.products?.items || [];
    return items
      .map(item => ({
        fuente: FUENTE,
        skuExterno: String(item.sku || ''),
        nombreExterno: item.name || '',
        precio: Number(item.price_range?.minimum_price?.final_price?.value) || 0,
        imagenUrl: item.small_image?.url || '',
        urlProducto: item.url_key ? `${URL_BASE}/${item.url_key}` : ''
      }))
      .filter(p => p.precio > 0 && p.skuExterno);
  } catch (error) {
    const status = error.response?.status;
    if (status === 403 || status === 429) throw new BloqueoDetectado(FUENTE, status);
    throw error;
  }
}

module.exports = { buscarEnEpa, FUENTE };
