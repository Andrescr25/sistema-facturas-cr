const {pool}=require('../../../config/database');
const {enTransaccion}=require('../../utils/transaccion');
const {httpError}=require('../../utils/validacion');
const {interno:{listarEn}}=require('./ordenesCiclo.service');
const {generarExcel}=require('../../utils/exportarExcel');
const {col,contexto,aContexto,siNo,informacion}=require('../rutas/operacionExcel');
const identidad=[col('ordenId','ID orden','numero'),col('referencia','Orden'),col('proveedor','Proveedor','texto',35),...contexto,col('estado','Estado orden')];
const producto=[col('productoId','ID producto','numero'),col('producto','Producto','texto',42),col('codigo','Código interno'),col('codigoProveedor','Código proveedor')];
async function exportar(f={}){
 return enTransaccion(pool,async db=>{
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const ordenes=await listarEn(db,f,{detalleId:f.ordenId??null});if(f.ordenId!=null&&!ordenes.length)throw httpError(404,'La orden no pertenece a la selección.');
  const ids=ordenes.map(o=>o.id),mapa=new Map(ordenes.map(o=>[o.id,o]));
  const lineas=(await db.query(`SELECT l.*,COALESCE(rec.cantidad,0) recibida,
   CASE WHEN o.estado IN ('enviada','parcialmente_recibida') THEN GREATEST(l.cantidad_propia-COALESCE(rec.cantidad,0),0) WHEN o.enviada_en IS NOT NULL THEN 0 END pendiente
   FROM orden_compra_ciclo_linea l JOIN orden_compra_ciclo o ON o.id=l.orden_id
   LEFT JOIN LATERAL (SELECT SUM(rl.cantidad) cantidad FROM orden_compra_ciclo_recepcion_linea rl JOIN orden_compra_ciclo_recepcion r ON r.id=rl.recepcion_id JOIN compra_linea cl ON cl.id=rl.compra_linea_id WHERE r.orden_id=l.orden_id AND cl.producto_id=l.producto_id) rec ON TRUE
   WHERE l.orden_id=ANY($1::int[]) ORDER BY l.orden_id,l.id`,[ids])).rows;
  const origenes=(await db.query('SELECT * FROM orden_compra_ciclo_cobertura WHERE orden_id=ANY($1::int[]) ORDER BY orden_id,producto_id,orden_visita NULLS LAST,faltante_id,id',[ids])).rows;
  // Solo metadatos del documento enviado: exportar nunca regenera ni envía PDF.
  const envios=(await db.query('SELECT orden_id,nombre_archivo,estado,confirmacion,preparado_en,iniciado_en,confirmado_en FROM orden_compra_ciclo_envio WHERE orden_id=ANY($1::int[]) ORDER BY orden_id,secuencia',[ids])).rows;
  const ciclo=f.cicloId&&f.cicloId!=='sin-ciclo'?(await db.query('SELECT id,ruta_nombre AS "rutaNombre",semana::text,estado FROM ciclo_ruta WHERE id=$1',[f.cicloId])).rows[0]:null;
  const id=o=>({ordenId:o.id,referencia:o.referencia,proveedor:o.proveedor_nombre,...aContexto(o.ciclo),estado:o.estado});
  const deProducto=l=>({productoId:l.producto_id,producto:l.producto_nombre,codigo:l.codigo_interno,codigoProveedor:l.codigo_proveedor});
  const hora=v=>v?new Date(v).toLocaleString('es-CR',{timeZone:'America/Costa_Rica'}):null;
  return generarExcel({titulo:'Órdenes de compra por ciclo',prefijo:'ordenes-ciclo',informacion:informacion(ciclo,f,[['Vista',f.ordenId!=null?'Orden seleccionada':f.vista||'activas'],['Orden seleccionada',f.ordenId||'Todas'],['Cantidades','Pedido ORIGINAL en proveedor/propias; borrador/incierto no significa enviado. Recibido proviene solo de eventos físicos.'],['Historia','Archivo24h no libera cobertura. Cierre conserva recibido y libera solo pendiente.'],['Documentos','Excel de consulta; el PDF enviado y las facturas permanecen en la orden.'],['Zona horaria','Fechas/hora de eventos en Costa Rica.']]),
   hojas:[{nombre:'Órdenes',columnas:[...identidad,col('cedula','Cédula proveedor'),col('version','Revisión','numero'),col('confirmado','Envío confirmado'),col('enviadaEn','Enviada (Costa Rica)','texto',28),col('recepcionFinal','Recepción final (Costa Rica)','texto',28),col('archivada','Archivada'),col('cerradaEn','Cierre (Costa Rica)','texto',28),col('motivo','Motivo cierre','texto',55)],filas:ordenes.map(o=>({...id(o),cedula:o.proveedor_cedula,version:o.version,confirmado:siNo(o.enviada_en),enviadaEn:hora(o.enviada_en),recepcionFinal:hora(o.recepcion_completa_en),archivada:siNo(o.archivada),cerradaEn:hora(o.cerrada_en),motivo:o.motivo_cierre}))},
    {nombre:'Productos',columnas:[...identidad,...producto,col('cantidadProveedor','Pedido original proveedor','numero'),col('factor','Conversión guardada','numero'),col('cantidad','Pedido original propias','numero'),col('recibida','Recibido físicamente','numero'),col('pendiente','Pendiente de recibir','numero')],filas:lineas.map(l=>{const o=mapa.get(l.orden_id);return{...id(o),...deProducto(l),cantidadProveedor:l.cantidad_proveedor,factor:l.factor_conversion,cantidad:l.cantidad_propia,recibida:l.recibida,pendiente:l.pendiente}})},
    {nombre:'Procedencia',columnas:[...identidad,col('productoId','ID producto','numero'),col('faltanteId','ID faltante','numero'),col('facturaId','ID factura','numero'),col('factura','Factura'),col('cliente','Cliente','texto',35),col('paradaOrigen','Parada del origen','numero'),col('anticipado','Preventa anticipada'),col('original','Asignación original','numero'),col('cubierta','Cobertura válida','numero'),col('recibida','Recibido asignado','numero')],filas:origenes.map(r=>({...id(mapa.get(r.orden_id)),productoId:r.producto_id,faltanteId:r.faltante_id,facturaId:r.factura_id,factura:r.factura_numero,cliente:r.cliente_nombre,paradaOrigen:r.orden_visita,anticipado:siNo(r.anticipado),original:r.cantidad,cubierta:r.cobertura,recibida:r.cantidad_recibida}))},
    {nombre:'Envíos',columnas:[...identidad,col('archivo','Documento PDF','texto',50),col('estadoEnvio','Estado envío'),col('confirmacion','Confirmación'),col('preparado','Preparado (Costa Rica)','texto',28),col('iniciado','Iniciado (Costa Rica)','texto',28),col('confirmadoEn','Confirmado (Costa Rica)','texto',28)],filas:envios.map(e=>({...id(mapa.get(e.orden_id)),archivo:e.nombre_archivo,estadoEnvio:e.estado,confirmacion:e.confirmacion,preparado:hora(e.preparado_en),iniciado:hora(e.iniciado_en),confirmadoEn:hora(e.confirmado_en)}))}]});
 });
}
module.exports={exportar};
