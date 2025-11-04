/**
 * Índice de servicios de integración con Alegra
 * Exporta todos los servicios de Alegra de forma centralizada
 */

const AlegraInvoiceService = require('./services/alegra-invoice.service');
const AlegraProductService = require('./services/alegra-product.service');
const AlegraContactService = require('./services/alegra-contact.service');

// Singleton instances
let invoiceServiceInstance = null;
let productServiceInstance = null;
let contactServiceInstance = null;

module.exports = {
  /**
   * Servicio de Facturas
   */
  getInvoiceService: () => {
    if (!invoiceServiceInstance) {
      invoiceServiceInstance = new AlegraInvoiceService();
    }
    return invoiceServiceInstance;
  },

  /**
   * Servicio de Productos
   */
  getProductService: () => {
    if (!productServiceInstance) {
      productServiceInstance = new AlegraProductService();
    }
    return productServiceInstance;
  },

  /**
   * Servicio de Contactos
   */
  getContactService: () => {
    if (!contactServiceInstance) {
      contactServiceInstance = new AlegraContactService();
    }
    return contactServiceInstance;
  }
};
