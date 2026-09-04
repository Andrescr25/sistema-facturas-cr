/**
 * Envíos por WhatsApp - Controller
 *
 * Solo lo que comparten los cuatro flujos: a qué números se le puede mandar a
 * un cliente, y qué se le mandó ya. El envío en sí vive en el módulo de cada
 * documento, porque cada uno arma lo suyo.
 */

const servicio = require('./envios.service');
const { getClient } = require('../../integrations/alegra');
const { telefonosDe } = require('../../utils/telefonosCliente');

/**
 * Los números a los que se le puede escribir a un cliente.
 *
 * Devuelve TODOS los candidatos de la ficha, no uno elegido: las fichas de
 * Alegra traen el nombre de quien contesta pegado, dos números en el mismo
 * campo o ningún número, y elegir por nuestra cuenta sería adivinar a quién
 * le llega un documento del cliente.
 */
async function telefonosDelContacto(req, res) {
  try {
    let contacto;
    try {
      contacto = await getClient().request('GET', `/contacts/${req.params.contactoId}`);
    } catch {
      return res.status(404).json({ success: false, message: 'Ese cliente no existe en Alegra.' });
    }

    const { candidatos, sinReconocer } = telefonosDe(contacto);
    res.json({
      success: true,
      data: {
        cliente: contacto.name,
        telefonos: candidatos,
        telefonosSinReconocer: sinReconocer
      }
    });
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

module.exports = { telefonosDelContacto, historial };
