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
   * Crear o recuperar un contacto en Alegra (proveedor/cliente) siguiendo el
   * formato oficial. Migrado del servicio legacy: devuelve el contacto RAW
   * (no envelope) y LANZA en error.
   */
  async createOrGetContact(data) {
    try {
      if (!data?.name) {
        throw new Error('Nombre del contacto es requerido');
      }

      const identification = data.identification
        ? data.identification.toString().replace(/\D/g, '')
        : null;

      if (identification) {
        const response = await this.client.api.get('/contacts', {
          params: {
            identification
          }
        });

        if (Array.isArray(response.data) && response.data.length > 0) {
          console.log(`✅ Contacto encontrado: ${response.data[0].name}`);
          return response.data[0];
        }
      }

      const typeArray = Array.isArray(data.type)
        ? data.type
        : [data.type || 'provider'];

      const normalizeAddress = () => {
        if (!data.address) return undefined;

        if (typeof data.address === 'string') {
          return { address: data.address };
        }

        if (typeof data.address === 'object') {
          const {
            address,
            addressLine,
            otrasSenas,
            city,
            country,
            provincia,
            canton,
            distrito
          } = data.address;

          return {
            address: address || addressLine || otrasSenas || null,
            city: city || null,
            country: country || 'CR',
            province: provincia || null,
            canton: canton || null,
            district: distrito || null
          };
        }

        return undefined;
      };

      const payload = {
        name: data.name.trim(),
        type: typeArray,
        status: data.status || 'active',
        phonePrimary: data.phonePrimary || data.phone || undefined,
        phoneSecondary: data.phoneSecondary || undefined,
        mobile: data.mobile || undefined,
        email: data.email || undefined,
        ignoreRepeated: data.ignoreRepeated !== undefined ? data.ignoreRepeated : true,
        identification: identification || undefined,
        identificationObject: identification
          ? {
              type: data.identificationType || data.identificationObject?.type || 'CJ',
              number: identification
            }
          : undefined,
        address: normalizeAddress(),
        term: data.term || undefined,
        creditLimit: data.creditLimit || undefined,
        exporter: data.exporter || undefined,
        statementAttached: data.statementAttached || undefined,
        accounting: data.accounting || undefined
      };

      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
          delete payload[key];
        }
      });

      console.log(`📝 Creando contacto en Alegra: ${payload.name}`);
      const response = await this.client.api.post('/contacts', payload);
      console.log(`✅ Contacto creado: ${response.data.name}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error creando/obteniendo contacto:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Obtener lista de proveedores (contactos tipo 'provider').
   * Migrado del servicio legacy: devuelve {success, data} y nunca lanza.
   */
  async getProveedores(busqueda = '', limit = 100) {
    try {
      console.log(`🏭 Obteniendo proveedores de Alegra${busqueda ? ` (búsqueda: "${busqueda}")` : ''}`);

      const params = {
        type: 'provider',
        limit: Math.min(limit, 30), // Alegra máximo 30 por página
        order_field: 'name',
        order_direction: 'ASC'
      };

      if (busqueda) {
        params.query = busqueda;
      }

      const response = await this.client.api.get('/contacts', { params });

      const proveedores = Array.isArray(response.data) ? response.data : [];

      console.log(`✅ Encontrados ${proveedores.length} proveedores`);

      return {
        success: true,
        data: proveedores
      };
    } catch (error) {
      console.error('❌ Error obteniendo proveedores:', error.message);
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
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
