/**
 * Emparejamiento de capturas de competencia contra el catálogo propio.
 * Corre aparte de la captura (sincronizador.js / importadorManual.js) a
 * propósito: sea cual sea el origen de la captura (búsqueda automática o
 * import manual), el criterio para decidir "esto es el mismo producto" es
 * uno solo — comparar el nombre externo contra TODO el catálogo activo,
 * no solo contra el producto que originó la búsqueda (una importación
 * manual no tiene "el producto que originó la búsqueda").
 *
 * A propósito NO auto-confirma ningún match, a diferencia del
 * auto-relacionado de proveedores (emailService.js, umbral 80). Probando
 * contra datos reales de Walmart/EPA, un 100% de score no garantizó nada:
 * "DESINFECTANTE EN GALON" empató con la primera marca de desinfectante
 * que apareciera, y nombres cortos como "ACEITE 3 EN 1 MD" llegaron a
 * matchear con "Aromatizante Glade" (mismo bug ya corregido en
 * matcher.js, pero deja claro que un score alto no reemplaza que una
 * persona mire el par antes de que alimente un techo de precio.
 */

const { query } = require('../../../../config/database');
const { calcularScoreSimilitud, UMBRAL_SUGERENCIA } = require('../../precios/matcher');

/**
 * Recorre las capturas sin mapping confirmado ni rechazado y calcula el
 * mejor producto propio candidato para cada una. Todo lo que llegue al
 * umbral de sugerencia queda para revisión humana — nada se aplica solo.
 */
async function emparejarPendientes() {
  const [capturas, catalogo, confirmados, rechazados] = await Promise.all([
    query(`
      SELECT DISTINCT ON (fuente, sku_externo) fuente, sku_externo, nombre_externo, precio,
             imagen_url, url_producto
      FROM precio_competencia
      ORDER BY fuente, sku_externo, fecha_captura DESC
    `),
    query(`
      SELECT alegra_id AS "alegraItemId", name AS nombre, image_url AS "imagenUrl",
             price AS precio, category AS categoria
      FROM alegra_products_cache WHERE status = 'active'
    `),
    query(`SELECT fuente, sku_externo FROM competencia_mapping`),
    query(`SELECT fuente, sku_externo FROM competencia_rechazo`)
  ]);

  const yaResuelto = new Set([
    ...confirmados.rows.map(r => `${r.fuente}::${r.sku_externo}`),
    ...rechazados.rows.map(r => `${r.fuente}::${r.sku_externo}`)
  ]);

  const pendientes = capturas.rows.filter(c => !yaResuelto.has(`${c.fuente}::${c.sku_externo}`));

  const sugerencias = [];

  for (const captura of pendientes) {
    let mejor = null;
    for (const producto of catalogo.rows) {
      const score = calcularScoreSimilitud(producto.nombre, captura.nombre_externo);
      if (score >= UMBRAL_SUGERENCIA && (!mejor || score > mejor.score)) {
        mejor = {
          alegraItemId: producto.alegraItemId,
          nombre: producto.nombre,
          imagenUrl: producto.imagenUrl || '',
          precio: Number(producto.precio) || 0,
          categoria: producto.categoria || '',
          score
        };
      }
    }
    if (!mejor) continue;

    sugerencias.push({
      fuente: captura.fuente,
      skuExterno: captura.sku_externo,
      nombreExterno: captura.nombre_externo,
      precio: Number(captura.precio),
      imagenUrl: captura.imagen_url || '',
      urlProducto: captura.url_producto || '',
      sugerido: mejor
    });
  }

  sugerencias.sort((a, b) => b.sugerido.score - a.sugerido.score);
  return { sugerencias };
}

module.exports = { emparejarPendientes };
