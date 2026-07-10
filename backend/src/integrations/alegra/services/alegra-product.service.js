/**
 * Servicio de Productos de Alegra
 * Maneja todas las operaciones relacionadas con productos/items en Alegra API
 */

const axios = require('axios');
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
   * Actualizar solo el precio principal de un producto.
   * A diferencia de los métodos con envelope, LANZA en error (semántica
   * heredada del servicio legacy; sus consumidores manejan el throw).
   * El PUT reenvía name/reference/inventory porque Alegra los exige.
   */
  async updateProductPrice(alegraItemId, newPrice) {
    try {
      console.log(`💰 Actualizando precio: ${alegraItemId} → ₡${newPrice}`);

      const currentProduct = await this.client.api.get(`/items/${alegraItemId}`);
      const productData = currentProduct.data;

      const updateData = {
        name: productData.name,
        reference: productData.reference,
        price: [{
          price: parseFloat(newPrice).toFixed(2),
          main: true
        }],
        inventory: productData.inventory
      };

      const response = await this.client.api.put(`/items/${alegraItemId}`, updateData);
      console.log(`✅ Precio actualizado en Alegra`);

      return response.data;
    } catch (error) {
      console.error(`❌ Error actualizando precio:`, error.message);
      throw error;
    }
  }

  /**
   * Subir imagen a un producto (multipart a /items/{id}/attachment).
   * LANZA con mensajes traducidos en errores conocidos (semántica legacy).
   */
  async uploadProductImage(alegraItemId, formData) {
    try {
      console.log(`📸 Subiendo imagen al producto ${alegraItemId}...`);

      const response = await this.client.api.post(`/items/${alegraItemId}/attachment`, formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 60000 // 60 segundos para subida de imagen
      });

      console.log(`✅ Imagen subida exitosamente: ${response.data.url || 'URL generada'}`);
      return {
        success: true,
        url: response.data.url,
        data: response.data
      };
    } catch (error) {
      console.error(`❌ Error subiendo imagen al producto ${alegraItemId}:`);
      console.error('   Status:', error.response?.status);
      console.error('   Error:', error.response?.data);
      console.error('   Message:', error.message);

      if (error.response?.status === 404) {
        throw new Error('El endpoint de imágenes no está disponible en tu versión de Alegra');
      } else if (error.response?.status === 403) {
        throw new Error('No tienes permisos para subir imágenes. Verifica tu plan de Alegra.');
      } else if (error.response?.data?.message) {
        throw new Error(`Error de Alegra: ${error.response.data.message}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Descargar imagen de una URL y subirla a Alegra
   */
  async downloadAndUploadProductImage(alegraItemId, imageUrl) {
    try {
      console.log(`📥 Descargando imagen desde URL: ${imageUrl}...`);
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const buffer = Buffer.from(imageResponse.data, 'binary');
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';

      let extension = 'jpg';
      if (contentType.includes('png')) extension = 'png';
      else if (contentType.includes('webp')) extension = 'webp';
      else if (contentType.includes('gif')) extension = 'gif';

      const filename = `product_${alegraItemId}.${extension}`;

      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('image', buffer, {
        filename: filename,
        contentType: contentType
      });

      console.log(`📸 Subiendo imagen descargada al producto ${alegraItemId}...`);
      return await this.uploadProductImage(alegraItemId, formData);
    } catch (error) {
      console.error(`❌ Error en downloadAndUploadProductImage para producto ${alegraItemId}:`, error.message);
      throw error;
    }
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
