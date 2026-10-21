const { faltanteOperativo, cantidadPendiente } = require('../reports/faltantesCompra.sql');
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError } = require('../../utils/validacion');
const { mappingProveedor, asignadoAlProveedor } = require('../reports/proveedorCompra.sql');

const entero = (v, etiqueta='Identificador', max=2147483647) => {
  if (!((typeof v==='number' && Number.isSafeInteger(v)) || (typeof v==='string' && /^[1-9]\d*$/.test(v))) || Number(v)<1 || Number(v)>max)
    throw httpError(400, `${etiqueta}: entero positivo válido requerido.`);
  return Number(v);
};
// Seis decimales, igual que SQL. No redondear cocientes binarios antes de
// pedir cajas: una fracción pequeña también requiere una unidad del proveedor.
function micros(v) {
  const [entera,decimal='']=String(v).split('.');
  return BigInt(entera)*1000000n+BigInt(decimal.padEnd(6,'0').slice(0,6));
}
const cantidadDe = v => `${v/1000000n}.${String(v%1000000n).padStart(6,'0')}`;
// Un bloqueo breve para reservar/editar/cerrar: dos operadores nunca descuentan
// a la vez la misma necesidad. Los faltantes también se bloquean por id.
const enOrden = trabajo => enTransaccion(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(46005,1)');return trabajo(db)});
function proveedorValido(p,{activo=true}={}) {
  if (!p) throw httpError(404,'No existe la ficha propia del proveedor.');
  if (activo && !p.activo) throw httpError(409,'El proveedor está inactivo.');
  return p;
}
async function proveedorEn(db,id,{ activo=true,bloquear=true,contactos=false }={}) {
  const {rows:[p]}=await db.query(`SELECT id,nombre,identificacion,activo${contactos?',telefono_whatsapp,telefono':''} FROM proveedor WHERE id=$1 ${bloquear?'FOR SHARE':''}`,[id]);
  return proveedorValido(p,{activo});
}
async function resolverProveedorEn(db,{ proveedorId,cedula,nombre }={},opciones={}) {
  if (proveedorId!=null) return proveedorEn(db,entero(proveedorId),opciones);
  if (cedula!=null && (typeof cedula!=='string' || cedula.length>20)) throw httpError(400,'Cédula inválida.');
  if (nombre!=null && (typeof nombre!=='string' || nombre.length>200)) throw httpError(400,'Nombre inválido.');
  let rows;
  const campos=opciones.contactos?'id,nombre,identificacion,activo,telefono_whatsapp,telefono':'id';
  if (cedula?.trim() && cedula!=='SIN_PROVEEDOR') ({rows}=await db.query(`SELECT ${campos} FROM proveedor WHERE identificacion=$1`,[cedula.trim()]));
  else if (nombre?.trim() && nombre!=='Sin_Proveedor') ({rows}=await db.query(`SELECT ${campos} FROM proveedor WHERE lower(btrim(nombre))=lower(btrim($1)) LIMIT 2`,[nombre]));
  if (!rows?.length) throw httpError(409,'Guardá primero la ficha de este proveedor; no se puede crear una orden por un nombre sin ficha.');
  if (rows.length!==1) throw httpError(409,'Hay varias fichas con ese nombre. Identificá al proveedor por su cédula.');
  if (opciones.contactos && opciones.bloquear===false) return proveedorValido(rows[0],opciones);
  return proveedorEn(db,rows[0].id,opciones);
}
async function necesidadesEn(db,p,excluirOrden=null,{ bloquear=false }={}) {
  // La reserva se cuenta por FALTANTE, incluso si se reasigna el proveedor.
  // No descontar stock provisional ni llamar al borrador «ya pedido».
  const {rows}=await db.query(`SELECT f.id AS "faltanteId",f.producto_propio_id AS "productoId",${cantidadPendiente()} AS cantidad_faltante,
    p.nombre,p.referencia,fa.id AS "facturaId",fa.numero,fa.cliente_id,fa.cliente_nombre,
    m.id AS mapping_id,m.supplier_code,m.supplier_desc,COALESCE(m.factor_conversion,1) AS factor_conversion,
    COALESCE((SELECT SUM(r.cobertura) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND ($3::int IS NULL OR r.orden_id<>$3)),0) AS reservada,
    COALESCE((SELECT SUM(r.cobertura) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND r.estado IN ('enviada','parcialmente_recibida','recibida','cerrada') AND ($3::int IS NULL OR r.orden_id<>$3)),0) AS solicitada,
    COALESCE((SELECT SUM(GREATEST(r.cobertura-r.cantidad_recibida,0)) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND r.estado IN ('enviada','parcialmente_recibida') AND ($3::int IS NULL OR r.orden_id<>$3)),0) AS pendiente_recibir,
    COALESCE((SELECT SUM(r.cantidad_recibida) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND ($3::int IS NULL OR r.orden_id<>$3)),0) AS recibida
    FROM faltantes f JOIN producto p ON p.id=f.producto_propio_id JOIN factura fa ON fa.id=f.factura_propia_id
    LEFT JOIN LATERAL (${mappingProveedor('p.id','$1','$2')}) m ON TRUE
    WHERE ${faltanteOperativo()} AND ${cantidadPendiente()}>0
      AND ${asignadoAlProveedor('$1','$2','$4')}
    ORDER BY f.id ${bloquear?'FOR UPDATE OF f':''}`,[p.id,p.identificacion,excluirOrden,p.nombre]);
  return rows;
}
function agrupar(rows) {
  const grupos=new Map();
  for (const r of rows) {
    if (!grupos.has(r.productoId)) grupos.set(r.productoId,{productoId:r.productoId,nombre:r.nombre,codigo:r.referencia,
      codigoProveedor:r.supplier_code,nombreProveedor:r.supplier_desc,mappingId:r.mapping_id,
      factorConversion:Number.isFinite(Number(r.factor_conversion))?Number(Number(r.factor_conversion).toFixed(6)):null,faltante:0n,reservada:0n,solicitada:0n,reservadaBorrador:0n,pendienteRecibir:0n,recibida:0n,disponible:0n,origenes:[]});
    const p=grupos.get(r.productoId),diferencia=micros(r.cantidad_faltante)-micros(r.reservada),libre=diferencia>0n?diferencia:0n;
    p.faltante+=micros(r.cantidad_faltante);p.reservada+=micros(r.reservada);p.disponible+=libre;
    p.solicitada+=micros(r.solicitada);p.pendienteRecibir+=micros(r.pendiente_recibir);p.recibida+=micros(r.recibida);
    p.reservadaBorrador+=micros(r.reservada)-micros(r.solicitada);
    p.origenes.push({...r,disponible:cantidadDe(libre)});
  }
  return [...grupos.values()].map(p=>{
    const factorValido=Number.isFinite(p.factorConversion)&&p.factorConversion>=0.000001&&p.factorConversion<=1000000;
    const disponible=p.origenes.reduce((s,f)=>s+micros(f.disponible),0n),factor=factorValido?micros(p.factorConversion.toFixed(6)):0n;
    // Sumar también los totales por origen con seis decimales exactos.
    const totales=Object.fromEntries(['faltante','reservada','solicitada','reservadaBorrador','pendienteRecibir','recibida','disponible'].map(k=>[k,Number(cantidadDe(p[k]))]));
    return {...p,...totales,factorValido,cantidadSugerida:factorValido?Number((disponible+factor-1n)/factor):null};
  });
}
function dto(o) { return {...o,referencia:String(o.id)}; }
async function obtenerEn(db,id,{ bloquear=false }={}) {
  const {rows:[o]}=await db.query(`SELECT * FROM orden_compra_ciclo_operativa WHERE id=$1 ${bloquear?'FOR UPDATE':'FOR SHARE'}`,[entero(id)]);
  if (!o) throw httpError(404,'No existe esa orden.');
  const {rows:lineas}=await db.query(`SELECT l.*,COALESCE((SELECT SUM(rl.cantidad) FROM orden_compra_ciclo_recepcion_linea rl JOIN orden_compra_ciclo_recepcion re ON re.id=rl.recepcion_id JOIN compra_linea cl ON cl.id=rl.compra_linea_id WHERE re.orden_id=l.orden_id AND cl.producto_id=l.producto_id),0) cantidad_recibida,COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.orden_visita,r.faltante_id) FILTER(WHERE r.linea_id IS NOT NULL),'[]') origenes
    FROM orden_compra_ciclo_linea l LEFT JOIN orden_compra_ciclo_origen r ON r.linea_id=l.id
    WHERE l.orden_id=$1 GROUP BY l.id ORDER BY l.id`,[o.id]);
  const {rows:envios}=await db.query(`SELECT id,version_orden,numero,mensaje,nombre_archivo,sha256,octet_length(pdf) bytes,
    estado,preparado_en,iniciado_en,confirmado_en,confirmacion,via,motivo FROM orden_compra_ciclo_envio WHERE orden_id=$1 ORDER BY secuencia DESC`,[o.id]);
  return {...dto(o),envios,lineas:lineas.map(l=>({...l,factor_conversion:Number(l.factor_conversion),cantidad_propia:Number(l.cantidad_propia)}))};
}
function revision(o,v) { if (entero(v,'Revisión')!==o.version) throw httpError(409,'La orden cambió en otra pantalla. Recargá antes de guardar.'); }
async function validarPendienteEn(db,o) {
  if (!o.lineas.length) throw httpError(409,'La orden no tiene productos para enviar.');
  const p=await proveedorEn(db,o.proveedor_id);
  const facturas=[...new Set(o.lineas.flatMap(l=>l.origenes.map(r=>r.factura_id)))];
  await db.query('SELECT id FROM factura WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE',[facturas]);
  const filas=await necesidadesEn(db,p,o.id,{bloquear:true}),porId=new Map(filas.map(f=>[f.faltanteId,f]));
  for (const l of o.lineas) for (const r of l.origenes) {
    const f=porId.get(r.faltante_id);
    if (!f || micros(r.cantidad)>micros(f.cantidad_faltante)-micros(f.reservada))
      throw httpError(409,'Los faltantes cambiaron. Revisá las cantidades del borrador antes de enviar.');
  }
}
async function listarEn(db,{proveedorId,vista='activas'}={}, {detalleId=null}={}) {
  if (!['activas','historial'].includes(vista)) throw httpError(400,'Vista inválida.');
  const filtros=[],params=[];
  // La vista usa la hora de PostgreSQL. Archivar no libera cobertura ni
  // cambia el estado comercial; parciales siguen activas sin límite de tiempo.
  if(detalleId==null)filtros.push(vista==='activas'?"o.estado<>'cerrada' AND NOT o.archivada":"(o.estado='cerrada' OR o.archivada)");
  else{params.push(entero(detalleId));filtros.push(`o.id=$${params.length}`)}
  if (proveedorId!=null&&proveedorId!=='') {params.push(entero(proveedorId));filtros.push(`o.proveedor_id=$${params.length}`)}
  const {rows}=await db.query(`SELECT o.*,CURRENT_TIMESTAMP AS consultada_en,l.productos,l.cantidad_propia
    FROM orden_compra_ciclo_operativa o
    LEFT JOIN LATERAL (SELECT COUNT(*)::int productos,COALESCE(SUM(cantidad_propia),0) cantidad_propia
      FROM orden_compra_ciclo_linea WHERE orden_id=o.id) l ON TRUE
    WHERE ${filtros.join(' AND ')} ORDER BY o.id DESC`,params);
  return rows.map(dto);
}
module.exports={interno:{entero,enOrden,obtenerEn,revision,validarPendienteEn,listarEn,proveedorEn,resolverProveedorEn,necesidadesEn,agrupar,micros,cantidadDe}};
