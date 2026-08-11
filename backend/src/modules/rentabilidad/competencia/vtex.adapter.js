/**
 * Adaptador VTEX — Fase 3 de la estrategia de precios. Sirve tanto a
 * Walmart CR (www.walmart.co.cr) como a Mas x Menos (www.masxmenos.cr):
 * ambos corren sobre la misma plataforma VTEX con la misma API pública de
 * catálogo, confirmado en vivo durante la investigación — solo cambia el
 * dominio. robots.txt de ambos solo bloquea cuenta/checkout, no el catálogo.
 */

const axios = require('axios');
const { USER_AGENT, TIMEOUT_MS, BloqueoDetectado } = require('./comun');

/**
 * @param {string} dominio - ej. 'www.walmart.co.cr' o 'www.masxmenos.cr'
 * @param {string} fuente - ej. 'walmart' o 'masxmenos' (para etiquetar los resultados)
 * @param {string} textoBusqueda
 * @param {number} limite
 * @returns {Promise<Array<{fuente:string, skuExterno:string, nombreExterno:string, precio:number, imagenUrl:string, urlProducto:string}>>}
 */
async function buscarEnVtex(dominio, fuente, textoBusqueda, limite = 5) {
  const url = `https://${dominio}/api/catalog_system/pub/products/search`;

  try {
    const res = await axios.get(url, {
      params: { ft: textoBusqueda, _from: 0, _to: Math.max(limite - 1, 0) },
      headers: { 'User-Agent': USER_AGENT },
      timeout: TIMEOUT_MS,
      // OJO: el serializador de params por defecto de axios codifica el
      // espacio como "+" — el WAF de VTEX responde 400 "Scripts are not
      // allowed!" ante un "+" en el query string (confirmado en vivo),
      // pero acepta "%20" sin problema. encodeURIComponent da "%20".
      paramsSerializer: { encode: encodeURIComponent },
      // VTEX responde 206 (contenido parcial) por diseño en /search — no es un error.
      validateStatus: status => status === 200 || status === 206
    });

    const productos = Array.isArray(res.data) ? res.data : [];
    return productos
      .map(p => {
        const item = p.items?.[0];
        const oferta = item?.sellers?.[0]?.commertialOffer;
        return {
          fuente,
          skuExterno: String(p.productId || item?.itemId || ''),
          nombreExterno: p.productName || '',
          precio: Number(oferta?.Price) || 0,
          imagenUrl: item?.images?.[0]?.imageUrl || '',
          urlProducto: p.link || ''
        };
      })
      .filter(p => p.precio > 0 && p.skuExterno);
  } catch (error) {
    const status = error.response?.status;
    if (status === 403 || status === 429) throw new BloqueoDetectado(fuente, status);
    throw error;
  }
}

module.exports = { buscarEnVtex };
