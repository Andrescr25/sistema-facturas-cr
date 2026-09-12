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
const consulta = require('./facturaConsulta.service');
const { generarPdfFactura } = require('./factura.pdf');
const { pool } = require('../../../config/database');

/** Una respuesta de error uniforme, que no inventa códigos. */
function fallo(res, error, contexto) {
  const s = error.status || 500;
  if (s >= 500) console.error(`❌ Facturación propia (${contexto}):`, error);
  res.status(s).json({ success: false, message: error.message, error: error.message });
}

module.exports = {
  /**
   * GET /facturacion/facturas — buscar en la base propia, sin Alegra.
   *
   * Hasta ahora las 5.398 facturas copiadas no se podían consultar desde el
   * sistema. El listado NO trae las líneas: para una tabla sobran, y pedirlas
   * multiplicaría por diez lo que viaja.
   */
  listar: async (req, res) => {
    try {
      const { buscar, q, estado, desde, hasta, clienteId, pagina, limite } = req.query;
      const { data, paginacion } = await consulta.listarFacturas({
        // `q` es como busca el resto del sistema; `buscar` se acepta igual para
        // no hacer que quien llame tenga que recordar cuál de los dos es.
        buscar: buscar || q || '',
        estado, desde, hasta, clienteId, pagina, limite
      });
      res.json({ success: true, data, paginacion });
    } catch (error) {
      fallo(res, error, 'listar');
    }
  },

  /** GET /facturacion/facturas/:id — con líneas, cobros y notas de crédito. */
  ver: async (req, res) => {
    try {
      const factura = await consulta.obtenerFactura(req.params.id);
      res.json({ success: true, data: factura });
    } catch (error) {
      fallo(res, error, 'ver');
    }
  },

  /**
   * GET /facturacion/facturas/:id/pdf — el papel que recibe el cliente,
   * armado por nosotros.
   *
   * Se devuelve el ARCHIVO, no un enlace: el PDF lo genera este servidor, y un
   * enlace tendría que ser público para que el navegador lo abriera solo.
   */
  pdf: async (req, res) => {
    try {
      const factura = await consulta.obtenerFactura(req.params.id);
      // Los datos del emisor —cédula, dirección, actividad económica y las
      // cuentas por donde le pagan— salen de la configuración, no del código.
      const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
      const archivo = await generarPdfFactura(factura, rows[0] || null);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="factura-${factura.numero}.pdf"`);
      return res.send(archivo);
    } catch (error) {
      fallo(res, error, 'pdf');
    }
  },

  /** PUT /facturacion/facturas/:id — solo mientras no sea electrónica ni tenga cobros. */
  editar: async (req, res) => {
    try {
      const factura = await servicio.editarFactura(req.params.id, req.body || {}, req.usuario?.id);
      res.json({ success: true, data: factura });
    } catch (error) {
      fallo(res, error, 'editar');
    }
  },

  /**
   * PATCH /facturacion/facturas/:id/anular — con motivo, que queda en el
   * documento. No borra: la factura conserva su número.
   */
  anular: async (req, res) => {
    try {
      const factura = await servicio.anularFactura(req.params.id, req.body || {}, req.usuario?.id);
      res.json({ success: true, data: factura });
    } catch (error) {
      fallo(res, error, 'anular');
    }
  },

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
