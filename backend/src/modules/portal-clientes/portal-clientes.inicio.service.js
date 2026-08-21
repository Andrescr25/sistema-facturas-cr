/**
 * Portal de clientes - Portada personalizada
 *
 * Las mismas tres secciones que usa el agente en su tablet, pero para el
 * cliente que está en sesión: lo que más compra, lo que dejó de comprar y lo
 * que está en oferta.
 *
 * DIFERENCIA CLAVE CON EL CATÁLOGO DEL AGENTE
 * El agente se descarga el historial de TODOS los clientes, porque necesita
 * elegir a cuál está visitando. Acá eso sería una fuga: el cliente vería lo
 * que compran los demás. La consulta va filtrada por su contacto y ese
 * filtro sale del TOKEN (req.cliente.contacto), nunca de un parámetro que
 * pueda cambiar en la petición.
 *
 * El cálculo de "habitual" y "perdido" se hace en SQL y no reusando el
 * utils del frontend porque acá ya se tiene la base a mano: traer 120 filas
 * para clasificarlas en JavaScript sería un viaje de más por nada.
 */

const { query } = require('../../../config/database');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { mapaVigentes, aplicarDescuento } = require('../../utils/descuentosExceso');

// Mismos umbrales que catalogoAgentePersonalizacion.js, para que un producto
// no sea "habitual" en la tablet del agente y otra cosa en el portal.
const VECES_MIN_HABITUAL = 2;
const VECES_MIN_PERDIDO = 3;
const DIAS_MIN_PERDIDO = 60;
const TOPE_SECCION = 24; // el cliente navega en un teléfono, no en una tablet

const COLUMNAS = `alegra_id, name, reference, category, price, tax_percentage, image_url`;

/**
 * Compras del cliente, agregadas por producto.
 *
 * `veces` cuenta FACTURAS distintas, no líneas: si un producto aparece dos
 * veces en la misma factura eso no es comprar dos veces.
 */
const SQL_HISTORIAL = `
  WITH agregado AS (
    SELECT alegra_item_id,
           COUNT(DISTINCT alegra_invoice_id) AS veces,
           MAX(fecha_emision) AS ultima_compra
    FROM venta_historico
    WHERE cliente_id = $1
    GROUP BY alegra_item_id
  )
  SELECT a.alegra_item_id, a.veces, a.ultima_compra,
         (CURRENT_DATE - a.ultima_compra::date) AS dias
  FROM agregado a
  ORDER BY a.veces DESC, a.ultima_compra DESC
  LIMIT 200;
`;

function mapProducto(row, descuentos, extra = {}) {
  const precioLista = precioConImpuesto(row.price, row.tax_percentage);
  const descuento = descuentos.get(String(row.alegra_id)) || 0;
  return {
    id: row.alegra_id,
    nombre: row.name,
    referencia: row.reference || null,
    categoria: row.category || 'Sin categoría',
    precio: aplicarDescuento(precioLista, descuento),
    precioLista: descuento > 0 ? precioLista : null,
    descuento: descuento > 0 ? descuento : null,
    imagen: row.image_url || null,
    ...extra
  };
}

async function obtenerInicio(alegraContactId) {
  // Las compras del cliente y las ofertas vigentes no dependen entre sí, así
  // que se piden a la vez: en secuencia eran dos viajes a Supabase (~140ms
  // cada uno) para armar una pantalla que el cliente abre en el teléfono.
  const [historial, descuentos] = await Promise.all([
    query(SQL_HISTORIAL, [String(alegraContactId)]),
    mapaVigentes()
  ]);

  const habitualesIds = [];
  const perdidosIds = [];
  const porItem = new Map();

  for (const row of historial.rows) {
    const veces = Number(row.veces);
    const dias = Number(row.dias);
    porItem.set(String(row.alegra_item_id), { veces, dias, ultimaCompra: row.ultima_compra });

    // Un producto vive en UNA sola sección. "Perdido" gana sobre "habitual"
    // porque perdido implica habitual (veces >= 3 > 2), y mostrarlo en las
    // dos daría etiquetas que se contradicen.
    if (veces >= VECES_MIN_PERDIDO && dias > DIAS_MIN_PERDIDO) {
      perdidosIds.push(String(row.alegra_item_id));
    } else if (veces >= VECES_MIN_HABITUAL) {
      habitualesIds.push(String(row.alegra_item_id));
    }
  }

  const idsOferta = [...descuentos.keys()];
  const todosLosIds = [...new Set([...habitualesIds, ...perdidosIds, ...idsOferta])];

  if (todosLosIds.length === 0) {
    return { habituales: [], perdidos: [], ofertas: [] };
  }

  // Una sola consulta para las tres secciones: los productos se filtran
  // después en memoria. Tres consultas contra la misma tabla, con el mismo
  // filtro de visibilidad, no aportan nada.
  const productos = await query(`
    SELECT ${COLUMNAS} FROM alegra_products_cache
    WHERE alegra_id = ANY($1::varchar[])
      AND status = 'active' AND hidden_locally = FALSE AND price > 0;
  `, [todosLosIds]);

  const porId = new Map(productos.rows.map(p => [String(p.alegra_id), p]));

  const armar = (ids, ordenar) => ids
    .map(id => {
      const row = porId.get(id);
      if (!row) return null; // dado de baja u oculto desde que lo compró
      const h = porItem.get(id);
      return mapProducto(row, descuentos, {
        veces: h?.veces ?? null,
        dias: h?.dias ?? null,
        ultimaCompra: h?.ultimaCompra ?? null
      });
    })
    .filter(Boolean)
    .sort(ordenar)
    .slice(0, TOPE_SECCION);

  return {
    // Lo que más compra: primero lo más frecuente y reciente.
    habituales: armar(habitualesIds, (a, b) => (b.veces - a.veces) || (a.dias - b.dias)),
    // Lo que dejó de comprar: primero lo que más compraba.
    perdidos: armar(perdidosIds, (a, b) => (b.veces - a.veces) || (b.dias - a.dias)),
    // En oferta: primero el descuento más grande.
    ofertas: armar(idsOferta, (a, b) => (b.descuento || 0) - (a.descuento || 0))
  };
}

module.exports = { obtenerInicio, VECES_MIN_HABITUAL, VECES_MIN_PERDIDO, DIAS_MIN_PERDIDO };
