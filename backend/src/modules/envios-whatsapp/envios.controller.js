/**
 * Envíos por WhatsApp - Controller
 *
 * Solo lo que comparten los cuatro flujos: a qué números se le puede mandar a
 * un cliente, y qué se le mandó ya. El envío en sí vive en el módulo de cada
 * documento, porque cada uno arma lo suyo.
 */

const servicio = require('./envios.service');

/** Los números de un cliente, desde su ficha propia (ver envios.service.js). */
async function telefonosDelCliente(req, res) {
  try {
    res.json({ success: true, data: await servicio.telefonosDeCliente(req.params.clienteId) });
  } catch (error) {
    console.error('Error obteniendo los teléfonos del cliente:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

/** Qué se le mandó ya de este documento, para no mandarlo dos veces. */
async function historial(req, res) {
  try {
    const { tipo, referencia } = req.query;
    if (!tipo || !referencia) {
      return res.status(400).json({ success: false, message: 'Faltan tipo y referencia.' });
    }
    res.json({ success: true, data: await servicio.historial({ tipo, referencia }) });
  } catch (error) {
    console.error('Error consultando el historial de envíos:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

module.exports = { telefonosDelCliente, historial };
