/**
 * Portal de clientes - Routes
 *
 * DOS routers a propósito, uno por público:
 *
 *   rutasPersonal → se monta en /api/portal-clientes y queda detrás de
 *                   requireAuth como cualquier pantalla del sistema.
 *   rutasCliente  → se monta en /api/portal, está en la lista de excepciones
 *                   de requireAuth y se protege con requireCliente.
 *
 * Separarlos en dos archivos de rutas hace visible dónde está la frontera:
 * nadie agrega una ruta de personal al router equivocado sin notarlo.
 */

const express = require('express');
const controller = require('./portal-clientes.controller');
const { requireCliente } = require('./portal-clientes.middleware');

// ---- Personal (detrás de requireAuth) ----
const rutasPersonal = express.Router();

rutasPersonal.get('/clientes', controller.listarClientes);
rutasPersonal.post('/clientes/:contactoId/invitacion', controller.generarInvitacion);
// El enlace se manda desde la pantalla porque el servidor ya no lo tiene:
// del token queda solo el hash, igual que con una contraseña.
rutasPersonal.post('/clientes/:contactoId/invitacion/whatsapp', controller.enviarInvitacionWhatsApp);
rutasPersonal.post('/clientes/:contactoId/revocar', controller.revocarAcceso);
rutasPersonal.post('/clientes/:contactoId/reactivar', controller.reactivarAcceso);

rutasPersonal.get('/pedidos', controller.listarPedidos);
rutasPersonal.get('/pedidos/pendientes', controller.contarPendientes);
rutasPersonal.get('/pedidos/:pedidoId', controller.detallePedido);
rutasPersonal.post('/pedidos/:pedidoId/facturar', controller.facturarPedido);
rutasPersonal.post('/pedidos/:pedidoId/rechazar', controller.rechazarPedido);
// Avisarle al cliente en qué va su pedido. Con botón, no automático.
rutasPersonal.post('/pedidos/:pedidoId/whatsapp', controller.enviarAvisoPedido);

// ---- Cliente (público + requireCliente) ----
const rutasCliente = express.Router();

rutasCliente.use(requireCliente);

rutasCliente.get('/invitacion/:token', controller.verInvitacion);
rutasCliente.post('/activar', controller.activar);
rutasCliente.post('/entrar', controller.entrar);
rutasCliente.get('/yo', controller.yo);
rutasCliente.get('/inicio', controller.portada);
rutasCliente.get('/carrito', controller.verCarrito);
rutasCliente.put('/carrito', controller.ponerEnCarrito);
rutasCliente.post('/carrito/varios', controller.agregarVariosAlCarrito);
rutasCliente.delete('/carrito', controller.vaciarCarrito);

rutasCliente.get('/junto-con', controller.juntoCon);
rutasCliente.get('/productos/:itemId', controller.fichaProducto);
rutasCliente.get('/facturas', controller.misFacturas);
rutasCliente.get('/compras', controller.comprasAnteriores);
rutasCliente.get('/compras/:facturaId', controller.detalleCompra);
rutasCliente.post('/compras/:facturaId/repetir', controller.repetirCompra);

rutasCliente.post('/pedidos', controller.crearPedido);
rutasCliente.get('/pedidos', controller.misPedidos);
rutasCliente.get('/pedidos/:pedidoId', controller.miPedido);

module.exports = { rutasPersonal, rutasCliente };
