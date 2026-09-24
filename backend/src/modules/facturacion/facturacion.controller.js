/**
 * Facturacion Module - Controller
 * Controladores HTTP para operaciones de facturación rápida
 */

const FacturacionService = require('./facturacion.service');
const { obtenerInicio } = require('../portal-clientes/portal-clientes.inicio.service');
const ResponseHelper = require('../../utils/response.helper');
const { explicarFalloAlegra } = require('../../integrations/alegra');

class FacturacionController {
  constructor() {
    this.facturacionService = new FacturacionService();
  }

  getItems = async (req, res) => {
    try {
      const result = await this.facturacionService.getItems();
      return ResponseHelper.success(res, result.data, 'Productos obtenidos para caché', 200, {
        total: result.total,
        timestamp: result.timestamp
      });
    } catch (error) {
      console.error('❌ Error obteniendo items de Alegra:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getContacts = async (req, res) => {
    try {
      const result = await this.facturacionService.getContacts();
      return ResponseHelper.success(res, result.data, 'Contactos obtenidos para caché', 200, {
        total: result.total,
        timestamp: result.timestamp
      });
    } catch (error) {
      console.error('❌ Error obteniendo contacts de Alegra:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  createInvoice = async (req, res) => {
    try {
      // La clave la pone quien arma la factura, una sola vez, y la repite en
      // cada reenvío. Con ella, mandar la misma factura dos veces devuelve la
      // que ya existe en vez de crear una segunda ante Hacienda.
      const { claveIdempotencia, ...invoiceData } = req.body;
      const result = await this.facturacionService.createInvoice(invoiceData, claveIdempotencia || null);
      return ResponseHelper.success(res, result.data, result.message);
    } catch (error) {
      console.error('❌ Error creando factura en Alegra:', error.response?.data || error);

      // EL MOTIVO DE ALEGRA VA EN EL MENSAJE, no en el detalle.
      //
      // Antes se mandaba `error.message` —el de axios, "Request failed with
      // status code 400"— y el motivo real viajaba como cuarto argumento, que
      // `ResponseHelper.error` SOLO incluye cuando NODE_ENV es 'development'.
      // En producción se descartaba: Alegra explicaba que el producto estaba
      // configurado para no facturarse sin stock y el cajero leía un código.
      //
      // Los conflictos de idempotencia (ya en vuelo, o quedó incierta) pasan
      // por acá sin tocarse: ya traen su código y su mensaje escrito.
      const fallo = explicarFalloAlegra(error);
      return ResponseHelper.error(res, fallo.mensaje, fallo.status, error.response?.data);
    }
  };

  enviarFacturaWhatsApp = async (req, res) => {
    try {
      const { telefono, mensaje } = req.body || {};
      const r = await this.facturacionService.enviarPorWhatsApp(req.params.id, {
        telefono, mensaje, usuarioId: req.usuario?.id
      });
      return ResponseHelper.success(res, r, `Factura enviada al ${r.telefono}.`);
    } catch (error) {
      console.error('❌ Error enviando la factura por WhatsApp:', error.message);
      return ResponseHelper.error(res, error.message, error.status || 500);
    }
  };

  getInvoicePDF = async (req, res) => {
    try {
      const { id } = req.params;
      const pdfResponse = await this.facturacionService.getInvoicePDF(id);

      if (pdfResponse.pdf) {
        return ResponseHelper.success(res, { pdfUrl: pdfResponse.pdf, invoiceId: id });
      } else {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=factura-${id}.pdf`);
        return res.send(pdfResponse);
      }
    } catch (error) {
      console.error('❌ Error obteniendo PDF de factura:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  /**
   * GET /facturacion/clientes/:alegraContactId/sugerencias
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
   */
  getSugerenciasCliente = async (req, res) => {
    try {
      const { habituales, perdidos } = await obtenerInicio(req.params.alegraContactId);
      return ResponseHelper.success(res, { habituales, perdidos });
    } catch (error) {
      console.error('❌ Error obteniendo sugerencias del cliente:', error.message);
      // Sin sugerencias se factura igual que hasta ayer: no se estorba.
      return ResponseHelper.success(res, { habituales: [], perdidos: [] });
    }
  };

  getTaxes = async (req, res) => {
    try {
      const result = await this.facturacionService.getTaxes();
      return ResponseHelper.success(res, result.data, 'Impuestos obtenidos');
    } catch (error) {
      console.error('❌ Error obteniendo impuestos:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };

  getPaymentMethods = async (req, res) => {
    try {
      const result = this.facturacionService.getPaymentMethods();
      return ResponseHelper.success(res, result.data, 'Métodos de pago obtenidos');
    } catch (error) {
      console.error('❌ Error obteniendo métodos de pago:', error);
      return ResponseHelper.error(res, error.message, 500);
    }
  };
}

module.exports = FacturacionController;
