/**
 * Servicio de Contactos de Alegra
 * Maneja todas las operaciones relacionadas con clientes/proveedores en Alegra API
 */

const { getInstance: getAlegraClient } = require('../alegra.client');

class AlegraContactService {
  constructor() {
    this.client = getAlegraClient();
  }

  /**
   * Obtener contactos con paginación
   */
  async getContacts(page = 1, limit = 30, type = null) {
    const params = {
      start: (page - 1) * limit,
      limit: limit
    };

    if (type) {
      params.type = type; // 'client' o 'provider'
    }

    return await this.client.get('/contacts', params);
  }

  /**
   * Buscar contactos
   */
  async searchContacts(query, type = null) {
    const params = {
      query: query
    };

    if (type) {
      params.type = type;
    }

    return await this.client.get('/contacts', params);
  }

  /**
   * Obtener contacto por ID
   */
  async getContactById(contactId) {
    return await this.client.get(`/contacts/${contactId}`);
  }

  /**
   * Crear contacto
   */
  async createContact(contactData) {
    return await this.client.post('/contacts', contactData);
  }

  /**
   * Actualizar contacto
   */
  async updateContact(contactId, updateData) {
    return await this.client.put(`/contacts/${contactId}`, updateData);
  }

  /**
   * Eliminar contacto
   */
  async deleteContact(contactId) {
    return await this.client.delete(`/contacts/${contactId}`);
  }

  /**
   * Obtener todos los proveedores
   */
  async getAllProviders() {
    return await this.getContacts(1, 100, 'provider');
  }

  /**
   * Obtener todos los clientes
   */
  async getAllClients() {
    return await this.getContacts(1, 100, 'client');
  }
}

module.exports = AlegraContactService;
