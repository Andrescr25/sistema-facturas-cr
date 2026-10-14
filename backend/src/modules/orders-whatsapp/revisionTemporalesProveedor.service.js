const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError } = require('../../utils/validacion');
const { fechaValida } = require('../../utils/exportarExcel');

function contexto(datos={}) {
  // Compatibilidad con ediciones legadas sin revisión. La pantalla nueva
  // siempre manda la fotografía que vio, también al agregar o deshacer.
  if (datos.revisionReporte === undefined) return null;
  if (typeof datos.revisionReporte !== 'string' || !/^[a-f0-9]{64}$/.test(datos.revisionReporte)) throw httpError(400,'Actualizá el reporte antes de editar.');
  const fechaInicio=datos.fechaInicio || null;
  if (fechaInicio !== null && (typeof fechaInicio !== 'string' || !fechaValida(fechaInicio))) throw httpError(400,'La fecha inicial del reporte no es válida.');
  return { revisionReporte:datos.revisionReporte,fechaInicio };
}
const enEdicion = trabajo => enTransaccion(pool,async db=>{
  // Preparar un envío usa el mismo bloqueo: una pestaña anterior no puede
  // guardar su cantidad después de que esa fotografía quedó congelada.
  await db.query('SELECT pg_advisory_xact_lock(46005,1)');
  return trabajo(db);
});
async function comprobarEn(db,nombre,revision) {
  if (!revision) return;
  const reportes=new(require('../reports/report.service'))();
  const leer=()=>reportes.getMissingItemsBySupplier(revision.fechaInicio,{db,incluirEnviadas:false});
  const encontrar=r=>r.data?.filter(p=>p.nombre===nombre || p.aliases?.includes(nombre)) || [];
  const r=await leer();
  if (!r.success) throw httpError(503,'No se pudieron comprobar los faltantes. No se guardaron cambios.');
  const candidatos=encontrar(r),p=candidatos[0];
  if (candidatos.length!==1 || p.revisionReporte!==revision.revisionReporte) throw httpError(409,'Los faltantes cambiaron. Actualizá el reporte y revisá las cantidades.');
  // Mismo orden que Reporte Clientes y el envío, seguido de una nueva
  // lectura: esperar por una respuesta de cliente no conserva el saldo viejo.
  const origenes=p.productos_faltantes.flatMap(l=>l.origenes);
  await db.query('SELECT id FROM factura WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE',[[...new Set(origenes.map(o=>o.facturaId))]]);
  await db.query('SELECT id FROM faltantes WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[[...new Set(origenes.map(o=>o.faltanteId))]]);
  const vigente=await leer();
  if (!vigente.success) throw httpError(503,'No se pudieron comprobar los faltantes. No se guardaron cambios.');
  const actuales=encontrar(vigente);
  if (actuales.length!==1 || actuales[0].revisionReporte!==revision.revisionReporte) throw httpError(409,'Los faltantes cambiaron. Actualizá el reporte y revisá las cantidades.');
}
module.exports = { contexto,enEdicion,comprobarEn };
