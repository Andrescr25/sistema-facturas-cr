/**
 * Catalogo Publico Module - Routes
 * Rutas para el catálogo público de solo lectura (montadas en /api/catalogo-agente)
 */

const express = require('express');
const router = express.Router();
const catalogoAgenteController = require('./catalogo-agente.controller');

router.get('/productos', catalogoAgenteController.listarProductos);
router.get('/categorias', catalogoAgenteController.listarCategorias);
router.get('/config-catalogo', catalogoAgenteController.obtenerConfigCatalogo);
// Qué productos son A y B en rotación: el catálogo de "Cliente nuevo". Pide
// sesión (no está en las rutas públicas de auth.middleware): dice qué es lo
// que más se vende.
router.get('/rotacion', catalogoAgenteController.obtenerRotacion);
router.get('/ofertas', catalogoAgenteController.listarOfertas);
// Los productos a los que se les bajó el precio a propósito. Otra cosa que
// las ofertas de arriba, que son excesos de inventario.
router.get('/ofertas-baja', catalogoAgenteController.listarOfertasPorBaja);
router.get('/historial-clientes', catalogoAgenteController.obtenerHistorialClientes);
router.post('/historial-clientes/sync', catalogoAgenteController.sincronizarHistorialClientes);

// El pedido que el agente levanta en la calle. Va detrás de la sesión del
// personal: el catálogo del agente ya exige login.
router.post('/pedidos', catalogoAgenteController.crearPedido);

// El dispositivo cuenta cuántos pedidos le quedan sin mandar; la casa lo mira.
router.post('/dispositivos/estado', catalogoAgenteController.reportarEstadoDispositivo);
router.get('/dispositivos', catalogoAgenteController.listarDispositivos);

module.exports = router;
