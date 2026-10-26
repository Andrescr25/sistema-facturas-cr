/**
 * Compras — Controller.
 *
 * AL REGISTRAR, LA COMPRA SE ACEPTA SOLA ANTE HACIENDA (2026-10-12). El
 * usuario pidió que el formulario de «Respuesta a Hacienda» «se haga solo»
 * al terminar de revisar precios. Va DESPUÉS de la transacción que registra
 * la compra, nunca adentro: la compra queda registrada aunque Hacienda no
 * atienda, y la respuesta dice qué pasó con la aceptación
 * (integrations/hacienda/aceptacionCompra.service.js).
 */

const servicio = require('./compras.service');
const manual = require('./compraManual.service');

function fallo(res, error, contexto) {
  const s = error.status || 500;
  if (s >= 500) console.error(`❌ Compras (${contexto}):`, error);
  res.status(s).json({ success: false, message: error.message, error: error.message });
}

module.exports = {
  /** POST /compras/registrar — { facturaId, preciosAjustados } */
  registrar: async (req, res) => {
    try {
      const { facturaId, preciosAjustados } = req.body || {};
      if (!facturaId) throw Object.assign(new Error('Falta facturaId.'), { status: 400 });

      const resultado = await servicio.registrarCompra(facturaId, preciosAjustados || {}, req.usuario?.id);
      // El `require` va acá: las rutas de Hacienda cargan su configuración
      // al importarse, y este módulo no las necesita para nada más.
      const hacienda = await require('../../integrations/hacienda/rutas')
        .alRegistrarCompra(resultado.compra.id, req.usuario?.id);
      res.status(201).json({
        success: true,
        data: { ...resultado, hacienda },
        message: `Compra registrada: ${resultado.lineas} líneas, ` +
          `${resultado.costosActualizados} costos y ${resultado.preciosActualizados} precios actualizados.`
      });
    } catch (error) {
      fallo(res, error, 'registrar');
    }
  },

  /**
   * POST /compras/manual — la factura de un proveedor que no manda factura
   * electrónica. Sin clave no hay nada que aceptar ante Hacienda.
   */
  registrarManual: async (req, res) => {
    try {
      const resultado = await manual.registrarCompraManual(req.body, req.usuario?.id);
      res.status(201).json({
        success: true,
        data: resultado,
        message: `Factura ${resultado.compra.numero} de ${resultado.compra.proveedor} cargada: ${resultado.lineas} líneas.`
      });
    } catch (error) {
      fallo(res, error, 'registrar a mano');
    }
  },

  /** GET /compras/proveedores — para elegir de quién es la factura cargada a mano. */
  proveedores: async (_req, res) => {
    try {
      res.json({ success: true, data: await manual.proveedoresActivos() });
    } catch (error) {
      fallo(res, error, 'proveedores');
    }
  }
};
