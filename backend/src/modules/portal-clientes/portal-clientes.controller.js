/**
 * Portal de clientes - Controller
 */

const personal = require('./portal-clientes.service');
const clienteSvc = require('./portal-clientes.cliente.service');
const pedidos = require('./portal-clientes.pedidos.service');
const inicio = require('./portal-clientes.inicio.service');
const carrito = require('./portal-clientes.carrito.service');
const sugerencias = require('./portal-clientes.sugerencias.service');
const saldo = require('./portal-clientes.saldo.service');

function responder(res, promesa, mensajeError) {
  return promesa
    .then(data => res.json({ success: true, data }))
    .catch(error => {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error(`${mensajeError}:`, error.message);
      res.status(500).json({ success: false, error: error.message });
    });
}

// ---- Personal ----
const listarClientes = (req, res) =>
  responder(res, personal.listarClientes({ busqueda: req.query.q }), 'Error listando clientes del portal');

const generarInvitacion = (req, res) =>
  responder(res, personal.generarInvitacion(req.params.contactoId, req.usuario?.id), 'Error generando la invitación');

const revocarAcceso = (req, res) =>
  responder(res, personal.revocarAcceso(req.params.contactoId), 'Error revocando el acceso');

const reactivarAcceso = (req, res) =>
  responder(res, personal.reactivarAcceso(req.params.contactoId), 'Error reactivando el acceso');

const listarPedidos = (req, res) =>
  responder(res, pedidos.listarPedidos({ estado: req.query.estado }), 'Error listando pedidos');

const detallePedido = (req, res) =>
  responder(res, pedidos.detalle(req.params.pedidoId), 'Error obteniendo el pedido');

const facturarPedido = (req, res) =>
  responder(res, pedidos.facturar(req.params.pedidoId, req.usuario?.id), 'Error facturando el pedido');

const rechazarPedido = (req, res) =>
  responder(res, pedidos.rechazar(req.params.pedidoId, req.body || {}, req.usuario?.id), 'Error rechazando el pedido');

const contarPendientes = (req, res) =>
  responder(res, pedidos.contarPendientes().then(n => ({ pendientes: n })), 'Error contando pedidos');

// ---- Cliente ----
const verInvitacion = (req, res) =>
  responder(res, clienteSvc.verInvitacion(req.params.token), 'Error leyendo la invitación');

const activar = (req, res) =>
  responder(res, clienteSvc.activar(req.body?.token, req.body || {}), 'Error activando la cuenta');

const entrar = (req, res) =>
  responder(res, clienteSvc.entrar(req.body || {}), 'Error en el ingreso del cliente');

const yo = (req, res) => res.json({ success: true, data: req.cliente });

// El contacto sale del TOKEN, no de la petición: así un cliente no puede
// pedir la portada de otro cambiando un parámetro.
const portada = (req, res) =>
  responder(res, inicio.obtenerInicio(req.cliente.contacto), 'Error armando la portada del cliente');

// ---- Carrito ----
const verCarrito = (req, res) =>
  responder(res, carrito.obtenerCarrito(req.cliente.id), 'Error leyendo el carrito');

const ponerEnCarrito = (req, res) =>
  responder(res, carrito.ponerCantidad(req.cliente.id, req.body?.alegraItemId, req.body?.cantidad), 'Error actualizando el carrito');

const vaciarCarrito = (req, res) =>
  responder(res, carrito.vaciarCarrito(req.cliente.id), 'Error vaciando el carrito');

const agregarVariosAlCarrito = (req, res) =>
  responder(res, carrito.agregarVarios(req.cliente.id, req.body?.lineas), 'Error agregando al carrito');

// ---- Sugerencias e historial ----
const juntoCon = (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
  return responder(res, sugerencias.seLlevaJuntoCon(ids, { excluir: ids }), 'Error buscando sugerencias');
};

const fichaProducto = (req, res) =>
  responder(res, sugerencias.fichaProducto(req.cliente.contacto, req.params.itemId), 'Error abriendo el producto');

const misFacturas = (req, res) =>
  responder(res, saldo.facturasPendientes(req.cliente.contacto), 'Error listando las facturas del cliente');

const detalleCompra = (req, res) =>
  responder(res, sugerencias.detalleCompra(req.cliente.contacto, req.params.facturaId), 'Error abriendo la compra');

const comprasAnteriores = (req, res) =>
  responder(res, sugerencias.comprasAnteriores(req.cliente.contacto), 'Error listando compras anteriores');

/**
 * Repetir una compra: se resuelven las líneas contra el historial de ESTE
 * cliente y se suman al carrito. El id de factura llega por la ruta, pero el
 * cliente sale del token, así que pedir una factura ajena no devuelve nada.
 */
const repetirCompra = async (req, res) => {
  try {
    const lineas = await sugerencias.lineasDeCompra(req.cliente.contacto, req.params.facturaId);
    const resultado = await carrito.agregarVarios(req.cliente.id, lineas);
    res.json({ success: true, data: resultado });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Error repitiendo la compra:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const crearPedido = (req, res) =>
  responder(res, clienteSvc.crearPedido(req.cliente.id, req.body || {}), 'Error creando el pedido');

const misPedidos = (req, res) =>
  responder(res, clienteSvc.misPedidos(req.cliente.id), 'Error listando los pedidos del cliente');

const miPedido = (req, res) =>
  responder(res, clienteSvc.detallePedido(req.cliente.id, req.params.pedidoId), 'Error obteniendo el pedido');

module.exports = {
  listarClientes, generarInvitacion, revocarAcceso, reactivarAcceso,
  listarPedidos, detallePedido, facturarPedido, rechazarPedido, contarPendientes,
  verInvitacion, activar, entrar, yo, portada, crearPedido, misPedidos, miPedido,
  verCarrito, ponerEnCarrito, vaciarCarrito, agregarVariosAlCarrito,
  juntoCon, fichaProducto, comprasAnteriores, detalleCompra, repetirCompra, misFacturas
};
