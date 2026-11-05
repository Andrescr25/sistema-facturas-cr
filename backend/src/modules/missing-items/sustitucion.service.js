const { createHash } = require('node:crypto');
const { conFaltanteEditable } = require('./missing-items.service');
const { contextoEn, candidatosEn } = require('./sustitucionConsulta');
const { prepararSustitucionEn, aplicarSustitucionEn } = require('../facturacion/sustitucionFactura.service');
const { agregarIngreso, bloquearIngresos } = require('./ingresoFaltante');
const { guardarAjusteEn } = require('./ajustesAlmacenados');
const { validarEntrega } = require('./ajusteEntrega');
const { guardarFaltantes } = require('../../utils/guardarFaltantes');
const { registrarCambio } = require('../../utils/bitacora');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { httpError, idValido } = require('../../utils/validacion');
const { precioConImpuesto } = require('../catalogo-clientes/precio');

async function listar(faltanteId, buscar) {
  return conFaltanteEditable(faltanteId, async (db, faltante) => {
    const contexto = await contextoEn(db, faltante);
    return { original: { id:contexto.original.id,nombre:contexto.original.nombre,cantidad:Number(faltante.cantidad_faltante) },
      productos: (await candidatosEn(db, faltante, contexto.original, buscar)).map(p => ({
        id:p.id,nombre:p.nombre,referencia:p.referencia,unidad:p.unidad,disponible:p.disponible,
        precio:precioConImpuesto(p.precio_sin_iva,p.tarifa)
      })) };
  }, { soloLectura:true });
}

function cantidadValida(valor, faltante) {
  const cantidad = typeof valor === 'number' || typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0 || cantidad > Number(faltante.cantidad_faltante)) {
    throw httpError(400, `La cantidad a cambiar debe ser un entero entre 1 y ${faltante.cantidad_faltante}.`);
  }
  return cantidad;
}

async function prepararEn(db, faltante, datos) {
  const productoId = idValido(datos.productoId);
  const cantidad = cantidadValida(datos.cantidad, faltante);
  const contexto = await contextoEn(db, faltante);
  const [candidato] = await candidatosEn(db, faltante, contexto.original, '', productoId);
  if (!candidato) throw httpError(409, 'No hay unidades ingresadas libres del sustituto. Actualizá la selección.');
  if (candidato.disponible < cantidad) throw httpError(409, `Solo quedan ${candidato.disponible} unidades ingresadas libres del sustituto. Revisá la cantidad.`);
  const { rows:[destino] } = await db.query(`SELECT f.*,f.created_at::text AS ingreso_desde,aj.cantidad_entregada,aj.estado AS respuesta,
    aj.revisado,aj.updated_at::text AS revision_fecha FROM faltantes f LEFT JOIN faltantes_ajustes aj ON aj.faltante_id=f.id
    WHERE f.factura_propia_id=$1 AND f.producto_propio_id=$2`, [faltante.factura_propia_id, productoId]);
  if (destino && (destino.estado !== 'pendiente' || Number(destino.cantidad_rebajada) > 0)) {
    throw httpError(409, 'El sustituto tiene un ajuste procesado en esta factura. Revisalo en Impresión antes de agregarle unidades.');
  }
  const propuesta = await prepararSustitucionEn(db, contexto, faltante.producto_propio_id, productoId, cantidad);
  const version = createHash('sha256').update(JSON.stringify({ faltante, destino, factura:contexto.factura,
    original:contexto.original, lineas:contexto.lineas, producto:propuesta.producto, descuento:propuesta.descuento, cantidad })).digest('hex');
  return { contexto, propuesta, destino, cantidad, version, restante:Number(faltante.cantidad_faltante)-cantidad };
}

function aVista(preparacion) {
  const { contexto, propuesta, cantidad, version, restante } = preparacion;
  return { version,cantidad,faltanteOriginalRestante:restante,
    original:{ nombre:contexto.original.nombre,referencia:contexto.original.referencia },
    producto:{ id:propuesta.producto.id,nombre:propuesta.producto.nombre,referencia:propuesta.producto.referencia,
      precio:precioConImpuesto(Number(propuesta.producto.precio)*(1-propuesta.descuento/100),Number(propuesta.producto.tarifa)||0),
      descuento:propuesta.descuento,tarifa:Number(propuesta.producto.tarifa)||0 },
    factura:{ id:contexto.factura.id,numero:contexto.factura.numero,totalAnterior:Number(contexto.factura.total),totalNuevo:propuesta.armado.total } };
}

async function previsualizar(faltanteId, datos) {
  return conFaltanteEditable(faltanteId, async (db, faltante) => aVista(await prepararEn(db, faltante, datos)), { soloLectura:true });
}

async function sustituir(faltanteId, datos, usuario) {
  return conFaltanteEditable(faltanteId, async (db, faltante) => {
    // Mismo orden en facturas distintas: nunca tomar A→B en una y B→A en otra.
    await bloquearIngresos(db, [faltante.producto_propio_id,idValido(datos.productoId)]);
    const preparado = await prepararEn(db, faltante, datos);
    if (!datos.version || datos.version !== preparado.version) throw httpError(409, 'Cambió la factura, el producto o su precio. Volvé a revisar el cambio antes de confirmar.');
    const { contexto, propuesta, destino, cantidad, restante } = preparado;
    await aplicarSustitucionEn(db, contexto, propuesta, usuario.id);
    const unidadesOriginales = propuesta.armado.lineas.filter(l=>l.producto_id===faltante.producto_propio_id).reduce((n,l)=>n+Number(l.cantidad),0);
    await db.query(`UPDATE faltantes SET cantidad_faltante=$2,tipo_faltante=$3,updated_at=${AHORA_CR_SQL} WHERE id=$1`,
      [faltante.id,restante,restante ? (restante<unidadesOriginales?'parcial':'total') : 'completo']);
    if (!restante) await db.query('DELETE FROM faltantes_ajustes WHERE faltante_id=$1', [faltante.id]);

    const faltantePrevio = destino?.tipo_faltante === 'completo' ? 0 : Number(destino?.cantidad_faltante)||0;
    const totalFaltante = faltantePrevio + cantidad;
    const unidadesDestino = propuesta.armado.lineas.filter(l=>l.producto_id===propuesta.producto.id).reduce((n,l)=>n+Number(l.cantidad),0);
    const detectados = [];
    await guardarFaltantes(faltante.factura_propia_id, [{ producto_id:propuesta.producto.id,cantidad_faltante:totalFaltante,
      tipo_faltante:totalFaltante<unidadesDestino?'parcial':'total',observaciones:destino?.observaciones||'' }],
    usuario.nombre||'Usuario', db, detectados);
    const destinoId = detectados[0].id;
    // El cambio conserva la fecha del pedido que debe respaldar la compra.
    await db.query(`UPDATE faltantes SET created_at=LEAST(created_at,$2::timestamp) WHERE id=$1`, [destinoId,faltante.ingreso_desde]);
    const reservas = await agregarIngreso(db, { id:destinoId,producto_propio_id:propuesta.producto.id }, cantidad, faltante.ingreso_desde, usuario.id);
    const entregada = (Number(destino?.cantidad_entregada)||0) + cantidad;
    await guardarAjusteEn(db, destinoId, validarEntrega(totalFaltante, {
      cantidadEntregada:entregada,estado:entregada===totalFaltante?'completo':'parcial',revisado:false
    }));
    const { rows:proveedores } = await db.query(`SELECT DISTINCT p.nombre AS proveedor_nombre FROM faltante_ingreso fi
      JOIN compra_linea cl ON cl.id=fi.compra_linea_id JOIN compra co ON co.id=cl.compra_id
      JOIN proveedor p ON p.id=co.proveedor_id WHERE fi.faltante_id=$1`, [destinoId]);
    await db.query(`UPDATE faltantes SET proveedor_asignado=COALESCE(proveedor_asignado,$2) WHERE id=$1`,
      [destinoId,proveedores.length===1?proveedores[0].proveedor_nombre:'Varios proveedores']);
    await registrarCambio(db, { entidad:'faltante',entidadId:faltante.id,accion:'editar',usuarioId:usuario.id,
      antes:{ nombre:contexto.original.nombre,productoId:faltante.producto_propio_id,cantidadFaltante:Number(faltante.cantidad_faltante) },
      despues:{ nombre:contexto.original.nombre,cantidadFaltante:restante,sustituto:propuesta.producto.nombre,
        productoId:propuesta.producto.id,cantidad,destinoId,reservas,totalFactura:propuesta.armado.total },
      motivo:'Cambio de producto en Reporte Clientes, con ingreso confirmado y precio actual' });
    return { ...aVista(preparado),faltanteDestinoId:destinoId };
  }, { todosLosFaltantes:true });
}

module.exports = { listar, previsualizar, sustituir };
