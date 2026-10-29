/**
 * Leer y anotar las cuentas por pagar con `pg`, NO con Prisma.
 *
 * POR QUÉ NO PRISMA (2026-10-29). El cliente generado declara `facturaId`
 * obligatorio, y esta rama no lo regenera ([[bloqueo/prisma-no-se-regenera]]).
 * La factura de compra cargada a mano a crédito (`crearCuentaACredito`) no
 * tiene factura del buzón, así que su cuenta guarda `factura_id` NULL — y
 * Prisma valida cada fila que LEE: una sola con NULL hizo fallar la lista
 * entera (P2032 «Error converting field "facturaId"…») y Pagos a Proveedores
 * respondió 500 desde que se cargó la primera. Es el mismo caso de
 * docs/grafo/leccion/el-doble-de-prisma-no-valida-tipos.md.
 *
 * Con `pg` una cuenta sin factura es una fila más: `facturaId` va null, sin
 * productos, y el número que se muestra es el de la propia cuenta.
 *
 * Devuelve la misma forma que daba Prisma (`prepararSalida` del servicio la
 * consume sin cambios): las fechas son el mismo instante —las columnas son
 * `timestamp` sin zona que Prisma lee como UTC, y acá se pide igual— y los
 * números llegan como número, no como texto.
 */
const { query } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCTOS_POR_FACTURA = 50;

const comodin = (valor) => `%${String(valor).replace(/[\\%_]/g, '\\$&')}%`;

/**
 * El proveedor y la búsqueda de texto: lo que no depende del saldo. El estado
 * NO está acá: sale de la vista `cuenta_por_pagar_saldo` (`idsPorEstado`), no
 * de la columna `estado`, que se queda vieja.
 * @returns {{ donde: string[], params: any[] }}
 */
function condicionesDeBusqueda({ proveedor, search } = {}) {
  const donde = [];
  const params = [];
  const parametro = (valor) => { params.push(valor); return `$${params.length}`; };

  if (proveedor && proveedor !== 'todos') {
    const exacto = parametro(proveedor);
    const parecido = parametro(comodin(proveedor));
    donde.push(`(c.proveedor_cedula = ${exacto} OR c.proveedor_nombre ILIKE ${parecido})`);
  }
  if (search) {
    const parecido = parametro(comodin(search));
    donde.push(`(c.numero_consecutivo ILIKE ${parecido} OR c.proveedor_nombre ILIKE ${parecido} OR c.proveedor_cedula ILIKE ${parecido})`);
  }
  return { donde, params };
}

/** Hasta 50 líneas por factura, en el orden de la factura. */
async function productosPorFactura(facturaIds) {
  const porFactura = new Map();
  if (facturaIds.length === 0) return porFactura;
  const { rows } = await query(
    `SELECT * FROM (
       SELECT p.id, p.factura_id, p.descripcion, p.cantidad, p.total_linea, p.precio_unitario, p.codigo_proveedor,
              ROW_NUMBER() OVER (PARTITION BY p.factura_id ORDER BY p.numero_linea ASC) AS n
         FROM productos_factura_proveedor p
        WHERE p.factura_id = ANY($1::uuid[])
     ) t
      WHERE n <= $2
      ORDER BY factura_id, n`,
    [facturaIds, PRODUCTOS_POR_FACTURA]
  );
  for (const r of rows) {
    if (!porFactura.has(r.factura_id)) porFactura.set(r.factura_id, []);
    porFactura.get(r.factura_id).push({
      id: r.id,
      descripcion: r.descripcion,
      cantidad: Number(r.cantidad),
      totalLinea: Number(r.total_linea),
      precioUnitario: Number(r.precio_unitario),
      codigoProveedor: r.codigo_proveedor
    });
  }
  return porFactura;
}

const comoCuenta = (r, productos) => ({
  id: r.id,
  facturaId: r.factura_id,
  proveedorNombre: r.proveedor_nombre,
  proveedorCedula: r.proveedor_cedula,
  numeroConsecutivo: r.numero_consecutivo,
  condicionVenta: r.condicion_venta,
  plazoCredito: r.plazo_credito,
  fechaEmision: r.fecha_emision,
  fechaVencimiento: r.fecha_vencimiento,
  montoTotal: Number(r.monto_total),
  notas: r.notas,
  // Sin factura del buzón (cargada a mano) no hay nada que colgarle.
  factura: r.factura_id
    ? { numeroConsecutivo: r.factura_numero, productos: productos.get(r.factura_id) || [] }
    : null
});

const COLUMNAS = `c.id, c.factura_id, c.proveedor_nombre, c.proveedor_cedula, c.numero_consecutivo,
  c.condicion_venta, c.plazo_credito, c.monto_total, c.notas,
  c.fecha_emision AT TIME ZONE 'UTC' AS fecha_emision,
  c.fecha_vencimiento AT TIME ZONE 'UTC' AS fecha_vencimiento`;

/**
 * Las cuentas con esos ids que además pasan la búsqueda, de la que vence
 * primero a la que vence después.
 * @param {{ ids: string[], proveedor?: string, search?: string }} opciones
 */
async function leerCuentas({ ids, ...busqueda }) {
  if (!ids || ids.length === 0) return [];
  const { donde, params } = condicionesDeBusqueda(busqueda);
  params.push(ids);
  const { rows } = await query(
    `SELECT ${COLUMNAS}, f.numero_consecutivo AS factura_numero
       FROM cuentas_por_pagar c
       LEFT JOIN facturas_proveedores f ON f.id = c.factura_id
      WHERE c.id = ANY($${params.length}::uuid[]) ${donde.map((d) => `AND ${d}`).join(' ')}
      ORDER BY c.fecha_vencimiento ASC, c.id`,
    params
  );
  const productos = await productosPorFactura(rows.map((r) => r.factura_id).filter(Boolean));
  return rows.map((r) => comoCuenta(r, productos));
}

/** Proveedores con al menos una cuenta liberada, para el filtro de la pantalla. */
async function proveedoresConCuentas() {
  const { rows } = await query(
    `SELECT DISTINCT ON (proveedor_cedula) proveedor_cedula, proveedor_nombre
       FROM cuentas_por_pagar
      WHERE liberada = TRUE
      ORDER BY proveedor_cedula, created_at DESC`
  );
  return rows
    .map((r) => ({ cedula: r.proveedor_cedula, nombre: r.proveedor_nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Lo único que se edita a mano de una cuenta: sus notas. */
async function anotarCuenta(id, notas) {
  if (!UUID.test(String(id))) throw httpError(404, 'Esa cuenta por pagar no existe.');
  const { rows } = await query(
    `UPDATE cuentas_por_pagar c SET notas = $2, updated_at = NOW() WHERE c.id = $1::uuid
     RETURNING ${COLUMNAS}`,
    [id, notas]
  );
  if (rows.length === 0) throw httpError(404, 'Esa cuenta por pagar no existe.');
  return comoCuenta(rows[0], new Map());
}

module.exports = { leerCuentas, proveedoresConCuentas, anotarCuenta, condicionesDeBusqueda };
