/**
 * Rutas del módulo de Órdenes de Compra y WhatsApp
 */

const express = require('express');
const OrdersWhatsappController = require('./orders-whatsapp.controller');

const router = express.Router();
const controller = new OrdersWhatsappController();

// Generar PDF
router.post('/generar-pdf', controller.generarPDF);

// Enviar WhatsApp
router.post('/enviar-whatsapp', controller.enviarWhatsApp);

// Cantidades modificadas
router.get('/cantidades', controller.getCantidades);
router.post('/cantidades', controller.guardarCantidades);
router.delete('/cantidades', controller.limpiarCantidades);

// Productos eliminados/agregados temporalmente
router.post('/producto-eliminado', controller.registrarProductoEliminado);
router.post('/producto-agregado', controller.registrarProductoAgregado);

// Deshacer. Estas dos faltaban: la pantalla ya las llamaba y daban 404, que
// se perdía en un catch vacío — la vista mostraba el cambio y el servidor
// seguía guardando lo contrario.
router.delete('/producto-eliminado', controller.quitarProductoEliminado);
router.delete('/producto-agregado', controller.quitarProductoAgregado);

// Teléfonos de WhatsApp de proveedores
router.get('/proveedor-contacto/:nombreProveedor', controller.getProveedorContacto);
router.put('/proveedor-contacto', controller.guardarProveedorContacto);

module.exports = router;
