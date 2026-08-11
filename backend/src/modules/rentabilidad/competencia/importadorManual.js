/**
 * Import manual de precios de competencia — cubre Pequeño Mundo (bloqueado
 * por Cloudflare, no se evade) y mayoristas (no publican precios en
 * ningún lado). Mismo flujo de captura que las fuentes automáticas; el
 * emparejamiento contra el catálogo propio corre aparte (emparejador.js).
 */

const { normalizar } = require('../../precios/matcher');
const { guardarCaptura } = require('./sincronizador');

function generarSkuManual(nombre) {
  return normalizar(nombre).replace(/\s+/g, '-').slice(0, 140) || 'sin-nombre';
}

/**
 * @param {string} fuente - identifica de dónde salió la lista (ej. 'pequeno_mundo', 'mayorista_x')
 * @param {Array<{nombre:string, precio:number|string, imagenUrl?:string}>} filas
 *        imagenUrl es opcional — las listas de mayorista rara vez la traen,
 *        pero si el usuario la tiene sirve para comparar contra la foto del
 *        producto propio igual que en las fuentes automáticas.
 */
async function importarManual(fuente, filas) {
  let guardadas = 0;
  for (const fila of filas || []) {
    const nombre = (fila.nombre || '').trim();
    const precio = Number(fila.precio) || 0;
    if (!nombre || precio <= 0) continue;

    await guardarCaptura({
      fuente,
      skuExterno: generarSkuManual(nombre),
      nombreExterno: nombre,
      precio,
      imagenUrl: (fila.imagenUrl || '').trim()
    });
    guardadas++;
  }
  return { guardadas, total: (filas || []).length };
}

module.exports = { importarManual, generarSkuManual };
