/**
 * Reporte Contador - Routes (montadas en /api/reporte-contador)
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('./reporte-contador.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // los reales rondan 100-150 KB; 15 MB da margen de sobra
  fileFilter: (req, file, cb) => {
    const okExt = /\.xlsx?$/i.test(file.originalname);
    const okMime = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ].includes(file.mimetype);
    if (okExt || okMime) return cb(null, true);
    cb(new Error('Solo se aceptan archivos .xlsx'));
  }
});

// Contactos guardados: son globales, no dependen de un período.
router.get('/contactos', controller.listarContactos);
router.post('/contactos', controller.crearContacto);
router.delete('/contactos/:id', controller.eliminarContacto);
// Envía los reportes del mes (ventas y compras) ya revisados.
router.post('/enviar-contador', controller.enviarAlContador);

router.get('/periodos', controller.listarPeriodos);
router.post('/periodos', upload.single('archivo'), controller.cargarPeriodo);
// Trae el mes directo de la API de Alegra, sin Excel de por medio.
router.post('/periodos/importar-alegra', controller.importarDesdeAlegra);
router.get('/periodos/:id', controller.obtenerPeriodo);
router.delete('/periodos/:id', controller.eliminarPeriodo);
router.get('/periodos/:id/exportar', controller.exportarPeriodo);
router.post('/periodos/:id/redetectar-duplicados', controller.redetectarDuplicados);
router.patch('/periodos/:id/facturas/:numero', controller.toggleExcluirFactura);

router.patch('/lineas/:id', controller.actualizarLinea);
router.delete('/lineas/:id', controller.eliminarLinea);

module.exports = router;
