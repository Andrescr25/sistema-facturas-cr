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

            return response.data || [];
    } catch (error) {
            console.error('❌ Error buscando en Alegra:', error);
            return [];
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
     * Buscar facturas por número en Alegra
     */
    async searchInvoicesByNumber(numero) {
        try {
            console.log(`🔍 Buscando facturas en Alegra con número: ${numero}`);
            
            // Alegra no filtra bien con numberTemplate, así que obtenemos todas y filtramos
            const response = await this.api.get('/invoices', {
                params: {
                    metadata: true,
                    order_field: 'date',
                    order_direction: 'DESC',
                    start: 0,
                    limit: 100 // Obtener últimas 100 facturas
                }
            });
            
            // Alegra devuelve: { metadata: {...}, data: [...] }
            const todasFacturas = response.data.data || response.data || [];
            
            // Filtrar por número (buscar en formattedNumber, number o fullNumber)
            const facturasFiltradas = todasFacturas.filter(f => {
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
                data: facturasTransformadas,
                metadata: response.data.metadata
            };
        } catch (error) {
            console.error('❌ Error buscando facturas por número:', error.message);
            return {
                success: false,
                data: [],
                error: error.message
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
     */
    transformInvoiceForFrontend(factura) {
        const fecha = new Date(factura.date);
        const semana = this.getWeekNumber(fecha);
        
        return {
            alegra_id: factura.id,
            numero_factura: factura.numberTemplate?.formattedNumber || factura.numberTemplate?.number || factura.id,
            cliente_nombre: factura.client?.name || 'Sin nombre',
            cliente_id: factura.client?.id || null,
            fecha: factura.date,
            fecha_vencimiento: factura.dueDate,
            subtotal: parseFloat(factura.subtotal) || 0,
            impuesto: parseFloat(factura.tax) || 0,
            total: parseFloat(factura.total) || 0,
            saldo: parseFloat(factura.balance) || 0,
            estado: factura.status,
            observaciones: factura.observations || '',
            terminos: factura.termsConditions || '',
            items: factura.items || [],
            semana: semana,
            mes: fecha.getMonth() + 1,
            ano: fecha.getFullYear(),
            condicion_venta: factura.saleCondition,
            metodo_pago: factura.paymentMethod,
            bodega: factura.warehouse?.name || 'Principal'
        };
    }
    
    /**
     * Obtener número de semana del año
     */
    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    async disconnect() {
        await this.prisma.$disconnect();
    }
}

module.exports = AlegraService;