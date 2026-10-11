const {httpError}=require('../../utils/validacion');
const {registrarCambio}=require('../../utils/bitacora');
const inventario=require('../inventario/inventario.service');
const {interno:{entero,enOrden,obtenerEn,revision}}=require('./ordenesCiclo.service');
const {interno:{uuid,hash}}=require('./ordenesCicloFactura.service');
const micro=v=>{const [a,b='']=String(v).split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0').slice(0,6))};
const numero=v=>Number(v)/1000000;
const tipos=['agotado_confirmado','pendiente_proveedor','rechazado','otro'];
function cantidades(datos){
 if(!Array.isArray(datos?.lineas)||datos.lineas.length>2000)throw httpError(400,'Incluí las cantidades físicas de esta recepción.');
 const r=datos.lineas.map(l=>({lineaId:entero(l?.lineaId),cantidad:inventario.decimal(l?.cantidad,'Cantidad recibida',{decimales:4})})).sort((a,b)=>a.lineaId-b.lineaId);
 if(new Set(r.map(l=>l.lineaId)).size!==r.length)throw httpError(400,'Hay líneas repetidas.');
 return r.map(l=>({...l,cantidad:numero(micro(l.cantidad)).toFixed(4)}));
}
const material=ls=>ls.map(l=>({numero: l.numero_linea,producto:l.producto_id,cantidad:String(micro(l.cantidad_propia)),factor:String(micro(l.factor_conversion))})).sort((a,b)=>a.numero-b.numero);
async function datosEn(db,o){
 const {rows:facturas}=await db.query("SELECT id,factura_id,documento,lineas,firma FROM orden_compra_ciclo_factura WHERE orden_id=$1 AND estado='vigente' ORDER BY secuencia",[o.id]);
 const {rows:historial}=await db.query('SELECT r.id,r.secuencia,r.final,r.motivos,r.observaciones,r.resumen,r.fecha,u.nombre usuario FROM orden_compra_ciclo_recepcion r LEFT JOIN usuario u ON u.id=r.usuario_id WHERE orden_id=$1 ORDER BY secuencia',[o.id]);
 const lineas=[],pendientes=[],bloqueos=[];
 for(const v of facturas){
  const {rows:[c]}=await db.query('SELECT id,estado,inventario_por_recepcion FROM compra WHERE factura_proveedor_id=$1 FOR SHARE',[v.factura_id]);
  if(!c){pendientes.push({numero:v.documento.numero_consecutivo});continue}
  const {rows:ls}=await db.query(`SELECT l.id,l.numero_linea,l.producto_id,l.descripcion,l.codigo_proveedor,l.unidad,
    l.cantidad::text,l.factor_conversion::text,l.cantidad_propia::text,p.inventariable,
    COALESCE((SELECT SUM(cantidad) FROM orden_compra_ciclo_recepcion_linea WHERE compra_linea_id=l.id),0)::text recibida,
    COALESCE((SELECT SUM(cantidad) FROM movimiento_inventario WHERE origen_tipo='compra' AND origen_id=l.compra_id AND producto_id=l.producto_id),0)::text acreditada,
    (SELECT SUM(cantidad_propia)::text FROM compra_linea WHERE compra_id=l.compra_id AND producto_id=l.producto_id) facturada_producto
    FROM compra_linea l LEFT JOIN producto p ON p.id=l.producto_id WHERE compra_id=$1 ORDER BY numero_linea,id FOR SHARE OF l`,[c.id]);
  const segura=c.estado==='registrada'&&ls.length>0&&ls.every(l=>l.producto_id&&Number(l.cantidad_propia)>0&&Number(l.factor_conversion)>0)
    &&v.lineas.every(l=>!l.revision)&&hash(material(ls))===hash(material(v.lineas));
  if(!segura)bloqueos.push(`Factura ${v.documento.numero_consecutivo}: revisá la compra y su vínculo antes de recibir; cambió la relación o cantidad.`);
  for(const l of ls)lineas.push({...l,compraId:c.id,vinculoId:v.id,numeroFactura:v.documento.numero_consecutivo,
    inventarioPorRecepcion:c.inventario_por_recepcion,segura,pendiente:numero(micro(l.cantidad_propia)-micro(l.recibida))});
 }
 const {rows:pedidas}=await db.query('SELECT producto_id,producto_nombre,cantidad_propia::text FROM orden_compra_ciclo_linea WHERE orden_id=$1 ORDER BY id',[o.id]);
 // El recibido también queda en los snapshots del evento: no derivarlo de
 // estado ENVIADA del buzón, de una aceptación financiera o de stock actual.
 const recibidos=new Map();for(const h of historial)for(const p of h.resumen.incrementos)recibidos.set(p.productoId,(recibidos.get(p.productoId)||0n)+micro(p.cantidad));
 const productos=new Map(pedidas.map(p=>[p.producto_id,{productoId:p.producto_id,nombre:p.producto_nombre,solicitado:Number(p.cantidad_propia),facturado:0,recibido:numero(recibidos.get(p.producto_id)||0n)}]));
 for(const l of lineas){if(!l.producto_id)continue;if(!productos.has(l.producto_id))productos.set(l.producto_id,{productoId:l.producto_id,nombre:l.descripcion,solicitado:0,facturado:0,recibido:numero(recibidos.get(l.producto_id)||0n)});productos.get(l.producto_id).facturado+=Number(l.cantidad_propia)}
 const comparacion=[...productos.values()].map(p=>({...p,noRecibido:Math.max(0,p.solicitado-p.recibido),adicionalRecibido:Math.max(0,p.recibido-p.solicitado),facturadoSinRecibir:Math.max(0,p.facturado-p.recibido),pendiente:['recibida','cerrada'].includes(o.estado)?0:Math.max(0,p.solicitado-p.recibido)}));
 const motivos=historial.at(-1)?.motivos||[];
 const contexto={version:o.version,vinculos:facturas.map(v=>[v.id,v.firma]),lineas,pendientes,bloqueos,recepciones:historial.map(r=>r.id)};
 return {lineas,comprasPendientes:pendientes,bloqueos,comparacion,motivos,historial,revision:hash(contexto),version:o.version,estado:o.estado,completaEn:o.recepcion_completa_en};
}
async function consultar(id){return enOrden(async db=>datosEn(db,await obtenerEn(db,id)))}
function motivosValidos(lista,productos){
 if(!Array.isArray(lista)||lista.length>2500)throw httpError(400,'Revisá los motivos de las diferencias.');
 const r=lista.map(m=>({productoId:entero(m?.productoId),tipo:m?.tipo,detalle:typeof m?.detalle==='string'?m.detalle.trim():''})).sort((a,b)=>a.productoId-b.productoId);
 if(new Set(r.map(m=>m.productoId)).size!==r.length||r.some(m=>!productos.has(m.productoId)||!tipos.includes(m.tipo)||!m.detalle||m.detalle.length>500))throw httpError(400,'Cada motivo requiere producto, causa confirmada y detalle de hasta 500 caracteres.');
 return r;
}
async function registrar(id,datos,usuarioId){
 const clave=uuid(datos?.clave),lineas=cantidades(datos);
 if(datos?.confirmar!==true||typeof datos.final!=='boolean')throw httpError(400,'Confirmá las cantidades físicamente recibidas y si habrá más entregas.');
 const observaciones=typeof datos.observaciones==='string'?datos.observaciones.trim():'';if(observaciones.length>1000)throw httpError(400,'Observaciones: hasta 1000 caracteres.');
 return enOrden(async db=>{
  const o=await obtenerEn(db,id,{bloquear:true});
  const {rows:[anterior]}=await db.query('SELECT orden_id,solicitud FROM orden_compra_ciclo_recepcion WHERE id=$1',[clave]);
  const solicitud={version:datos.version,revision:datos.revision,lineas,final:datos.final,motivos:datos.motivos,observaciones};
  if(anterior){if(anterior.orden_id!==o.id||hash(anterior.solicitud)!==hash(solicitud))throw httpError(409,'La clave de recepción ya corresponde a otros datos.');return {orden:o,...await datosEn(db,o)}}
  revision(o,datos.version);if(!['enviada','parcialmente_recibida'].includes(o.estado))throw httpError(409,'La orden no tiene una recepción abierta.');
  const d=await datosEn(db,o);if(d.revision!==datos.revision)throw httpError(409,'Cambió la compra o recepción. Recargá y revisá las cantidades.');
  if(d.bloqueos.length)throw httpError(409,d.bloqueos[0]);
  if(datos.final&&d.comprasPendientes.length)throw httpError(409,'Registrá y revisá las compras de las facturas vinculadas antes de finalizar.');
  const incrementos=[],compras=new Set();
  for(const l of lineas){const original=d.lineas.find(p=>p.id===l.lineaId);if(!original?.segura)throw httpError(409,'La línea no es una compra revisada de esta orden.');
   if(micro(l.cantidad)>micro(original.cantidad_propia)-micro(original.recibida))throw httpError(409,'La cantidad recibida supera lo pendiente de esta línea facturada.');
   if(micro(l.cantidad)===0n)continue;
   if(original.inventariable&&!original.inventarioPorRecepcion&&micro(original.acreditada)<micro(original.facturada_producto))throw httpError(409,'Compra anterior sin entrada propia completa: no importar stock histórico como una recepción nueva.');
   incrementos.push({productoId:original.producto_id,cantidad:l.cantidad,lineaId:l.lineaId,vinculoId:original.vinculoId});if(original.inventarioPorRecepcion)compras.add(original.compraId);
  }
  if(!datos.final&&!incrementos.length)throw httpError(400,'Una recepción parcial necesita alguna cantidad física mayor que cero.');
  const motivos=motivosValidos(datos.motivos,new Set(d.comparacion.map(p=>p.productoId)));
  const comparacion=d.comparacion.map(p=>{const incremento=incrementos.filter(l=>l.productoId===p.productoId).reduce((a,l)=>a+micro(l.cantidad),0n),recibido=micro(p.recibido)+incremento;
   return {...p,recibido:numero(recibido),noRecibido:numero(micro(p.solicitado)>recibido?micro(p.solicitado)-recibido:0n),facturadoSinRecibir:numero(micro(p.facturado)>recibido?micro(p.facturado)-recibido:0n),adicionalRecibido:numero(recibido>micro(p.solicitado)?recibido-micro(p.solicitado):0n)};});
  if(datos.final&&comparacion.some(p=>(p.noRecibido>0||p.facturadoSinRecibir>0)&&!motivos.some(m=>m.productoId===p.productoId)))throw httpError(400,'Indicá un motivo confirmado para cada diferencia al finalizar la recepción.');
  await db.query(`INSERT INTO orden_compra_ciclo_recepcion(id,orden_id,solicitud,resumen,final,motivos,observaciones,usuario_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[clave,o.id,solicitud,{incrementos,comparacion},datos.final,JSON.stringify(motivos),observaciones||null,usuarioId||null]);
  for(const l of incrementos)await db.query('INSERT INTO orden_compra_ciclo_recepcion_linea(recepcion_id,vinculo_id,compra_linea_id,cantidad) VALUES($1,$2,$3,$4)',[clave,l.vinculoId,l.lineaId,l.cantidad]);
  // Reutiliza el origen compra y su delta, nunca crea otra compra ni otra
  // entrada paralela por recepción. Compras anteriores no se reconcilian.
  for(const compraId of compras)await inventario.reconciliarDocumentoEn(db,'compra',compraId,usuarioId,{recepcionId:clave});
  // Conservar microsegundos del reloj de PostgreSQL; un Date de JS los perdería.
  await db.query(`UPDATE orden_compra_ciclo SET estado=$2,recepcion_id=$3,recepcion_completa_en=CASE WHEN $4::boolean THEN (SELECT fecha FROM orden_compra_ciclo_recepcion WHERE id=$3) ELSE NULL END,version=version+1,actualizado_en=NOW() WHERE id=$1`,[o.id,datos.final?'recibida':'parcialmente_recibida',clave,datos.final]);
  await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:datos.final?'recepcion_final':'recepcion_parcial',despues:{recepcionId:clave,incrementos,motivos},usuarioId});
  const orden=await obtenerEn(db,o.id);return {orden,...await datosEn(db,orden)};
 });
}
module.exports={consultar,registrar};
