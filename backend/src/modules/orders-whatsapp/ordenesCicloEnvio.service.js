const {createHash}=require('node:crypto');
const whatsapp=require('../../integrations/whatsapp');
const {salidasBloqueadas,errorSalidaBloqueada}=require('../../../config/aislado');
const {httpError}=require('../../utils/validacion');
const {telefonosDe,validarTelefonoEscrito}=require('../../utils/telefonosCliente');
const {registrarCambio}=require('../../utils/bitacora');
const {generarPdfOrden}=require('./ordenesCiclo.pdf');
// El archivo que recibe el proveedor: sin el número de la orden (2026-10-20).
const {hoyEnCostaRica}=require('../../utils/fechaCR');
const {interno:{enOrden,obtenerEn,revision,validarPendienteEn}}=require('./ordenesCiclo.service');
const MENSAJE_PEDIDO='Hola buenas, adjunto pedido\ngracias';
const sha=b=>createHash('sha256').update(b).digest('hex');
const uuid=id=>{if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw httpError(400,'Identificador de copia revisada inválido.');return id.toLowerCase()};
const pendiente=o=>{if(o.estado!=='pendiente_enviar'||o.envio_id)throw httpError(409,'La orden debe estar pendiente de enviar, sin intento activo.');};
async function envioEn(db,ordenId,id){
  const {rows:[e]}=await db.query('SELECT * FROM orden_compra_ciclo_envio WHERE orden_id=$1 AND id=$2 FOR UPDATE',[ordenId,uuid(id)]);
  if(!e)throw httpError(404,'Esa copia no corresponde a esta orden.');
  if(sha(e.pdf)!==e.sha256)throw httpError(409,'La copia guardada no coincide con la revisada. No se enviará.');
  return e;
}
async function propuesta(id){return enOrden(async db=>{
  const o=await obtenerEn(db,id),{rows:[p]}=await db.query('SELECT telefono_whatsapp,telefono FROM proveedor WHERE id=$1',[o.proveedor_id]);
  const {candidatos,sinReconocer}=telefonosDe({mobile:p.telefono_whatsapp,phonePrimary:p.telefono});
  return {telefonos:candidatos,sinReconocer,mensaje:MENSAJE_PEDIDO};
})}
async function prepararEn(db,id,datos,usuarioId){
  const clave=uuid(datos?.clave),telefono=validarTelefonoEscrito(datos?.telefono);
  if(!telefono.valido)throw httpError(400,telefono.motivo);
  const mensaje=typeof datos.mensaje==='string'?datos.mensaje.trim():'';
  if(!mensaje||mensaje.length>2000)throw httpError(400,'Escribí un mensaje de hasta 2000 caracteres.');
    const o=await obtenerEn(db,id,{bloquear:true});
    // El mensaje no lleva número de orden: desde el 2026-10-20 la orden no
    // muestra «OC-xx» a nadie. El PDF y la copia guardada conservan qué se pidió.
    const {rows:[previa]}=await db.query('SELECT orden_id,version_orden,numero,mensaje FROM orden_compra_ciclo_envio WHERE id=$1',[clave]);
    if(previa){
      if(previa.orden_id!==o.id||previa.version_orden!==Number(datos.version)||previa.numero!==telefono.numero||previa.mensaje!==mensaje)
        throw httpError(409,'Esa clave ya corresponde a otra copia revisada.');
      return o;
    }
    revision(o,datos.version);pendiente(o);await validarPendienteEn(db,o);
    const pdf=await generarPdfOrden(o,{preferirDatosProveedor:datos.preferirDatosProveedor});if(pdf.length>5*1024*1024)throw httpError(413,'La orden supera el tamaño permitido para el PDF.');
    await db.query(`INSERT INTO orden_compra_ciclo_envio(id,orden_id,version_orden,numero,mensaje,nombre_archivo,pdf,sha256,preparado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[clave,o.id,o.version,telefono.numero,mensaje,`orden-de-compra-${hoyEnCostaRica()}.pdf`,pdf,sha(pdf),usuarioId||null]);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'preparar_envio',despues:{copiaId:clave,version:o.version,numero:telefono.numero,sha256:sha(pdf)},usuarioId});
    return obtenerEn(db,o.id);
}
const preparar=(id,datos,usuarioId)=>enOrden(db=>prepararEn(db,id,datos,usuarioId));
async function descargar(id,copiaId){return enOrden(async db=>{
  const o=await obtenerEn(db,id),e=await envioEn(db,o.id,copiaId);
  // Una revisión anterior sigue en historial; descargar jamás regenera bytes.
  return {pdf:e.pdf,nombreArchivo:e.nombre_archivo};
})}
async function finalizarEn(db,o,e,{estado,via=null,confirmacion=null,motivo=null,usuarioId}){
  await db.query(`UPDATE orden_compra_ciclo_envio SET estado=$2::varchar,via=$3,motivo=$4,
    confirmado_en=CASE WHEN $2::varchar='confirmado' THEN NOW() ELSE NULL END,confirmacion=$5,
    confirmado_por=CASE WHEN $2::varchar='confirmado' THEN $6::int ELSE NULL END WHERE id=$1`,[e.id,estado,via,motivo,confirmacion,usuarioId||null]);
  if(estado==='confirmado')await db.query(`UPDATE orden_compra_ciclo SET estado='enviada',enviada_en=(SELECT confirmado_en FROM orden_compra_ciclo_envio WHERE id=$2),version=version+1,actualizado_en=NOW() WHERE id=$1`,[o.id,e.id]);
  if(estado==='no_enviado')await db.query('UPDATE orden_compra_ciclo SET envio_id=NULL,version=version+1,actualizado_en=NOW() WHERE id=$1',[o.id]);
  if(estado==='confirmado'||estado==='incierto'){
    const directo=await db.query(`SELECT despues FROM bitacora_cambio WHERE entidad='orden_compra_ciclo'
      AND entidad_id=$1 AND accion='revisar_reporte' AND despues->>'clave'=$2 LIMIT 1`,[String(o.id),e.id]);
    // Retirar solo las ediciones que acompañaron ESTE envío; otra persona
    // puede haber revisado el siguiente pedido mientras WhatsApp respondía.
    if(directo.rows.length)await db.query(`DELETE FROM orden_compra_temporal t
      USING jsonb_to_recordset($1::jsonb) AS r(id int,actualizado text)
      WHERE t.id=r.id AND t.updated_at=r.actualizado::timestamp`,[JSON.stringify(directo.rows[0].despues.temporales || [])]);
  }
  if(confirmacion!=='manual')await db.query(`INSERT INTO envio_whatsapp(tipo,referencia,telefono,enviado_por,exito,error)
    VALUES('orden_compra',$1,$2,$3,$4,$5)`,[o.referencia,e.numero,usuarioId||null,estado==='confirmado',estado==='confirmado'?null:motivo]);
  await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:`envio_${estado}`,despues:{copiaId:e.id,estado,confirmacion,via},usuarioId,motivo});
  return obtenerEn(db,o.id);
}
async function enviar(id,copiaId,datos,usuarioId){
  if(datos?.confirmar!==true)throw httpError(400,'Confirmá que revisaste el PDF, el destinatario y el mensaje antes de enviar.');
  const reclamado=await enOrden(async db=>{
    const o=await obtenerEn(db,id,{bloquear:true}),e=await envioEn(db,o.id,copiaId);
    // La misma petición, incluso después de una respuesta perdida, SOLO lee
    // el resultado durable. Un intento activo/incierto nunca llama dos veces.
    if(e.estado!=='revisado')return {orden:o};
    revision(o,e.version_orden);pendiente(o);await validarPendienteEn(db,o);
    if(salidasBloqueadas())throw errorSalidaBloqueada('enviar la orden de compra');
    await db.query("UPDATE orden_compra_ciclo_envio SET estado='enviando',iniciado_en=NOW(),iniciado_por=$2 WHERE id=$1",[e.id,usuarioId||null]);
    await db.query('UPDATE orden_compra_ciclo SET envio_id=$2,version=version+1,actualizado_en=NOW() WHERE id=$1',[o.id,e.id]);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'iniciar_envio',despues:{copiaId:e.id,numero:e.numero},usuarioId});
    return {e,ordenId:o.id};
  });
  if(reclamado.orden)return reclamado.orden;
  const e=reclamado.e;let resultado;
  try{
    // Fuera de la transacción: el bloqueo se confirmó ANTES de tocar la red.
    const r=await whatsapp.enviarDocumento({telefono:e.numero,mensaje:e.mensaje,pdf:e.pdf,nombreArchivo:e.nombre_archivo,sujeto:'proveedor'});
    if(r?.enviado!==true||r.numero!==e.numero)throw new Error('Sin confirmación del transporte');
    resultado={estado:'confirmado',confirmacion:'transporte',via:['interno','evolution'].includes(r.via)?r.via:null};
  }catch(error){
    const seguro=error.envioNoIniciado===true;
    // Nunca persistir el error crudo: puede contener claves/URL o payload.
    resultado={estado:seguro?'no_enviado':'incierto',motivo:seguro
      ?'WhatsApp no inició el envío. Prepará una nueva copia para reintentar explícitamente.'
      :'Resultado del envío por verificar. Consultá al proveedor; no reenviar automáticamente.'};
  }
  try{return await enOrden(async db=>{
    const o=await obtenerEn(db,id,{bloquear:true}),actual=await envioEn(db,o.id,e.id);
    if(actual.estado!=='enviando')return o;
    return finalizarEn(db,o,actual,{...resultado,usuarioId});
  })}catch{throw httpError(503,'No se pudo guardar el resultado del envío. No reenviés: recargá y verificá con el proveedor.');}
}
async function confirmarVerificado(id,copiaId,datos,usuarioId){
  const motivo=typeof datos?.motivo==='string'?datos.motivo.trim():'';
  if(datos?.confirmarEnvio!==true||!motivo||motivo.length>1000)throw httpError(400,'Confirmá que verificaste esta orden con el proveedor e indicá cómo (hasta 1000 caracteres).');
  return enOrden(async db=>{
    const o=await obtenerEn(db,id,{bloquear:true}),e=await envioEn(db,o.id,copiaId);
    if(e.estado==='confirmado')return o;
    const {rows:[tiempo]}=await db.query("SELECT $1::timestamptz<NOW()-INTERVAL '5 minutes' vencido",[e.iniciado_en]);
    if(o.envio_id!==e.id||!(e.estado==='incierto'||(e.estado==='enviando'&&tiempo.vencido)))
      throw httpError(409,'La orden no tiene un resultado incierto verificable. Esperá si el envío está en curso.');
    return finalizarEn(db,o,e,{estado:'confirmado',confirmacion:'manual',motivo,usuarioId});
  });
}
module.exports={propuesta,preparar,descargar,enviar,confirmarVerificado,mensajePredeterminado:MENSAJE_PEDIDO,interno:{prepararEn}};
