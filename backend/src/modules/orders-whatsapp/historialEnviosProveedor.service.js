const { query } = require('../../../config/database');
const cicloPedidos = require('./cicloPedidos');

/** Contrato de lectura histórico: no decidir si una compra actual ya salió
 * por una marca antigua del proveedor. La interfaz usa cada orden propia. */
async function getOrdenesEnviadas(desde) {
  const { rows } = await query(`SELECT referencia,MAX(creado_en) ultimo_envio,COUNT(*)::int veces
    FROM envio_whatsapp WHERE tipo='orden_compra' AND exito=TRUE AND referencia IS NOT NULL
      AND creado_en >= GREATEST($1::timestamp,${cicloPedidos.SQL_INICIO_CICLO})
    GROUP BY referencia ORDER BY MAX(creado_en) DESC`,[desde || null]);
  return rows.map(r => ({ proveedor:r.referencia,ultimoEnvio:r.ultimo_envio,veces:r.veces }));
}
module.exports = { getOrdenesEnviadas };
