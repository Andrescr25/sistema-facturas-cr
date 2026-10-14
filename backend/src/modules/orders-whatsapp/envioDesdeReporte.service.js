const { randomUUID } = require('node:crypto');
const { interno:{hash:firma} } = require('./ordenesCicloFactura.service');
const { httpError } = require('../../utils/validacion');
const { fechaValida } = require('../../utils/exportarExcel');
const { registrarCambio } = require('../../utils/bitacora');
const { telefonosDe } = require('../../utils/telefonosCliente');
const { validarTelefonoProveedor } = require('../../utils/telefonosProveedor');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../../../config/aislado');
const motor = require('./ordenesCiclo.service');
const envio = require('./ordenesCicloEnvio.service');
const { enOrden, obtenerEn, resolverProveedorEn, entero, necesidadesEn, agrupar, reemplazarLineaEn, micros } = motor.interno;
const { mappingProveedor } = require('../reports/proveedorCompra.sql');

const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function validar(datos) {
  if (!uuid(datos?.clave) || !/^[a-f0-9]{64}$/.test(datos?.revisionReporte || '')) throw httpError(400,'Recargá los faltantes antes de enviar.');
  if (!Array.isArray(datos.productos) || !datos.productos.length || datos.productos.length > 500) throw httpError(400,'Incluí entre 1 y 500 productos en el pedido.');
  if (datos.fechaInicio != null && (typeof datos.fechaInicio !== 'string' || !fechaValida(datos.fechaInicio))) throw httpError(400,'La fecha inicial del reporte no es válida.');
  if ('telefono' in datos && (typeof datos.telefono !== 'string' || !datos.telefono.trim())) throw httpError(400,'Escribí un número de WhatsApp para este envío.');
  return { ...datos, clave:datos.clave.toLowerCase() };
}
async function productoManualEn(db,p,l) {
  let productoId = l.productoId;
  if (productoId == null) {
    // Agregados antiguos guardaban código/nombre. Resolver solo si ambas
    // señas apuntan a una ficha única; jamás inferir un id por parecido.
    const { rows } = await db.query('SELECT id FROM producto WHERE referencia=$1 AND nombre=$2 LIMIT 2',[l.codigoInterno || l.codigo,l.nombreInterno || l.nombre]);
    if (rows.length !== 1) throw httpError(409,'Volvé a agregar el producto manual desde el catálogo antes de enviar.');
    productoId = rows[0].id;
  }
  const { rows:[r] } = await db.query(`SELECT p.id,p.nombre,p.referencia,m.id mapping_id,m.supplier_code,m.supplier_desc,
    COALESCE(m.factor_conversion,1) factor_conversion FROM producto p
    LEFT JOIN LATERAL (${mappingProveedor('p.id','$2','$3')}) m ON true WHERE p.id=$1 FOR SHARE OF p`,[entero(productoId),p.id,p.identificacion]);
  if (!r) throw httpError(409,'El producto manual ya no está en el catálogo.');
  if ((l.codigoInterno && l.codigoInterno !== r.referencia) || (l.nombreInterno && l.nombreInterno !== r.nombre)) throw httpError(409,'El producto manual cambió. Volvé a elegirlo en el catálogo.');
  return { productoId:r.id,nombre:r.nombre,codigo:r.referencia,mappingId:r.mapping_id,
    codigoProveedor:r.supplier_code,nombreProveedor:r.supplier_desc,factorConversion:Number(r.factor_conversion) };
}
async function limpiarBorradorEn(db,o) {
  if (o.estado === 'pendiente_enviar') await db.query("UPDATE orden_compra_ciclo SET estado='borrador',version=version+1,actualizado_en=NOW() WHERE id=$1",[o.id]);
  await db.query('DELETE FROM orden_compra_ciclo_origen WHERE linea_id IN (SELECT id FROM orden_compra_ciclo_linea WHERE orden_id=$1)',[o.id]);
  await db.query('DELETE FROM orden_compra_ciclo_linea WHERE orden_id=$1',[o.id]);
}
async function telefonosFichaEn(db,id) {
  const { rows:[p] } = await db.query('SELECT telefono_whatsapp,telefono FROM proveedor WHERE id=$1',[id]);
  const campo = p.telefono_whatsapp?.trim() ? { mobile:p.telefono_whatsapp } : { phonePrimary:p.telefono };
  return telefonosDe(campo).candidatos;
}
async function revisarEn(db,datos,actor,{soloPreparar=false}={}) {
  const { rows:[previa] } = await db.query('SELECT orden_id FROM orden_compra_ciclo_envio WHERE id=$1',[datos.clave]);
  if (previa) {
    const { rows:[registro] } = await db.query(`SELECT despues FROM bitacora_cambio
      WHERE entidad='orden_compra_ciclo' AND entidad_id=$1 AND accion='revisar_reporte'
        AND despues->>'clave'=$2 ORDER BY id DESC LIMIT 1`,[String(previa.orden_id),datos.clave]);
    if (registro?.despues?.firma !== firma(datos)) throw httpError(409,'Este intento ya corresponde a otro pedido.');
    return obtenerEn(db,previa.orden_id);
  }
  if (!soloPreparar && salidasBloqueadas()) throw errorSalidaBloqueada('enviar la orden de compra');
  const p = await resolverProveedorEn(db,datos);
  await db.query('SELECT id FROM proveedor WHERE id=$1 FOR SHARE',[p.id]);
  const candidatos = await telefonosFichaEn(db,p.id);
  const telefono = 'telefono' in datos ? validarTelefonoProveedor(datos.telefono,'WhatsApp') : candidatos.length === 1 ? candidatos[0].formateado : null;
  if (!telefono) {
    // Con varios destinos, no elegir uno por el orden de lectura. Abrir el
    // modal permite elegir o escribir otro sin crear una copia sin destino.
    if (soloPreparar) return { destinoPendiente:{telefono:'',mensaje:envio.mensajePredeterminado,telefonos:candidatos} };
    throw httpError(409,'Elegí o escribí un número de WhatsApp antes de enviar.');
  }
  const reporte = await new (require('../reports/report.service'))().getMissingItemsBySupplier(datos.fechaInicio || null,{db,incluirEnviadas:false,asignarProveedores:false});
  if (!reporte.success) throw httpError(503,'No se pudieron comprobar los faltantes. No se inició el envío.');
  // La asignación antigua puede tener sólo nombre aunque su ficha sí tenga
  // cédula. Conservar el identificador público del reporte también conserva
  // la clave del intento incierto guardada por la pestaña.
  const actual = reporte.data.find(r => (r.cedula ? r.cedula === p.identificacion
    : r.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase()) && r.revisionReporte === datos.revisionReporte);
  if (!actual || datos.revisionReporte !== actual.revisionReporte) throw httpError(409,'Los faltantes cambiaron. Actualizá el reporte antes de enviar.');
  // Reporte Clientes bloquea factura antes de ajustar/encolar. Esperar en
  // ese mismo orden y releer la revisión evita enviar cantidades anteriores
  // a una respuesta que terminó mientras este clic esperaba el bloqueo.
  const facturas = [...new Set(actual.productos_faltantes.flatMap(l => l.origenes.map(r => r.facturaId)))];
  await db.query('SELECT id FROM factura WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE',[facturas]);
  const faltantes = actual.productos_faltantes.flatMap(l => l.origenes.map(r => r.faltanteId));
  await db.query('SELECT id FROM faltantes WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE',[faltantes]);
  const vigente = await new (require('../reports/report.service'))().getMissingItemsBySupplier(datos.fechaInicio || null,{db,incluirEnviadas:false});
  if (!vigente.success || vigente.data.find(r => r.id === actual.id)?.revisionReporte !== datos.revisionReporte) throw httpError(409,'Los faltantes cambiaron mientras se revisaban. Actualizá el reporte.');
  await require('./reservasBorradorReporte.service').liberarReasignadasEn(db,p.id,faltantes,actor);
  const { rows:abiertas } = await db.query(`SELECT * FROM orden_compra_ciclo WHERE proveedor_id=$1
    AND estado IN ('borrador','pendiente_enviar') AND envio_id IS NULL ORDER BY id DESC FOR UPDATE`,[p.id]);
  let o = abiertas[0];
  // Antes se abría una por semana. La revisión visible ahora reúne al
  // proveedor completo; liberar borradores anteriores conservando su historia
  // evita que reservas ocultas bloqueen el pedido que acaba de revisar.
  for (const anterior of abiertas.slice(1)) {
    const motivo = 'Borrador sustituido por las cantidades revisadas en Reporte Proveedores.';
    await db.query("UPDATE orden_compra_ciclo SET estado='cerrada',motivo_cierre=$2,cerrada_en=NOW(),version=version+1,actualizado_en=NOW() WHERE id=$1",[anterior.id,motivo]);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:anterior.id,accion:'cerrada',despues:{sustituidaPor:o.id},usuarioId:actor,motivo});
  }
  if (!o) o = (await db.query(`INSERT INTO orden_compra_ciclo(proveedor_id,proveedor_nombre,proveedor_cedula,clave,solicitud)
    VALUES($1,$2,$3,$4,$5) RETURNING *`,[p.id,p.nombre,p.identificacion,randomUUID(),{sinCiclos:true,desdeReporte:true}])).rows[0];
  // La pantalla es la revisión: reemplazar la abierta con lo que allí se vio
  // retira orígenes resueltos y ediciones anteriores, sin tocar una enviada.
  await limpiarBorradorEn(db,o);
  const visibles = new Set(actual.productos_faltantes.flatMap(l => l.origenes.map(r => r.faltanteId)));
  const fuentes = agrupar((await necesidadesEn(db,p,null,o.id,{bloquear:true,sinCiclos:true})).filter(r => visibles.has(r.faltanteId)));
  const vistos = new Set();
  for (const l of datos.productos) {
    const manual = l.agregadoManual === true;
    let origen = manual ? await productoManualEn(db,p,l) : fuentes.find(f => f.productoId === entero(l.productoId));
    if (!origen || vistos.has(origen.productoId)) throw httpError(409,'Los productos del pedido cambiaron o están repetidos. Actualizá el reporte.');
    vistos.add(origen.productoId);
    const revisado = actual.productos_faltantes.find(f => f.producto_id === origen.productoId);
    if (!manual && (!revisado || ['nombre','codigo','nombreProveedor','codigoProveedor','mappingId'].some(k => {
      const claves = {nombre:'nombre',codigo:'codigo',nombreProveedor:'nombre_proveedor',codigoProveedor:'codigo_proveedor',mappingId:'mapping_id'};
      return (origen[k] || null) !== (revisado[claves[k]] || null);
    }))) throw httpError(409,'Los datos del producto cambiaron. Actualizá el reporte.');
    const propia = Number(l.cantidadOriginal);
    const adicional = l.cantidadAdicional == null ? 0 : Number(l.cantidadAdicional);
    if (!Number.isSafeInteger(adicional) || adicional < 0 || adicional > 1000000) throw httpError(400,'La cantidad agregada debe ser un entero mayor o igual a cero.');
    if (!Number.isFinite(propia) || propia <= 0 || propia > 1000000 || Number(propia.toFixed(6)) !== propia) throw httpError(400,'Cantidad propia positiva de hasta seis decimales requerida.');
    if (!Number.isSafeInteger(propia) && (manual || micros(propia.toFixed(6)) !== micros(Number(revisado?.cantidad_faltante || 0).toFixed(6)) + BigInt(adicional)*1000000n)) throw httpError(400,'Ingresá cantidades enteras. Los decimales solo corresponden al saldo calculado por conversión.');
    if (!Number.isFinite(origen.factorConversion) || origen.factorConversion < 0.000001 || origen.factorConversion > 1000000) throw httpError(409,'La conversión del proveedor no es válida. Revisá su ficha.');
    const unidades = micros(propia.toFixed(6)), factor = micros(origen.factorConversion.toFixed(6));
    const esperada = Number((unidades + factor - 1n) / factor);
    const q = entero(manual ? esperada : l.cantidad,'Cantidad a pedir',1000000);
    if (!manual && Number(l.factorConversion) !== origen.factorConversion) throw httpError(409,'La conversión del proveedor cambió. Actualizá antes de enviar.');
    if (!manual && esperada !== q) throw httpError(400,'La cantidad del pedido no coincide con las unidades revisadas.');
    if (manual) await db.query(`INSERT INTO orden_compra_ciclo_linea(orden_id,producto_id,producto_nombre,codigo_interno,codigo_proveedor,nombre_proveedor,mapping_id,factor_conversion,cantidad_proveedor)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[o.id,origen.productoId,origen.nombre,origen.codigo,origen.codigoProveedor,origen.nombreProveedor,origen.mappingId,origen.factorConversion,q]);
    else await reemplazarLineaEn(db,o,{productoId:origen.productoId,cantidadProveedor:q},origen);
  }
  await db.query("UPDATE orden_compra_ciclo SET estado='pendiente_enviar',version=version+1,actualizado_en=NOW() WHERE id=$1",[o.id]);
  o = await obtenerEn(db,o.id);
  const mensaje = envio.mensajePredeterminado;
  o = await envio.interno.prepararEn(db,o.id,{version:o.version,clave:datos.clave,telefono,mensaje,preferirDatosProveedor:datos.preferirDatosProveedor !== false},actor);
  const { rows:temporales } = await db.query(`SELECT id,updated_at::text actualizado FROM orden_compra_temporal
    WHERE proveedor_nombre=ANY($1::text[])`,[[...new Set([p.nombre,actual.nombre,...(actual.aliases || [])])]]);
  await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'revisar_reporte',despues:{clave:datos.clave,firma:firma(datos),temporales},usuarioId:actor});
  return o;
}
async function enviar(datos,actor) {
  datos = validar(datos);
  const o = await enOrden(db => revisarEn(db,datos,actor));
  const orden = await envio.enviar(o.id,datos.clave,{confirmar:true},actor);
  const estado = orden.envios.find(e => e.id === datos.clave)?.estado;
  return { orden, envioEstado:estado };
}
/** El modal muestra el destino y mensaje de la copia guardada, no una
 * propuesta que podría cambiar al confirmar. Preparar jamás reclama el
 * canal ni manda mensajes; cancelar deja la copia en su historial.
 */
async function revisarEnvio(datos,actor) {
  datos=validar(datos);
  return enOrden(async db=>{
    const o=await revisarEn(db,datos,actor,{soloPreparar:true});
    if (o.destinoPendiente) return { orden:null,destino:o.destinoPendiente,envioEstado:'pendiente_destino' };
    const copia=o.envios.find(e=>e.id===datos.clave);
    if (o.estado!=='pendiente_enviar' || o.envio_id || copia?.estado!=='revisado' || copia.version_orden!==o.version) throw httpError(409,'La compra cambió o ya tiene un envío por verificar. Actualizá el reporte.');
    return { orden:o,destino:{telefono:copia.numero,mensaje:copia.mensaje,telefonos:await telefonosFichaEn(db,o.proveedor_id)},envioEstado:copia.estado };
  });
}
module.exports = { enviar,revisarEnvio };
