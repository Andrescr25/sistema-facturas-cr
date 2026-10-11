/**
 * Facturación propia — Controller
 *
 * Responde la factura NUESTRA. El controller viejo, que le hablaba a Alegra y
 * devolvía su respuesta tal cual, se retiró el 2026-10-04 con sus rutas
 * (`/invoices` y compañía): ya no las llamaba ninguna pantalla.
 */

const servicio = require('./facturaPropia.service');
const consulta = require('./facturaConsulta.service');
const { generarPdfFactura } = require('./factura.pdf');
const envio = require('./facturaEnvio.service');
const correoFactura = require('./facturaCorreo.service');
const { ofertasVigentes } = require('./ofertas.service');
const { obtenerInicio } = require('../portal-clientes/portal-clientes.inicio.service');
const { pool } = require('../../../config/database');

/** Una respuesta de error uniforme, que no inventa códigos. */
function fallo(res, error, contexto) {
  const s = error.status || 500;
  if (s >= 500) console.error(`❌ Facturación propia (${contexto}):`, error);
  res.status(s).json({ success: false, message: error.message, error: error.message });
}

function falloCorreo(res, error) {
  const status = error.status || 500;
  const publico = ['CORREO_NO_CONFIGURADO', 'CORREO_INCIERTO', 'CORREO_RECHAZADO'].includes(error.code);
  // No registrar errores SMTP crudos: pueden llevar autenticación.
  const message = status < 500 || publico ? error.message : 'No se pudo preparar el correo de la factura.';
  res.status(status).json({ success: false, message, error: message });
}

module.exports = {
  ciclos: async (req, res) => {
    try { res.json({ success: true, data: await require('../rutas/documentosCiclo.service').disponibles(req.params.clienteId) }); }
    catch (error) { fallo(res, error, 'ciclos'); }
  },
  /** GET /facturacion/facturas/:id/correo — propuesta revisable antes de enviar. */
  datosCorreo: async (req, res) => {
    try {
      res.json({ success: true, data: await correoFactura.datosCorreoFactura(req.params.id) });
    } catch (error) { falloCorreo(res, error); }
  },

  /** POST /facturacion/facturas/:id/correo — envío manual, sin reintentos. */
  correo: async (req, res) => {
    try {
      const data = await correoFactura.enviarFacturaPorCorreo(req.params.id, req.body || {});
      res.json({ success: true, data, message: 'Correo aceptado por el servidor de envío.' });
    } catch (error) { falloCorreo(res, error); }
  },
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

  /**
   * GET /facturacion/facturas/:id/telefonos — a qué números se le puede
   * mandar. Se PROPONEN: las fichas traen cosas como "89350207 JEISON" y
   * quien manda elige, con el número a la vista.
   */
  telefonos: async (req, res) => {
    try {
      res.json({ success: true, data: await envio.telefonosParaFactura(req.params.id) });
    } catch (error) {
      fallo(res, error, 'telefonos');
    }
  },

  /** POST /facturacion/facturas/:id/whatsapp — la factura, con el PDF propio. */
  whatsapp: async (req, res) => {
    try {
      const { telefono, mensaje } = req.body || {};
      const r = await envio.enviarFacturaPorWhatsApp(req.params.id, {
        telefono, mensaje, usuarioId: req.usuario?.id
      });
      res.json({ success: true, data: r, message: `Factura enviada al ${r.numero || telefono}.` });
    } catch (error) {
      fallo(res, error, 'whatsapp');
    }
  },

  /**
   * GET /facturacion/ofertas — los descuentos de exceso vivos, con nuestro id
   * de producto. Es lo que evita que un cliente que pidió viendo "−20 %"
   * llegue a la caja y se le cobre completo.
   */
  ofertas: async (_req, res) => {
    try {
      res.json({ success: true, data: await ofertasVigentes() });
    } catch (error) {
      fallo(res, error, 'ofertas');
    }
  },

  /**
   * GET /facturacion/clientes/:clienteId/sugerencias
   *
   * Lo que ese cliente suele llevar, para que el agente se lo pueda recordar
   * mientras le toma el pedido con él enfrente. Es exactamente el mismo
   * cálculo que ve el cliente en su catálogo —si fueran dos cuentas
   * distintas, el agente le ofrecería algo que el portal no le muestra—, así
   * que se reusa el servicio en vez de escribirlo otra vez.
   *
   * ACÁ EL CLIENTE VIENE EN LA RUTA, y en el portal sale del token. No es una
   * inconsistencia: quien factura es del personal y le está cobrando a ese
   * cliente, mientras que un cliente no puede pedir la portada de otro.
   *
   * EL ID ES EL NUESTRO (`cliente.id`), y los productos vuelven con
   * `producto.id`. Mientras la pantalla lo pidió con el id de Alegra, 216 de
   * los 247 clientes recibían las compras de OTRO —el que tiene ese número
   * como id propio— sin ningún error a la vista. Ver
   * docs/grafo/leccion/ids-propios-y-de-alegra-no-se-mezclan.md.
   */
  sugerencias: async (req, res) => {
    const vacio = { habituales: [], perdidos: [] };
    const clienteId = Number(req.params.clienteId);
    // Un id que no es un entero positivo no es de nadie: no se consulta.
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.json({ success: true, data: vacio });
    }
    try {
      const { habituales, perdidos } = await obtenerInicio(clienteId);
      res.json({ success: true, data: { habituales, perdidos } });
    } catch (error) {
      console.error('❌ Facturación propia (sugerencias):', error.message);
      // Sin sugerencias se factura igual que siempre: no se estorba.
      res.json({ success: true, data: vacio });
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
