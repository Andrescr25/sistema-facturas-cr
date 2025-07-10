const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

class AlegraService {
    constructor() {
        this.baseURL = 'https://api.alegra.com/api/v1';
        this.credentials = {
            user: process.env.ALEGRA_USER || 'tachifacturas@gmail.com',
            token: process.env.ALEGRA_TOKEN || 'b3a84abb6897180d3889'
        };

        // Configurar cliente HTTP con autenticación
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
            timeout: 30000 // 30 segundos - aumentado para evitar timeouts
        });

        this.prisma = new PrismaClient();
        this.setupInterceptors();
    }

    /**
     * Configura interceptores para logging y manejo de errores
     */
    setupInterceptors() {
        // Request interceptor
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

        // Response interceptor
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
     * Verifica la conexión con Alegra
     * @returns {Object} Información de la empresa
     */
    async testConnection() {
        try {
            console.log('🔍 Verificando conexión con Alegra...');

            const response = await this.api.get('/company');
            const company = response.data;

            console.log('✅ Conexión exitosa con Alegra');
            console.log(`🏢 Empresa: ${company.name}`);
            console.log(`🌍 País: ${company.country}`);
            console.log(`💰 Moneda: ${company.currency}`);

            return company;

        } catch (error) {
            console.error('❌ Error conectando con Alegra:', error.message);
            throw error;
        }
    }

    /**
     * Sincroniza todos los productos de Alegra
     * @returns {Array} Productos sincronizados
     */
    async syncProductsFromAlegra() {
        try {
            console.log('📦 Iniciando sincronización de productos...');

            // Obtener productos paginados
            let allProducts = [];
            let currentPage = 1;
            let hasMore = true;

            while (hasMore) {
                console.log(`📄 Obteniendo página ${currentPage}...`);

                const response = await this.api.get('/items', {
                    params: {
                        start: (currentPage - 1) * 30,
                        limit: 30,
                        type: 'product' // Solo productos, no servicios
                    }
                });

                const products = response.data;
                allProducts = allProducts.concat(products);

                // Verificar si hay más páginas
                hasMore = products.length === 30;
                currentPage++;

                // Delay para evitar límites de API
                if (currentPage % 10 === 0) {
                    console.log('⏸️ Pausa para evitar límites de API...');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos
                }

                // Límite de seguridad
                if (currentPage > 100) {
                    console.warn('⚠️ Límite de páginas alcanzado (100)');
                    break;
                }
            }

            console.log(`📦 ${allProducts.length} productos obtenidos de Alegra`);

            // Guardar en tabla local para búsquedas rápidas
            await this.saveProductsToLocal(allProducts);

            return allProducts;

        } catch (error) {
            console.error('❌ Error sincronizando productos:', error.message);
            throw error;
        }
    }

    /**
     * Guarda productos de Alegra en tabla local
     * @param {Array} products - Productos de Alegra
     */
    async saveProductsToLocal(products) {
        try {
            console.log('💾 Guardando productos en BD local...');

            // Limpiar tabla existente
            await this.prisma.alegraProduct.deleteMany({});

            // Filtrar duplicados por alegraId
            const uniqueProducts = products.filter((product, index, self) =>
                index === self.findIndex(p => p.id === product.id)
            );

            console.log(`📦 ${products.length} productos descargados, ${uniqueProducts.length} únicos`);

            // Insertar productos únicos
            const productsToInsert = uniqueProducts.map(product => {
                // Extraer precio de la lista de precios (tomar el principal)
                const mainPrice = product.price?.find(p => p.main === true);
                const price = mainPrice ? parseFloat(mainPrice.price) : 0;
                
                // Extraer costo del inventario
                const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
                
                // Extraer referencia del objeto
                const reference = product.reference?.reference || product.reference || '';
                
                // Usar itemCategory si existe, sino category
                const category = product.itemCategory?.name || product.category?.name || '';
                
                return {
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
            });

            await this.prisma.alegraProduct.createMany({
                data: productsToInsert
            });

            console.log(`✅ ${productsToInsert.length} productos guardados en BD local`);

        } catch (error) {
            console.error('❌ Error guardando productos localmente:', error.message);
            throw error;
        }
    }

    /**
     * Busca productos similares en Alegra (local)
     * @param {String} description - Descripción del producto del proveedor
     * @param {String} supplierCode - Código del proveedor
     * @returns {Array} Productos similares con score de confianza
     */
    async findSimilarProducts(description, supplierCode) {
        try {
            console.log(`🔍 Buscando productos similares para: "${description}"`);

            // Extraer palabras clave de la descripción
            const keywords = description.toLowerCase()
                .split(' ')
                .filter(word => word.length > 2)
                .slice(0, 5); // Máximo 5 palabras

            if (keywords.length === 0) {
                return [];
            }

            // Buscar productos que contengan alguna palabra clave
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

            // Calcular score de similitud
            const productsWithScore = products.map(product => {
                const score = this.calculateSimilarityScore(description, product);
                return {
                    ...product,
                    similarityScore: score
                };
            })
                .filter(product => product.similarityScore > 30) // Mínimo 30% similitud
                .sort((a, b) => b.similarityScore - a.similarityScore);

            console.log(`💡 ${productsWithScore.length} productos similares encontrados`);

            return productsWithScore;

        } catch (error) {
            console.error('❌ Error buscando productos similares:', error.message);
            return [];
        }
    }

    /**
     * Calcula score de similitud entre descripción del proveedor y producto Alegra
     * @param {String} supplierDesc - Descripción del proveedor
     * @param {Object} alegraProduct - Producto de Alegra
     * @returns {Number} Score de 0-100
     */
    calculateSimilarityScore(supplierDesc, alegraProduct) {
        const supplierWords = supplierDesc.toLowerCase().split(' ').filter(w => w.length > 2);
        const alegraText = `${alegraProduct.name} ${alegraProduct.reference} ${alegraProduct.description}`.toLowerCase();

        let matches = 0;
        supplierWords.forEach(word => {
            if (alegraText.includes(word)) {
                matches++;
            }
        });

        const score = Math.round((matches / supplierWords.length) * 100);
        return Math.min(score, 100);
    }

    /**
     * Crea un nuevo producto en Alegra
     * @param {Object} productData - Datos del producto
     * @returns {Object} Producto creado
     */
    async createProduct(productData) {
        try {
            console.log(`📦 Creando producto en Alegra: ${productData.name}`);

            const response = await this.api.post('/items', {
                name: productData.name,
                reference: productData.reference || '',
                description: productData.description || '',
                price: productData.price || 0,
                cost: productData.cost || 0,
                type: 'product',
                status: 'active'
            });

            const newProduct = response.data;
            console.log(`✅ Producto creado: ${newProduct.id} - ${newProduct.name}`);

            return newProduct;

        } catch (error) {
            console.error('❌ Error creando producto:', error.message);
            throw error;
        }
    }

    /**
     * Crea un gasto (factura de proveedor) en Alegra
     * @param {Object} facturaData - Datos de la factura
     * @returns {Object} Gasto creado
     */
    async createPurchase(facturaData) {
        try {
            console.log(`💰 Creando gasto en Alegra: ${facturaData.numeroConsecutivo}`);

            // Preparar datos del gasto
            const purchaseData = {
                date: facturaData.fechaEmision.fecha,
                dueDate: facturaData.fechaEmision.fecha, // Misma fecha si es contado
                observations: `Factura ${facturaData.numeroConsecutivo} - ${facturaData.emisor.nombre}`,
                reference: facturaData.numeroConsecutivo,

                // Proveedor
                contact: {
                    name: facturaData.emisor.nombre,
                    identification: facturaData.emisor.identificacion.numero,
                    email: facturaData.emisor.correoElectronico,
                    phone: facturaData.emisor.telefono?.numero
                },

                // Productos
                items: facturaData.productos.map(producto => ({
                    id: producto.alegraItemId, // ID del producto en Alegra
                    quantity: producto.cantidad,
                    price: producto.precioUnitario,
                    discount: producto.descuento || 0,
                    tax: [{
                        id: 1, // IVA estándar CR
                        value: producto.impuesto || 0
                    }]
                }))
            };

            const response = await this.api.post('/purchases', purchaseData);
            const purchase = response.data;

            console.log(`✅ Gasto creado: ${purchase.id} - ${purchase.reference}`);
            return purchase;

        } catch (error) {
            console.error('❌ Error creando gasto:', error.message);
            throw error;
        }
    }

    /**
     * Obtiene estadísticas de la cuenta
     * @returns {Object} Estadísticas
     */
    async getAccountStats() {
        try {
            const [products, purchases] = await Promise.all([
                this.api.get('/items?limit=1'),
                this.api.get('/purchases?limit=1')
            ]);

            return {
                totalProducts: products.data.length || 0,
                totalPurchases: purchases.data.length || 0,
                lastSync: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error.message);
            return {
                totalProducts: 0,
                totalPurchases: 0,
                lastSync: null
            };
        }
    }

    /**
     * Desconecta Prisma
     */
    async disconnect() {
        await this.prisma.$disconnect();
    }
}

module.exports = AlegraService;