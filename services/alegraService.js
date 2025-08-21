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

        if (!global.prismaInstance) {
            global.prismaInstance = new PrismaClient();
        }
        this.prisma = global.prismaInstance; // 
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
                console.log(` API Response: ${response.status} ${response.config.url}`);
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

            console.log(' Conexión exitosa con Alegra');
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
 * ⚡ OPTIMIZADO: Guarda productos usando updates incrementales (MUCHO MÁS RÁPIDO)
 * @param {Array} products - Productos de Alegra
 */
    async saveProductsToLocal(products) {
        try {
            console.log('💾 Guardando productos en BD local (modo incremental)...');
            const startTime = Date.now();

            //  1. Obtener productos existentes de la BD (solo IDs y updatedAt para comparar)
            const existingProducts = await this.prisma.alegraProduct.findMany({
                select: {
                    alegraId: true,
                    updatedAt: true,
                    name: true
                }
            });

            const existingMap = new Map();
            existingProducts.forEach(p => {
                existingMap.set(p.alegraId, {
                    updatedAt: p.updatedAt,
                    name: p.name
                });
            });

            console.log(`📊 ${existingProducts.length} productos en BD, ${products.length} desde Alegra`);

            //  2. Filtrar duplicados por alegraId
            const uniqueProducts = products.filter((product, index, self) =>
                index === self.findIndex(p => p.id === product.id)
            );

            //  3. Clasificar productos: nuevos, a actualizar, a eliminar
            const toInsert = [];
            const toUpdate = [];
            const currentAlegraIds = new Set();

            uniqueProducts.forEach(product => {
                currentAlegraIds.add(product.id);

                // Extraer datos del producto (igual que antes)
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
                    //  Producto nuevo
                    toInsert.push(productData);
                } else if (existing.name !== product.name) {
                    //  Solo actualizar si cambió el nombre (indicador simple de cambio)
                    toUpdate.push(productData);
                }
                // Si no cambió, no hacer nada (MUCHO MÁS EFICIENTE)
            });

            //  4. Identificar productos a eliminar (ya no están en Alegra)
            const toDelete = existingProducts
                .filter(existing => !currentAlegraIds.has(existing.alegraId))
                .map(p => p.alegraId);

            console.log(`📈 Cambios detectados:`);
            console.log(`   ➕ ${toInsert.length} nuevos`);
            console.log(`   🔄 ${toUpdate.length} a actualizar`);
            console.log(`   ❌ ${toDelete.length} a eliminar`);

            //  5. Ejecutar operaciones en paralelo (MUCHO MÁS RÁPIDO)
            const operations = [];

            // Insertar nuevos
            if (toInsert.length > 0) {
                operations.push(
                    this.prisma.alegraProduct.createMany({
                        data: toInsert,
                        skipDuplicates: true
                    })
                );
            }

            // Actualizar existentes (uno por uno, pero en paralelo)
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
                        console.warn(`⚠️ Error actualizando producto ${product.alegraId}:`, error.message);
                    })
                );
                operations.push(Promise.all(updatePromises));
            }

            // Eliminar obsoletos
            if (toDelete.length > 0) {
                operations.push(
                    this.prisma.alegraProduct.deleteMany({
                        where: {
                            alegraId: {
                                in: toDelete
                            }
                        }
                    })
                );
            }

            //  6. Ejecutar todas las operaciones
            if (operations.length > 0) {
                await Promise.all(operations);
            }

            const duration = Date.now() - startTime;
            console.log(` Sincronización incremental completada en ${duration}ms`);
            console.log(`📊 Total final: ${uniqueProducts.length} productos en BD local`);

            return {
                total: uniqueProducts.length,
                inserted: toInsert.length,
                updated: toUpdate.length,
                deleted: toDelete.length,
                duration: duration
            };

        } catch (error) {
            console.error('❌ Error en sincronización incremental:', error.message);

            //  Fallback: si falla, hacer el método original como backup
            console.log('🔄 Fallback: usando método tradicional...');
            return this.saveProductsToLocalFallback(products);
        }
    }

    /**
     * 🔄 Método fallback (original) en caso de error
     */
    async saveProductsToLocalFallback(products) {
        try {
            console.log('💾 Guardando productos (método fallback)...');

            // Limpiar tabla existente
            await this.prisma.alegraProduct.deleteMany({});

            // Filtrar duplicados por alegraId
            const uniqueProducts = products.filter((product, index, self) =>
                index === self.findIndex(p => p.id === product.id)
            );

            console.log(`📦 ${products.length} productos descargados, ${uniqueProducts.length} únicos`);

            // Insertar productos únicos
            const productsToInsert = uniqueProducts.map(product => {
                const mainPrice = product.price?.find(p => p.main === true);
                const price = mainPrice ? parseFloat(mainPrice.price) : 0;
                const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
                const reference = product.reference?.reference || product.reference || '';
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

            console.log(` ${productsToInsert.length} productos guardados (fallback)`);

            return {
                total: productsToInsert.length,
                inserted: productsToInsert.length,
                updated: 0,
                deleted: 0,
                duration: 0
            };

        } catch (error) {
            console.error('❌ Error en método fallback:', error.message);
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
 * Calcula el ID del impuesto basado en el porcentaje real del producto
 */
    calculateTaxId(productDataFromProvider) {

        if (!productDataFromProvider.impuesto || productDataFromProvider.impuesto <= 0) {
            console.log(`   ✅ Sin impuesto → IVA exento (0%)`);
            return "2"; // IVA exento
        }

        // ✅ MÉTODO 1: Calcular basado en totales de línea
        const subtotalSinImpuesto = productDataFromProvider.totalLinea - productDataFromProvider.impuesto;
        const porcentajeMetodo1 = (productDataFromProvider.impuesto / subtotalSinImpuesto) * 100;

        // ✅ MÉTODO 2: Calcular basado en precio unitario con descuento
        const precioOriginal = productDataFromProvider.precioUnitario;
        const descuentoUnitario = (productDataFromProvider.descuento || 0) / productDataFromProvider.cantidad;
        const precioConDescuento = precioOriginal - descuentoUnitario;
        const impuestoUnitario = productDataFromProvider.impuesto / productDataFromProvider.cantidad;
        const porcentajeMetodo2 = (impuestoUnitario / precioConDescuento) * 100;

        console.log(`   📊 MÉTODO 1 (total línea): ${porcentajeMetodo1.toFixed(2)}%`);
        console.log(`   📊 MÉTODO 2 (unitario): ${porcentajeMetodo2.toFixed(2)}%`);

        // Usar el método más lógico
        const porcentajeFinal = porcentajeMetodo1;
        console.log(`   🎯 Porcentaje final: ${porcentajeFinal.toFixed(2)}%`);

        // Mapear a IDs de Alegra (con tolerancia de ±0.5%)
        if (Math.abs(porcentajeFinal - 13) <= 0.5) return "1";   // IVA 13%
        if (Math.abs(porcentajeFinal - 8) <= 0.5) return "7";    // IVA transitorio 8%
        if (Math.abs(porcentajeFinal - 4) <= 0.5) return "6";    // IVA reducido 4%
        if (Math.abs(porcentajeFinal - 2) <= 0.5) return "5";    // IVA reducido 2%
        if (Math.abs(porcentajeFinal - 1) <= 0.5) return "4";    // IVA reducido 1%
        if (Math.abs(porcentajeFinal - 0.5) <= 0.25) return "3"; // IVA reducido 0.5%
        if (porcentajeFinal <= 0.25) return "2";                  // IVA exento

        // Fallback para porcentajes no reconocidos
        console.warn(`⚠️ Porcentaje de impuesto no reconocido: ${porcentajeFinal.toFixed(2)}%, usando IVA 13%`);
        return "1"; // IVA 13% por defecto
    }

    /**
     * NUEVO: Busca proveedor por cédula o nombre
     * @param {String} cedula - Cédula del proveedor
     * @param {String} nombre - Nombre del proveedor
     * @returns {Object|null} Proveedor encontrado
     */
    async findProviderByCedula(cedula, nombre) {
        try {
            console.log(`🔍 Buscando proveedor: ${nombre} (${cedula})`);

            // Buscar por identificación primero (más preciso)
            const responseById = await this.api.get('/contacts', {
                params: {
                    identification: cedula,
                    type: 'provider'
                }
            });

            if (responseById.data && responseById.data.length > 0) {
                const provider = responseById.data[0];
                console.log(` Proveedor encontrado por cédula: ${provider.id} - ${provider.name}`);
                return provider;
            }

            // Si no encuentra por cédula, buscar por nombre
            const responseByName = await this.api.get('/contacts', {
                params: {
                    name: nombre,
                    type: 'provider'
                }
            });

            const providers = responseByName.data;

            // Buscar coincidencia por cédula en los resultados
            const provider = providers.find(p =>
                p.identification === cedula ||
                p.name.toLowerCase().includes(nombre.toLowerCase().split(' ')[0]) // Primera palabra del nombre
            );

            if (provider) {
                console.log(` Proveedor encontrado por nombre: ${provider.id} - ${provider.name}`);
                return provider;
            }

            console.log(`⚠️ Proveedor no encontrado: ${nombre}`);
            return null;

        } catch (error) {
            console.error('❌ Error buscando proveedor:', error.message);
            return null;
        }
    }

    /**
     * NUEVO: Crea o actualiza un proveedor en Alegra
     * @param {Object} providerData - Datos del proveedor de la factura
     * @returns {Object} Proveedor creado/actualizado
     */
    async createOrUpdateProvider(providerData) {
        try {
            console.log(`👤 Creando proveedor: ${providerData.nombre}`);

            const newProvider = {
                name: providerData.nombre,
                identification: providerData.cedula,
                email: providerData.email,
                mobile: providerData.telefono,
                type: 'provider',
                kindOfPerson: 'LEGAL_PERSON', // Persona jurídica por defecto
                regime: 'SIMPLIFIED', // Régimen simplificado
                identificationObject: {
                    type: providerData.cedula.length > 10 ? 'LEGAL_PERSON' : 'NATURAL_PERSON',
                    number: providerData.cedula
                }
            };

            const response = await this.api.post('/contacts', newProvider);
            const provider = response.data;

            console.log(` Proveedor creado: ${provider.id} - ${provider.name}`);
            return provider;

        } catch (error) {
            // Si el error es que ya existe, extraer los datos del error
            if (error.response?.status === 400 && error.response?.data?.code === 2006) {
                const existingProvider = {
                    id: error.response.data.contactId,
                    name: error.response.data.contactName,
                    identification: error.response.data.contactIdentification
                };

                console.log(` Proveedor ya existe: ${existingProvider.id} - ${existingProvider.name}`);
                return existingProvider;
            }

            console.error('❌ Error creando proveedor:', error.message);
            throw error;
        }
    }

    /**
 *  NUEVO: Actualiza el PRECIO DE VENTA de un producto en Alegra
 * @param {String} alegraItemId - ID del producto en Alegra
 * @param {Number} newPrice - Nuevo precio de venta (SIN IVA)
 * @returns {Object} Producto actualizado
 */
    async updateProductPrice(alegraItemId, newPrice) {
        try {
            console.log(`💰 Actualizando PRECIO DE VENTA del producto ${alegraItemId}: ₡${newPrice} (sin IVA)`);

            // Obtener producto actual para preservar otros datos
            const currentProduct = await this.api.get(`/items/${alegraItemId}`);
            const productData = currentProduct.data;

            //  ACTUALIZAR SOLO EL PRECIO DE VENTA (NO EL COSTO)
            const updateData = {
                name: productData.name,
                reference: productData.reference,
                //  SOLO actualizar price (precio de venta)
                price: [{
                    price: parseFloat(newPrice).toFixed(2),
                    main: true
                }],
                //  MANTENER inventory sin cambios (NO tocar el costo)
                inventory: productData.inventory
            };

            const response = await this.api.put(`/items/${alegraItemId}`, updateData);
            const updatedProduct = response.data;

            console.log(` PRECIO DE VENTA actualizado: ${alegraItemId} → ₡${newPrice} (sin IVA)`);
            return updatedProduct;

        } catch (error) {
            console.error(`❌ Error actualizando PRECIO DE VENTA del producto ${alegraItemId}:`, error.message);
            throw error;
        }
    }

    /**
 *  CORREGIDO: Actualiza SOLO el COSTO de un producto en Alegra (NO el precio de venta)
 * @param {String} alegraItemId - ID del producto en Alegra
 * @param {Number} newCost - Nuevo costo unitario
 * @returns {Object} Producto actualizado
 */
    async updateProductCost(alegraItemId, newCost) {
        try {
            console.log(`💰 Actualizando COSTO del producto ${alegraItemId}: ₡${newCost}`);

            // Obtener producto actual para preservar otros datos
            const currentProduct = await this.api.get(`/items/${alegraItemId}`);
            const productData = currentProduct.data;

            //  ACTUALIZAR SOLO EL COSTO (NO EL PRECIO DE VENTA)
            const updateData = {
                name: productData.name,
                reference: productData.reference,
                //  MANTENER price sin cambios (NO tocar precio de venta)
                price: productData.price,
                //  SOLO actualizar costo en inventory
                inventory: {
                    ...productData.inventory,
                    unitCost: parseFloat(newCost).toFixed(2)
                }
            };

            const response = await this.api.put(`/items/${alegraItemId}`, updateData);
            const updatedProduct = response.data;

            console.log(` COSTO actualizado: ${alegraItemId} → ₡${newCost}`);
            return updatedProduct;

        } catch (error) {
            console.error(`❌ Error actualizando COSTO del producto ${alegraItemId}:`, error.message);
            throw error;
        }
    }

    /**
     * NUEVO: Crea una factura de proveedor (Bills) en Alegra
     * @param {Object} facturaData - Datos de la factura procesada
     * @returns {Object} Factura creada en Alegra
     */
    async createBill(facturaData) {
        try {
            console.log(`📄 Creando factura de proveedor en Alegra: ${facturaData.numeroConsecutivo}`);

            // Buscar o crear proveedor
            let provider = await this.findProviderByCedula(
                facturaData.proveedorCedula,
                facturaData.proveedorNombre
            );

            if (!provider) {
                console.log('👤 Proveedor no encontrado, creando nuevo...');
                provider = await this.createOrUpdateProvider({
                    nombre: facturaData.proveedorNombre,
                    cedula: facturaData.proveedorCedula,
                    email: facturaData.proveedorEmail,
                    telefono: facturaData.proveedorTelefono
                });
            }

            // Preparar fecha (formato YYYY-MM-DD)
            const fechaEmision = new Date(facturaData.fechaEmision).toISOString().split('T')[0];

            // Función que calcula correctamente usando precio original
            function calcularDescuentoPorcentaje(producto) {
                const descuentoTotal = producto.descuento || 0;

                if (descuentoTotal <= 0) {
                    return 0;
                }

                // CORRECCIÓN: Calcular precio original ANTES del descuento
                const totalConDescuento = producto.totalLinea - (producto.impuesto || 0);
                const precioOriginalSinImpuesto = totalConDescuento + descuentoTotal;
                const precioUnitarioOriginal = precioOriginalSinImpuesto / producto.cantidad;
                const descuentoUnitario = descuentoTotal / producto.cantidad;

                const porcentaje = (descuentoUnitario / precioUnitarioOriginal) * 100;

                console.log(`💰 ${producto.descripcion}:`);
                console.log(`💰 Precio original: ₡${precioUnitarioOriginal}`);
                console.log(`💰 Descuento: ₡${descuentoUnitario} = ${porcentaje.toFixed(1)}%`);

                return Math.min(Math.round(porcentaje * 100) / 100, 99);
            }

            // Preparar productos para la factura
            const purchaseItems = facturaData.productos
                .filter(p => p.estadoRelacionado === 'RELACIONADO' && p.alegraItemId)
                .map(producto => {
                    // Calcular precio unitario correcto
                    const totalLinea = producto.totalLinea;
                    const cantidad = producto.cantidad;
                    const impuestoTotal = producto.impuesto || 0;

                    // Calcular porcentaje de impuesto real del producto
                    const subtotalSinImpuesto = totalLinea - impuestoTotal;
                    const porcentajeImpuesto = subtotalSinImpuesto > 0 ? (impuestoTotal / subtotalSinImpuesto) * 100 : 0;

                    // Precio unitario sin impuesto
                    const precioUnitarioSinImpuesto = subtotalSinImpuesto / cantidad;

                    console.log(`🔍 Producto ${producto.descripcion}:`);
                    console.log(`   Total línea: ₡${totalLinea}`);
                    console.log(`   Impuesto total: ₡${impuestoTotal} (${porcentajeImpuesto.toFixed(1)}%)`);
                    console.log(`   Subtotal sin impuesto: ₡${subtotalSinImpuesto}`);
                    console.log(`   Precio unitario sin impuesto: ₡${precioUnitarioSinImpuesto}`);

                    return {
                        id: parseInt(producto.alegraItemId),
                        quantity: producto.cantidad,
                        price: (subtotalSinImpuesto + (producto.descuento || 0)) / producto.cantidad, // ← PRECIO ORIGINAL
                        discount: calcularDescuentoPorcentaje(producto),
                        tax: producto.impuesto ? [{
                            id: 1,
                            value: producto.impuesto
                        }] : []
                    };
                });

            if (purchaseItems.length === 0) {
                throw new Error('No hay productos relacionados para crear la factura');
            }

            // Estructura para Bills API de Alegra
            const billData = {
                date: fechaEmision,
                dueDate: fechaEmision, // Misma fecha por defecto
                observations: `Factura electrónica ${facturaData.numeroConsecutivo} - Procesada automáticamente`,
                termsConditions: 'Compra procesada desde sistema de facturas CR',
                provider: provider.id,

                // Datos de la factura
                numberTemplate: {
                    number: facturaData.numeroConsecutivo
                },

                purchases: {
                    items: purchaseItems
                },

                // Información de Costa Rica
                saleCondition: 'CASH', // Contado por defecto
                paymentMethod: 'CASH', // Efectivo por defecto
                economicActivity: {
                    code: '523402' // Código por defecto para comercio
                }

                // No incluir moneda para usar la predeterminada de la cuenta
            };

            console.log(`📋 Enviando factura con ${purchaseItems.length} productos...`);

            const response = await this.api.post('/bills', billData);
            const bill = response.data;

            console.log(` Factura creada en Alegra: ${bill.id} - ${bill.numberTemplate?.number || bill.reference}`);

            return bill;

        } catch (error) {
            console.error('❌ Error creando factura en Alegra:', error.message);
            if (error.response?.data) {
                console.error('📋 Detalles del error:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }

    /**
     * NUEVO: Procesa una factura completa (actualiza costos + crea factura)
     * @param {Object} facturaCompleta - Factura con productos aprobados
     * @returns {Object} Resultado del procesamiento
     */
    async processCompleteBill(facturaCompleta) {
        try {
            console.log(`🚀 Procesando factura completa: ${facturaCompleta.numeroConsecutivo}`);

            const productosAprobados = facturaCompleta.productos.filter(p =>
                p.estadoRevision === 'APROBADO' && p.alegraItemId
            );

            if (productosAprobados.length === 0) {
                throw new Error('No hay productos aprobados para procesar');
            }

            console.log(`📦 ${productosAprobados.length} productos aprobados para procesar`);

            // 1. Actualizar costos de productos en Alegra
            const costosActualizados = [];
            for (const producto of productosAprobados) {
                try {
                    // Calcular costo real desde la factura
                    const costoUnitario = producto.totalLinea / producto.cantidad;

                    const updatedProduct = await this.updateProductCost(
                        producto.alegraItemId,
                        costoUnitario
                    );

                    costosActualizados.push({
                        alegraItemId: producto.alegraItemId,
                        descripcion: producto.descripcion,
                        costoAnterior: updatedProduct.inventory?.unitCost || 0,
                        costoNuevo: costoUnitario,
                        actualizado: true
                    });

                    // Pausa entre actualizaciones para evitar límites de API
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (error) {
                    console.error(`⚠️ Error actualizando costo del producto ${producto.alegraItemId}:`, error.message);
                    costosActualizados.push({
                        alegraItemId: producto.alegraItemId,
                        descripcion: producto.descripcion,
                        error: error.message,
                        actualizado: false
                    });
                }
            }

            // 2. Crear factura de proveedor en Alegra
            const billCreated = await this.createBill(facturaCompleta);

            // 3. Resultado del procesamiento
            const resultado = {
                facturaId: facturaCompleta.id,
                alegraFacturaId: billCreated.id,
                numeroConsecutivo: facturaCompleta.numeroConsecutivo,
                proveedor: facturaCompleta.proveedorNombre,
                totalProductos: productosAprobados.length,
                costosActualizados: costosActualizados,
                costosExitosos: costosActualizados.filter(c => c.actualizado).length,
                facturaCreada: true,
                fechaProcesamiento: new Date().toISOString()
            };

            console.log(`🎉 Factura procesada exitosamente:`);
            console.log(`   📄 Alegra ID: ${billCreated.id}`);
            console.log(`   💰 Productos: ${resultado.costosExitosos}/${resultado.totalProductos} costos actualizados`);

            return resultado;

        } catch (error) {
            console.error('❌ Error procesando factura completa:', error.message);
            throw error;
        }
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
            console.log(` Producto creado: ${newProduct.id} - ${newProduct.name}`);

            return newProduct;

        } catch (error) {
            console.error('❌ Error creando producto:', error.message);
            throw error;
        }
    }

    /**
     * Crea un gasto (factura de proveedor) en Alegra [DEPRECATED - usar createBill]
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

            console.log(` Gasto creado: ${purchase.id} - ${purchase.reference}`);
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


    /**
     *  MEJORADO: Crea un producto completo en Alegra con todos los campos necesarios
     * @param {Object} productData - Datos del producto del proveedor + datos editados
     * @returns {Object} Producto creado en Alegra
     */
    async createProductComplete(productData) {
        try {
            console.log(`📦 Creando producto completo en Alegra: ${productData.name}`);

            // Mapear unidad de medida del proveedor a formato Alegra
            const mapUnidadMedida = (unidadProveedor) => {
                const mapeo = {
                    'unidad': 'unit',
                    'und': 'unit',
                    'pieza': 'unit',
                    'pza': 'unit',
                    'metro': 'meter',
                    'm': 'meter',
                    'kilogramo': 'kilogram',
                    'kg': 'kilogram',
                    'gramo': 'gram',
                    'g': 'gram',
                    'litro': 'liter',
                    'l': 'liter'
                };

                const unidadLower = (unidadProveedor || '').toLowerCase().trim();
                return mapeo[unidadLower] || 'unit';
            };

            const taxId = this.calculateTaxId(productData);


            // ✅ PAYLOAD CON CAMPOS REALMENTE REQUERIDOS
            const alegraProductData = {
                name: productData.name,
                price: [{
                    price: parseFloat(productData.price || 0).toFixed(2)
                }],
                inventory: {
                    unit: mapUnidadMedida(productData.unidadMedida),
                    unitCost: parseFloat(productData.cost || productData.price || 0),
                    initialQuantity: parseInt(productData.initialQuantity || 0)
                },
                productKey: productData.codigoCabys,      // ← CABYS para Hacienda
                reference: {
                    reference: productData.reference, // ← Código interno
                    type: "4"
                },
                tax: [taxId],
                itemCategory: { id: productData.categoryId }
            };

            console.log('🔍 PAYLOAD CON INVENTORY:', JSON.stringify(alegraProductData, null, 2));

            const response = await this.api.post('/items', alegraProductData);
            const newProduct = response.data;

            console.log(`✅ Producto creado exitosamente: ${newProduct.id} - ${newProduct.name}`);

            return newProduct;

        } catch (error) {
            console.error('❌ Error creando producto en Alegra:', error.message);
            if (error.response?.data) {
                console.error('📋 Detalles del error:', JSON.stringify(error.response.data, null, 2));
            }
            throw error;
        }
    }


    /**
     *  NUEVO: Sube imagen a un producto en Alegra
     * @param {String} alegraItemId - ID del producto en Alegra
     * @param {File|Buffer} imageFile - Archivo de imagen
     * @param {String} fileName - Nombre del archivo (opcional)
     * @returns {Object} Respuesta con URL de la imagen
     */
    async uploadProductImage(alegraItemId, imageFile, fileName = 'producto.jpg') {
        try {
            console.log(`📸 Subiendo imagen al producto ${alegraItemId}...`);

            // Crear FormData para multipart/form-data
            const FormData = require('form-data');
            const formData = new FormData();


            // Agregar imagen al form data
            formData.append('image', imageFile.buffer, {
                filename: fileName,
                contentType: imageFile.mimetype
            });

            const response = await this.api.post(
                `/items/${alegraItemId}/attachment`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    },
                    timeout: 60000
                }
            );

            console.log(`✅ Imagen subida exitosamente: ${response.data.url || 'URL generada'}`);

            return {
                success: true,
                url: response.data.url,
                message: 'Imagen subida correctamente'
            };

        } catch (error) {
            console.error(`❌ Error subiendo imagen al producto ${alegraItemId}:`, error.message);

            return {
                success: false,
                error: error.message,
                message: 'Error subiendo imagen (producto creado sin imagen)'
            };
        }
    }

    /**
     *  MÉTODO PRINCIPAL: Crea producto completo con imagen opcional
     * @param {Object} productDataFromProvider - Datos del producto del proveedor
     * @param {Object} editedData - Datos editados por el usuario
     * @param {File} imageFile - Archivo de imagen (opcional)
     * @returns {Object} Resultado completo del proceso
     */
    async createProductWithImage(productDataFromProvider, editedData = {}, imageFile = null) {
        try {
            console.log(`🚀 Iniciando creación completa del producto: ${editedData.name || productDataFromProvider.descripcion}`);

            //  1. Combinar datos del proveedor con ediciones del usuario
            const productData = {
                // ✅ EMPEZAR CON EDITEDDATA
                ...editedData,

                // ✅ FORZAR CAMPOS CRÍTICOS DEL PROVEEDOR (después del spread)
                descuento: productDataFromProvider.descuento,
                impuesto: productDataFromProvider.impuesto,
                cantidad: productDataFromProvider.cantidad,
                totalLinea: productDataFromProvider.totalLinea,
                precioUnitario: productDataFromProvider.precioUnitario,
                descripcion: productDataFromProvider.descripcion,
                codigoProveedor: productDataFromProvider.codigoProveedor,
                codigoCabys: productDataFromProvider.codigoCabys,
                unidadMedida: productDataFromProvider.unidadMedida
            };

            //  2. Crear producto en Alegra
            const newProduct = await this.createProductComplete(productData);

            //  3. Subir imagen si se proporcionó
            let imageResult = null;
            if (imageFile && newProduct.id) {
                imageResult = await this.uploadProductImage(newProduct.id, imageFile);
            }

            //  4. Actualizar caché local de productos
            try {
                await this.prisma.alegraProduct.create({
                    data: {
                        alegraId: newProduct.id,
                        name: newProduct.name,
                        reference: productData.reference || '',
                        description: productData.description || '',
                        category: '',
                        price: parseFloat(productData.price || 0),
                        cost: parseFloat(productData.cost || 0),
                        status: 'active',
                        type: 'product',
                        searchText: `${newProduct.name} ${productData.reference || ''} ${productData.description || ''}`.toLowerCase()
                    }
                });
                console.log('✅ Producto agregado al caché local');
            } catch (cacheError) {
                console.warn('⚠️ Error actualizando caché local:', cacheError.message);
            }

            const resultado = {
                success: true,
                product: newProduct,
                alegraId: newProduct.id,
                name: newProduct.name,
                hasImage: imageResult?.success || false,
                imageUrl: imageResult?.url || null,
                imageError: imageResult?.success ? null : imageResult?.error,
                message: `Producto "${newProduct.name}" creado exitosamente${imageResult?.success ? ' con imagen' : ''}`
            };

            console.log(`🎉 Producto creado completamente:`, resultado);
            return resultado;

        } catch (error) {
            console.error('❌ Error en creación completa del producto:', error.message);

            return {
                success: false,
                error: error.message,
                message: 'Error creando el producto'
            };
        }
    }


}

module.exports = AlegraService;