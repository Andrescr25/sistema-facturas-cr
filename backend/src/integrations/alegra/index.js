/**
 * Índice de servicios de integración con Alegra
 * Exporta todos los servicios de Alegra de forma centralizada
 */

const AlegraInvoiceService = require('./services/alegra-invoice.service');
const AlegraProductService = require('./services/alegra-product.service');
const AlegraContactService = require('./services/alegra-contact.service');
const AlegraInventoryService = require('./services/alegra-inventory.service');
const AlegraSyncService = require('./services/alegra-sync.service');
const { getInstance: getAlegraClient } = require('./alegra.client');
const { explicarFalloAlegra } = require('./explicarFallo');

// Singleton instances
let invoiceServiceInstance = null;
let productServiceInstance = null;
let contactServiceInstance = null;
let inventoryServiceInstance = null;
let syncServiceInstance = null;

module.exports = {
  /** Por qué falló una llamada a Alegra, dicho para quien está en la caja. */
  explicarFalloAlegra,

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
  },

  /**
   * Servicio de Inventario
   */
  getInventoryService: () => {
    if (!inventoryServiceInstance) {
      inventoryServiceInstance = new AlegraInventoryService();
    }
    return inventoryServiceInstance;
  },

  /**
   * Servicio de sincronización del caché local de productos
   */
  getSyncService: () => {
    if (!syncServiceInstance) {
      syncServiceInstance = new AlegraSyncService();
    }
    return syncServiceInstance;
  },

  /**
   * Cliente HTTP crudo, para casos de uso genéricos/legacy que necesitan
   * acceso directo a axios (this.api) o requestWithRetry sin pasar por un
   * servicio de dominio específico.
   */
  getClient: () => getAlegraClient()
};
