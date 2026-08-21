/**
 * Catálogo para clientes - Routes
 *
 * Todas públicas: es un catálogo pensado para mandarse por WhatsApp. Están
 * declaradas en la lista de excepciones de auth.middleware.js, y son de solo
 * lectura — no hay ninguna ruta acá que escriba.
 */

const express = require('express');
const controller = require('./catalogo-clientes.controller');

const router = express.Router();

router.get('/productos', controller.productos);
router.get('/ofertas', controller.ofertas);
router.get('/categorias', controller.categorias);
router.get('/configuracion', controller.configuracion);

module.exports = router;
