const service=require('./entregas.service');
const {generarExcel}=require('../../utils/exportarExcel');
// Cantidades con seis decimales visibles: cero no significa desconocido. La
// versión «por ciclo» (contexto de semana, orden y Maps de la semana) se retiró
// el 2026-10-20 con los ciclos; el Excel es siempre el de la ruta.
const col=(clave,titulo,tipo='texto',ancho=22)=>({clave,titulo,tipo,ancho,...(tipo==='numero'?{formato:'#,##0.######'}:{})});
const siNo=v=>v?'Sí':'No';
const identificacion=[col('clave','Parada'),col('cliente','Cliente','texto',35),col('ruta','Ruta','texto',32),col('rutaId','ID ruta','numero'),col('parada','Orden de entrega','numero')];
const documentos=[col('tipo','Documento'),col('documentoId','ID documento','numero'),col('numero','Factura'),col('pedidoId','ID pedido origen','numero'),col('origen','Origen pedido'),col('bodega','Estado bodega'),col('avance','Avance físico'),col('revision','Requiere revisión física'),col('versionAvance','Revisión del avance','numero')];
const deParada=p=>({clave:p.clave,cliente:p.clienteNombre,ruta:p.ruta?.nombre||'Sin ruta',rutaId:p.ruta?.id,parada:p.ruta?.orden,maps:p.ubicacion_maps});
const deDocumento=d=>({tipo:d.tipo,documentoId:d.id,numero:d.numero,pedidoId:d.pedidoId,origen:d.origen||'Factura directa',bodega:d.estadoBodega,avance:d.avance?.estado||'Por facturar',revision:siNo(d.avance?.estado==='requiere_revision'),versionAvance:d.avance?.version,enCamion:d.avance?.estado==='requiere_revision'?null:d.avance?.enCamion,entregada:d.avance?.estado==='requiere_revision'?null:d.avance?.entregada,camionAnterior:d.avance?.estado==='requiere_revision'?d.avance.enCamion:null,entregadaAnterior:d.avance?.estado==='requiere_revision'?d.avance.entregada:null});
async function exportar(f={}){
 const d=await service.paraExportar(f);
 const info=[['Ruta',d.ruta?.nombre],['Vista',f.vista==='historial'?'Historial físico':'Facturas pendientes de entregar'],['Carga','Todas las facturas pendientes de la ruta, en orden inverso; revisar Bodega antes de cargar.'],['Historial','La ruta de una carga registrada queda fijada.'],['Páginas','Todos los resultados, no solo la página visible.']];
 return generarExcel({titulo:'Carga y entregas por ruta',prefijo:'entregas-ruta',informacion:info,
  hojas:[{nombre:'Recorrido',columnas:[...identificacion,col('maps','Ubicación Maps','texto',45),col('facturas','Facturas','numero'),col('pedidos','Pedidos por facturar','numero')],filas:d.paradas.map(p=>({...deParada(p),facturas:p.documentos.filter(d=>d.tipo==='factura').length,pedidos:p.documentos.filter(d=>d.tipo==='pedido').length}))},
   {nombre:'Documentos',columnas:[...identificacion,...documentos,col('enCamion','En camión suma de líneas','numero'),col('entregada','Entregado suma de líneas','numero'),col('camionAnterior','En camión anterior por revisar','numero'),col('entregadaAnterior','Entregado anterior por revisar','numero')],filas:d.paradas.flatMap(p=>p.documentos.map(doc=>({...deParada(p),...deDocumento(doc)})))},
   {nombre:'Productos',columnas:[...identificacion,...documentos,col('numeroLinea','Número línea factura','numero'),col('lineaPedidoId','ID línea pedido','numero'),col('productoId','ID producto','numero'),col('codigo','Código'),col('producto','Producto','texto',45),col('descripcion','Descripción','texto',45),col('cantidad','Cantidad del documento','numero')],filas:d.paradas.flatMap(p=>p.documentos.flatMap(doc=>d.lineas.filter(l=>l.tipo===doc.tipo&&l.documento_id===doc.id).map(l=>({...deParada(p),...deDocumento(doc),numeroLinea:l.tipo==='factura'?l.orden:null,lineaPedidoId:l.tipo==='pedido'?l.orden:null,productoId:l.producto_id,codigo:l.referencia,producto:l.nombre,descripcion:l.descripcion,cantidad:l.cantidad}))))},
   {nombre:'Carga sugerida',columnas:[col('ordenCarga','Orden sugerido de carga','numero'),...identificacion,col('maps','Ubicación Maps','texto',45),...documentos,col('faltantes','Líneas con faltantes','numero')],filas:d.carga.flatMap(p=>p.facturas.map(doc=>({...deParada(p),ordenCarga:p.ordenCarga,...deDocumento(doc),faltantes:doc.faltantes})))}]});
}
module.exports={exportar};
