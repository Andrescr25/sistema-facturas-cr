/**
 * Cobros sobre la base propia — Controller.
 *
 * Convive con el controlador viejo (que va contra Alegra) mientras la
 * pantalla se cambia: apagar el camino viejo antes de que Cuentas por Cobrar
 * llame al nuevo dejaría a la empresa sin poder registrar un abono.
 */

const servicio = require('./cobros.service');

function fallo(res, error, contexto) {
  const s = error.status || 500;
  if (s >= 500) console.error(`❌ Cobros propios (${contexto}):`, error);
  res.status(s).json({ success: false, message: error.message, error: error.message });
}

module.exports = {
  /** GET /cuentas-por-cobrar/propios/deudores — a quién hay que cobrarle. */
  deudores: async (req, res) => {
    try {
      const { buscar, q, pagina, limite } = req.query;
      const r = await servicio.listarDeudores({ buscar: buscar || q || '', pagina, limite });
      res.json({ success: true, data: r.data, paginacion: r.paginacion });
    } catch (error) {
      fallo(res, error, 'deudores');
    }
  },

  /** GET /cuentas-por-cobrar/propios/facturas/:id/abonos */
  abonos: async (req, res) => {
    try {
      res.json({ success: true, data: await servicio.abonosDeFactura(req.params.id) });
    } catch (error) {
      fallo(res, error, 'abonos');
    }
  },

  /** POST /cuentas-por-cobrar/propios/abonos */
  registrar: async (req, res) => {
    try {
      const abono = await servicio.registrarAbono(req.body || {}, req.usuario?.id);
      res.status(201).json({
        success: true, data: abono,
        message: `Abono de ₡${abono.monto} aplicado a la factura ${abono.factura.numero}.`
      });
    } catch (error) {
      fallo(res, error, 'registrar');
    }
  },

  /** PATCH /cuentas-por-cobrar/propios/abonos/:id/anular — no borra. */
  anular: async (req, res) => {
    try {
      const abono = await servicio.anularAbono(req.params.id, req.body || {}, req.usuario?.id);
      res.json({ success: true, data: abono });
    } catch (error) {
      fallo(res, error, 'anular');
    }
  }
};
