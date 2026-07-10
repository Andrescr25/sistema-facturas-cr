const axios = require('axios');
const prisma = require('../lib/prisma');
const alegraConfig = require('../src/integrations/alegra/alegra.config');

class AlegraService {
  constructor() {
        // Configuración compartida con src/integrations/alegra (credenciales solo por env)
        this.baseURL = alegraConfig.baseURL;
        this.credentials = alegraConfig.credentials;

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

        this.prisma = prisma;
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
     * Sincronizar cache de productos (alegra_products_cache / AlegraProduct)
     */
    async syncProductsCache() {
        console.log('🔄 Sincronizando caché de productos de Alegra...');
        const products = await this.syncProductsFromAlegra();
        return {
            success: true,
            message: 'Caché de productos sincronizada exitosamente',
            count: products.length
        };
    }

    /**
     * Sincronizar automáticamente (sincroniza caché y productos locales legacy)
     */
    async syncProductsAutomatically() {
        console.log('🔄 Sincronización automática de productos iniciada...');
        // 1. Sincronizar caché de Alegra (Prisma)
        const cacheProducts = await this.syncProductsFromAlegra();
        
        // 2. Sincronizar productos locales legacy (direct pg)
        const ProductService = require('../src/modules/products/product.service');
        const productService = new ProductService();
        const localSyncResult = await productService.syncProducts(100, false, true);

        return {
            success: true,
            message: 'Sincronización automática completada con éxito',
            cacheCount: cacheProducts.length,
            localSync: localSyncResult
        };
    }

    /**
     * Guardar productos en BD local
     */
    async saveProductsToLocal(products) {
        try {
            console.log('💾 Guardando productos en BD local...');
            const startTime = Date.now();

            const existingProducts = await this.prisma.alegraProduct.findMany({
                select: { alegraId: true, updatedAt: true, name: true, price: true, cost: true, reference: true, status: true, imageUrl: true }
            });

            const existingMap = new Map();
            existingProducts.forEach(p => {
                existingMap.set(p.alegraId, {
                    updatedAt: p.updatedAt,
                    name: p.name,
                    price: p.price,
                    cost: p.cost,
                    reference: p.reference,
                    status: p.status,
                    imageUrl: p.imageUrl
                });
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
                
                const favoriteImage = product.images?.find(img => img.favorite === true) || product.images?.[0];
                const imageUrl = favoriteImage ? favoriteImage.url : '';

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
                    imageUrl: imageUrl,
                    searchText: `${product.name} ${reference} ${product.description || ''}`.toLowerCase()
                };

                const existing = existingMap.get(product.id);

                if (!existing) {
                    toInsert.push(productData);
                } else {
                    // Solo actualizar si algo cambió
                    const nameDiff = existing.name !== productData.name;
                    const priceDiff = Math.abs(existing.price - productData.price) > 0.01;
                    const costDiff = Math.abs(existing.cost - productData.cost) > 0.01;
                    const refDiff = existing.reference !== productData.reference;
                    const statusDiff = existing.status !== productData.status;
                    const imgDiff = (existing.imageUrl || '').split('?')[0] !== (productData.imageUrl || '').split('?')[0];

                    const hasChanged = nameDiff || priceDiff || costDiff || refDiff || statusDiff || imgDiff;

                    if (hasChanged && toUpdate.length < 5) {
                        console.log(`🔍 Mismatch for ${productData.alegraId} (${productData.name}):`, {
                            name: nameDiff ? `${existing.name} vs ${productData.name}` : 'OK',
                            price: priceDiff ? `${existing.price} vs ${productData.price}` : 'OK',
                            cost: costDiff ? `${existing.cost} vs ${productData.cost}` : 'OK',
                            ref: refDiff ? `'${existing.reference}' vs '${productData.reference}'` : 'OK',
                            status: statusDiff ? `${existing.status} vs ${productData.status}` : 'OK',
                            img: imgDiff ? `'${existing.imageUrl}' vs '${productData.imageUrl}'` : 'OK'
                        });
                    }

                    if (hasChanged) {
                        toUpdate.push(productData);
                    }
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

            // Actualizar en lotes para evitar saturar connection pool
            if (toUpdate.length > 0) {
                const BATCH_SIZE = 5;
                const batches = [];

                for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
                    batches.push(toUpdate.slice(i, i + BATCH_SIZE));
                }

                console.log(`📦 Actualizando ${toUpdate.length} productos en ${batches.length} lotes`);

                for (let i = 0; i < batches.length; i++) {
                    const batch = batches[i];
                    const batchPromises = batch.map(product =>
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
                                imageUrl: product.imageUrl,
                                searchText: product.searchText,
                                updatedAt: new Date()
                            }
                        }).catch(error => {
                            console.warn(`⚠️ Error actualizando ${product.alegraId}:`, error.message);
                        })
                    );

                    await Promise.all(batchPromises);

                    // Pequeña pausa entre lotes
                    if (i < batches.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
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









    // Métodos de producto (getProductById, searchProducts, updateProduct,
    // deleteProduct, updateProductPrice, uploadProductImage,
    // downloadAndUploadProductImage) viven ahora en
    // src/integrations/alegra/services/alegra-product.service.js








    // getInvoiceById y updateInvoice viven ahora en
    // src/integrations/alegra/services/alegra-invoice.service.js

    // searchInvoicesByNumber y searchInvoicesByClient viven ahora en
    // src/integrations/alegra/services/alegra-invoice.service.js (los consume
    // src/modules/invoices/invoice.service.js)

    // La API de Alegra (productos, contactos, facturas, compras e inventario)
    // vive ahora en src/integrations/alegra/. Este servicio conserva únicamente:
    // - la maquinaria de sincronización del cache local de productos
    // - transformInvoiceForFrontend y sus helpers (los usa warehouse)
    // - makeRequest/requestWithRetry (los usan facturacion y warehouse)

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
            
            const response = await this.requestWithRetry(() => this.api.request(config));
            
            // Devolver solo los datos (sin el wrapper de axios)
            return response.data;
        } catch (error) {
            console.error(`❌ makeRequest error:`, error.response?.data || error.message);
            throw error;
        }
    }



    /**
     * El cliente Prisma es compartido (lib/prisma.js) y se desconecta solo
     * al cerrar el proceso, así que aquí no hay nada que cerrar.
     */
    async disconnect() {}
}

module.exports = AlegraService;
