/**
 * Cobros sobre la base propia — Controller.
 *
 * Convive con el controlador viejo (que va contra Alegra) mientras la
 * pantalla se cambia: apagar el camino viejo antes de que Cuentas por Cobrar
 * llame al nuevo dejaría a la empresa sin poder registrar un abono.
 */

const servicio = require('./cobros.service');
const caja = require('./cierreCaja.service');

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

  /** GET /cuentas-por-cobrar/propios/caja?fecha= — lo cobrado y si cuadra. */
  resumenCaja: async (req, res) => {
    try {
      res.json({ success: true, data: await caja.resumenDelDia(req.query.fecha) });
    } catch (error) {
      fallo(res, error, 'resumenCaja');
    }
  },

  /** POST /cuentas-por-cobrar/propios/caja/cerrar */
  cerrarCaja: async (req, res) => {
    try {
      const cierre = await caja.cerrarCaja(req.body || {}, req.usuario?.id);
      res.status(201).json({ success: true, data: cierre });
    } catch (error) {
      fallo(res, error, 'cerrarCaja');
    }
  },

  /** POST /cuentas-por-cobrar/propios/caja/reabrir — con motivo, y queda anotado. */
  reabrirCaja: async (req, res) => {
    try {
      const r = await caja.reabrirCaja(req.body?.fecha, req.body || {}, req.usuario?.id);
      res.json({ success: true, data: r });
    } catch (error) {
      fallo(res, error, 'reabrirCaja');
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
