const { query } = require('../../../config/database');
const revision = require('./revisionTemporalesProveedor.service');
const { httpError, numero, texto, idValido } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { TEMPORAL_VIGENTE } = require('./temporalesVisibles.sql');

const entero = numero({ min:0,max:1000000,entero:true });
function cantidad(v,etiqueta,{ positiva=false }={}) {
  if (!['number','string'].includes(typeof v)) throw httpError(400,`${etiqueta}: ingresá un número entero.`);
  const n = entero(v,etiqueta);
  if (n == null || (positiva && n === 0)) throw httpError(400,`${etiqueta}: ingresá un entero ${positiva?'positivo':'mayor o igual a cero'}.`);
  return n;
}
function requerido(v,etiqueta,max) {
  if (typeof v !== 'string') throw httpError(400,`${etiqueta}: requerido.`);
  const s = texto(max)(v,etiqueta);
  if (!s) throw httpError(400,`${etiqueta}: requerido.`);
  return s;
}
function datos(proveedor,codigo,nombre,productoId) {
  return { proveedor:requerido(proveedor,'Proveedor',255),codigo:requerido(codigo,'Producto',100),
    nombre:requerido(nombre || codigo,'Nombre del producto',255),productoId:productoId == null ? null : idValido(productoId) };
}
async function identidadEn(db,d) {
  if (d.productoId == null) return d;
  const { rows:[p] } = await db.query('SELECT id,nombre,referencia FROM producto WHERE id=$1 FOR SHARE',[d.productoId]);
  if (!p || (d.codigo !== `id:${p.id}` && d.codigo !== `extra:id:${p.id}` && d.codigo !== p.referencia)) throw httpError(409,'El producto cambió. Volvé a elegirlo en el catálogo.');
  return { ...d,nombre:p.nombre };
}
// Los ids nuevos llevan una prueba de identidad por fila. Una referencia
// literal «id:2» antigua no demuestra que se trate de producto.id=2.
const RESOLVER_PRODUCTO = `LEFT JOIN LATERAL (
  SELECT despues FROM bitacora_cambio b WHERE b.entidad='orden_compra_temporal'
    AND b.entidad_id=t.id::text AND b.despues->>'actualizado'=t.updated_at::text
    ORDER BY b.id DESC LIMIT 1) identidad ON true
  LEFT JOIN LATERAL (SELECT CASE WHEN COUNT(*)=1 THEN MIN(p.id) END producto_id,
    CASE WHEN COUNT(*)=1 THEN MIN(p.referencia) END codigo_interno
    FROM (SELECT p.id,p.referencia FROM producto p WHERE
      (identidad.despues->>'productoId' IS NOT NULL AND p.id::text=identidad.despues->>'productoId')
      OR (identidad.despues->>'productoId' IS NULL AND p.nombre=t.producto_nombre AND
        (p.referencia=t.producto_codigo OR t.producto_codigo='id:'||p.id::text)) LIMIT 2) p) resuelto ON true`;

async function getCantidadesModificadas() {
  const { rows } = await query(`SELECT t.*,t.updated_at::text actualizado,resuelto.producto_id,resuelto.codigo_interno,
    identidad.despues->>'revisionReporte' revision_reporte,identidad.despues->>'fechaInicio' fecha_inicio,
    CASE WHEN resuelto.producto_id IS NOT NULL THEN 'id:'||resuelto.producto_id::text END clave_producto
    FROM orden_compra_temporal t ${RESOLVER_PRODUCTO} WHERE ${TEMPORAL_VIGENTE}
    ORDER BY proveedor_nombre,producto_nombre`);
  return { rows,modificadas:rows.filter(r=>!r.accion || r.accion==='modificado'),
    eliminadas:rows.filter(r=>r.accion==='eliminado'),agregadas:rows.filter(r=>r.accion==='agregado') };
}
async function guardarEn(db,d,original,modificada,accion,usuarioId) {
  d = await identidadEn(db,d);
  if (d.productoId != null) {
    const { rows:[previa] } = await db.query(`SELECT resuelto.producto_id FROM orden_compra_temporal t
      ${RESOLVER_PRODUCTO} WHERE t.proveedor_nombre=$1 AND t.producto_codigo=$2 FOR UPDATE OF t`,[d.proveedor,d.codigo]);
    if (previa && previa.producto_id !== d.productoId) throw httpError(409,'Un cambio anterior usa ese código para otro producto. Recargá y revisalo antes de guardar.');
  }
  const { rows:[r] } = await db.query(`INSERT INTO orden_compra_temporal
    (proveedor_nombre,producto_codigo,producto_nombre,cantidad_original,cantidad_modificada,accion)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(proveedor_nombre,producto_codigo) DO UPDATE
    SET producto_nombre=EXCLUDED.producto_nombre,cantidad_original=EXCLUDED.cantidad_original,
      cantidad_modificada=EXCLUDED.cantidad_modificada,accion=EXCLUDED.accion,updated_at=CURRENT_TIMESTAMP
    RETURNING id,updated_at::text actualizado`,[d.proveedor,d.codigo,d.nombre,original,modificada,accion]);
  await registrarCambio(db,{entidad:'orden_compra_temporal',entidadId:r.id,accion:'editar',
    despues:{productoId:d.productoId,actualizado:r.actualizado,...d.revision},usuarioId});
}
function comprobarExtras(filas,revisados) {
  for (const fila of filas) {
    const esperada=revisados.find(e=>e.codigo===fila.producto_codigo);
    if (esperada && (esperada.actualizado!==fila.actualizado || esperada.cantidad!==fila.cantidad_modificada)) throw httpError(409,'Un producto agregado cambió. Recargá antes de guardar.');
  }
  if (revisados.some(e=>!filas.some(f=>f.producto_codigo===e.codigo))) throw httpError(409,'Un producto agregado cambió. Recargá antes de guardar.');
}
async function guardarCantidades(filas,usuarioId=null) {
  if (!Array.isArray(filas) || !filas.length || filas.length>500) throw httpError(400,'Incluí entre 1 y 500 cantidades.');
  const limpias = filas.map(f=>{
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw httpError(400,'Cantidad inválida.');
    const original = numero({min:0,max:1000000})(f.cantidad_original,'Cantidad original');
    if (original == null || !['number','string'].includes(typeof f.cantidad_original)) throw httpError(400,'Falta la cantidad original.');
    const extras = f.extras_sustituidos || [];
    if (!Array.isArray(extras) || extras.length>500) throw httpError(400,'Los productos agregados cambiaron. Recargá.');
    const revisados=f.extras_revisados || [];
    if (!Array.isArray(revisados) || revisados.length>500) throw httpError(400,'La revisión de agregados no es válida.');
    return { d:{...datos(f.proveedor_nombre,f.producto_codigo,f.producto_nombre,f.producto_id),revision:revision.contexto(f)},
      // La demanda exacta se lee del reporte y sus orígenes. Este metadato
      // entero legado es la base mínima de revisión, nunca cambia el faltante.
      original:Math.ceil(original),modificada:cantidad(f.cantidad_modificada,'Cantidad a pedir'),
      extras:extras.map(k=>requerido(k,'Producto agregado',100)),
      revisados:revisados.map(e=>({codigo:requerido(e?.codigo,'Producto agregado',100),
        actualizado:requerido(e?.actualizado,'Revisión del agregado',100),cantidad:cantidad(e?.cantidad,'Cantidad agregada',{positiva:true})})),
      conservar:f.extra_conservado == null ? null : {
        cantidad:cantidad(f.extra_conservado.cantidad,'Cantidad agregada',{positiva:true}),
        codigo:requerido(f.extra_conservado.productoCodigo,'Producto agregado',100),
        origenes:Array.isArray(f.extra_conservado.clavesOrigen) && f.extra_conservado.clavesOrigen.length<=500
          ? f.extra_conservado.clavesOrigen.map(k=>requerido(k,'Producto agregado',100)) : (()=>{throw httpError(400,'Agregado inválido.');})()
      } };
  });
  const claves = limpias.map(f=>JSON.stringify([f.d.proveedor,f.d.codigo]));
  if (new Set(claves).size!==claves.length) throw httpError(400,'Hay cantidades repetidas del mismo producto.');
  return revision.enEdicion(async db=>{
    const comprobadas=new Set();
    for (const f of limpias) {
      const clave=JSON.stringify([f.d.proveedor,f.d.revision]);
      if (!comprobadas.has(clave)) { await revision.comprobarEn(db,f.d.proveedor,f.d.revision); comprobadas.add(clave); }
    }
    for (const f of limpias) {
      if (f.conservar) {
        if (!f.d.productoId || f.conservar.codigo !== `extra:id:${f.d.productoId}`) throw httpError(400,'Identidad del agregado inválida.');
        const {rows:previas} = await db.query(`SELECT t.id,t.producto_codigo,t.updated_at::text actualizado,t.cantidad_modificada,resuelto.producto_id FROM orden_compra_temporal t
          ${RESOLVER_PRODUCTO} WHERE t.proveedor_nombre=$1 AND t.producto_codigo=ANY($2::text[])
            AND t.accion='agregado' FOR UPDATE OF t`,[f.d.proveedor,f.conservar.origenes]);
        if (previas.length!==new Set(f.conservar.origenes).size || previas.some(e=>e.producto_id!==f.d.productoId)) throw httpError(409,'El agregado cambió. Recargá antes de conservarlo.');
        comprobarExtras(previas,f.revisados.filter(e=>f.conservar.origenes.includes(e.codigo)));
        await db.query("DELETE FROM orden_compra_temporal WHERE id=ANY($1::int[]) AND accion='agregado'",[previas.map(e=>e.id)]);
        await guardarEn(db,{...f.d,codigo:f.conservar.codigo},0,f.conservar.cantidad,'agregado',usuarioId);
      }
      if (f.extras.length && !f.d.productoId) throw httpError(409,'Volvé a elegir el producto del catálogo.');
      const { rows:extras } = await db.query(`SELECT t.id,t.producto_codigo,t.updated_at::text actualizado,t.cantidad_modificada,resuelto.producto_id FROM orden_compra_temporal t
        ${RESOLVER_PRODUCTO} WHERE t.proveedor_nombre=$1 AND t.producto_codigo=ANY($2::text[])
          AND t.accion='agregado' FOR UPDATE OF t`,[f.d.proveedor,f.extras]);
      if (extras.some(e=>e.producto_id!==f.d.productoId)) throw httpError(409,'Un agregado corresponde a otro producto. Recargá antes de guardar.');
      comprobarExtras(extras,f.revisados.filter(e=>f.extras.includes(e.codigo)));
      await guardarEn(db,f.d,f.original,f.modificada,'modificado',usuarioId);
      await db.query("DELETE FROM orden_compra_temporal WHERE id=ANY($1::int[]) AND accion='agregado'",[extras.map(e=>e.id)]);
    }
    return limpias.length;
  });
}
// Ya no se crean exclusiones temporales («eliminado»): quitar un producto es
// del todo (sinCompra.service.js, 2026-10-22). Las que quedaron se siguen
// leyendo y se pueden restaurar con eliminarRegistroTemporal.
async function registrarProductoAgregado(proveedor,codigo,nombre,q,opciones={}) {
  const d={...datos(proveedor,codigo,nombre,opciones.productoId),revision:revision.contexto(opciones)},n=cantidad(q,'Cantidad agregada',{positiva:true});
  return revision.enEdicion(async db=>{await revision.comprobarEn(db,d.proveedor,d.revision);return guardarEn(db,d,0,n,'agregado',opciones.usuarioId)});
}
async function eliminarRegistroTemporal(proveedor,codigo,accion,opciones={}) {
  const d=datos(proveedor,codigo,codigo,opciones.producto_id);
  if (!['agregado','eliminado'].includes(accion)) throw httpError(400,'Acción temporal inválida.');
  const contexto=revision.contexto(opciones);
  return revision.enEdicion(async db=>{
    await revision.comprobarEn(db,d.proveedor,contexto);
    if (d.productoId != null) {
      const { rows:[previa] } = await db.query(`SELECT resuelto.producto_id FROM orden_compra_temporal t
        ${RESOLVER_PRODUCTO} WHERE t.proveedor_nombre=$1 AND t.producto_codigo=$2 AND t.accion=$3 FOR UPDATE OF t`,[d.proveedor,d.codigo,accion]);
      if (previa && previa.producto_id!==d.productoId) throw httpError(409,'El cambio pertenece a otro producto. Recargá antes de deshacerlo.');
    }
    const { rows } = await db.query(`DELETE FROM orden_compra_temporal
      WHERE proveedor_nombre=$1 AND producto_codigo=$2 AND accion=$3 RETURNING id`,[d.proveedor,d.codigo,accion]);
    return rows.length;
  });
}
async function limpiarCantidades() {
  throw httpError(410,'La limpieza global fue retirada. Las órdenes conservan su historial.');
}
module.exports = { getCantidadesModificadas,guardarCantidades,registrarProductoAgregado,eliminarRegistroTemporal,limpiarCantidades };
