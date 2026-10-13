/**
 * Rutas del módulo de Reportes
 */

const express = require('express');
const ReportController = require('./report.controller');

const router = express.Router();
const reportController = new ReportController();
const {enviarExcel}=require('../../utils/exportarExcel');

// Reporte de faltantes por proveedor
router.get('/faltantes/proveedor/ciclos', reportController.getCiclos);
// Consulta independiente: no asignar proveedores ni aplicar borradores al leer.
router.get('/faltantes/proveedor/necesidades/exportar',(req,res)=>require('./necesidades.excel').exportar(req.query).then(r=>enviarExcel(res,r)).catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudieron exportar las necesidades.'})));
router.get('/faltantes/proveedor/necesidades', (req,res)=>require('./necesidades.service').listar(req.query)
  .then(data=>res.json({success:true,data}))
  .catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudieron consultar las necesidades de esta semana.'})));
router.get('/faltantes/proveedor', reportController.getMissingItemsBySupplier);
router.get('/faltantes/proveedor/exportar', reportController.exportarProveedores);

// Las notas escritas al facturar, para leerlas al comprar
router.get('/faltantes/notas', reportController.getNotasDeFaltantes);

// Reporte de faltantes por cliente
router.get('/faltantes/cliente/rutas', reportController.getRutasClientes);
router.get('/faltantes/cliente', reportController.getMissingItemsByClient);
router.get('/faltantes/cliente/exportar', reportController.exportarClientes);
// Por el id PROPIO de la factura (migración independencia/032).
router.post('/faltantes/cliente/facturas/:facturaId/impresion', reportController.enviarAImpresion);
router.post('/faltantes/cliente/facturas/:facturaId/recuperar', reportController.recuperarFactura);

// Limpiar faltantes procesados
router.delete('/faltantes/proveedor/limpiar', reportController.clearProcessedSupplierMissingItems);

// Encargos especiales, consolidado y compras sugeridas se retiraron el
// 2026-09-30 (rama independencia-alegra, migración 032): ninguna pantalla los
// llamaba y leían la tabla vieja de proveedores por `productos.proveedor_id`.

// Historial de procesamientos
router.get('/historial', reportController.getProcessingHistory);

module.exports = router;
