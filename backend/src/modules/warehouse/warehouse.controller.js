/**
 * Warehouse Module - Controller
 * Facturas en Bodega sobre la factura propia.
 */

// Todo por `facturaId`, el id PROPIO: nunca por el de Alegra (bodegaPropia.js).
// Las rutas por id de Alegra (`/bodega/facturas/:alegraId`, que le pedían la
// lista a Alegra y escribían en la tabla vieja `facturas`) se retiraron el
// 2026-09-30, al terminar la sección 11: ninguna pantalla las llamaba.

const bodegaPropia = require('./bodegaPropia');

function responderPropia(res, promesa, contexto) {
  return promesa
    .then((data) => res.json(data && data.success !== undefined ? data : { success: true, data }))
    .catch((error) => {
      const status = error.status || 500;
      if (status >= 500) console.error(contexto, error);
      res.status(status).json({ success: false, message: error.message,
        ...(error.code === 'FACTURA_NO_VIGENTE' ? { code: error.code } : {}) });
    });
}

/** GET /bodega/facturas-propias?dias=&limit= */
const getFacturasPropias = (req, res) =>
  responderPropia(res, bodegaPropia.listar(req.query), 'Error listando facturas propias de bodega:');

/** GET /bodega/facturas-propias/:facturaId/estados */
const getEstadosFacturaPropia = (req, res) =>
  responderPropia(res, bodegaPropia.estados(req.params.facturaId), 'Error leyendo lo registrado de la factura:');

/** POST /bodega/facturas-propias/:facturaId/faltantes { faltantes, registrado_por } */
const registrarFaltantesFacturaPropia = (req, res) =>
  responderPropia(res, bodegaPropia.registrarFaltantes(req.params.facturaId, req.body?.faltantes, req.body?.registrado_por || 'Bodega', req.usuario?.id), 'Error registrando faltantes de la factura:');

/** POST /bodega/facturas-propias/:facturaId/estado { estado, observaciones, enviar_a_impresion } */
const updateEstadoFacturaPropia = (req, res) =>
  responderPropia(res, bodegaPropia.actualizarEstado(req.params.facturaId, {
    estado: req.body?.estado,
    observaciones: req.body?.observaciones ?? null,
    enviarAImpresion: Boolean(req.body?.enviar_a_impresion)
  }), 'Error actualizando el estado de la factura:');

const getCiclos = (req, res) => responderPropia(res, require('../rutas/operacionCiclo.service').listarCiclos(), 'Error leyendo ciclos de bodega:');

module.exports = {
  getCiclos,
  getFacturasPropias,
  getEstadosFacturaPropia,
  registrarFaltantesFacturaPropia,
  updateEstadoFacturaPropia
};
