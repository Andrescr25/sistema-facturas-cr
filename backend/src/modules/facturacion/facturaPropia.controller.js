/**
 * Facturación propia — Controller
 *
 * Va aparte del controller viejo, que le habla a Alegra y devuelve la
 * respuesta de Alegra tal cual. Este responde la factura NUESTRA.
 *
 * Las dos rutas conviven a propósito mientras la pantalla se cambia: apagar
 * `/invoices` antes de que Facturación llame a `/facturas` dejaría a la
 * empresa sin poder facturar.
 */

const servicio = require('./facturaPropia.service');

module.exports = {
  /** POST /facturacion/facturas */
  crear: async (req, res) => {
    try {
      // La clave la pone quien arma la factura, una sola vez, y la repite en
      // cada reenvío: mandarla dos veces devuelve la que ya existe.
      const { claveIdempotencia, ...datos } = req.body || {};
      const factura = await servicio.crearFactura(datos, req.usuario?.id, { clave: claveIdempotencia || null });

      // Una factura ya creada no es un error: se responde 200 con lo que hay.
      const status = factura.yaExistia ? 200 : 201;
      res.status(status).json({ success: true, data: factura });
    } catch (error) {
      const s = error.status || 500;
      if (s >= 500) console.error('❌ Facturación propia (crear):', error);
      res.status(s).json({ success: false, message: error.message, error: error.message });
    }
  }
};
