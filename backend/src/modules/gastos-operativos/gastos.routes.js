const express = require('express');
const multer = require('multer');
const c = require('./gastos.controller');
const router = express.Router();
const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } }).single('pdf');
const subirXml = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } }).single('xml');

router.get('/', c.listar);
router.post('/desde-factura', c.desdeFactura);
router.get('/:id', c.obtener);
router.patch('/:id', c.editar);
router.post('/:id/revalidar', c.revalidar);
router.post('/:id/pagos', c.pagar);
router.get('/:id/hacienda', c.estadoFiscal);
router.post('/:id/hacienda', c.responderFiscal);
router.get('/:id/archivos/:tipo', c.descargar);
router.post('/:id/pdf', (req, res, next) => subir(req, res, e => e
  ? res.status(400).json({ success: false, message: 'Elegí un único PDF de hasta 8 MB.' }) : next()), c.adjuntarPdf);
router.post('/:id/xml', (req, res, next) => subirXml(req, res, e => e
  ? res.status(400).json({ success: false, message: 'Elegí un único XML de hasta 2 MB.' }) : next()), c.adjuntarXml);

module.exports = { routes: router };
