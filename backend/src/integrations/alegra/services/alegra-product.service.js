/**
 * Servicio de Productos de Alegra
 * Maneja todas las operaciones relacionadas con productos/items en Alegra API
 */

const { getInstance: getAlegraClient } = require('../alegra.client');

class AlegraProductService {
  constructor() {
    this.client = getAlegraClient();
  }

  /**
   * Obtener productos con paginación
   */
  async getProducts(page = 1, limit = 30) {
    const params = {
      start: (page - 1) * limit,
      limit: limit,
      type: 'product'
    };

    return await this.client.get('/items', params);
  }

  /**
   * Buscar productos
   */
  async searchProducts(query) {
    return await this.client.get('/items', {
      query: query,
      type: 'product'
    });
  }

  /**
   * Obtener todos los productos (paginación automática)
   */
  async getAllProducts(maxPages = 100) {
    try {
      console.log('📦 Sincronizando productos de Alegra...');

      let allProducts = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore && currentPage <= maxPages) {
        console.log(`📄 Página ${currentPage}...`);

        const result = await this.getProducts(currentPage, 30);

        if (!result.success) {
          throw new Error(result.error);
        }

        const products = result.data;
        allProducts = allProducts.concat(products);

        hasMore = products.length === 30;
        currentPage++;

        // Rate limiting
        if (currentPage % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`📦 ${allProducts.length} productos obtenidos`);

      return {
        success: true,
        data: allProducts,
        totalPages: currentPage - 1
      };
    } catch (error) {
      console.error('❌ Error sincronizando productos:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener producto por ID
   */
  async getProductById(productId) {
    return await this.client.get(`/items/${productId}`);
  }

  /**
   * Crear producto
   */
  async createProduct(productData) {
    return await this.client.post('/items', productData);
  }

  /**
   * Actualizar producto
   */
  async updateProduct(productId, updateData) {
    return await this.client.put(`/items/${productId}`, updateData);
  }

  /**
   * Eliminar producto
   */
  async deleteProduct(productId) {
    return await this.client.delete(`/items/${productId}`);
  }

  /**
   * Obtener precio de producto por referencia
   */
  async getProductPrice(reference) {
    try {
      const result = await this.client.get('/items', {
        reference: reference
      });

      if (result.success && result.data && result.data.length > 0) {
        return {
          success: true,
          price: result.data[0].price,
          product: result.data[0]
        };
      }

      return {
        success: false,
        error: 'Producto no encontrado'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AlegraProductService;
