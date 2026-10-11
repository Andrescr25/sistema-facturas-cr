const {pool}=require('../../../config/database');
const {enTransaccion}=require('../../utils/transaccion');
const {httpError}=require('../../utils/validacion');
const {registrarCambio}=require('../../utils/bitacora');
const {interno:{entero,enOrden,obtenerEn,revision}}=require('./ordenesCiclo.service');
const {interno:{uuid,hash}}=require('./ordenesCicloFactura.service');

async function datosEn(db,o){
 const {rows:[evento]}=await db.query('SELECT c.*,u.nombre usuario FROM orden_compra_ciclo_cierre c JOIN usuario u ON u.id=c.usuario_id WHERE orden_id=$1',[o.id]);
 const resumen=evento?.resumen||(await db.query('SELECT orden_compra_cierre_contexto($1) resumen',[o.id])).rows[0].resumen;
 const confirmado=o.enviada_en&&o.envio_id&&(await db.query("SELECT 1 FROM orden_compra_ciclo_envio WHERE id=$1 AND orden_id=$2 AND estado='confirmado' AND confirmado_en=(SELECT enviada_en FROM orden_compra_ciclo WHERE id=$2)",[o.envio_id,o.id])).rowCount>0;
 // Comparar fechas dentro de PostgreSQL: Date de JS pierde microsegundos.
 const puedeCerrar=['enviada','parcialmente_recibida'].includes(o.estado)&&!!confirmado;
 return{resumen,evento:evento?{id:evento.id,motivo:evento.motivo,fecha:evento.fecha,usuario:evento.usuario,usuarioId:evento.usuario_id}:null,
  version:o.version,estado:o.estado,revision:hash(resumen),puedeCerrar};
}
async function consultar(id){
 return enTransaccion(pool,async db=>{
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const o=(await db.query('SELECT * FROM orden_compra_ciclo WHERE id=$1',[entero(id)])).rows[0];
  if(!o)throw httpError(404,'No existe esa orden.');return datosEn(db,o);
 });
}
async function cerrar(id,datos,usuarioId){
 const clave=uuid(datos?.clave),actor=entero(usuarioId,'Usuario'),version=entero(datos?.version,'Revisión');
 const motivo=typeof datos?.motivo==='string'?datos.motivo.trim():'';
 if(!motivo||motivo.length>1000||datos.confirmar!==true||typeof datos.revision!=='string'||!/^[a-f0-9]{64}$/.test(datos.revision))throw httpError(400,'Revisá la cobertura, confirmá el cierre e indicá un motivo de hasta 1000 caracteres.');
 const solicitud={version,revision:datos.revision,motivo,confirmar:true};
 return enOrden(async db=>{
  const o=await obtenerEn(db,id,{bloquear:true});
  const {rows:[anterior]}=await db.query('SELECT orden_id,solicitud FROM orden_compra_ciclo_cierre WHERE id=$1',[clave]);
  // Se consulta antes de la revisión: una respuesta perdida no crea otro cierre.
  if(anterior){if(anterior.orden_id!==o.id||hash(anterior.solicitud)!==hash(solicitud))throw httpError(409,'Esa clave de cierre corresponde a otros datos.');return{orden:o,...await datosEn(db,o)}}
  revision(o,version);const d=await datosEn(db,o);
  if(!d.puedeCerrar)throw httpError(409,'Solo se cierra una orden enviada o parcialmente recibida con envío confirmado. Verificá primero cualquier envío incierto.');
  if(d.revision!==datos.revision)throw httpError(409,'La recepción o cobertura cambió. Actualizá y revisá antes de cerrar.');
  if(!(await db.query('SELECT id FROM usuario WHERE id=$1 AND activo FOR SHARE',[actor])).rowCount)throw httpError(403,'El cierre requiere un usuario activo.');
  await db.query('INSERT INTO orden_compra_ciclo_cierre(id,orden_id,solicitud,resumen,motivo,usuario_id) VALUES($1,$2,$3,$4,$5,$6)',[clave,o.id,solicitud,d.resumen,motivo,actor]);
  // No tocar compra, CxP, recibido ni kardex. La vista de cobertura retiene
  // únicamente lo físico asignado; el resto queda libre para OTRA orden.
  await db.query("UPDATE orden_compra_ciclo SET estado='cerrada',motivo_cierre=$2,cerrada_en=(SELECT fecha FROM orden_compra_ciclo_cierre WHERE id=$3),version=version+1,actualizado_en=NOW() WHERE id=$1",[o.id,motivo,clave]);
  await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'cerrar_enviada',despues:{cierreId:clave,resumen:d.resumen},usuarioId:actor,motivo});
  return{orden:await obtenerEn(db,o.id),...await datosEn(db,{...o,estado:'cerrada',version:o.version+1})};
 });
}
module.exports={consultar,cerrar};
