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
 * que compran los demás. La consulta se filtra por la ficha propia que el
 * middleware resuelve desde la cuenta del token (req.cliente.clienteId),
 * nunca de un parámetro que pueda cambiar en la petición.
 *
 * El cálculo de "habitual" y "perdido" se hace en SQL y no reusando el
 * utils del frontend porque acá ya se tiene la base a mano: traer 120 filas
 * para clasificarlas en JavaScript sería un viaje de más por nada.
 *
 * Los productos salen de `producto`, con la misma definición que el catálogo
 * y el carrito (ver catalogo-clientes/consultaProducto).
 */

const { query } = require('../../../config/database');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');
const { COLUMNAS, DESDE, VISIBLE, mapProducto } = require('../catalogo-clientes/consultaProducto');
const { HOY_CR } = require('../ventas/rotacion');

// Mismos umbrales que catalogoAgentePersonalizacion.js, para que un producto
// no sea "habitual" en la tablet del agente y otra cosa en el portal.
const VECES_MIN_HABITUAL = 2;
const VECES_MIN_PERDIDO = 3;
const DIAS_MIN_PERDIDO = 60;
const TOPE_SECCION = 24; // el cliente navega en un teléfono, no en una tablet

// FACTURACIÓN PIDE MÁS (2026-10-28, el usuario: «que me recomiende más productos
// que el cliente lleva»). Con `ampliado` se devuelven más productos por lista y
// una lista nueva: `ocasionales`, lo que el cliente compró UNA sola vez en el
// último año. Hoy un producto comprado una vez no es «habitual» de nadie, y 44
// de 236 clientes se quedaban sin ninguna sugerencia (medido). El portal no
// pide `ampliado`: su respuesta y sus topes no cambian.
const TOPES_AMPLIADO = { habituales: 40, perdidos: 20, ocasionales: 30 };
const DIAS_MAX_OCASIONAL = 365; // una compra de hace años no es lo que «lleva»
const LIMITE_HISTORIAL = 200;
const LIMITE_HISTORIAL_AMPLIADO = 500; // las compras de una vez van al final del orden

/**
 * Compras del cliente, agregadas por producto.
 *
 * `veces` cuenta FACTURAS distintas, no líneas: si un producto aparece dos
 * veces en la misma factura eso no es comprar dos veces.
 */
// Ventas de la ficha propia del cliente, filtrada desde su sesión.
const SQL_HISTORIAL = `
  WITH agregado AS (
    SELECT v.producto_id,
           COUNT(DISTINCT v.factura_id) AS veces,
           MAX(v.fecha) AS ultima_compra
    FROM venta_linea v
    WHERE v.cliente_id = $1
    GROUP BY v.producto_id
  )
  SELECT a.producto_id, a.veces, a.ultima_compra,
         (${HOY_CR} - a.ultima_compra) AS dias
  FROM agregado a
  ORDER BY a.veces DESC, a.ultima_compra DESC
  LIMIT $2;
`;

/**
 * @param {number|string} clienteId
 * @param {{ ampliado?: boolean }} [opciones]  `ampliado`: más por lista y la lista
 *   `ocasionales` (solo Facturación; el portal y el agente no lo piden).
 */
async function obtenerInicio(clienteId, { ampliado = false } = {}) {
  // Las compras del cliente y las ofertas vigentes no dependen entre sí, así
  // que se piden a la vez: en secuencia eran dos viajes a Supabase (~140ms
  // cada uno) para armar una pantalla que el cliente abre en el teléfono.
  const [historial, descuentos] = await Promise.all([
    query(SQL_HISTORIAL, [Number(clienteId), ampliado ? LIMITE_HISTORIAL_AMPLIADO : LIMITE_HISTORIAL]),
    mapaVigentesPropios()
  ]);

  const habitualesIds = [];
  const perdidosIds = [];
  const ocasionalesIds = [];
  const porItem = new Map();

  for (const row of historial.rows) {
    const veces = Number(row.veces);
    const dias = Number(row.dias);
    porItem.set(String(row.producto_id), { veces, dias, ultimaCompra: row.ultima_compra });

    // Un producto vive en UNA sola sección. "Perdido" gana sobre "habitual"
    // porque perdido implica habitual (veces >= 3 > 2), y mostrarlo en las
    // dos daría etiquetas que se contradicen.
    if (veces >= VECES_MIN_PERDIDO && dias > DIAS_MIN_PERDIDO) {
      perdidosIds.push(String(row.producto_id));
    } else if (veces >= VECES_MIN_HABITUAL) {
      habitualesIds.push(String(row.producto_id));
    } else if (ampliado && dias <= DIAS_MAX_OCASIONAL) {
      // Una sola compra, reciente: no es un hábito, pero sí algo que ya llevó.
      ocasionalesIds.push(String(row.producto_id));
    }
  }

  const idsOferta = [...descuentos.keys()];
  const todosLosIds = [...new Set([...habitualesIds, ...perdidosIds, ...ocasionalesIds, ...idsOferta])];

  if (todosLosIds.length === 0) {
    return { habituales: [], perdidos: [], ofertas: [], ...(ampliado ? { ocasionales: [] } : {}) };
  }

  // Una sola consulta para las tres secciones: los productos se filtran
  // después en memoria. Tres consultas contra la misma tabla, con el mismo
  // filtro de visibilidad, no aportan nada.
  const productos = await query(`
    SELECT ${COLUMNAS} ${DESDE}
    WHERE p.id = ANY($1::int[]) AND ${VISIBLE};
  `, [todosLosIds]);

  const porId = new Map(productos.rows.map(p => [String(p.producto_id), p]));

  const armar = (ids, ordenar, tope = TOPE_SECCION) => ids
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
    .slice(0, tope);

  const topes = ampliado ? TOPES_AMPLIADO : { habituales: TOPE_SECCION, perdidos: TOPE_SECCION };
  return {
    // Lo que más compra: primero lo más frecuente y reciente.
    habituales: armar(habitualesIds, (a, b) => (b.veces - a.veces) || (a.dias - b.dias), topes.habituales),
    // Lo que dejó de comprar: primero lo que más compraba.
    perdidos: armar(perdidosIds, (a, b) => (b.veces - a.veces) || (b.dias - a.dias), topes.perdidos),
    // En oferta: primero el descuento más grande.
    ofertas: armar(idsOferta, (a, b) => (b.descuento || 0) - (a.descuento || 0)),
    // Lo que llevó una sola vez este último año: primero lo más reciente.
    ...(ampliado ? { ocasionales: armar(ocasionalesIds, (a, b) => a.dias - b.dias, topes.ocasionales) } : {})
  };
}

module.exports = { obtenerInicio, VECES_MIN_HABITUAL, VECES_MIN_PERDIDO, DIAS_MIN_PERDIDO, DIAS_MAX_OCASIONAL };
