/**
 * Productos y categorías — Routes
 *
 * - `routes` (/api/maestro): ver todo y cambiar. Solo quien tenga el módulo
 *   Gestión de Catálogo (ver usuarios/modulos.js).
 * - `rutasCompartidas` (/api/catalogos): leer lo activo para vender.
 *
 * No se usa /api/productos: ese prefijo es del catálogo local de siempre y
 * está abierto a cualquiera que haya entrado.
 */

const express = require('express');
const controller = require('./productos.controller');

const routes = express.Router();
routes.get('/productos', controller.listar);
routes.get('/productos/proveedores', controller.proveedores);
routes.get('/productos/:id', controller.obtener);
routes.post('/productos', controller.crear);
routes.put('/productos/:id', controller.editar);
routes.patch('/productos/:id/estado', controller.cambiarEstado);
routes.get('/categorias', controller.listarCategorias);
routes.post('/categorias', controller.crearCategoria);
routes.put('/categorias/:id', controller.editarCategoria);
routes.patch('/categorias/:id/activo', controller.cambiarActivoCategoria);

const rutasCompartidas = express.Router();
rutasCompartidas.get('/productos', controller.paraOperar);

module.exports = { routes, rutasCompartidas };
