/**
 * Descuentos por exceso vigentes.
 *
 * VIVE ACÁ, FUERA DE LOS DOS CATÁLOGOS, porque los consumen tres lugares:
 * el catálogo del agente (listarOfertas), el catálogo del cliente y el
 * armado del pedido. La definición de "vigente" no es obvia —no basta con
 * que exista una fila de descuento— y si cada uno la escribiera por su
 * lado, el cliente podría ver una oferta que al pedirla se cobra completa.
 *
 * Vigente = el empacador confirmó el producto listo en caja (empacado) en su
 * tanda de exceso más reciente, esa cantidad física es mayor a 0, el
 * descuento sigue siendo mayor que 0, y no llegó al 100% (no está regalado).
 *
 * EL DESCUENTO EN 0 ES LA SALIDA DE LA LIQUIDACIÓN. El stock que se compara
 * acá es el que el empacador contó ese día, y esa foto envejece: un producto
 * que se agotó después seguía saliendo en oferta. Quien lo saca es
 * depurarOfertasSinStock (inventario-auditorias.service.js), que compara
 * contra el stock en vivo de Alegra y pone el descuento en 0. Acá se respeta
 * esa decisión.
 */

const { query } = require('../../config/database');

const SQL_VIGENTES = `
  WITH ultimo_empaque AS (
    SELECT DISTINCT ON (iai.alegra_id)
      iai.alegra_id,
      COALESCE(iai.stock_real, iai.stock_sistema) AS stock_efectivo
    FROM inventario_auditoria_items iai
    JOIN inventario_auditorias ia ON ia.id = iai.auditoria_id AND ia.tipo = 'exceso'
    WHERE iai.empacado = TRUE
    ORDER BY iai.alegra_id, iai.created_at DESC
  )
  SELECT pde.alegra_item_id, pde.nombre_producto, pde.descuento_porcentaje
  FROM producto_descuento_exceso pde
  JOIN ultimo_empaque ue ON ue.alegra_id = pde.alegra_item_id
  WHERE pde.regalado = FALSE AND ue.stock_efectivo > 0 AND pde.descuento_porcentaje > 0
  ORDER BY pde.descuento_porcentaje DESC;
`;

/** Filas crudas, en el orden de mayor descuento primero. */
async function listarVigentes() {
  const result = await query(SQL_VIGENTES);
  return result.rows.map(row => ({
    id: String(row.alegra_item_id),
    nombre: row.nombre_producto,
    descuentoPorcentaje: Number(row.descuento_porcentaje) || 0
  }));
}

/** Map<alegraItemId, porcentaje> — la forma cómoda para aplicar precios. */
async function mapaVigentes() {
  const filas = await listarVigentes();
  return new Map(filas.map(f => [f.id, f.descuentoPorcentaje]));
}

/**
 * El portal trabaja por producto.id. Inventario conserva sus ids de Alegra
 * hasta el conteo físico: se traduce solo al leer la oferta, sin mezclar las
 * llaves de los catálogos. Acepta la conexión de la transacción del pedido.
 */
async function mapaVigentesPropios(db = { query }) {
  const { rows } = await db.query(`
    WITH vigentes AS (${SQL_VIGENTES.replace(/;\s*$/, '')})
    SELECT p.id AS producto_id, v.descuento_porcentaje
      FROM vigentes v JOIN producto p ON p.alegra_id = v.alegra_item_id
  `);
  return new Map(rows.map(r => [String(r.producto_id), Number(r.descuento_porcentaje) || 0]));
}

/**
 * Aplica el descuento sobre un precio ya con impuesto.
 *
 * El descuento va DESPUÉS del impuesto y no antes: es una rebaja sobre lo
 * que el cliente paga. Redondeado a 2 decimales, igual que el precio, para
 * que lo que se muestra y lo que se congela en el pedido sean el mismo
 * número.
 */
function aplicarDescuento(precioConImpuesto, porcentaje) {
  const p = Number(porcentaje) || 0;
  if (p <= 0) return precioConImpuesto;
  return Math.round(precioConImpuesto * (1 - p / 100) * 100) / 100;
}

module.exports = { listarVigentes, mapaVigentes, mapaVigentesPropios, aplicarDescuento, SQL_VIGENTES };
