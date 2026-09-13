/**
 * Las ofertas de exceso, para el mostrador.
 *
 * POR QUÉ LA FACTURACIÓN TIENE QUE CONOCERLAS
 * El catálogo del agente, el catálogo público y el portal YA le muestran
 * estos descuentos al cliente. La facturación no los conocía, así que alguien
 * que pidió viendo "−20 %" llegaba a la caja y se le cobraba el precio
 * completo. La oferta que se promete y la que se cobra tienen que ser la
 * misma.
 *
 * DÓNDE VA EL DESCUENTO Y POR QUÉ DA IGUAL
 * El catálogo lo aplica sobre el precio CON impuesto —es una rebaja sobre lo
 * que el cliente paga— y la factura sobre la base ANTES del impuesto. El
 * cliente paga lo mismo: P(1+t)(1−d) es P(1−d)(1+t). La diferencia es que en
 * la factura el descuento baja la base imponible, que es como debe declararse.
 *
 * "Vigente" no se redefine acá: sale de utils/descuentosExceso.js, que es el
 * único lugar donde está escrito qué cuenta como oferta viva. Si cada pantalla
 * lo decidiera por su lado, el cliente podría ver una oferta que al facturarla
 * se cobra completa — que es justo el problema que esto viene a cerrar.
 */

const { pool } = require('../../../config/database');
const { SQL_VIGENTES } = require('../../utils/descuentosExceso');

/**
 * Las ofertas vivas, con NUESTRO id de producto.
 *
 * La tabla de descuentos guarda el id de Alegra; la facturación trabaja con
 * el id propio. El puente es `producto.alegra_id`, y un producto que todavía
 * no tenga esa correspondencia sencillamente no trae oferta: es mejor cobrar
 * el precio de lista que aplicar un descuento al producto equivocado.
 */
async function ofertasVigentes() {
  const { rows } = await pool.query(`
    WITH vigentes AS (${SQL_VIGENTES.replace(/;\s*$/, '')})
    SELECT p.id AS producto_id,
           v.alegra_item_id,
           v.nombre_producto,
           v.descuento_porcentaje
      FROM vigentes v
      JOIN producto p ON p.alegra_id = v.alegra_item_id
     WHERE p.activo
     ORDER BY v.descuento_porcentaje DESC
  `);

  return rows.map(r => ({
    productoId: r.producto_id,
    alegraItemId: String(r.alegra_item_id),
    nombre: r.nombre_producto,
    descuentoPorcentaje: Number(r.descuento_porcentaje) || 0
  }));
}

module.exports = { ofertasVigentes };
