/** Fabricar estados anteriores para probar reintentos/historia; no es API de negocio. */
delete require.cache[require.resolve('../../src/modules/orders-whatsapp/ordenesCiclo.service')];
const motor = require('../../src/modules/orders-whatsapp/ordenesCiclo.service');
const { pool } = require('../../config/database');
const { registrarCambio } = require('../../src/utils/bitacora');
const { httpError } = require('../../src/utils/validacion');
const { entero,enOrden,obtenerEn,revision,validarPendienteEn,listarEn,proveedorEn,resolverProveedorEn,necesidadesEn,agrupar } = motor.interno;
function lineasValidas(v) {
  if (!Array.isArray(v) || !v.length || v.length>500) throw httpError(400,'Incluí entre 1 y 500 productos.');
  const lineas=v.map(l=>({ productoId:entero(l?.productoId), cantidadProveedor:entero(l?.cantidadProveedor,'Cantidad del proveedor',1000000) })).sort((a,b)=>a.productoId-b.productoId);
  if (new Set(lineas.map(l=>l.productoId)).size!==lineas.length) throw httpError(400,'Hay productos repetidos.');
  return lineas;
}
async function reemplazarLineaEn(db,o,l,producto,previa) {
  const [linea]=await require('../../src/modules/orders-whatsapp/ordenesCicloLineas.service').insertarLineasEn(db,o,[{l,producto,previa}]);
  return linea;
}
async function reemplazarLineasEn(db,o,lineas,p) {
  const productos=agrupar(await necesidadesEn(db,p,o.id,{bloquear:true}));
  const previas=new Map(o.lineas?.map(l=>[l.producto_id,l])||[]);
  await db.query('DELETE FROM orden_compra_ciclo_origen WHERE linea_id IN (SELECT id FROM orden_compra_ciclo_linea WHERE orden_id=$1)',[o.id]);
  await db.query('DELETE FROM orden_compra_ciclo_linea WHERE orden_id=$1',[o.id]);
  for (const l of lineas) await reemplazarLineaEn(db,o,l,productos.find(p=>p.productoId===l.productoId),previas.get(l.productoId));
}
async function crear(datos,usuarioId) {
  const cicloId=datos?.cicloId==='sin-ciclo'?null:datos?.cicloId??null,proveedorId=entero(datos?.proveedorId),lineas=lineasValidas(datos?.lineas),clave=datos?.clave;
  if (typeof clave!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clave)) throw httpError(400,'Clave de solicitud inválida.');
  const solicitud={proveedorId,cicloId,lineas};
  return enOrden(async db=>{
    const {rows:[previa]}=await db.query('SELECT id,solicitud FROM orden_compra_ciclo WHERE clave=$1',[clave]);
    if (previa) {
      if (!(await db.query('SELECT $1::jsonb=$2::jsonb igual',[previa.solicitud,solicitud])).rows[0].igual)
        throw httpError(409,'Esa clave ya corresponde a otra solicitud.');
      return obtenerEn(db,previa.id);
    }
    const p=await proveedorEn(db,proveedorId),c=cicloId?(await db.query('SELECT ruta_nombre,semana::text FROM ciclo_ruta WHERE id=$1',[cicloId])).rows[0]:null;
    const {rows:[o]}=await db.query(`INSERT INTO orden_compra_ciclo(proveedor_id,proveedor_nombre,proveedor_cedula,ciclo_id,ruta_nombre,semana,clave,solicitud)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.id,p.nombre,p.identificacion,cicloId,c?.ruta_nombre??null,c?.semana??null,clave,solicitud]);
    await reemplazarLineasEn(db,o,lineas,p);const nueva=await obtenerEn(db,o.id);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'crear',despues:nueva,usuarioId});return nueva;
  });
}
async function editar(id,datos,usuarioId) {
  const lineas=lineasValidas(datos?.lineas);
  return enOrden(async db=>{const o=await obtenerEn(db,id,{bloquear:true});revision(o,datos?.version);
    if (o.estado!=='borrador') throw httpError(409,'Volvé a borrador antes de modificar productos o cantidades.');
    const p=await proveedorEn(db,o.proveedor_id);await reemplazarLineasEn(db,o,lineas,p);
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

async function sugerir(filtros) {
  return enOrden(async db => ({ productos: agrupar(await necesidadesEn(db, await resolverProveedorEn(db, filtros))) }));
}
module.exports = { ...motor, crear, editar, cambiarEstado, sugerir,
  obtener: id => enOrden(db => obtenerEn(db,id)), listar: filtros => listarEn(pool,filtros) };
