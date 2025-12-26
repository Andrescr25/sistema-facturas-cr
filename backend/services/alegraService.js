const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

// Singleton de Prisma
if (!global.prismaInstance) {
    global.prismaInstance = new PrismaClient();
}

class AlegraService {
  constructor() {
        this.baseURL = 'https://api.alegra.com/api/v1';
        this.credentials = {
            user: process.env.ALEGRA_USER || 'tachifacturas@gmail.com',
            token: process.env.ALEGRA_TOKEN || 'b3a84abb6897180d3889'
        };

    this.api = axios.create({
      baseURL: this.baseURL,
      auth: {
                username: this.credentials.user,
                password: this.credentials.token
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
            timeout: 60000 // Aumentado a 60 segundos para evitar timeouts
        });

        this.prisma = global.prismaInstance;
        this.setupInterceptors();
    }

    setupInterceptors() {
    this.api.interceptors.request.use(
      (config) => {
                console.log(`🔄 API Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
                console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
                console.log(`✅ API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
                console.error('❌ API Error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

    /**
     * Realizar petición con reintentos y backoff exponencial
     * @param {Function} requestFn - Función que retorna una promesa de la petición
     * @param {number} maxRetries - Número máximo de reintentos (default: 3)
     * @param {number} initialDelay - Delay inicial en ms (default: 1000)
     */
    async requestWithRetry(requestFn, maxRetries = 3, initialDelay = 1000) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;

                // Si es el último intento, lanzar el error
                if (attempt === maxRetries) {
                    console.error(`❌ Falló después de ${maxRetries + 1} intentos`);
                    throw error;
                }

                // Determinar si debemos reintentar
                let shouldRetry = false;

                // Reintentar en errores de timeout o errores de red
                if (error.code === 'ECONNABORTED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ENOTFOUND' ||
                    error.code === 'ECONNRESET' ||
                    !error.response) {
                    shouldRetry = true;
                }

                // Reintentar en errores del servidor (5xx) y rate limiting (429)
                if (error.response?.status) {
                    const status = error.response.status;
                    // 429: Too Many Requests
                    // 502: Bad Gateway
                    // 503: Service Unavailable
                    // 504: Gateway Timeout
                    if (status === 429 || status === 502 || status === 503 || status === 504) {
                        shouldRetry = true;
                        console.log(`⚠️ Error del servidor: ${status} - ${error.response.statusText}`);
                    }
                }

                if (!shouldRetry) {
                    console.log(`❌ Error no recuperable (${error.code || error.response?.status}), abortando reintentos`);
                    throw error;
                }

                // Calcular delay con backoff exponencial
                const delay = initialDelay * Math.pow(2, attempt);
                console.log(`⏳ Reintento ${attempt + 1}/${maxRetries} en ${delay}ms... (Razón: ${error.code || error.response?.status})`);

                // Esperar antes del siguiente reintento
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Sincronizar productos desde Alegra
     */
    async syncProductsFromAlegra() {
        try {
            console.log('📦 Sincronizando productos de Alegra...');

            let allProducts = [];
            let currentPage = 1;
            let hasMore = true;

            while (hasMore) {
                console.log(`📄 Página ${currentPage}...`);

                const response = await this.api.get('/items', {
                    params: {
                        start: (currentPage - 1) * 30,
                        limit: 30,
                        type: 'product'
                    }
                });

                const products = response.data;
                allProducts = allProducts.concat(products);

                hasMore = products.length === 30;
                currentPage++;

                if (currentPage % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                if (currentPage > 100) break;
            }

            console.log(`📦 ${allProducts.length} productos obtenidos`);
            await this.saveProductsToLocal(allProducts);

            return allProducts;
        } catch (error) {
            console.error('❌ Error sincronizando:', error.message);
            throw error;
        }
    }

    /**
     * Guardar productos en BD local
     */
    async saveProductsToLocal(products) {
        try {
            console.log('💾 Guardando productos en BD local...');
            const startTime = Date.now();

            const existingProducts = await this.prisma.alegraProduct.findMany({
                select: { alegraId: true, updatedAt: true, name: true }
            });

            const existingMap = new Map();
            existingProducts.forEach(p => {
                existingMap.set(p.alegraId, { updatedAt: p.updatedAt, name: p.name });
            });

            const uniqueProducts = products.filter((product, index, self) =>
                index === self.findIndex(p => p.id === product.id)
            );

            const toInsert = [];
            const toUpdate = [];
            const currentAlegraIds = new Set();

            uniqueProducts.forEach(product => {
                currentAlegraIds.add(product.id);

                const mainPrice = product.price?.find(p => p.main === true);
                const price = mainPrice ? parseFloat(mainPrice.price) : 0;
                const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
                const reference = product.reference?.reference || product.reference || '';
                const category = product.itemCategory?.name || product.category?.name || '';

                const productData = {
                    alegraId: product.id,
                    name: product.name,
                    reference: reference,
                    description: product.description || '',
                    category: category,
                    price: price,
                    cost: cost,
                    status: product.status || 'active',
                    type: product.type || 'product',
                    searchText: `${product.name} ${reference} ${product.description || ''}`.toLowerCase()
                };

                const existing = existingMap.get(product.id);

                if (!existing) {
                    toInsert.push(productData);
                } else {
                    // Siempre actualizar para mantener precios actualizados
                    toUpdate.push(productData);
                }
            });

            const toDelete = existingProducts
                .filter(existing => !currentAlegraIds.has(existing.alegraId))
                .map(p => p.alegraId);

            console.log(`📈 Cambios: +${toInsert.length} ~${toUpdate.length} -${toDelete.length}`);

            const operations = [];

            if (toInsert.length > 0) {
                operations.push(
                    this.prisma.alegraProduct.createMany({
                        data: toInsert,
                        skipDuplicates: true
                    })
                );
            }

            if (toUpdate.length > 0) {
                const updatePromises = toUpdate.map(product =>
                    this.prisma.alegraProduct.update({
                        where: { alegraId: product.alegraId },
                        data: {
                            name: product.name,
                            reference: product.reference,
                            description: product.description,
                            category: product.category,
                            price: product.price,
                            cost: product.cost,
                            status: product.status,
                            type: product.type,
                            searchText: product.searchText,
                            updatedAt: new Date()
                        }
                    }).catch(error => {
                        console.warn(`⚠️ Error actualizando ${product.alegraId}:`, error.message);
                    })
                );
                operations.push(Promise.all(updatePromises));
            }

            if (toDelete.length > 0) {
                operations.push(
                    this.prisma.alegraProduct.deleteMany({
                        where: { alegraId: { in: toDelete } }
                    })
                );
            }

            if (operations.length > 0) {
                await Promise.all(operations);
            }

            const duration = Date.now() - startTime;
            console.log(`✅ Sincronización completada en ${duration}ms`);

      return {
                total: uniqueProducts.length,
                inserted: toInsert.length,
                updated: toUpdate.length,
                deleted: toDelete.length,
                duration: duration
      };
    } catch (error) {
            console.error('❌ Error guardando productos:', error.message);
            throw error;
        }
    }

    /**
     * Buscar productos similares
     */
    async findSimilarProducts(description, supplierCode) {
        try {
            const keywords = description.toLowerCase()
                .split(' ')
                .filter(word => word.length > 2)
                .slice(0, 5);

            if (keywords.length === 0) return [];

            const products = await this.prisma.alegraProduct.findMany({
                where: {
                    OR: keywords.map(keyword => ({
                        searchText: {
                            contains: keyword,
                            mode: 'insensitive'
                        }
                    }))
                },
                take: 10
            });

            const productsWithScore = products.map(product => {
                const score = this.calculateSimilarityScore(description, product);
      return {
                    ...product,
                    similarityScore: score
      };
            })
                .filter(product => product.similarityScore > 30)
                .sort((a, b) => b.similarityScore - a.similarityScore);

            return productsWithScore;
    } catch (error) {
            console.error('❌ Error buscando similares:', error.message);
            return [];
        }
    }

    calculateSimilarityScore(supplierDesc, alegraProduct) {
        const supplierWords = supplierDesc.toLowerCase().split(' ').filter(w => w.length > 2);
        const alegraText = `${alegraProduct.name} ${alegraProduct.reference} ${alegraProduct.description}`.toLowerCase();

        let matches = 0;
        supplierWords.forEach(word => {
            if (alegraText.includes(word)) matches++;
        });

        const score = Math.round((matches / supplierWords.length) * 100);
        return Math.min(score, 100);
    }

    /**
     * Obtener un producto específico de Alegra por ID
     */
    async getItem(alegraItemId) {
        try {
            console.log(`🔍 Obteniendo producto ${alegraItemId} de Alegra...`);
            const response = await this.api.get(`/items/${alegraItemId}`);
            console.log(`✅ Producto obtenido: ${response.data.name}`);
            return response.data;
        } catch (error) {
            console.error(`❌ Error obteniendo producto ${alegraItemId}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Actualizar precio de producto
     */
    async updateProductPrice(alegraItemId, newPrice) {
        try {
            console.log(`💰 Actualizando precio: ${alegraItemId} → ₡${newPrice}`);

            const currentProduct = await this.api.get(`/items/${alegraItemId}`);
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

            const response = await this.api.put(`/items/${alegraItemId}`, updateData);
            console.log(`✅ Precio actualizado en Alegra`);
            
            return response.data;
    } catch (error) {
            console.error(`❌ Error actualizando precio:`, error.message);
            throw error;
        }
    }

    /**
     * Buscar productos en Alegra API
     */
    async searchProducts(query) {
        try {
            const response = await this.api.get('/items', {
                params: {
                    query: query.trim(),
                    limit: 20
                }
            });

            // Alegra retorna un array directamente
            const items = Array.isArray(response.data) ? response.data : [];
            
            console.log(`✅ Búsqueda exitosa: ${items.length} productos encontrados`);
            
            return {
                success: true,
                data: items
            };
        } catch (error) {
            console.error('❌ Error buscando productos en Alegra:', error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || error.message,
                data: []
            };
        }
    }

    /**
     * Obtener categorías de Alegra (cuentas contables) - DEPRECATED
     * Usar getItemCategories() en su lugar para categorías de productos
     */
    async getCategories() {
        try {
            console.log('📁 Obteniendo categorías (cuentas contables) de Alegra...');
            const response = await this.api.get('/categories');
            
            if (response.data && Array.isArray(response.data)) {
                console.log(`✅ ${response.data.length} categorías obtenidas de Alegra`);
                return response.data;
            }
            
            return [];
        } catch (error) {
            console.error('❌ Error obteniendo categorías de Alegra:', error);
            return [];
        }
    }

    /**
     * Obtener categorías de PRODUCTOS (item-categories)
     * Este es el endpoint correcto para categorías de productos/items
     */
    async getItemCategories() {
        try {
            console.log('📦 Obteniendo categorías de productos (item-categories) de Alegra...');
            console.log('🔑 Usando credenciales:', {
                user: this.credentials.user,
                token: this.credentials.token ? `${this.credentials.token.substring(0, 4)}...` : 'NO CONFIGURADO',
                baseURL: this.baseURL
            });
            
            const response = await this.api.get('/item-categories');
            
            console.log('📊 Respuesta recibida:', {
                status: response.status,
                dataType: Array.isArray(response.data) ? 'array' : typeof response.data,
                length: Array.isArray(response.data) ? response.data.length : 'N/A'
            });
            
            if (response.data && Array.isArray(response.data)) {
                console.log(`✅ ${response.data.length} categorías de productos obtenidas de Alegra`);
                return response.data.map(cat => ({
                    id: cat.id,
                    name: cat.name || cat.description,
                    description: cat.description,
                    status: cat.status
                }));
            }
            
            console.warn('⚠️ La respuesta no es un array válido');
            return [];
        } catch (error) {
            console.error('❌ Error obteniendo categorías de productos de Alegra:');
            console.error('   Mensaje:', error.message);
            console.error('   Status:', error.response?.status);
            console.error('   Data:', error.response?.data);
            console.error('   URL:', error.config?.url);
            throw error; // Propagar el error para que se maneje en el endpoint
        }
    }

    /**
     * Obtener producto por ID
     */
    async getProductById(alegraId) {
        try {
            const response = await this.api.get(`/items/${alegraId}`);
            return response.data;
    } catch (error) {
            console.error('❌ Error obteniendo producto:', error);
            throw error;
        }
    }

    /**
     * Crear un nuevo producto en Alegra con TODOS los datos
     * Incluye: imagen, CABYS, impuestos, costo, inventario
     */
    async createProduct(data) {
        try {
            console.log(`📦 Creando producto COMPLETO en Alegra: ${data.name}`);
            console.log('📤 Datos recibidos:', JSON.stringify(data, null, 2));
            
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
            
            // Agregar referencia si se proporcionó
            if (data.reference) {
                productData.reference = {
                    reference: data.reference,
                    type: 'CODE_OF_INTERNAL_USE'
                };
            }
            
            // Agregar categoría si se especificó
            if (data.itemCategory && data.itemCategory.id) {
                productData.itemCategory = {
                    id: parseInt(data.itemCategory.id)
                };
            }

            // 🆕 Agregar código CABYS (productKey)
            if (data.productKey) {
                productData.productKey = data.productKey;
                console.log(`✅ Código CABYS agregado: ${data.productKey}`);
            }

            // 🆕 Agregar forma farmacéutica si se especificó (medicamentos)
            // Nota: Alegra requiere este campo para medicamentos según normativa CR 2025
            if (data.pharmaceuticalForm) {
                productData.pharmaceuticalForm = data.pharmaceuticalForm;
                console.log(`✅ Forma farmacéutica agregada: ${data.pharmaceuticalForm}`);
            }
            
            // 🆕 Agregar registro sanitario si se especificó (medicamentos)
            if (data.sanitaryRegistry) {
                productData.sanitaryRegistry = data.sanitaryRegistry;
                console.log(`✅ Registro sanitario agregado: ${data.sanitaryRegistry}`);
            }

            // 🆕 Agregar impuestos (tax)
            if (data.tax && Array.isArray(data.tax)) {
                productData.tax = data.tax;
                console.log(`✅ Impuestos agregados: ${JSON.stringify(data.tax)}`);
            }

            // 🆕 Agregar inventario (inventory) si es tipo producto
            if (data.type === 'product') {
                productData.inventory = {
                    unit: data.unit || 'unit',
                    unitCost: parseFloat(data.cost) || parseFloat(data.price) || 0
                };

                // Agregar cantidad inicial si se especificó
                if (data.initialQuantity && parseFloat(data.initialQuantity) > 0) {
                    productData.inventory.initialQuantity = parseFloat(data.initialQuantity);
                    console.log(`✅ Cantidad inicial: ${data.initialQuantity}`);
                }
            }

            console.log('📋 Datos formateados para Alegra:', JSON.stringify(productData, null, 2));
            
            const response = await this.api.post('/items', productData);
            console.log(`✅ Producto creado exitosamente: ID ${response.data.id}`);
            console.log(`📊 Respuesta completa:`, JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            console.error(`❌ Error creando producto en Alegra:`);
            console.error('   Status:', error.response?.status);
            console.error('   Error:', error.response?.data);
            console.error('   Message:', error.message);
            
            // Proporcionar error más descriptivo al usuario
            if (error.response?.data?.code === 1093) {
                throw new Error('Alegra requiere una "clave/referencia de producto". Verifica la configuración de tu cuenta en Alegra → Configuración → Productos.');
            } else if (error.response?.data?.message) {
                throw new Error(`Error de Alegra: ${error.response.data.message} (código ${error.response.data.code || 'N/A'})`);
            } else {
                throw error;
            }
        }
    }

    /**
     * 🆕 Subir imagen a un producto en Alegra
     * Usa el endpoint /items/{id}/attachment con multipart/form-data
     */
    async uploadProductImage(alegraItemId, formData) {
        try {
            console.log(`📸 Subiendo imagen al producto ${alegraItemId}...`);
            
            // El endpoint correcto es /items/{id}/attachment
            const response = await this.api.post(`/items/${alegraItemId}/attachment`, formData, {
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
     * Actualizar producto (cost, price, etc, image URL)
     */
    async updateProduct(alegraId, data) {
        try {
            console.log(`📝 Actualizando producto ${alegraId}...`);
            console.log('📋 Datos de actualización:', JSON.stringify(data, null, 2));
            
            const response = await this.api.put(`/items/${alegraId}`, data);
            console.log(`✅ Producto ${alegraId} actualizado exitosamente`);
            
            return response.data;
        } catch (error) {
            console.error(`❌ Error actualizando producto ${alegraId}:`);
            console.error('   Status:', error.response?.status);
            console.error('   Error:', error.response?.data);
            console.error('   Message:', error.message);
            throw error;
        }
    }

    /**
     * Eliminar producto
     */
    async deleteProduct(alegraId) {
        try {
            console.log(`🗑️ Eliminando producto ${alegraId}...`);
            await this.api.delete(`/items/${alegraId}`);
            console.log(`✅ Producto ${alegraId} eliminado`);
            return true;
        } catch (error) {
            console.error(`❌ Error eliminando producto ${alegraId}:`, error);
            throw error;
        }
    }

    /**
     * Crear o recuperar un contacto en Alegra (proveedor/cliente) siguiendo el formato oficial.
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
                const response = await this.api.get('/contacts', {
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
            const response = await this.api.post('/contacts', payload);
            console.log(`✅ Contacto creado: ${response.data.name}`);
            return response.data;
        } catch (error) {
            console.error('❌ Error creando/obteniendo contacto:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Crear factura de compra usando endpoint /bills con estructura correcta
     * Documentación: https://developer.alegra.com/reference/post_bills
     */
    async createPurchaseInvoice(data) {
        try {
            console.log(`📄 Creando factura de compra en Alegra...`);
            
            // Transformar datos al formato correcto de /bills (según código antiguo que funcionaba)
            const billData = {
                date: data.date,
                dueDate: data.date, // Misma fecha si es contado
                provider: data.client, // ← CLAVE: usar 'provider' no 'contact'
                numberTemplate: data.numberTemplate || { id: 10 }, // ID 10 = Factura de compra electrónica
                observations: data.observations || '',
                purchases: {
                    items: data.items
                },
                saleCondition: 'CASH', // Contado por defecto
                paymentMethod: 'CASH' // Efectivo por defecto
            };
            
            console.log(`📋 Datos de factura:`, JSON.stringify(billData, null, 2));
            
            const response = await this.api.post('/bills', billData);
            console.log(`✅ Factura de compra creada: ID ${response.data.id}`);
            return response.data;
        } catch (error) {
            // Log detallado del error
            console.error('❌ Error creando factura de compra:');
            console.error('   Status:', error.response?.status);
            console.error('   Message:', error.response?.data?.message || error.message);
            console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
            
            // Verificar si es error 403 (sin permisos)
            if (error.response?.status === 403) {
                console.warn('⚠️ Error 403: Sin permisos para crear facturas de compra');
                console.warn('💡 Posibles causas:');
                console.warn('   1. Tu plan no incluye facturas de proveedor');
                console.warn('   2. El usuario no tiene permisos suficientes');
                console.warn('   3. Verifica en Alegra: Configuración > Usuarios y permisos');
            } else if (error.response?.status === 400) {
                console.warn('⚠️ Error 400: Datos inválidos');
                console.warn('   Datos enviados:', JSON.stringify(error.config?.data, null, 2));
            }
            
            throw error;
        }
    }

    /**
     * Obtener una factura específica por ID de Alegra
     */
    async getInvoiceById(invoiceId) {
        try {
            const response = await this.api.get(`/invoices/${invoiceId}`);

            console.log(`📄 Factura obtenida: ${invoiceId}`);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Error obteniendo factura ${invoiceId}:`, error.message);
            return {
                success: false,
                error: error.message,
                message: `Error al obtener factura: ${error.message}`
            };
        }
    }

    /**
     * Actualizar factura en Alegra
     */
    async updateInvoice(invoiceId, datosEdicion) {
        try {
            console.log(`✏️ Actualizando factura ${invoiceId} en Alegra`);
            console.log('📝 Datos de edición:', JSON.stringify(datosEdicion, null, 2));

            const response = await this.api.put(`/invoices/${invoiceId}`, datosEdicion);

            console.log(`✅ Factura ${invoiceId} actualizada exitosamente`);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Error actualizando factura ${invoiceId}:`, error.message);
            console.error('Detalles del error:', error.response?.data || error);

            return {
                success: false,
                error: error.message,
                message: `Error al actualizar factura: ${error.message}`,
                details: error.response?.data || null
            };
        }
    }

    /**
     * Buscar facturas por número en Alegra
     */
    async searchInvoicesByNumber(numero) {
        try {
            console.log(`🔍 Buscando facturas en Alegra con número: ${numero}`);
            
            // Paginación: obtener hasta 3 páginas (90 facturas)
            let allInvoices = [];
            let start = 0;
            const limit = 30; // Máximo permitido por Alegra
            let hasMore = true;
            let totalPages = 0;

            while (hasMore && totalPages < 3) {
                const response = await this.api.get('/invoices', {
                    params: {
                        start: start,
                        limit: limit,
                        order_field: 'date',
                        order_direction: 'DESC',
                        metadata: true
                    }
                });

                // Alegra devuelve: { metadata: {...}, data: [...] }
                const invoices = response.data.data || response.data || [];
                
                console.log(`📊 Página ${totalPages + 1}: Obtenidas ${invoices.length} facturas`);

                if (invoices.length === 0) {
                    hasMore = false;
                    break;
                }

                allInvoices = allInvoices.concat(invoices);

                // Siguiente página
                start += limit;
                totalPages++;

                // Si obtuvo menos facturas que el límite, es la última página
                if (invoices.length < limit) {
                    hasMore = false;
                }
            }

            console.log(`🔍 Total facturas revisadas: ${allInvoices.length} en ${totalPages} páginas`);
            
            // Filtrar por número (buscar en formattedNumber, number o fullNumber)
            const facturasFiltradas = allInvoices.filter(f => {
                const num = numero.toLowerCase();
                return (
                    f.numberTemplate?.formattedNumber?.toLowerCase().includes(num) ||
                    f.numberTemplate?.number?.toString().includes(num) ||
                    f.numberTemplate?.fullNumber?.toLowerCase().includes(num)
                );
            });
            
            console.log(`✅ Encontradas ${facturasFiltradas.length} facturas que coinciden con "${numero}"`);
            
            // Transformar al formato esperado por el frontend
            const facturasTransformadas = facturasFiltradas.map(f => this.transformInvoiceForFrontend(f));
            
            return {
                success: true,
                data: facturasTransformadas
            };
        } catch (error) {
            console.error('❌ Error buscando facturas por número:', error.message);
            return {
                success: false,
                data: [],
                error: error.message,
                message: `Error en búsqueda: ${error.message}`
            };
        }
    }

    /**
     * Buscar facturas por cliente en Alegra
     */
    async searchInvoicesByClient(cliente) {
        try {
            console.log(`🔍 Buscando facturas del cliente: ${cliente}`);
            
            // Primero buscar el contacto - Alegra devuelve array directo para contacts
            const contactsResponse = await this.api.get('/contacts', {
                params: {
                    query: cliente,
                    type: 'client'
                }
            });
            
            // Contacts devuelve array directo (sin wrapper metadata/data)
            const contacts = contactsResponse.data || [];
            
            if (contacts.length === 0) {
                console.log('⚠️ No se encontró el cliente');
                return {
                    success: true,
                    data: [],
                    client: null
                };
            }
            
            const contact = contacts[0];
            console.log(`✅ Cliente encontrado: ${contact.name} (ID: ${contact.id})`);
            
            // Buscar facturas del cliente
            const invoicesResponse = await this.api.get('/invoices', {
                params: {
                    client: contact.id,
                    metadata: true,
                    order_field: 'date',
                    order_direction: 'DESC'
                }
            });
            
            // Invoices devuelve: { metadata: {...}, data: [...] }
            const facturas = invoicesResponse.data.data || invoicesResponse.data || [];
            console.log(`✅ Encontradas ${facturas.length} facturas del cliente`);
            
            // Transformar al formato esperado por el frontend
            const facturasTransformadas = facturas.map(f => this.transformInvoiceForFrontend(f));
            
            return {
                success: true,
                data: facturasTransformadas,
                client: contact,
                metadata: invoicesResponse.data.metadata
            };
        } catch (error) {
            console.error('❌ Error buscando facturas por cliente:', error.message);
            return {
                success: false,
                data: [],
                client: null,
                error: error.message
            };
        }
    }
    
    /**
     * Transformar factura de Alegra al formato esperado por el frontend
     * Copiado del sistema original proyecto-faltantes
     */
    transformInvoiceForFrontend(invoice) {
        try {
            const fecha = new Date(invoice.date);

            return {
            // ID y números
            alegra_id: parseInt(invoice.id),
            numero_factura: invoice.numberTemplate?.formattedNumber || invoice.numberTemplate?.number || 'N/A',
            numero_completo: invoice.numberTemplate?.fullNumber || 'N/A',

            // Cliente
            cliente_id: parseInt(invoice.client?.id || 0),
            cliente_nombre: invoice.client?.name || 'Cliente no especificado',
            cliente_email: invoice.client?.email || null,
            cliente_identificacion: invoice.client?.identification || null,
            cliente_telefono: invoice.client?.phonePrimary || null,

            // Fechas
            fecha_emision: invoice.date,
            fecha_vencimiento: invoice.dueDate || invoice.date,
            fecha_hora: invoice.datetime || invoice.date,

            // Montos
            subtotal: parseFloat(invoice.subtotal || 0),
            descuento: parseFloat(invoice.discount || 0),
            impuestos: parseFloat(invoice.tax || 0),
            total: parseFloat(invoice.total || 0),
            total_pagado: parseFloat(invoice.totalPaid || 0),
            saldo: parseFloat(invoice.balance || 0),

            // Estado y condiciones
            estado: invoice.status || 'unknown',
            condicion_venta: invoice.saleCondition || null,
            metodo_pago: invoice.paymentMethod || null,
            terminos: invoice.term || null,

            // Información adicional
            observaciones: invoice.observations || null,
            anotaciones: invoice.anotation || null,
            terminos_condiciones: invoice.termsConditions || null,

            // Bodega y vendedor
            bodega: invoice.warehouse?.name || 'Principal',
            vendedor: invoice.seller?.name || null,

            // Semana, mes, año (calculados)
            semana: this.calculateWeekOfMonth(invoice.date),
            mes: fecha.getMonth() + 1,
            ano: fecha.getFullYear(),

            // Items procesados
            items: this.processAlegraItems(invoice.items || []),

            // Datos originales para referencia
            alegra_data: invoice
            };
        } catch (error) {
            console.error('❌ Error en transformInvoiceForFrontend:', error);
            console.error('❌ Factura problemática:', invoice);
            throw new Error(`Error transformando factura: ${error.message}`);
        }
    }

    /**
     * Procesar items de factura de Alegra
     */
    processAlegraItems(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        return items.map(item => this.normalizeInvoiceItem(item));
    }

    normalizeInvoiceItem(item = {}) {
        const { referenceValue, referenceType } = this.normalizeItemReference(item);
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const total = Number(item.total) || Number((quantity * price).toFixed(2));
        const discount = Number(item.discount) || 0;

        return {
            alegra_id: item.id,
            codigo_alegra: item.id?.toString() || null,
            nombre: item.name || item.description || 'Producto sin nombre',
            name: item.name || item.description || 'Producto sin nombre',
            descripcion: item.description || '',
            description: item.description || '',
            referencia: referenceValue,
            reference: referenceValue,
            referencia_tipo: referenceType,
            reference_type: referenceType,
            // ✅ codigo_producto solo usa la referencia real (NO productKey/CABYS)
            codigo_producto: referenceValue || null,
            // ⚠️ productKey es CABYS - mantenerlo separado, NO usarlo como identificador
            productKey: item.productKey || null,
            cantidad: quantity,
            quantity,
            precio_unitario: price,
            price,
            descuento: discount,
            discount,
            total,
            unidad: item.unit || item.unitType || 'unit',
            unit: item.unit || item.unitType || 'unit',
            unitType: item.unitType || item.unit || 'unit',
            tipo: item.type || 'product',
            impuestos: Array.isArray(item.tax) ? item.tax : [],
            tax: Array.isArray(item.tax) ? item.tax : [],
        };
    }

    normalizeItemReference(item = {}) {
        const coerceString = (value) => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
            return null;
        };

        let referenceValue = null;
        let referenceType = null;

        const rawReference = item.reference;

        if (typeof rawReference === 'string' || typeof rawReference === 'number' || typeof rawReference === 'bigint') {
            referenceValue = coerceString(rawReference);
        } else if (rawReference && typeof rawReference === 'object') {
            referenceValue =
                coerceString(rawReference.reference) ||
                coerceString(rawReference.code) ||
                coerceString(rawReference.value);
            referenceType = rawReference.type || null;
        }

        // ❌ NO usar productKey (CABYS) como referencia - es un código general compartido
        if (!referenceValue) {
            referenceValue =
                coerceString(item.code) ||
                coerceString(item.sku) ||
                coerceString(item.id);
        }

        if (!referenceType) {
            referenceType = item.referenceType || item.reference_type || null;
        }

        return {
            referenceValue,
            referenceType: referenceType || null
        };
    }
    
    /**
     * Calcular semana del mes
     */
    calculateWeekOfMonth(dateString) {
        const date = new Date(dateString);
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const dayOfMonth = date.getDate();
        const dayOfWeek = firstDay.getDay();

        return Math.ceil((dayOfMonth + dayOfWeek) / 7);
    }

    /**
     * Obtener lista de proveedores (contactos tipo 'provider') de Alegra
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

            const response = await this.api.get('/contacts', { params });
            
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
     * Crear un nuevo proveedor en Alegra
     */
    async createProveedor(proveedorData) {
        try {
            console.log(`➕ Creando proveedor en Alegra:`, proveedorData.name);
            
            const payload = {
                name: proveedorData.name,
                type: ['provider'],
                identification: proveedorData.identification || null,
                identificationObject: proveedorData.identificationType ? {
                    type: proveedorData.identificationType,
                    number: proveedorData.identification
                } : null,
                phonePrimary: proveedorData.phone || null,
                email: proveedorData.email || null,
                address: proveedorData.address ? {
                    address: proveedorData.address
                } : null
            };

            const response = await this.api.post('/contacts', payload);
            
            console.log(`✅ Proveedor creado: ${response.data.name} (ID: ${response.data.id})`);
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creando proveedor:', error.message);
            return {
                success: false,
                error: error.message,
                message: `Error al crear proveedor: ${error.message}`
            };
        }
    }

    /**
     * Método genérico para hacer requests a la API de Alegra
     * Usado por las rutas de facturación
     */
    async makeRequest(method, endpoint, params = {}) {
        try {
            console.log(`📡 makeRequest: ${method} ${endpoint}`);
            
            const config = {
                method: method.toLowerCase(),
                url: endpoint,
                params: method.toUpperCase() === 'GET' ? params : undefined,
                data: method.toUpperCase() !== 'GET' ? params : undefined
            };
            
            const response = await this.api.request(config);
            
            // Devolver solo los datos (sin el wrapper de axios)
            return response.data;
        } catch (error) {
            console.error(`❌ makeRequest error:`, error.response?.data || error.message);
            throw error;
        }
    }

    async disconnect() {
        await this.prisma.$disconnect();
    }
}

module.exports = AlegraService;