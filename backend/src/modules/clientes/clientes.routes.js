/**
 * Clientes — Routes
 *
 * - `routes` (/api/clientes): la ficha completa y los cambios. Solo quien
 *   tenga el módulo Clientes (ver usuarios/modulos.js), que es el mismo que
 *   administra el portal.
 * - `rutasCompartidas` (/api/catalogos): buscar un cliente activo para
 *   facturarle o cobrarle, sin datos de crédito.
 */

const express = require('express');
const controller = require('./clientes.controller');

const routes = express.Router();
routes.get('/', controller.listar);
routes.get('/:id', controller.obtener);
routes.post('/', controller.crear);
routes.put('/:id', controller.editar);
routes.patch('/:id/estado', controller.cambiarEstado);

const rutasCompartidas = express.Router();
rutasCompartidas.get('/clientes', controller.paraOperar);

module.exports = { routes, rutasCompartidas };
