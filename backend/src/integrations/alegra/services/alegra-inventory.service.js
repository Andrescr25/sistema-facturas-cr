/**
 * Servicio de Inventario de Alegra
 * Ajustes de inventario e ítems inventariables.
 * Migrado del servicio legacy: ambos métodos devuelven data RAW y LANZAN en error.
 */

const { getInstance: getAlegraClient } = require('../alegra.client');

class AlegraInventoryService {
  constructor() {
    this.client = getAlegraClient();
  }

  /**
   * Crear ajuste de inventario (POST /inventory-adjustments) con reintentos.
   * Ojo: enviar demasiados items en un solo llamado produce un 400 code 14009
   * engañoso; el loteo lo maneja el consumidor (src/modules/inventario-auditorias).
   */
  async createInventoryAdjustment(adjustmentData) {
    try {
      console.log('Creando ajuste de inventario en Alegra...');
      const response = await this.client.requestWithRetry(
        () => this.client.api.post('/inventory-adjustments', adjustmentData)
      );
      console.log(`Ajuste de inventario creado: ID ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error('Error creando ajuste de inventario en Alegra:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Obtener todos los ítems inventariables activos (paginación automática)
   */
  async getInventariableItems() {
    try {
      console.log('Obteniendo ítems inventariables de Alegra...');
      let allItems = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.api.get('/items', {
          params: {
            start: (currentPage - 1) * 30,
            limit: 30,
            inventariable: true,
            status: 'active'
          }
        });

        const items = response.data;
        allItems = allItems.concat(items);

        hasMore = items.length === 30;
        currentPage++;

        if (currentPage % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (currentPage > 100) break;
      }

      return allItems;
    } catch (error) {
      console.error('Error obteniendo ítems inventariables de Alegra:', error.message);
      throw error;
    }
  }

  /**
   * Obtener un solo ítem por su ID (GET /items/:id) — rápido, a diferencia de
   * getInventariableItems() que pagina todo el catálogo. Usado cuando se
   * necesita el stock/costo frescos de UN producto puntual (ej. al agregarlo
   * a una devolución), sin pagar el costo de traer todo el catálogo.
   */
  async getItemById(alegraId) {
    try {
      const response = await this.client.api.get(`/items/${alegraId}`);
      return response.data;
    } catch (error) {
      console.error(`Error obteniendo ítem ${alegraId} de Alegra:`, error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = AlegraInventoryService;
