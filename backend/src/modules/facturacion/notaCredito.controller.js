/**
 * Notas de crédito propias — Controller.
 *
 * Hoy se hacen a mano en Alegra. Esto permite hacerlas desde el sistema, con
 * el motivo escrito: de las 27 existentes hay 4 sin ninguno y nadie sabe hoy
 * por qué se hicieron.
 */

const servicio = require('./notaCredito.service');
const { obtenerNota } = require('./notaCreditoConsulta.service');
const { generarPdfNotaCredito } = require('./notaCredito.pdf');
const { pool } = require('../../../config/database');

function fallo(res, error, contexto) {
  const s = error.status || 500;
  if (s >= 500) console.error(`❌ Nota de crédito (${contexto}):`, error);
  res.status(s).json({ success: false, message: error.message, error: error.message });
}

module.exports = {
  /** POST /facturacion/notas-credito */
  crear: async (req, res) => {
    try {
      const nota = await servicio.crearNotaCredito(req.body || {}, req.usuario?.id);
      res.status(201).json({ success: true, data: nota });
    } catch (error) {
      fallo(res, error, 'crear');
    }
  },

  /** PATCH /facturacion/notas-credito/:id/anular — no borra, conserva su número. */
  anular: async (req, res) => {
    try {
      const nota = await servicio.anularNotaCredito(req.params.id, req.body || {}, req.usuario?.id);
      res.json({ success: true, data: nota });
    } catch (error) {
      fallo(res, error, 'anular');
    }
  },

  /**
   * GET /facturacion/notas-credito/:id/pdf — el papel de la nota: el mismo
   * que le llega al cliente por correo cuando Hacienda la acepta.
   */
  pdf: async (req, res) => {
    try {
      const nota = await obtenerNota(req.params.id);
      const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
      const archivo = await generarPdfNotaCredito(nota, rows[0] || null);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="nota-credito-${nota.numero}.pdf"`);
      return res.send(archivo);
    } catch (error) {
      fallo(res, error, 'pdf');
    }
  },

  /** GET /facturacion/notas-credito/motivos — para que la pantalla no los invente. */
  motivos: (_req, res) => res.json({ success: true, data: servicio.MOTIVOS })
};
