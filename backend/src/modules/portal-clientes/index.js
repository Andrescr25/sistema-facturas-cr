/**
 * Portal de clientes - Index
 */

const { rutasPersonal, rutasCliente } = require('./portal-clientes.routes');
const controller = require('./portal-clientes.controller');
const service = require('./portal-clientes.service');
const clienteService = require('./portal-clientes.cliente.service');
const pedidosService = require('./portal-clientes.pedidos.service');
const middleware = require('./portal-clientes.middleware');

module.exports = { rutasPersonal, rutasCliente, controller, service, clienteService, pedidosService, middleware };
