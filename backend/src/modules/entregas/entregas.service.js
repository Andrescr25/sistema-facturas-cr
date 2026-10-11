const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { idValido, httpError } = require('../../utils/validacion');
const { COLUMNAS_CICLO, JOIN_CICLO, contextoDocumento, filtrosOperacion } = require('../rutas/operacionCiclo.service');

const entero = (v, nombre) => {
  if(!((typeof v==='number'&&Number.isSafeInteger(v))||(typeof v==='string'&&/^[1-9]\d*$/.test(v))))
    throw httpError(400,`${nombre} inválido.`);
  const n=idValido(v);
  if(n>2147483647)throw httpError(400,`${nombre} inválido.`);
  return n;
};
function validar({cicloId,rutaId,pagina=1,tamano=20}={}) {
  // Nunca usar «la semana actual» ni consultar todas las rutas implícitamente.
  if(cicloId==null||cicloId==='')throw httpError(400,'Elegí una semana o Sin ciclo.');
  if(cicloId!=='sin-ciclo')entero(cicloId,'Ciclo');
  if(rutaId!=null&&rutaId!==''&&rutaId!=='sin-ciclo')entero(rutaId,'Ruta');
  pagina=entero(pagina,'Página');tamano=entero(tamano,'Tamaño de página');
  if(tamano>50)throw httpError(400,'Como máximo 50 paradas por página.');
  return{cicloId,rutaId,pagina,tamano};
}
const lectura = fn => enTransaccion(pool,async db=>{
  // Cabeceras, faltantes y líneas deben pertenecer a la misma lectura.
  // Ni consultar el plan ni abrir una parada pueden asignar o cambiar datos.
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  return fn(db);
});
async function recorridoEn(db,filtros) {
  let ciclo=null;
  if(filtros.cicloId!=='sin-ciclo') {
    const {rows:[c]}=await db.query(`SELECT id,ruta_id AS "rutaId",ruta_nombre AS "rutaNombre",semana::text,estado
      FROM ciclo_ruta WHERE id=$1 AND recorrido_fijado`,[entero(filtros.cicloId,'Ciclo')]);
    if(!c)throw httpError(404,'No existe esa semana con recorrido fijado.');
    ciclo=c;
  }
  const params=[],where=[];filtrosOperacion(filtros,where,params);
  const filtro=where.join(' AND ');
  const {rows}=await db.query(`
    SELECT 'factura' tipo,f.id,f.numero,f.cliente_id,
      COALESCE(rc.cliente_nombre,f.cliente_nombre) cliente_nombre,rc.id parada_id,
      f.estado_bodega,f.preventa_anticipada,${COLUMNAS_CICLO},rc.ubicacion_maps,
      p.id pedido_id,p.origen,entrega_resumen(f.id) avance,
      (SELECT COUNT(*)::int FROM faltantes x WHERE x.factura_propia_id=f.id
        AND x.tipo_faltante<>'completo' AND x.cantidad_faltante>0 AND x.estado IN ('pendiente','procesado')) faltantes
    FROM factura f ${JOIN_CICLO('f')}
    LEFT JOIN LATERAL (SELECT id,origen FROM pedido_cliente WHERE factura_id=f.id
      AND cliente_id IS NOT DISTINCT FROM f.cliente_id
      AND ciclo_ruta_cliente_id IS NOT DISTINCT FROM f.ciclo_ruta_cliente_id ORDER BY id LIMIT 1) p ON TRUE
    WHERE f.estado='emitida' AND ${filtro}
    UNION ALL
    SELECT 'pedido' tipo,p.id,NULL numero,p.cliente_id,
      COALESCE(rc.cliente_nombre,p.cliente_nombre) cliente_nombre,rc.id parada_id,
      NULL estado_bodega,p.preventa_anticipada,${COLUMNAS_CICLO},rc.ubicacion_maps,
      p.id pedido_id,p.origen,NULL avance,0 faltantes
    FROM pedido_cliente p ${JOIN_CICLO('p')}
    WHERE p.estado='pendiente' AND p.factura_id IS NULL AND ${filtro}
  `,params);
  const grupos=new Map();
  for(const f of rows){
    const contexto=contextoDocumento(f);
    const clave=f.parada_id?`rc-${f.parada_id}`:f.cliente_id?`cl-${f.cliente_id}`:`${f.tipo==='factura'?'f':'p'}-${f.id}`;
    if(!grupos.has(clave))grupos.set(clave,{clave,clienteId:f.cliente_id,clienteNombre:f.cliente_nombre||'Cliente sin nombre',
      ...contexto,documentos:[]});
    // Lista blanca para el chofer: no precios, costos, saldos o cuentas.
    grupos.get(clave).documentos.push({tipo:f.tipo,id:f.id,numero:f.numero,pedidoId:f.pedido_id,
      origen:f.origen,anticipado:contexto.anticipado,estadoBodega:f.estado_bodega,
      revisionBodega:f.tipo==='factura'&&f.estado_bodega==='procesado',faltantes:f.faltantes,avance:f.avance});
  }
  const paradas=[...grupos.values()].sort((a,b)=>(a.ciclo?.orden??Infinity)-(b.ciclo?.orden??Infinity)
    ||a.clienteNombre.localeCompare(b.clienteNombre,'es')||a.clave.localeCompare(b.clave));
  for(const p of paradas){p.documentos.sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.id-b.id);delete p.anticipado}
  return{ciclo,paradas};
}
function aPlan({ciclo,paradas},{pagina,tamano}) {
  const documentos=paradas.flatMap(p=>p.documentos);
  // La sugerencia considera TODA la ruta, no solo la página visible. Una
  // revisión de bodega no confirma carga/entrega ni disponibilidad completa.
  const carga=ciclo?[...paradas].reverse().flatMap(p=>{
    const facturas=p.documentos.filter(d=>d.revisionBodega&&d.avance?.estado!=='entregada');
    if(!facturas.length)return[];
    const indice=paradas.findIndex(x=>x.clave===p.clave);
    return[{clave:p.clave,clienteNombre:p.clienteNombre,ciclo:p.ciclo,ubicacion_maps:p.ubicacion_maps,
      pagina:Math.floor(indice/tamano)+1,facturas}];
  }).map((p,i)=>({...p,ordenCarga:i+1})):[];
  const paginas=Math.max(1,Math.ceil(paradas.length/tamano));
  return{ciclo,paradas:paradas.slice((pagina-1)*tamano,pagina*tamano),carga,
    resumen:{paradas:paradas.length,facturas:documentos.filter(d=>d.tipo==='factura').length,
      revisadas:documentos.filter(d=>d.revisionBodega).length,pedidosSinFacturar:documentos.filter(d=>d.tipo==='pedido').length},
    paginacion:{pagina,tamano,paginas,total:paradas.length}};
}
async function plan(datos){const filtros=validar(datos);return lectura(async db=>aPlan(await recorridoEn(db,filtros),filtros))}
async function parada(clave,datos) {
  if(typeof clave!=='string'||!/^(rc|cl|f|p)-[1-9]\d*$/.test(clave))throw httpError(400,'Parada inválida.');
  entero(clave.split('-')[1],'Parada');const filtros=validar(datos);
  return lectura(async db=>{
    const r=await recorridoEn(db,filtros),p=r.paradas.find(p=>p.clave===clave);
    if(!p)throw httpError(404,'Esa parada no pertenece a la selección.');
    const facturas=p.documentos.filter(d=>d.tipo==='factura').map(d=>d.id),pedidos=p.documentos.filter(d=>d.tipo==='pedido').map(d=>d.id);
    const rows=await lineasEn(db,facturas,pedidos);
    return{...p,documentos:p.documentos.map(d=>({...d,lineas:rows.filter(l=>l.tipo===d.tipo&&l.documento_id===d.id)
      .map(l=>({productoId:l.producto_id,nombre:l.nombre,referencia:l.referencia,descripcion:l.descripcion,cantidad:Number(l.cantidad)}))}))};
  });
}
async function lineasEn(db,facturas,pedidos){
  return(await db.query(`SELECT 'factura' tipo,factura_id documento_id,numero_linea orden,producto_id,nombre,referencia,descripcion,cantidad
    FROM factura_linea WHERE factura_id=ANY($1::int[])
    UNION ALL SELECT 'pedido',pedido_id,id,producto_id,nombre_producto,referencia,NULL,cantidad
    FROM pedido_cliente_linea WHERE pedido_id=ANY($2::int[]) ORDER BY tipo,documento_id,orden`,[facturas,pedidos])).rows;
}
async function paraExportar(datos){
  const filtros=validar({...datos,pagina:1,tamano:20});
  return lectura(async db=>{
    const completo=await recorridoEn(db,filtros),r={...completo,paradas:completo.paradas};
    // El detalle exportado es la parada visible; el recorrido toma TODAS las
    // páginas. Filtrar una clave nunca permite consultar otra semana.
    if(datos?.clave!=null){
      if(typeof datos.clave!=='string'||!/^(rc|cl|f|p)-[1-9]\d*$/.test(datos.clave))throw httpError(400,'Parada inválida.');
      entero(datos.clave.split('-')[1],'Parada');
      const p=r.paradas.find(p=>p.clave===datos.clave);if(!p)throw httpError(404,'Esa parada no pertenece a la selección.');r.paradas=[p];
    }
    const ds=r.paradas.flatMap(p=>p.documentos);
    const lineas=await lineasEn(db,ds.filter(d=>d.tipo==='factura').map(d=>d.id),ds.filter(d=>d.tipo==='pedido').map(d=>d.id));
    const plan=aPlan(r,{pagina:1,tamano:Math.max(1,r.paradas.length)});
    // La sugerencia de carga conserva su posición en el recorrido completo,
    // también al descargar el detalle de una parada intermedia.
    if(datos?.clave!=null){plan.carga=aPlan(completo,{pagina:1,tamano:20}).carga.filter(p=>p.clave===datos.clave)}
    return{...plan,lineas};
  });
}
module.exports={plan,parada,paraExportar};
