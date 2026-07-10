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
   * Crear producto COMPLETO en Alegra (imagen, CABYS, impuestos, costo,
   * inventario y campos de medicamento). Migrado del servicio legacy:
   * LANZA con errores amigables (statusCode) en vez de devolver envelope,
   * y reintenta sin los campos farmacéuticos si Alegra los rechaza.
   */
  async createProduct(data) {
    try {
      console.log(`📦 Creando producto COMPLETO en Alegra: ${data.name}`);
      console.log('📤 Datos recibidos:', JSON.stringify(data, null, 2));

      const medicineFieldsRequested = Boolean(data.pharmaceuticalForm || data.sanitaryRegistry);

      const buildProductData = ({ includeMedicineFields = true } = {}) => {
        // Preparar datos según la API de Alegra
        const productData = {
          name: data.name,
          description: data.description || data.name,
          status: data.status || 'active',
          type: data.type || 'product', // 'product' para inventario, 'service' para servicios

          // Precio (Alegra requiere array de precios)
          price: [{
            idPriceList: 1, // ID 1 = Lista de precios "General" por defecto
            price: parseFloat(data.price) || 0
          }],

          // Unidad de medida (obligatoria)
          unit: data.unit || 'unit'
        };

        if (data.reference) {
          productData.reference = {
            reference: data.reference,
            type: 'CODE_OF_INTERNAL_USE'
          };
        }

        if (data.itemCategory && data.itemCategory.id) {
          productData.itemCategory = {
            id: parseInt(data.itemCategory.id)
          };
        }

        // Código CABYS (productKey)
        if (data.productKey) {
          productData.productKey = data.productKey;
          console.log(`✅ Código CABYS agregado: ${data.productKey}`);
        }

        if (includeMedicineFields) {
          if (data.pharmaceuticalForm) {
            const pharmaFormMap = {
              '01': '158', // Líquidos -> Solución
              '02': '199', // Sólidos -> Tableta
              '03': '229', // Semisólidos -> Unguento
              '04': '163', // Gases -> Solución en aerosol
              '05': '105'  // Otros -> Líquido
            };
            const formId = pharmaFormMap[data.pharmaceuticalForm] || data.pharmaceuticalForm;
            productData.idPharmaceuticalForm = formId;
            console.log(`✅ Forma farmacéutica agregada (Alegra ID: ${formId}): ${data.pharmaceuticalForm}`);
          }

          if (data.sanitaryRegistry) {
            productData.drugRegistration = data.sanitaryRegistry;
            console.log(`✅ Registro sanitario agregado (Alegra drugRegistration): ${data.sanitaryRegistry}`);
          }
        }

        // Campos adicionales oficiales de Alegra, si se configuran desde otra capa.
        if (Array.isArray(data.customFields) && data.customFields.length > 0) {
          productData.customFields = data.customFields;
          console.log(`✅ Campos personalizados agregados: ${JSON.stringify(data.customFields)}`);
        }

        if (data.tax && Array.isArray(data.tax)) {
          productData.tax = data.tax;
          console.log(`✅ Impuestos agregados: ${JSON.stringify(data.tax)}`);
        }

        // Inventario (inventory) si es tipo producto
        if (data.type === 'product') {
          productData.inventory = {
            unit: data.unit || 'unit',
            unitCost: parseFloat(data.cost) || parseFloat(data.price) || 0
          };

          if (data.initialQuantity && parseFloat(data.initialQuantity) > 0) {
            productData.inventory.initialQuantity = parseFloat(data.initialQuantity);
            console.log(`✅ Cantidad inicial: ${data.initialQuantity}`);
          }
        }

        return productData;
      };

      const postProduct = async (productData) => {
        console.log('📋 Datos formateados para Alegra:', JSON.stringify(productData, null, 2));

        const response = await this.client.api.post('/items', productData);
        console.log(`✅ Producto creado exitosamente: ID ${response.data.id}`);
        console.log(`📊 Respuesta completa:`, JSON.stringify(response.data, null, 2));
        return response.data;
      };

      try {
        return await postProduct(buildProductData());
      } catch (error) {
        const rawAlegraError = JSON.stringify(error.response?.data || error.message || '').toLowerCase();
        const canRetryWithoutMedicineFields =
          medicineFieldsRequested &&
          [400, 422].includes(error.response?.status) &&
          (
            rawAlegraError.includes('pharmaceuticalform') ||
            rawAlegraError.includes('sanitaryregistry') ||
            rawAlegraError.includes('sanitary registry') ||
            rawAlegraError.includes('not allowed') ||
            rawAlegraError.includes('unknown') ||
            rawAlegraError.includes('unrecognized') ||
            rawAlegraError.includes('unsupported') ||
            rawAlegraError.includes('no permitido') ||
            rawAlegraError.includes('no soportado')
          );

        if (!canRetryWithoutMedicineFields) {
          throw error;
        }

        console.warn('⚠️ Alegra rechazó los campos farmacéuticos no documentados. Reintentando sin esos campos.');

        const createdProduct = await postProduct(buildProductData({ includeMedicineFields: false }));
        createdProduct._warnings = [
          'Alegra no aceptó los campos de forma farmacéutica y registro sanitario por API pública. El producto fue creado, pero esos datos deben completarse desde Alegra o con los nombres/endpoints internos correctos.'
        ];

        return createdProduct;
      }
    } catch (error) {
      console.error(`❌ Error creando producto en Alegra:`);
      console.error('   Status:', error.response?.status);
      console.error('   Error:', error.response?.data);
      console.error('   Message:', error.message);

      const buildAlegraMessage = (errorData) => {
        if (!errorData) return error.message;
        if (typeof errorData === 'string') return errorData;
        if (errorData.message) return errorData.message;
        if (errorData.error) return errorData.error;
        if (Array.isArray(errorData.errors)) {
          return errorData.errors
            .map(err => err.message || err.error || JSON.stringify(err))
            .join('; ');
        }

        return JSON.stringify(errorData);
      };

      // Proporcionar error más descriptivo al usuario
      if (error.response?.data?.code === 1093) {
        const friendlyError = new Error('Alegra requiere una "clave/referencia de producto". Verifica la configuración de tu cuenta en Alegra → Configuración → Productos.');
        friendlyError.statusCode = 502;
        throw friendlyError;
      } else if (error.response?.data?.code === 1132) {
        const friendlyError = new Error('Este CABYS corresponde a un medicamento y Alegra requiere forma farmacéutica. Marca el producto como medicamento y completa la información farmacéutica.');
        friendlyError.statusCode = 400;
        throw friendlyError;
      } else if (error.response?.data?.message) {
        const friendlyError = new Error(`Error de Alegra: ${error.response.data.message} (código ${error.response.data.code || 'N/A'})`);
        friendlyError.statusCode = 502;
        throw friendlyError;
      } else if (error.response) {
        const friendlyError = new Error(`Error de Alegra: ${buildAlegraMessage(error.response.data)} (HTTP ${error.response.status})`);
        friendlyError.statusCode = 502;
        throw friendlyError;
      } else {
        throw error;
      }
    }
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
