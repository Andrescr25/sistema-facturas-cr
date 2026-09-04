const express = require('express');
const router = express.Router();
const controller = require('./cotizaciones.controller');

/**
 * Lo ÚNICO de cotizaciones que vive fuera del login.
 *
 * Va en su propio router y su propio prefijo (/cotizacion-publica) a
 * propósito: si fuera una ruta más dentro de /cotizaciones, sacar ese prefijo
 * de la lista de rutas públicas abriría también crear, editar, facturar y
 * borrar. Acá la excepción de seguridad alcanza a una sola cosa: leer una
 * cotización, y solo con su token firmado.
 */
router.get('/:token', controller.publica);

module.exports = router;
