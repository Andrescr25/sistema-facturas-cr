const { faltanteOperativo, cantidadPendiente } = require('../reports/faltantesCompra.sql');
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError } = require('../../utils/validacion');
const { filtrosOperacion } = require('../rutas/operacionCiclo.service');
const { mappingProveedor, asignadoAlProveedor } = require('../reports/proveedorCompra.sql');

const entero = (v, etiqueta='Identificador', max=2147483647) => {
  if (!((typeof v==='number' && Number.isSafeInteger(v)) || (typeof v==='string' && /^[1-9]\d*$/.test(v))) || Number(v)<1 || Number(v)>max)
    throw httpError(400, `${etiqueta}: entero positivo válido requerido.`);
  return Number(v);
};
function cicloValido(v) { return v==='sin-ciclo' ? null : entero(v, 'Ciclo'); }
function lineasValidas(v) {
  if (!Array.isArray(v) || !v.length || v.length>500) throw httpError(400,'Incluí entre 1 y 500 productos.');
  const lineas=v.map(l=>({ productoId:entero(l?.productoId), cantidadProveedor:entero(l?.cantidadProveedor,'Cantidad del proveedor',1000000) })).sort((a,b)=>a.productoId-b.productoId);
  if (new Set(lineas.map(l=>l.productoId)).size!==lineas.length) throw httpError(400,'Hay productos repetidos.');
  return lineas;
}
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
async function contextoEn(db,cicloId,{ activo=true }={}) {
  if (cicloId===null) return null;
  const {rows:[c]}=await db.query('SELECT id,ruta_id,ruta_nombre,semana::text,estado,recorrido_fijado FROM ciclo_ruta WHERE id=$1 FOR SHARE',[cicloId]);
  if (!c?.recorrido_fijado) throw httpError(404,'No existe ese ciclo con recorrido fijado.');
  if (activo && ['cerrado','cancelado'].includes(c.estado)) throw httpError(409,'Ese ciclo está cerrado o cancelado; no admite compras nuevas.');
  return c;
}
async function proveedorEn(db,id,{ activo=true,bloquear=true }={}) {
  const {rows:[p]}=await db.query(`SELECT id,nombre,identificacion,activo FROM proveedor WHERE id=$1 ${bloquear?'FOR SHARE':''}`,[id]);
  if (!p) throw httpError(404,'No existe la ficha propia del proveedor.');
  if (activo && !p.activo) throw httpError(409,'El proveedor está inactivo.');
  return p;
}
async function resolverProveedorEn(db,{ proveedorId,cedula,nombre }={},opciones={}) {
  if (proveedorId!=null) return proveedorEn(db,entero(proveedorId),opciones);
  if (cedula!=null && (typeof cedula!=='string' || cedula.length>20)) throw httpError(400,'Cédula inválida.');
  if (nombre!=null && (typeof nombre!=='string' || nombre.length>200)) throw httpError(400,'Nombre inválido.');
  let rows;
  if (cedula?.trim() && cedula!=='SIN_PROVEEDOR') ({rows}=await db.query('SELECT id FROM proveedor WHERE identificacion=$1',[cedula.trim()]));
  else if (nombre?.trim() && nombre!=='Sin_Proveedor') ({rows}=await db.query('SELECT id FROM proveedor WHERE lower(btrim(nombre))=lower(btrim($1)) LIMIT 2',[nombre]));
  if (!rows?.length) throw httpError(409,'Guardá primero la ficha de este proveedor; no se puede crear una orden por un nombre sin ficha.');
  if (rows.length!==1) throw httpError(409,'Hay varias fichas con ese nombre. Identificá al proveedor por su cédula.');
  return proveedorEn(db,rows[0].id,opciones);
}
async function necesidadesEn(db,p,cicloId,excluirOrden=null,{ bloquear=false,sinCiclos=false }={}) {
  // La reserva se cuenta por FALTANTE, incluso si se reasigna el proveedor.
  // No descontar stock provisional ni llamar al borrador «ya pedido».
  const {rows}=await db.query(`SELECT f.id AS "faltanteId",f.producto_propio_id AS "productoId",${cantidadPendiente()} AS cantidad_faltante,
    p.nombre,p.referencia,fa.id AS "facturaId",fa.numero,fa.cliente_id,fa.cliente_nombre,fa.preventa_anticipada,rc.orden,
    m.id AS mapping_id,m.supplier_code,m.supplier_desc,COALESCE(m.factor_conversion,1) AS factor_conversion,
    COALESCE((SELECT SUM(r.cobertura) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND ($4::int IS NULL OR r.orden_id<>$4)),0) AS reservada,
    COALESCE((SELECT SUM(r.cobertura) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND r.estado IN ('enviada','parcialmente_recibida','recibida','cerrada') AND ($4::int IS NULL OR r.orden_id<>$4)),0) AS solicitada,
    COALESCE((SELECT SUM(GREATEST(r.cobertura-r.cantidad_recibida,0)) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND r.estado IN ('enviada','parcialmente_recibida') AND ($4::int IS NULL OR r.orden_id<>$4)),0) AS pendiente_recibir,
    COALESCE((SELECT SUM(r.cantidad_recibida) FROM orden_compra_ciclo_cobertura r
      WHERE r.faltante_id=f.id AND ($4::int IS NULL OR r.orden_id<>$4)),0) AS recibida
    FROM faltantes f JOIN producto p ON p.id=f.producto_propio_id JOIN factura fa ON fa.id=f.factura_propia_id
    LEFT JOIN ciclo_ruta_cliente rc ON rc.id=fa.ciclo_ruta_cliente_id
    LEFT JOIN LATERAL (${mappingProveedor('p.id','$1','$2')}) m ON TRUE
    WHERE ${faltanteOperativo()} AND ${cantidadPendiente()}>0
      AND ($6::boolean OR rc.ciclo_id IS NOT DISTINCT FROM $3::int)
      AND ${asignadoAlProveedor('$1','$2','$5')}
    ORDER BY f.id ${bloquear?'FOR UPDATE OF f':''}`,[p.id,p.identificacion,cicloId,excluirOrden,p.nombre,sinCiclos]);
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
function dto(o) { return {...o,referencia:`OC-${o.id}`,ciclo:o.ciclo_id?{id:o.ciclo_id,rutaNombre:o.ruta_nombre,semana:o.semana}:null}; }
async function obtenerEn(db,id,{ bloquear=false }={}) {
  const {rows:[o]}=await db.query(`SELECT *,semana::text FROM orden_compra_ciclo_operativa WHERE id=$1 ${bloquear?'FOR UPDATE':'FOR SHARE'}`,[entero(id)]);
  if (!o) throw httpError(404,'No existe esa orden.');
  const {rows:lineas}=await db.query(`SELECT l.*,COALESCE((SELECT SUM(rl.cantidad) FROM orden_compra_ciclo_recepcion_linea rl JOIN orden_compra_ciclo_recepcion re ON re.id=rl.recepcion_id JOIN compra_linea cl ON cl.id=rl.compra_linea_id WHERE re.orden_id=l.orden_id AND cl.producto_id=l.producto_id),0) cantidad_recibida,COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.orden_visita,r.faltante_id) FILTER(WHERE r.linea_id IS NOT NULL),'[]') origenes
    FROM orden_compra_ciclo_linea l LEFT JOIN orden_compra_ciclo_origen r ON r.linea_id=l.id
    WHERE l.orden_id=$1 GROUP BY l.id ORDER BY l.id`,[o.id]);
  const {rows:envios}=await db.query(`SELECT id,version_orden,numero,mensaje,nombre_archivo,sha256,octet_length(pdf) bytes,
    estado,preparado_en,iniciado_en,confirmado_en,confirmacion,via,motivo FROM orden_compra_ciclo_envio WHERE orden_id=$1 ORDER BY secuencia DESC`,[o.id]);
  return {...dto(o),envios,lineas:lineas.map(l=>({...l,factor_conversion:Number(l.factor_conversion),cantidad_propia:Number(l.cantidad_propia)}))};
}
async function sugerir(filtros) {
  const cicloId=cicloValido(filtros?.cicloId);
  return enTransaccion(pool,async db=>{const p=await resolverProveedorEn(db,filtros),c=await contextoEn(db,cicloId);
    return {proveedor:{id:p.id,nombre:p.nombre,cedula:p.identificacion},ciclo:c?{id:c.id,rutaNombre:c.ruta_nombre,semana:c.semana}:null,
      productos:agrupar(await necesidadesEn(db,p,cicloId))};});
}
async function reemplazarLineaEn(db,o,l,producto,previa) {
    if (!producto || producto.disponible<=0) throw httpError(409,'Un producto ya no tiene faltantes libres. Revisá la orden.');
    // Al editar, conservar la conversión y los códigos que la persona revisó.
    // Un cambio posterior del maestro/mapeo no modifica la orden guardada.
    const factor=previa?.factor_conversion??producto.factorConversion;
    if (!Number.isFinite(factor)||factor<0.000001||factor>1000000) throw httpError(409,'Corregí la conversión del producto antes de preparar su orden.');
    const {rows:[n]}=await db.query(`INSERT INTO orden_compra_ciclo_linea(orden_id,producto_id,producto_nombre,codigo_interno,codigo_proveedor,nombre_proveedor,mapping_id,factor_conversion,cantidad_proveedor)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,cantidad_propia`,[o.id,l.productoId,previa?.producto_nombre??producto.nombre,
      previa?previa.codigo_interno:producto.codigo,previa?previa.codigo_proveedor:producto.codigoProveedor,
      previa?previa.nombre_proveedor:producto.nombreProveedor,previa?previa.mapping_id:producto.mappingId,factor,l.cantidadProveedor]);
    let disponible=micros(n.cantidad_propia);
    for (const f of producto.origenes) {
      const libre=micros(f.disponible),cantidad=disponible<libre?disponible:libre;
      if (cantidad<=0n) continue;
      await db.query(`INSERT INTO orden_compra_ciclo_origen(linea_id,faltante_id,factura_id,factura_numero,cliente_id,cliente_nombre,orden_visita,anticipado,cantidad)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[n.id,f.faltanteId,f.facturaId,f.numero,f.cliente_id,f.cliente_nombre,f.orden,f.preventa_anticipada,cantidadDe(cantidad)]);
      disponible-=cantidad;
    }
}
async function reemplazarLineasEn(db,o,lineas,p,{sinCiclos=o.ciclo_id==null}={}) {
  const productos=agrupar(await necesidadesEn(db,p,o.ciclo_id,o.id,{bloquear:true,sinCiclos}));
  const previas=new Map(o.lineas?.map(l=>[l.producto_id,l])||[]);
  await db.query('DELETE FROM orden_compra_ciclo_origen WHERE linea_id IN (SELECT id FROM orden_compra_ciclo_linea WHERE orden_id=$1)',[o.id]);
  await db.query('DELETE FROM orden_compra_ciclo_linea WHERE orden_id=$1',[o.id]);
  for (const l of lineas) await reemplazarLineaEn(db,o,l,productos.find(p=>p.productoId===l.productoId),previas.get(l.productoId));
}
async function crear(datos,usuarioId) {
  const cicloId=cicloValido(datos?.cicloId),proveedorId=entero(datos?.proveedorId),lineas=lineasValidas(datos?.lineas),clave=datos?.clave;
  if (typeof clave!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clave)) throw httpError(400,'Clave de solicitud inválida.');
  const solicitud={proveedorId,cicloId,lineas};
  return enOrden(async db=>{
    const {rows:[previa]}=await db.query('SELECT id,solicitud FROM orden_compra_ciclo WHERE clave=$1',[clave]);
    if (previa) {
      if (!(await db.query('SELECT $1::jsonb=$2::jsonb igual',[previa.solicitud,solicitud])).rows[0].igual)
        throw httpError(409,'Esa clave ya corresponde a otra solicitud.');
      return obtenerEn(db,previa.id);
    }
    const p=await proveedorEn(db,proveedorId),c=await contextoEn(db,cicloId);
    const {rows:[o]}=await db.query(`INSERT INTO orden_compra_ciclo(proveedor_id,proveedor_nombre,proveedor_cedula,ciclo_id,ruta_nombre,semana,clave,solicitud)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.id,p.nombre,p.identificacion,cicloId,c?.ruta_nombre??null,c?.semana??null,clave,solicitud]);
    await reemplazarLineasEn(db,o,lineas,p);const nueva=await obtenerEn(db,o.id);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'crear',despues:nueva,usuarioId});return nueva;
  });
}
function revision(o,v) { if (entero(v,'Revisión')!==o.version) throw httpError(409,'La orden cambió en otra pantalla. Recargá antes de guardar.'); }
async function editar(id,datos,usuarioId) {
  const lineas=lineasValidas(datos?.lineas);
  return enOrden(async db=>{const o=await obtenerEn(db,id,{bloquear:true});revision(o,datos?.version);
    if (o.estado!=='borrador') throw httpError(409,'Volvé a borrador antes de modificar productos o cantidades.');
    const p=await proveedorEn(db,o.proveedor_id);await reemplazarLineasEn(db,o,lineas,p,{sinCiclos:true});
    await db.query('UPDATE orden_compra_ciclo SET version=version+1,actualizado_en=NOW() WHERE id=$1',[o.id]);
    const nueva=await obtenerEn(db,o.id);await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'editar',antes:o,despues:nueva,usuarioId});return nueva;
  });
}
async function cambiarEstado(id,datos,usuarioId) {
  if (!['borrador','pendiente_enviar','cerrada'].includes(datos?.estado)) throw httpError(400,'Estado no disponible. El envío y la recepción se registran por su propio flujo.');
  const motivo=typeof datos.motivo==='string'?datos.motivo.trim():'';
  if (datos.estado==='cerrada'&&(!motivo||motivo.length>1000)) throw httpError(400,'Indicá el motivo del cierre (hasta 1000 caracteres).');
  return enOrden(async db=>{const o=await obtenerEn(db,id,{bloquear:true});revision(o,datos?.version);
    if (o.estado==='cerrada') throw httpError(409,'La orden cerrada conserva su historial y no se reabre.');
    if (o.estado==='enviada'||o.envio_id) throw httpError(409,'La orden ya fue enviada o tiene un intento por verificar; los cierres enviados requieren revisión de cobertura en su propio flujo.');
    if (o.estado===datos.estado) return o;
    if (datos.estado==='pendiente_enviar') {
      await validarPendienteEn(db,o);
    }
    await db.query(`UPDATE orden_compra_ciclo SET estado=$2::varchar,version=version+1,actualizado_en=NOW(),
      motivo_cierre=$3,cerrada_en=CASE WHEN $2::varchar='cerrada' THEN NOW() ELSE NULL END WHERE id=$1`,[o.id,datos.estado,datos.estado==='cerrada'?motivo:null]);
    const nueva=await obtenerEn(db,o.id);await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:datos.estado,antes:o,despues:nueva,usuarioId,motivo:motivo||null});return nueva;
  });
}
async function validarPendienteEn(db,o) {
  if (!o.lineas.length) throw httpError(409,'La orden no tiene productos para enviar.');
  const p=await proveedorEn(db,o.proveedor_id);
  const facturas=[...new Set(o.lineas.flatMap(l=>l.origenes.map(r=>r.factura_id)))];
  await db.query('SELECT id FROM factura WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE',[facturas]);
  const filas=await necesidadesEn(db,p,o.ciclo_id,o.id,{bloquear:true,sinCiclos:true}),porId=new Map(filas.map(f=>[f.faltanteId,f]));
  for (const l of o.lineas) for (const r of l.origenes) {
    const f=porId.get(r.faltante_id);
    if (!f || micros(r.cantidad)>micros(f.cantidad_faltante)-micros(f.reservada))
      throw httpError(409,'Los faltantes cambiaron. Revisá las cantidades del borrador antes de enviar.');
  }
}
async function listarEn(db,{rutaId,cicloId,proveedorId,vista='activas'}={}, {detalleId=null}={}) {
  if (!['activas','historial'].includes(vista)) throw httpError(400,'Vista inválida.');
  const where=[],params=[];
  filtrosOperacion({rutaId,cicloId},where,params);
  // El filtro compartido usa rc.id para Sin ciclo; rc representa aquí la orden.
  const filtros=where.map(s=>s.replaceAll('rc.id IS NULL','o.ciclo_id IS NULL'));
  // La vista usa la hora de PostgreSQL. Archivar no libera cobertura ni
  // cambia el estado comercial; parciales siguen activas sin límite semanal.
  if(detalleId==null)filtros.push(vista==='activas'?"o.estado<>'cerrada' AND NOT o.archivada":"(o.estado='cerrada' OR o.archivada)");
  else{params.push(entero(detalleId));filtros.push(`o.id=$${params.length}`)}
  if (proveedorId!=null&&proveedorId!=='') {params.push(entero(proveedorId));filtros.push(`o.proveedor_id=$${params.length}`)}
  const {rows}=await db.query(`SELECT o.*,o.semana::text,CURRENT_TIMESTAMP AS consultada_en,l.productos,l.cantidad_propia
    FROM orden_compra_ciclo_operativa o LEFT JOIN ciclo_ruta cr ON cr.id=o.ciclo_id
    LEFT JOIN LATERAL (SELECT COUNT(*)::int productos,COALESCE(SUM(cantidad_propia),0) cantidad_propia
      FROM orden_compra_ciclo_linea WHERE orden_id=o.id) l ON TRUE
    WHERE ${filtros.join(' AND ')} ORDER BY o.semana DESC NULLS LAST,o.id DESC`,params);
  return rows.map(dto);
}
const listar=f=>listarEn(pool,f);
module.exports={sugerir,crear,editar,cambiarEstado,listar,obtener:id=>enTransaccion(pool,db=>obtenerEn(db,id)),
  interno:{entero,cicloValido,enOrden,obtenerEn,revision,validarPendienteEn,listarEn,contextoEn,proveedorEn,resolverProveedorEn,necesidadesEn,agrupar,micros,cantidadDe,reemplazarLineaEn}};
