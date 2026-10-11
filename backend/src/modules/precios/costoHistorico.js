/**
 * Mantenimiento incremental de costo_historico.
 *
 * Hasta ahora esa tabla solo la escribía scripts/backfill-costo-historico.js,
 * a mano. Dos consecuencias medidas en producción:
 *
 *   1. Los costos envejecían en silencio. El tablero de rentabilidad y el
 *      motor de precios sugerían sobre la foto del último backfill, sin
 *      ninguna señal de que el dato tuviera meses.
 *   2. Nada limpiaba las filas cuando se deshacía o se cambiaba una relación,
 *      así que quedaban costos de productos ajenos apuntando al producto
 *      equivocado (EXTENSION CTE BLANCA mostraba ₡3.740 por una línea de
 *      "EXTESION ELECTRICA 4.5 MTRS" de otro proveedor).
 *
 * Este módulo se llama en cada punto donde una línea de factura cambia de
 * relación. Es idempotente y arregla las dos direcciones: si la línea quedó
 * válida la inserta o actualiza, y si dejó de serlo la borra. Llamarlo dos
 * veces con los mismos ids deja el mismo resultado.
 *
 * LA FILA NACE CON SU `producto_id`, QUE ES EL DE LA LÍNEA. Quien lee el
 * costo (precios/costoDerivado.js) lo busca por el id propio. Hasta el
 * 2026-10-03 este INSERT no lo escribía: la migración 005 lo había rellenado
 * una vez y toda compra posterior quedaba sin él, o sea fuera del costo del
 * producto.
 *
 * El producto de la línea es `productos_factura_proveedor.producto_id`
 * (migración 038). Antes hacía falta que la línea tuviera un id de Alegra: la
 * compra de un producto creado en el sistema no dejaba costo. El id de Alegra
 * se sigue guardando al lado, cuando existe, solo como referencia.
 */

const prisma = require('../../../lib/prisma');
const { query } = require('../../../config/database');
const { calcularCostoUnitarioPropio } = require('./costo');

/**
 * Sincroniza costo_historico para líneas de factura concretas.
 *
 * @param {string[]} productoFacturaIds
 * @returns {Promise<{registradas: number, eliminadas: number}>}
 */
async function sincronizarCostoDeLineas(productoFacturaIds) {
  const ids = [...new Set((productoFacturaIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return { registradas: 0, eliminadas: 0 };

  const lineas = await prisma.productoFactura.findMany({
    where: { id: { in: ids } },
    include: {
      factura: { select: { fechaEmision: true, proveedorNombre: true, proveedorCedula: true } },
      mapeo: { select: { factorConversion: true } }
    }
  });

  // El producto PROPIO de cada línea. Prisma no conoce esa columna (no se
  // regenera el cliente: ver relacionPropia.js), así que se lee aparte.
  const propios = lineas.length > 0
    ? await query('SELECT id, producto_id FROM productos_factura_proveedor WHERE id = ANY($1::uuid[])', [lineas.map(l => l.id)])
    : { rows: [] };
  const productoDeLinea = new Map(propios.rows.map(r => [r.id, r.producto_id]));

  const filas = [];
  const aBorrar = [];

  for (const l of lineas) {
    const productoId = productoDeLinea.get(l.id) || null;
    // Mismas condiciones que usa la lectura (ver costoDerivado.js): solo
    // cuenta una línea confirmada, con producto, precio y fecha.
    const valida = l.estadoRelacionado === 'RELACIONADO'
      && productoId
      && Number(l.precioUnitario) > 0
      && l.factura?.fechaEmision;

    if (!valida) { aBorrar.push(l.id); continue; }

    const { costoUnitario, factor } = calcularCostoUnitarioPropio(l, l.mapeo?.factorConversion);
    if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) { aBorrar.push(l.id); continue; }

    filas.push([
      l.alegraItemId || null,
      productoId,
      l.id,
      l.factura.proveedorCedula || null,
      l.factura.proveedorNombre || null,
      l.factura.fechaEmision.toISOString().slice(0, 10),
      Math.round(costoUnitario * 10000) / 10000,
      factor,
      'factura_proveedor'
    ]);
  }

  // Las líneas que ya no califican se borran SIEMPRE, incluso las que ni
  // siquiera existen ya: es lo que hace que cambiar una relación no deje el
  // costo viejo apuntando al producto anterior.
  const idsSinFila = ids.filter(id => !filas.some(f => String(f[2]) === id));
  const todosABorrar = [...new Set([...aBorrar.map(String), ...idsSinFila])];

  let eliminadas = 0;
  if (todosABorrar.length > 0) {
    const res = await query(
      `DELETE FROM costo_historico WHERE producto_factura_id = ANY($1::uuid[])`,
      [todosABorrar]
    );
    eliminadas = res.rowCount || 0;
  }

  if (filas.length > 0) {
    const COLUMNAS = 9;
    const placeholders = filas
      .map((_, idx) => `(${Array.from({ length: COLUMNAS }, (_, c) => `$${idx * COLUMNAS + c + 1}`).join(', ')})`)
      .join(', ');

    await query(`
      INSERT INTO costo_historico
        (alegra_item_id, producto_id, producto_factura_id, proveedor_cedula, proveedor_nombre, fecha, costo_unitario, factor_conversion, origen)
      SELECT v.alegra_item_id, v.producto_id::int, v.producto_factura_id::uuid, v.proveedor_cedula, v.proveedor_nombre,
             v.fecha::date, v.costo_unitario::numeric, v.factor_conversion::numeric, v.origen
        FROM (VALUES ${placeholders})
             AS v(alegra_item_id, producto_id, producto_factura_id, proveedor_cedula, proveedor_nombre, fecha, costo_unitario, factor_conversion, origen)
      ON CONFLICT (producto_factura_id) DO UPDATE SET
        alegra_item_id = EXCLUDED.alegra_item_id,
        producto_id = EXCLUDED.producto_id,
        proveedor_cedula = EXCLUDED.proveedor_cedula,
        proveedor_nombre = EXCLUDED.proveedor_nombre,
        fecha = EXCLUDED.fecha,
        costo_unitario = EXCLUDED.costo_unitario,
        factor_conversion = EXCLUDED.factor_conversion;
    `, filas.flat());
  }

  return { registradas: filas.length, eliminadas };
}

/** Todas las líneas de una factura de proveedor. */
async function sincronizarCostoDeFactura(facturaId) {
  if (!facturaId) return { registradas: 0, eliminadas: 0 };
  const lineas = await prisma.productoFactura.findMany({
    where: { facturaId: String(facturaId) },
    select: { id: true }
  });
  return sincronizarCostoDeLineas(lineas.map(l => l.id));
}

/** Todas las líneas atadas a un mapeo (al cambiar su producto o su factor). */
async function sincronizarCostoDeMapeo(mapeoId) {
  if (!mapeoId) return { registradas: 0, eliminadas: 0 };
  const lineas = await prisma.productoFactura.findMany({
    where: { mapeoId: String(mapeoId) },
    select: { id: true }
  });
  return sincronizarCostoDeLineas(lineas.map(l => l.id));
}

module.exports = {
  sincronizarCostoDeLineas,
  sincronizarCostoDeFactura,
  sincronizarCostoDeMapeo
};
