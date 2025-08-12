const AlegraService = require('./alegraService'); // ✅ Usar tu AlegraService
if (!global.prismaInstance) {
    global.prismaInstance = new PrismaClient();
}
const prisma = global.prismaInstance; 


class AlegraCacheService {
    constructor() {
        this.isUpdating = false;
        this.lastUpdate = null;
        this.updateInterval = 10 * 60 * 1000; // 10 minutos en ms
        this.alegraService = new AlegraService(); // ✅ Instanciar tu servicio

        // ✅ Inicializar después de un delay para evitar conflictos
        setTimeout(() => {
            this.startAutoUpdate();
        }, 10000); // 10 segundos de delay
    }

    /**
     * 🔄 Iniciar actualizaciones automáticas cada 10 minutos
     */
    startAutoUpdate() {
        console.log('🔄 Cache automático iniciado (actualización cada 10 min)');

        // Primera actualización después de 30 segundos
        setTimeout(() => {
            this.updateCache();
        }, 30000);

        // Configurar intervalo de 10 minutos
        setInterval(() => {
            this.updateCache();
        }, this.updateInterval);
    }

    /**
     * 📊 Obtener productos desde cache local
     */
    async getProductsFromCache(alegraIds) {
        try {
            const products = await prisma.alegraProduct.findMany({
                where: {
                    alegraId: {
                        in: alegraIds
                    }
                },
                select: {
                    alegraId: true,
                    name: true,
                    price: true,
                    cost: true,
                    updatedAt: true
                }
            });

            console.log(`💾 Cache: ${products.length}/${alegraIds.length} productos encontrados`);

            return products.reduce((acc, product) => {
                acc[product.alegraId] = {
                    name: product.name,
                    price: product.price,
                    cost: product.cost,
                    updatedAt: product.updatedAt
                };
                return acc;
            }, {});

        } catch (error) {
            console.error('❌ Error obteniendo productos del cache:', error);
            return {};
        }
    }

    /**
     * 🔍 Obtener productos con fallback a API
     */
    async getProducts(alegraIds) {
        const uniqueIds = [...new Set(alegraIds.filter(Boolean))];

        if (uniqueIds.length === 0) return {};

        try {
            // 1. Intentar desde cache primero
            const cachedProducts = await this.getProductsFromCache(uniqueIds);

            // 2. Identificar productos faltantes o muy desactualizados  
            const missingIds = [];
            const tenMinutesAgo = new Date(Date.now() - this.updateInterval);

            for (const id of uniqueIds) {
                const cached = cachedProducts[id];
                // ✅ NUEVO: Si es un solo producto, siempre obtenerlo fresco (para actualizaciones)
                if (uniqueIds.length === 1 || !cached || cached.updatedAt < tenMinutesAgo) {
                    missingIds.push(id);
                }
            }

            // 3. Si hay productos faltantes, obtener individualmente desde la API
            if (missingIds.length > 0) {
                console.log(`🔄 Obteniendo ${missingIds.length} productos desde API de Alegra...`);

                for (const alegraId of missingIds) {
                    try {
                        // ✅ Usar la API de tu AlegraService para obtener producto individual
                        const response = await this.alegraService.api.get(`/items/${alegraId}`);
                        const product = response.data;
                        console.log('🔍 PRODUCTO CRUDO DE ALEGRA:', JSON.stringify(product, null, 2));

                        if (product) {
                            // Extraer precio y costo como en tu método saveProductsToLocal
                            const mainPrice = product.price?.find(p => p.main === true);
                            const priceWithoutTax = mainPrice ? parseFloat(mainPrice.price) : 0;
                            const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;

                            // ✅ NUEVO: Extraer porcentaje de impuesto
                            let taxPercentage = 0;
                            if (product.tax && Array.isArray(product.tax) && product.tax.length > 0) {
                                // Tomar el primer impuesto (generalmente es el IVA)
                                taxPercentage = parseFloat(product.tax[0].percentage) || 0;
                            }

                            // ✅ NUEVO: Calcular precio con IVA incluido
                            const priceWithTax = priceWithoutTax * (1 + taxPercentage / 100);

                            console.log(`💰 Producto ${product.name}:`);
                            console.log(`   Precio sin IVA: ₡${priceWithoutTax}`);
                            console.log(`   Impuesto: ${taxPercentage}%`);
                            console.log(`   Precio con IVA: ₡${priceWithTax.toFixed(2)}`);

                            const productData = {
                                name: product.name || `Producto ${alegraId}`,
                                price: Math.round(priceWithTax),
                                priceWithoutTax: priceWithoutTax,
                                cost: cost,
                                taxPercentage: taxPercentage
                            };

                            // Actualizar cache
                            await this.updateProductInCache(alegraId, productData);

                            console.log(`📊 PRODUCTO PROCESADO:`, JSON.stringify(productData, null, 2));

                            // Agregar a los resultados
                            cachedProducts[alegraId] = {
                                ...productData,
                                updatedAt: new Date()
                            };
                        }
                    } catch (apiError) {
                        console.warn(`⚠️ No se pudo obtener producto ${alegraId} desde API:`, apiError.message);

                        // Usar valores por defecto
                        cachedProducts[alegraId] = {
                            name: `Producto ${alegraId}`,
                            price: 0,
                            cost: 0,
                            updatedAt: new Date()
                        };
                    }

                    // Pausa para no saturar la API
                    await this.sleep(300);
                }
            }

            return cachedProducts;

        } catch (error) {
            console.error('❌ Error obteniendo productos:', error);

            // Fallback: retornar valores por defecto para todos los IDs
            const fallbackProducts = {};
            for (const id of uniqueIds) {
                fallbackProducts[id] = {
                    name: `Producto ${id}`,
                    price: 0,
                    cost: 0,
                    updatedAt: new Date()
                };
            }
            return fallbackProducts;
        }
    }

    /**
     * 💾 Actualizar producto individual en cache
     */
    async updateProductInCache(alegraId, productData) {
        try {
            await prisma.alegraProduct.upsert({
                where: { alegraId },
                update: {
                    name: productData.name,
                    price: productData.price,
                    cost: productData.cost,
                    updatedAt: new Date()
                },
                create: {
                    alegraId,
                    name: productData.name,
                    price: productData.price,
                    cost: productData.cost,
                    searchText: productData.name.toLowerCase()
                }
            });
        } catch (error) {
            console.error(`❌ Error actualizando cache para ${alegraId}:`, error);
        }
    }

    /**
     * 🔄 Actualización completa del cache desde Alegra
     */
    async updateCache() {
        if (this.isUpdating) {
            console.log('⏳ Cache ya se está actualizando, omitiendo...');
            return;
        }

        this.isUpdating = true;

        try {
            console.log('🔄 Iniciando actualización completa del cache...');

            // ✅ Usar el método correcto de tu AlegraService
            const productos = await this.alegraService.syncProductsFromAlegra();

            if (!productos || productos.length === 0) {
                console.log('⚠️ No se obtuvieron productos de Alegra');
                return;
            }

            console.log(`✅ Cache actualizado: ${productos.length} productos sincronizados`);
            this.lastUpdate = new Date();

        } catch (error) {
            console.error('❌ Error actualizando cache completo:', error);

            // Si el método de sincronización no funciona, usar testConnection para verificar
            try {
                await this.alegraService.testConnection();
                console.log('✅ Conexión con Alegra OK, cache usará API individual por ahora');
            } catch (connectionError) {
                console.error('❌ Error de conexión con Alegra:', connectionError.message);
            }
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * 📊 Obtener estadísticas del cache
     */
    async getCacheStats() {
        try {
            const total = await prisma.alegraProduct.count();
            const withPrice = await prisma.alegraProduct.count({
                where: { price: { gt: 0 } }
            });
            const withCost = await prisma.alegraProduct.count({
                where: { cost: { gt: 0 } }
            });

            return {
                total,
                withPrice,
                withCost,
                lastUpdate: this.lastUpdate,
                isUpdating: this.isUpdating
            };
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas del cache:', error);
            return {
                total: 0,
                withPrice: 0,
                withCost: 0,
                lastUpdate: null,
                isUpdating: false
            };
        }
    }

    /**
     * 💤 Función sleep para pausas
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 🔧 Cerrar conexiones
     */
    async disconnect() {
        if (this.alegraService) {
            await this.alegraService.disconnect();
        }
        await prisma.$disconnect();
    }
}

// Singleton instance
const alegraCacheService = new AlegraCacheService();

module.exports = alegraCacheService;