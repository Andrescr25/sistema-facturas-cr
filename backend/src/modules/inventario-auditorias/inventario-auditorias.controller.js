/** HTTP del inventario propio; cada cambio identifica al usuario autenticado. */
const servicio = require('./inventario-auditorias.service');
const inventario = require('../inventario/inventario.service');
const productosNuevos = require('./productosNuevos');
const accion = (trabajo, { mensaje = null, extendido = false } = {}) => async (req, res) => {
  try {
    const data = await trabajo(req);
    res.json(extendido ? { success: true, ...data } : { success: true, data, ...(mensaje ? { message: mensaje } : {}) });
  } catch (error) { responderError(res, error, 'Inventario: operación no completada.'); }
};
const usuario = req => req.usuario?.id || null;
const listarAuditorias = accion(r => servicio.listarAuditorias(r.query.tipo));
const listarCategorias = accion(r => servicio.listarCategorias());
const crearAuditoria = accion(r => servicio.crearAuditoria(r.body || {}));
const getAuditoria = accion(r => servicio.getAuditoria(r.params.id));
const guardarConteos = accion(r => servicio.guardarConteos(r.params.id,r.body?.items,usuario(r)), { extendido: true });
const guardarConteoIndividual = accion(r => servicio.guardarConteoIndividual(r.params.id,r.params.itemId,r.body?.stockReal));
const finalizarAuditoria = accion(r => servicio.finalizarAuditoria(r.params.id,r.body?.observaciones,usuario(r)));
const ajustarInventario = accion(r => servicio.ajustarInventario(r.params.id,usuario(r)), { extendido: true });
const resincronizarAuditoria = accion(r => servicio.resincronizarAuditoria(r.params.id));
const crearDevolucion = accion(r => servicio.crearDevolucion(r.body?.destino || 'cliente'));
const buscarProductosParaDevolucion = accion(r => servicio.buscarProductosParaDevolucion(r.query.q));
const agregarItemDevolucion = accion(r => servicio.agregarItemDevolucion(r.params.id,r.body || {}));
const eliminarItemDevolucion = accion(r => servicio.eliminarItemDevolucion(r.params.id,r.params.itemId));
const generarExcesos = accion(r => servicio.generarTandaDeExcesos(), { extendido: true });
const actualizarItemExceso = accion(r => servicio.actualizarItemExceso(r.params.id,r.params.itemId,r.body || {},usuario(r)));
const listarRegalos = accion(r => servicio.listarRegalos());
const crearExcesoManual = accion(r => servicio.crearExcesoManual());
const eliminarAuditoria = accion(r => servicio.eliminarAuditoria(r.params.id), { extendido: true });
const agregarItemExceso = accion(r => servicio.agregarItemExceso(r.params.id,r.body || {}));
const aplicarDescuentoTanda = accion(r => servicio.aplicarDescuentoTanda(r.params.id,r.body || {}), { extendido: true });
const listarDescuentosExceso = accion(r => servicio.listarDescuentosExceso());
const guardarDescuentoExceso = accion(r => servicio.guardarDescuentoExceso(r.body || {}));
const eliminarDescuentoExceso = accion(r => servicio.eliminarDescuentoExceso(r.params.productoId), { extendido: true });
const listarExistencias = accion(r => inventario.listarExistencias({...r.query,soloBajo:r.query.soloBajo==='true',soloSinConteo:r.query.soloSinConteo==='true'}));
const kardex = accion(r => inventario.kardex(r.params.productoId,r.query));
const guardarUmbrales = accion(r => inventario.guardarUmbrales(r.params.productoId,r.body || {}));

// ==================== PRODUCTOS NUEVOS (catálogo del agente) ====================

function responderError(res, error, contexto) {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  console.error(contexto);
  return res.status(500).json({ success: false, message: 'No se pudo completar la operación.' });
}

/** GET /inventario-auditorias/productos-nuevos */
async function listarProductosNuevos(req, res) {
  try {
    res.json({ success: true, data: await productosNuevos.listar() });
  } catch (error) {
    responderError(res, error, 'Error listando productos nuevos:');
  }
}

async function buscarProductosNuevos(req, res) {
  try {
    res.json({ success: true, data: await productosNuevos.buscar(req.query.q) });
  } catch (error) {
    responderError(res, error, 'Error buscando productos nuevos:');
  }
}

/** POST /inventario-auditorias/productos-nuevos { productoId: producto.id } */
async function agregarProductoNuevo(req, res) {
  try {
    const quien = req.usuario?.nombre || req.usuario?.usuario || null;
    res.json({ success: true, data: await productosNuevos.agregar(req.body?.productoId, quien) });
  } catch (error) {
    responderError(res, error, 'Error agregando producto nuevo:');
  }
}

/** DELETE /inventario-auditorias/productos-nuevos/registros/:registroId */
async function quitarProductoNuevo(req, res) {
  try {
    res.json({ success: true, data: await productosNuevos.quitar(req.params.registroId) });
  } catch (error) {
    responderError(res, error, 'Error quitando producto nuevo:');
  }
}

module.exports = {
  listarAuditorias, listarCategorias, crearAuditoria, getAuditoria, guardarConteos, guardarConteoIndividual, finalizarAuditoria, ajustarInventario, resincronizarAuditoria, crearDevolucion, buscarProductosParaDevolucion, agregarItemDevolucion, eliminarItemDevolucion, generarExcesos, actualizarItemExceso, listarRegalos, crearExcesoManual, eliminarAuditoria, agregarItemExceso, aplicarDescuentoTanda, listarDescuentosExceso, guardarDescuentoExceso, eliminarDescuentoExceso, listarExistencias, kardex, guardarUmbrales,
  buscarProductosNuevos, listarProductosNuevos, agregarProductoNuevo, quitarProductoNuevo
};
