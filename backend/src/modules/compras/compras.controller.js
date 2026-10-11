/**
 * Compras — Controller.
 */

const servicio = require('./compras.service');

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
      res.status(201).json({
        success: true,
        data: resultado,
        message: `Compra registrada: ${resultado.lineas} líneas, ` +
          `${resultado.costosActualizados} costos y ${resultado.preciosActualizados} precios actualizados.`
      });
    } catch (error) {
      fallo(res, error, 'registrar');
    }
  }
};
