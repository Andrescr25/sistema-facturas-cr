/**
 * Rutas del módulo de Órdenes de Compra y WhatsApp
 */

const express = require('express');
const OrdersWhatsappController = require('./orders-whatsapp.controller');

const router = express.Router();
const controller = new OrdersWhatsappController();

// Entrada por proveedor.
router.use('/proveedor', require('./ordenesProveedor.routes'));

// El envío global no registra cobertura y permitiría comprar otra vez lo ya
// solicitado. Conservamos lectura/borradores históricos, pero todo
// envío nuevo pasa por la orden persistida y la copia explícitamente revisada.
router.post('/enviar-whatsapp', (req, res) => res.status(409).json({
  success: false,
  message: 'Abrí el proveedor en Faltantes y revisá una orden de compra antes de enviarla.'
}));

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

// El WhatsApp del proveedor para la orden: el de su FICHA (`proveedor`), que
// se busca por cédula. Antes iba por nombre a una tabla aparte.
router.get('/proveedor-contacto', controller.getProveedorContacto);
router.put('/proveedor-contacto', controller.guardarProveedorContacto);

module.exports = router;
