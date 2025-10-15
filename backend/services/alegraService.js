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
            timeout: 30000
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
                } else if (existing.name !== product.name) {
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
     * Obtener categorías de Alegra
     */
    async getCategories() {
        try {
            console.log('📁 Obteniendo categorías de Alegra...');
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
     * Actualizar producto (cost, price, etc)
     */
    async updateProduct(alegraId, data) {
        try {
            console.log(`📝 Actualizando producto ${alegraId}...`);
            const response = await this.api.put(`/items/${alegraId}`, data);
            console.log(`✅ Producto ${alegraId} actualizado`);
            return response.data;
        } catch (error) {
            console.error(`❌ Error actualizando producto ${alegraId}:`, error);
            throw error;
        }
    }

    /**
     * Crear o obtener contacto (proveedor/cliente)
     */
    async createOrGetContact(data) {
        try {
            // Buscar contacto existente por identificación
            if (data.identification) {
                const response = await this.api.get('/contacts', {
                    params: {
                        identification: data.identification
                    }
                });

                if (response.data && response.data.length > 0) {
                    console.log(`✅ Contacto encontrado: ${response.data[0].name}`);
                    return response.data[0];
                }
            }

            // Si no existe, crear nuevo
            console.log(`📝 Creando contacto: ${data.name}...`);
            const response = await this.api.post('/contacts', data);
            console.log(`✅ Contacto creado: ${response.data.name}`);
            return response.data;
        } catch (error) {
            console.error('❌ Error creando/obteniendo contacto:', error);
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

        return items.map(item => ({
            alegra_id: item.id,
            nombre: item.name || 'Producto sin nombre',
            descripcion: item.description || '',
            referencia: item.reference || null,
            codigo_producto: item.productKey || null,
            cantidad: parseInt(item.quantity || 0),
            precio_unitario: parseFloat(item.price || 0),
            descuento: parseFloat(item.discount || 0),
            total: parseFloat(item.total || 0),
            unidad: item.unit || 'unit',
            tipo: item.type || 'product', // 'product' o 'service'
            impuestos: item.tax || []
        }));
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