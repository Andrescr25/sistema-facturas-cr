/**
 * Revision-Precios Module - Routes
 * Rutas para la revisión de precios (montadas en /api/revision-precios)
 */

const express = require('express');
const router = express.Router();
const revisionPreciosController = require('./revision-precios.controller');

// Facturas
router.get('/facturas', revisionPreciosController.getFacturas);
router.get('/facturas-relacionadas', revisionPreciosController.getFacturasRelacionadas);
router.post('/devolver-factura', revisionPreciosController.devolverFactura);

// Comparación de precios: los productos de la factura (del maestro propio,
// por `producto.id`) y el precio que sugiere el motor para cada línea.
router.post('/productos-batch', revisionPreciosController.getProductosBatch);
router.get('/facturas/:facturaId/sugerencias-precio', revisionPreciosController.getSugerenciasPrecio);
// /facturas/:facturaId/ordenes-compra se retiró el 2026-10-20: lo que llega ya
// no se enlaza a una orden de compra (pedido del usuario).

// La compra se registra por /compras/registrar. El envío viejo a Alegra
// (/enviar-alegra) se retiró el 2026-10-04: ninguna pantalla lo llamaba.

// Se quitaron /productos-pendientes, /confirmar-producto, /rechazar-producto,
// /actualizar-precio y /estadisticas: ninguna pantalla las llamaba, y las tres
// del medio escribían la relación por el id de Alegra o el precio de la línea
// de la factura recibida.

module.exports = router;
