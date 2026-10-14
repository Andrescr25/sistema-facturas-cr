const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError } = require('../../utils/validacion');
const { interno: { enOrden, listarEn, resolverProveedorEn } } = require('./ordenesCiclo.service');
const { sincronizarEn } = require('./ordenesAutomaticas.service');

async function datosEn(db, proveedor) {
  const activas = await listarEn(db, { proveedorId: proveedor.id });
  const historial = await listarEn(db, { proveedorId: proveedor.id, vista: 'historial' });
  return { proveedor, ordenes: [...activas, ...historial].sort((a,b) => b.id-a.id) };
}
async function consultar(filtros) {
  return enTransaccion(pool, async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return datosEn(db, await resolverProveedorEn(db, filtros, { activo:false, bloquear:false }));
  });
}
async function preparar(filtros, actor) {
  return enOrden(async db => {
    const proveedor = await resolverProveedorEn(db, filtros, { activo:false, bloquear:false });
    if (!proveedor.activo) throw httpError(409, 'El proveedor está inactivo. Activá su ficha antes de preparar una compra.');
    await sincronizarEn(db, { proveedorId: proveedor.id }, actor);
    return datosEn(db, proveedor);
  });
}
async function estados() {
  return (await pool.query(`SELECT p.nombre proveedor,p.identificacion cedula,
    COUNT(*) FILTER(WHERE o.estado IN ('borrador','pendiente_enviar') AND o.envio_id IS NULL)::int pendientes,
    COUNT(*) FILTER(WHERE o.enviada_en IS NOT NULL)::int veces,MAX(o.enviada_en) AS "ultimoEnvio"
    FROM orden_compra_ciclo o JOIN proveedor p ON p.id=o.proveedor_id GROUP BY p.id`)).rows;
}
module.exports = { consultar, preparar, estados };
