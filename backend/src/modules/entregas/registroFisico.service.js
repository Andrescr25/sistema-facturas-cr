const {pool}=require('../../../config/database');
const {enTransaccion}=require('../../utils/transaccion');
const {httpError}=require('../../utils/validacion');
const {registrarCambio}=require('../../utils/bitacora');
// PostgreSQL valida con NUMERIC. Redondear las restas para no mostrar residuos
// binarios como carga pendiente después de entregar una fracción completa.
const redondear=v=>Math.round(v*10000)/10000||0;
const id=v=>{if(!((typeof v==='number'&&Number.isSafeInteger(v))||(typeof v==='string'&&/^[1-9]\d*$/.test(v)))||Number(v)>2147483647||Number(v)<1)throw httpError(400,'Identificador inválido.');return Number(v)};
const cantidad=v=>{
 if(!['number','string'].includes(typeof v)||!/^\d{1,9}(\.\d{1,4})?$/.test(String(v)))throw httpError(400,'Usá cantidades positivas o cero con hasta cuatro decimales.');
 return Number(v);
};
function solicitud(datos,accion){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datos?.clave||''))throw httpError(400,'Clave de registro inválida.');
 if(datos.confirmar!==true)throw httpError(400,'Confirmá las cantidades físicamente verificadas.');
 if(!Number.isInteger(datos.version)||datos.version<0||!(/^[0-9a-f]{32}$/.test(datos.revision||'')))throw httpError(400,'Revisá el documento antes de registrar.');
 if(!Array.isArray(datos.lineas)||datos.lineas.length>1000)throw httpError(400,'Lista de líneas inválida.');
 const lineas=datos.lineas.map(l=>({numeroLinea:id(l?.numeroLinea),...(accion==='revision'?
   {cargada:cantidad(l.cargada),entregada:cantidad(l.entregada),descargada:cantidad(l.descargada)}:{cantidad:cantidad(l.cantidad)})})).sort((a,b)=>a.numeroLinea-b.numeroLinea);
 if(new Set(lineas.map(l=>l.numeroLinea)).size!==lineas.length)throw httpError(400,'Hay líneas repetidas.');
 if(['carga','entrega','descarga'].includes(accion)&&(!lineas.length||lineas.some(l=>l.cantidad<=0)))throw httpError(400,'Indicá al menos una cantidad física nueva positiva.');
 if(accion==='incidencia'&&lineas.length)throw httpError(400,'Una incidencia no cambia cantidades.');
 const motivo=typeof datos.motivo==='string'?datos.motivo.trim():null;
 if((datos.motivo!=null&&typeof datos.motivo!=='string')||motivo?.length>1000||(['revision','descarga','incidencia'].includes(accion)&&!motivo))throw httpError(400,'Indicá un motivo de hasta 1000 caracteres.');
 return{clave:datos.clave.toLowerCase(),solicitud:{accion,version:datos.version,revision:datos.revision,lineas,motivo:motivo||null}};
}
async function datosEn(db,facturaId,{bloquear=false}={}){
 const {rows:[f]}=await db.query(`SELECT id,cliente_id,ciclo_ruta_cliente_id FROM factura WHERE id=$1 ${bloquear?'FOR UPDATE':''}`,[id(facturaId)]);
 if(!f)throw httpError(404,'No existe esa factura.');
 if(bloquear)await db.query('SELECT id FROM cliente WHERE id=$1 FOR SHARE',[f.cliente_id]);
 const {rows:[cy]}=await db.query(`SELECT c.id,c.ruta_id AS "rutaId",c.ruta_nombre AS "rutaNombre",c.semana::text,c.estado,rc.orden
   FROM ciclo_ruta_cliente rc JOIN ciclo_ruta c ON c.id=rc.ciclo_id WHERE rc.id=$1`,[f.ciclo_ruta_cliente_id]);
 const {rows:historial}=await db.query(`SELECT e.*,u.nombre responsable FROM entrega_evento e JOIN usuario u ON u.id=e.usuario_id
   WHERE factura_id=$1 ORDER BY version`,[f.id]);
 const ultimo=historial.at(-1),version=ultimo?.version||0;
 const {rows:[contexto]}=await db.query(`SELECT d documento,entrega_revision($1,$2::int) revision,entrega_factura_vigente($1) vigente
   FROM (SELECT entrega_documento($1) d) x`,[f.id,version]);
 const documento=contexto.documento,registrado=ultimo?.documento||documento;
 // JSONB decide la igualdad operativa, sin depender de orden de claves o
 // precisión de fechas de JavaScript. Cambiar precios no cambia el físico.
 const cambio=ultimo?!(await db.query('SELECT $1::jsonb=$2::jsonb iguales',[ultimo.documento,documento])).rows[0].iguales:false;
 const lineas=registrado.lineas.map(l=>{
  const s=ultimo?.saldos.find(s=>s.numeroLinea===l.numeroLinea)||{cargada:0,entregada:0,descargada:0};
  return{...l,...s,enCamion:redondear(s.cargada-s.entregada-s.descargada),pendiente:Math.max(0,redondear(Number(l.cantidad)-s.entregada))};
 });
 const completas=lineas.length&&lineas.every(l=>l.entregada>=Number(l.cantidad));
 const estado=cambio?'requiere_revision':completas?'entregada':lineas.some(l=>l.entregada>0)?'parcialmente_entregada':lineas.some(l=>l.enCamion>0)?'cargada':'por_cargar';
 const bloqueos=[];
 if(!contexto.vigente)bloqueos.push('La factura está anulada o acreditada totalmente.');
 if(documento.factura.estadoBodega!=='procesado')bloqueos.push('Bodega debe registrar primero su revisión.');
 if(cambio)bloqueos.push('Cambió la factura o su revisión de bodega. Un administrador debe revisar el registro físico antes de continuar.');
 return{facturaId:f.id,ciclo:cy||null,ruta:documento.factura.ruta||null,vigente:contexto.vigente,version,revision:contexto.revision,documento,lineas,
   requiereRevision:cambio,estado,bloqueos,puedeCargar:!bloqueos.length,
   puedeEntregar:!bloqueos.length,
   historial:historial.map(e=>({id:e.id,version:e.version,accion:e.accion,documento:e.documento,saldos:e.saldos,motivo:e.motivo,responsable:e.responsable,usuarioId:e.usuario_id,fecha:e.fecha}))};
}
async function consultar(facturaId){return enTransaccion(pool,async db=>{
 await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');return datosEn(db,facturaId);
})}
async function guardar(facturaId,datos,usuarioId,accion){
 const {clave,solicitud:pedido}=solicitud(datos,accion);facturaId=id(facturaId);usuarioId=id(usuarioId);
 return enTransaccion(pool,async db=>{
  const p=await datosEn(db,facturaId,{bloquear:true});
  const {rows:[actor]}=await db.query('SELECT activo,es_admin FROM usuario WHERE id=$1 FOR SHARE',[usuarioId]);
  if(!actor?.activo)throw httpError(403,'Responsable activo requerido.');
  if(accion==='revision'&&!actor.es_admin)throw httpError(403,'Solo un administrador puede corregir el registro físico.');
  const {rows:[anterior]}=await db.query('SELECT factura_id,solicitud FROM entrega_evento WHERE id=$1',[clave]);
  if(anterior){const igual=(await db.query('SELECT $1::jsonb=$2::jsonb iguales',[anterior.solicitud,pedido])).rows[0].iguales;
   if(anterior.factura_id!==facturaId||!igual)throw httpError(409,'Esa clave ya corresponde a otro registro.');return p;
  }
  if(p.version!==pedido.version||p.revision!==pedido.revision)throw httpError(409,'Cambió la factura, bodega, ruta o registro. Actualizá y revisá antes de guardar.');
  if(['carga','entrega'].includes(accion)&&p.bloqueos.length)throw httpError(409,p.bloqueos.join(' '));
  if(accion==='revision'&&!p.vigente)throw httpError(409,'No se pueden reasignar cantidades a una factura anulada. Podés descargar su carga anterior.');
  const doc=['descarga','incidencia'].includes(accion)&&p.historial.length?p.historial.at(-1).documento:p.documento;
  let saldos;
  // SAVEPOINT traduce una validación de cantidades a 400 sin ocultar un
  // error real de escritura, ni continuar una transacción abortada.
  await db.query('SAVEPOINT validar_fisico');
  try{saldos=(await db.query('SELECT entrega_calcular_saldos($1,$2,$3,$4) saldos',[doc,JSON.stringify(p.historial.at(-1)?.saldos||[]),accion,JSON.stringify(pedido.lineas)])).rows[0].saldos}
  catch(e){await db.query('ROLLBACK TO SAVEPOINT validar_fisico');if(e.code==='P0001')throw httpError(400,e.message);throw e}
  await db.query('RELEASE SAVEPOINT validar_fisico');
  try{await db.query(`INSERT INTO entrega_evento(id,factura_id,recorrido_id,version,accion,solicitud,documento,saldos,motivo,usuario_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[clave,facturaId,p.documento.factura.recorridoId,p.version+1,accion,pedido,doc,JSON.stringify(saldos),pedido.motivo,usuarioId]);}
  catch(e){if(e.code==='P0001')throw httpError(409,e.message);throw e}
  await registrarCambio(db,{entidad:'entrega_evento',entidadId:clave,accion,usuarioId,motivo:pedido.motivo,
    despues:{facturaId,recorridoId:p.documento.factura.recorridoId,version:p.version+1,saldos}});
  return datosEn(db,facturaId);
 });
}
async function registrar(facturaId,datos,usuarioId){
 if(!['carga','entrega','descarga','incidencia'].includes(datos?.accion))throw httpError(400,'Acción física inválida.');
 return guardar(facturaId,datos,usuarioId,datos.accion);
}
module.exports={consultar,registrar,revisar:(id,datos,actor)=>guardar(id,datos,actor,'revision')};
