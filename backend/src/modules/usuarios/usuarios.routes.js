/**
 * Usuarios y permisos - Routes
 *
 * Todo lo de acá exige ser administrador. No hace falta comprobarlo ruta por
 * ruta: '/usuarios' está en RUTAS_ADMIN (modulos.js) y requirePermiso lo hace
 * valer antes de llegar. La excepción es el catálogo de módulos, que es una
 * lista fija de nombres y no expone dato alguno.
 */

const express = require('express');
const controller = require('./usuarios.controller');

const router = express.Router();

router.get('/modulos', controller.catalogoModulos);

// La bitácora de cambios: quién hizo qué. Solo lectura, y solo administradores
// (cuelga de /usuarios). Va ANTES de `/:id`, o "bitacora" se leería como el id
// de un usuario.
router.get('/bitacora', controller.listarBitacora);
router.get('/bitacora/filtros', controller.filtrosBitacora);
router.get('/bitacora/:id', controller.lineaBitacora);

router.get('/', controller.listar);
router.post('/', controller.crear);
router.get('/:id', controller.obtener);
router.put('/:id', controller.actualizar);
router.post('/:id/password', controller.restablecerPassword);
router.delete('/:id', controller.eliminar);

module.exports = router;
