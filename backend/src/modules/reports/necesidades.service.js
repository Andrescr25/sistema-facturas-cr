const {pool}=require('../../../config/database');
const {enTransaccion}=require('../../utils/transaccion');
const {httpError}=require('../../utils/validacion');
const {filtrosOperacion,JOIN_CICLO,COLUMNAS_CICLO}=require('../rutas/operacionCiclo.service');
const {aCiclo}=require('../rutas/documentosCiclo.service');

const entero=(v,max=2147483647)=>{
 if(!((typeof v==='number'&&Number.isSafeInteger(v))||(typeof v==='string'&&/^[1-9]\d*$/.test(v)))||Number(v)<1||Number(v)>max)throw httpError(400,'Identificador o página inválidos.');
 return Number(v);
};
function validar({cicloId,rutaId,q='',pagina=1,tamano=20}={}){
 if(cicloId==null||cicloId==='')throw httpError(400,'Elegí una semana o Sin ciclo.');
 for(const v of [cicloId,rutaId])if(v!=null&&v!==''&&v!=='sin-ciclo')entero(v);
 if(typeof q!=='string'||q.length>200)throw httpError(400,'La búsqueda admite hasta 200 caracteres.');
 return{cicloId,rutaId,q:q.trim(),pagina:entero(pagina),tamano:entero(tamano,50)};
}
// Cantidades propias hasta seis decimales (conversiones de proveedor). No
// acumular puntos flotantes ni descontar el compromiso del kardex otra vez.
const micro=v=>{const [entera,decimal='']=String(v??0).split('.');return BigInt(entera)*1000000n+BigInt(decimal.padEnd(6,'0').slice(0,6));};
const texto=v=>`${v/1000000n}.${String(v%1000000n).padStart(6,'0')}`;
const positivo=v=>v>0n?v:0n;
const CAMPOS=['comprometido','porFacturar','entregado','enCamion','faltanteRegistrado','cubierta','reservadaBorrador','envioPorVerificar','solicitado','pendienteRecibir','recibido','sinCobertura'];
const origen=r=>({tipo:r.tipo,documentoId:r.documento_id,facturaId:r.factura_id,pedidoId:r.pedido_id,numero:r.numero,
 clienteId:r.cliente_id,clienteNombre:r.cliente_nombre,ciclo:aCiclo(r),anticipado:r.preventa_anticipada===true});

async function consultar(filtros,{completa=false}={}){
 const f=validar(filtros);
 return enTransaccion(pool,async db=>{
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  let ciclo=null;
  if(f.cicloId!=='sin-ciclo'){
   ciclo=(await db.query('SELECT id,ruta_id AS "rutaId",ruta_nombre AS "rutaNombre",semana::text,estado FROM ciclo_ruta WHERE id=$1 AND recorrido_fijado',[entero(f.cicloId)])).rows[0];
   if(!ciclo)throw httpError(404,'No existe esa semana con recorrido fijado.');
  }
  const where=[],params=[];filtrosOperacion(f,where,params);const filtro=where.join(' AND ');
  // Una factura sustituye al pedido de origen. Leer sólo pedidos pendientes
  // SIN factura evita contabilizar dos veces la preventa al facturarla.
  // Una reimpresión requiere revisión física; no reasignar su entrega vieja
  // a productos/líneas nuevas ni afirmar cantidades pendientes desconocidas.
  const demandas=(await db.query(`WITH facturas_del_ciclo AS MATERIALIZED (
   SELECT f.*,e.saldos,(f.alegra_id IS NOT NULL AND e.id IS NULL) historico,
    CASE WHEN e.id IS NULL THEN f.alegra_id IS NOT NULL ELSE e.documento IS DISTINCT FROM entrega_documento(f.id) END revisar
   FROM factura f ${JOIN_CICLO('f')} LEFT JOIN LATERAL
    (SELECT id,documento,saldos FROM entrega_evento WHERE factura_id=f.id ORDER BY version DESC LIMIT 1) e ON TRUE
   WHERE f.estado='emitida' AND ${filtro})
   SELECT 'factura' tipo,f.id documento_id,f.id factura_id,p.id pedido_id,f.numero,f.cliente_id,
    COALESCE(rc.cliente_nombre,f.cliente_nombre) cliente_nombre,f.preventa_anticipada,${COLUMNAS_CICLO},
    l.producto_id,MIN(l.nombre) nombre,MIN(l.referencia) referencia,f.revisar,f.historico,array_agg(l.numero_linea ORDER BY l.numero_linea) lineas,
    SUM(GREATEST(l.cantidad,0)) cantidad,
    CASE WHEN f.revisar THEN NULL ELSE SUM(GREATEST(l.cantidad-COALESCE((s.x->>'entregada')::numeric,0),0)) END pendiente,
    CASE WHEN f.revisar THEN NULL ELSE SUM(COALESCE((s.x->>'entregada')::numeric,0)) END entregada,
    CASE WHEN f.revisar THEN NULL ELSE SUM(COALESCE((s.x->>'cargada')::numeric,0)-COALESCE((s.x->>'entregada')::numeric,0)-COALESCE((s.x->>'descargada')::numeric,0)) END camion
   FROM facturas_del_ciclo f ${JOIN_CICLO('f')} JOIN factura_linea l ON l.factura_id=f.id
   LEFT JOIN LATERAL (SELECT x FROM jsonb_array_elements(COALESCE(f.saldos,'[]')) x WHERE (x->>'numeroLinea')::int=l.numero_linea) s ON TRUE
   LEFT JOIN LATERAL (SELECT id FROM pedido_cliente WHERE factura_id=f.id AND cliente_id IS NOT DISTINCT FROM f.cliente_id
    AND ciclo_ruta_cliente_id IS NOT DISTINCT FROM f.ciclo_ruta_cliente_id ORDER BY id LIMIT 1) p ON TRUE
   GROUP BY f.id,p.id,f.numero,f.cliente_id,rc.cliente_nombre,f.cliente_nombre,f.preventa_anticipada,cr.id,rc.orden,l.producto_id,f.revisar,f.historico,CASE WHEN l.producto_id IS NULL THEN l.numero_linea ELSE NULL END
   UNION ALL
   SELECT 'pedido',p.id,NULL,p.id,NULL,p.cliente_id,COALESCE(rc.cliente_nombre,p.cliente_nombre),p.preventa_anticipada,${COLUMNAS_CICLO},
    l.producto_id,MIN(l.nombre_producto),MIN(l.referencia),FALSE,FALSE,array_agg(l.id ORDER BY l.id),SUM(GREATEST(l.cantidad,0)),SUM(GREATEST(l.cantidad,0)),0,0
   FROM pedido_cliente p ${JOIN_CICLO('p')} JOIN pedido_cliente_linea l ON l.pedido_id=p.id
   WHERE p.estado='pendiente' AND p.factura_id IS NULL AND ${filtro}
   GROUP BY p.id,rc.cliente_nombre,cr.id,rc.orden,l.producto_id,CASE WHEN l.producto_id IS NULL THEN l.id ELSE NULL END`,params)).rows;
  const faltantes=(await db.query(`SELECT 'faltante' tipo,f.id documento_id,fa.id factura_id,fa.numero,fa.cliente_id,
   COALESCE(rc.cliente_nombre,fa.cliente_nombre) cliente_nombre,fa.preventa_anticipada,${COLUMNAS_CICLO},
   f.producto_propio_id producto_id,f.cantidad_faltante,f.estado,f.proveedor_asignado,f.proveedor_cedula
   FROM faltantes f JOIN factura fa ON fa.id=f.factura_propia_id ${JOIN_CICLO('fa')}
   WHERE fa.estado='emitida' AND f.estado IN ('pendiente','procesado') AND f.tipo_faltante<>'completo' AND f.cantidad_faltante>0 AND ${filtro} ORDER BY f.id`,params)).rows;
  const cobertura=(await db.query(`SELECT c.faltante_id,c.orden_id,c.estado,c.cantidad,c.cobertura,c.cantidad_recibida,
   o.proveedor_nombre,e.estado envio_estado FROM orden_compra_ciclo_cobertura c JOIN orden_compra_ciclo o ON o.id=c.orden_id
   LEFT JOIN orden_compra_ciclo_envio e ON e.id=o.envio_id WHERE c.faltante_id=ANY($1::int[]) ORDER BY c.orden_id,c.faltante_id`,[faltantes.map(x=>x.documento_id)])).rows;
  const filtroOrden=filtro.replaceAll('rc.id IS NULL','o.ciclo_id IS NULL');
  // Leer cada línea una sola vez. Un empaque puede cubrir varios faltantes,
  // pero su cantidad solicitada/recibida no se multiplica por esos orígenes.
  const compras=(await db.query(`SELECT o.id,o.estado,o.proveedor_id,o.proveedor_nombre,o.archivada,o.semana::text,o.ruta_nombre,
   e.estado envio_estado,l.producto_id,l.producto_nombre,l.cantidad_propia,l.cantidad_proveedor,l.factor_conversion,
   COALESCE(rec.cantidad,0) recibida FROM orden_compra_ciclo_operativa o JOIN orden_compra_ciclo_linea l ON l.orden_id=o.id
   LEFT JOIN ciclo_ruta cr ON cr.id=o.ciclo_id LEFT JOIN orden_compra_ciclo_envio e ON e.id=o.envio_id
   LEFT JOIN LATERAL (SELECT SUM(rl.cantidad) cantidad FROM orden_compra_ciclo_recepcion_linea rl
     JOIN orden_compra_ciclo_recepcion re ON re.id=rl.recepcion_id JOIN compra_linea cl ON cl.id=rl.compra_linea_id
     WHERE re.orden_id=o.id AND cl.producto_id=l.producto_id) rec ON TRUE
   WHERE (o.estado<>'cerrada' OR o.enviada_en IS NOT NULL) AND ${filtroOrden} ORDER BY o.id,l.id`,params)).rows;
  const ids=[...new Set([...demandas,...faltantes,...compras].map(x=>x.producto_id).filter(x=>x!=null))];
  const productos=(await db.query(`SELECT p.id,p.nombre,p.referencia,p.activo,p.inventariable,
   COALESCE(s.existencia,0) existencia,COALESCE(s.conteo_confirmado,FALSE) conteo_confirmado
   FROM producto p LEFT JOIN inventario_saldo s ON s.producto_id=p.id WHERE p.id=ANY($1::int[])`,[ids])).rows;
  const grupos=new Map(productos.map(p=>[p.id,{productoId:p.id,nombre:p.nombre,codigo:p.referencia,activo:p.activo,
   stock:{inventariable:p.inventariable,existencia:p.inventariable?p.existencia:null,conteoConfirmado:p.conteo_confirmado,alcance:'general'},
   cantidades:Object.fromEntries(CAMPOS.map(k=>[k,0n])),requiereRevision:false,origenes:[],compras:[]} ]));
  const sinProducto=[];
  for(const d of demandas){
   const item={...origen(d),lineas:d.lineas,cantidad:d.cantidad,pendiente:d.pendiente,entregada:d.entregada,enCamion:d.camion,requiereRevision:d.revisar,historicoSinEntrega:d.historico};
   const g=grupos.get(d.producto_id);
   if(!g){sinProducto.push({...item,nombre:d.nombre,codigo:d.referencia});continue}
   g.origenes.push(item);g.requiereRevision ||= d.revisar;
   if(d.tipo==='pedido')g.cantidades.porFacturar+=micro(d.pendiente);
   else if(!d.revisar){g.cantidades.comprometido+=micro(d.pendiente);g.cantidades.entregado+=micro(d.entregada);g.cantidades.enCamion+=micro(d.camion)}
  }
  for(const d of faltantes){
   const g=grupos.get(d.producto_id),asignaciones=cobertura.filter(c=>c.faltante_id===d.documento_id);
   const cub=asignaciones.reduce((s,c)=>s+micro(c.cobertura),0n),sin=positivo(micro(d.cantidad_faltante)-cub);
   const item={...origen(d),cantidad:d.cantidad_faltante,estado:d.estado,proveedor:d.proveedor_asignado,
    cubierta:texto(cub),sinCobertura:texto(sin),coberturaEnExceso:texto(positivo(cub-micro(d.cantidad_faltante))),
    ordenes:asignaciones.map(c=>({ordenId:c.orden_id,estado:c.estado,envioEstado:c.envio_estado,proveedor:c.proveedor_nombre,
     cantidad:c.cantidad,cubierta:c.cobertura,recibida:c.cantidad_recibida}))};
   if(!g){sinProducto.push(item);continue}g.origenes.push(item);
   g.cantidades.faltanteRegistrado+=micro(d.cantidad_faltante);g.cantidades.cubierta+=cub;g.cantidades.sinCobertura+=sin;
   for(const c of asignaciones){if(['enviando','incierto'].includes(c.envio_estado))g.cantidades.envioPorVerificar+=micro(c.cobertura);
    else if(['borrador','pendiente_enviar'].includes(c.estado))g.cantidades.reservadaBorrador+=micro(c.cobertura)}
  }
  for(const o of compras){
   const g=grupos.get(o.producto_id),solicitada=['enviada','parcialmente_recibida','recibida','cerrada'].includes(o.estado),pendiente=['enviada','parcialmente_recibida'].includes(o.estado)?positivo(micro(o.cantidad_propia)-micro(o.recibida)):0n;
   g.compras.push({ordenId:o.id,estado:o.estado,envioEstado:o.envio_estado,proveedorId:o.proveedor_id,proveedor:o.proveedor_nombre,archivada:o.archivada,
    cantidad:o.cantidad_propia,cantidadProveedor:o.cantidad_proveedor,factorConversion:o.factor_conversion,recibida:o.recibida,pendiente:texto(pendiente),
    rutaNombre:o.ruta_nombre,semana:o.semana});
   if(solicitada)g.cantidades.solicitado+=micro(o.cantidad_propia);
   g.cantidades.pendienteRecibir+=pendiente;g.cantidades.recibido+=micro(o.recibida);
  }
  const buscar=f.q.toLocaleLowerCase('es');
  const todos=[...grupos.values()].map(g=>({...g,cantidades:{...Object.fromEntries(CAMPOS.map(k=>[k,texto(g.cantidades[k])])),
   comprometido:g.requiereRevision?null:texto(g.cantidades.comprometido),comprometidoVerificado:texto(g.cantidades.comprometido),
   requerido:g.requiereRevision?null:texto(g.cantidades.comprometido+g.cantidades.porFacturar),requeridoVerificado:texto(g.cantidades.comprometido+g.cantidades.porFacturar)}}))
   .filter(g=>`${g.nombre} ${g.codigo||''} P-${g.productoId}`.toLocaleLowerCase('es').includes(buscar)).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')||a.productoId-b.productoId);
  for(const g of todos)g.origenes.sort((a,b)=>(a.ciclo?.orden??Infinity)-(b.ciclo?.orden??Infinity)||a.tipo.localeCompare(b.tipo)||a.documentoId-b.documentoId);
  const sinRelacion=sinProducto.filter(d=>`${d.nombre||''} ${d.codigo||''}`.toLocaleLowerCase('es').includes(buscar));
  return{ciclo,productos:completa?todos:todos.slice((f.pagina-1)*f.tamano,f.pagina*f.tamano),sinProducto:completa?sinRelacion:sinRelacion.slice((f.pagina-1)*f.tamano,f.pagina*f.tamano),
   resumen:{productos:todos.length,pedidosPorFacturar:new Set(demandas.filter(d=>d.tipo==='pedido').map(d=>d.documento_id)).size,
    documentosPorRevisar:new Set(demandas.filter(d=>d.revisar).map(d=>d.documento_id)).size,sinProducto:sinProducto.length},
   paginacion:{pagina:f.pagina,tamano:f.tamano,total:todos.length,sinProducto:sinRelacion.length,paginas:Math.max(1,Math.ceil(todos.length/f.tamano),Math.ceil(sinRelacion.length/f.tamano))}};
 });
}
// Exportar reutiliza UNA lectura coherente, nunca une respuestas paginadas.
module.exports={listar:f=>consultar(f),paraExportar:f=>consultar({...f,pagina:1,tamano:20},{completa:true})};
