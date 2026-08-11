/**
 * Orquesta la búsqueda de precios de competencia por producto propio contra
 * las 3 fuentes automáticas (EPA, Walmart CR, Mas x Menos). Solo captura —
 * el emparejamiento contra el catálogo propio corre aparte, ver
 * emparejador.js, con el mismo criterio sin importar si la captura vino de
 * acá o de una importación manual.
 */

const { query } = require('../../../../config/database');
const { buscarEnEpa } = require('./epa.adapter');
const { buscarEnVtex } = require('./vtex.adapter');
const { esperar, BloqueoDetectado } = require('./comun');

const FUENTES = [
  { fuente: 'epa', buscar: (texto) => buscarEnEpa(texto, 5) },
  { fuente: 'walmart', buscar: (texto) => buscarEnVtex('www.walmart.co.cr', 'walmart', texto, 5) },
  { fuente: 'masxmenos', buscar: (texto) => buscarEnVtex('www.masxmenos.cr', 'masxmenos', texto, 5) }
];

async function guardarCaptura({ fuente, skuExterno, nombreExterno, precio, imagenUrl, urlProducto }) {
  if (!fuente || !skuExterno || !precio) return;
  await query(`
    INSERT INTO precio_competencia (fuente, sku_externo, nombre_externo, precio, imagen_url, url_producto, fecha_captura)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
    ON CONFLICT (fuente, sku_externo, fecha_captura) DO UPDATE SET
      nombre_externo = EXCLUDED.nombre_externo,
      precio = EXCLUDED.precio,
      -- No pisar una imagen que ya teníamos con un vacío: si una captura
      -- posterior viene sin foto (la fuente la quitó, o es import manual),
      -- la que ya estaba sigue sirviendo para comparar.
      imagen_url = COALESCE(NULLIF(EXCLUDED.imagen_url, ''), precio_competencia.imagen_url),
      url_producto = COALESCE(NULLIF(EXCLUDED.url_producto, ''), precio_competencia.url_producto)
  `, [fuente, skuExterno, nombreExterno, precio, imagenUrl || '', urlProducto || '']);
}

/**
 * @param {Array<{alegraItemId:string, nombre:string}>} productos
 * @param {{onProgreso?: (procesados:number, total:number) => void}} opciones
 */
async function sincronizarLote(productos, { onProgreso } = {}) {
  const resumen = { procesados: 0, capturas: 0, bloqueos: [] };
  const fuentesActivas = new Set(FUENTES.map(f => f.fuente));

  for (const producto of productos) {
    for (const { fuente, buscar } of FUENTES) {
      if (!fuentesActivas.has(fuente)) continue;

      try {
        const candidatos = await buscar(producto.nombre);
        for (const candidato of candidatos) await guardarCaptura(candidato);
        resumen.capturas += candidatos.length;
      } catch (error) {
        if (error instanceof BloqueoDetectado) {
          console.warn(`⚠️ ${error.message}`);
          fuentesActivas.delete(fuente);
          resumen.bloqueos.push({ fuente, status: error.status });
        } else {
          console.warn(`⚠️ Error buscando "${producto.nombre}" en ${fuente}: ${error.message}`);
        }
      }

      await esperar();
    }

    resumen.procesados++;
    if (onProgreso) onProgreso(resumen.procesados, productos.length);
  }

  return resumen;
}

module.exports = { sincronizarLote, guardarCaptura, FUENTES };
