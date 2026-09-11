/**
 * Configuración de la empresa — Routes
 *
 * Dos routers porque son dos permisos distintos:
 *
 * - `routes` (/api/configuracion): ver todo y cambiar. Solo quien tenga el
 *   módulo Configuración (ver usuarios/modulos.js).
 * - `rutasCompartidas` (/api/catalogos): leer lo activo. Facturación, Cobros
 *   y los PDF lo necesitan para cualquiera que haya entrado; no expone nada
 *   que no se imprima ya en una factura.
 */

const express = require('express');
const controller = require('./configuracion.controller');

const routes = express.Router();
routes.get('/', controller.obtener);
routes.put('/empresa', controller.actualizarEmpresa);
routes.post('/:catalogo', controller.crear);
routes.put('/:catalogo/:id', controller.editar);
routes.patch('/:catalogo/:id/activo', controller.cambiarActivo);

const rutasCompartidas = express.Router();
rutasCompartidas.get('/configuracion', controller.paraOperar);

module.exports = { routes, rutasCompartidas };
