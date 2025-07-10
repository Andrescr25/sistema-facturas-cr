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
                console.log(`✅ Proveedor encontrado por cédula: ${provider.id} - ${provider.name}`);
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
                console.log(`✅ Proveedor encontrado por nombre: ${provider.id} - ${provider.name}`);
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

            console.log(`✅ Proveedor creado: ${provider.id} - ${provider.name}`);
            return provider;

        } catch (error) {
            // Si el error es que ya existe, extraer los datos del error
            if (error.response?.status === 400 && error.response?.data?.code === 2006) {
                const existingProvider = {
                    id: error.response.data.contactId,
                    name: error.response.data.contactName,
                    identification: error.response.data.contactIdentification
                };

                console.log(`✅ Proveedor ya existe: ${existingProvider.id} - ${existingProvider.name}`);
                return existingProvider;
            }

            console.error('❌ Error creando proveedor:', error.message);
            throw error;
        }
    }

    /**
     * NUEVO: Actualiza el costo de un producto en Alegra
     * @param {String} alegraItemId - ID del producto en Alegra
     * @param {Number} newCost - Nuevo costo unitario
     * @returns {Object} Producto actualizado
     */
    async updateProductCost(alegraItemId, newCost) {
        try {
            console.log(`💰 Actualizando costo del producto ${alegraItemId}: ₡${newCost}`);

            // Obtener producto actual para preservar otros datos
            const currentProduct = await this.api.get(`/items/${alegraItemId}`);
            const productData = currentProduct.data;

            // Actualizar solo el costo en el inventario
            const updateData = {
                name: productData.name,
                reference: productData.reference || {},
                inventory: {
                    ...productData.inventory,
                    unitCost: newCost
                }
            };

            const response = await this.api.put(`/items/${alegraItemId}`, updateData);
            const updatedProduct = response.data;

            console.log(`✅ Costo actualizado: ${alegraItemId} → ₡${newCost}`);
            return updatedProduct;

        } catch (error) {
            console.error(`❌ Error actualizando costo del producto ${alegraItemId}:`, error.message);
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
                        price: precioUnitarioSinImpuesto, // ← PRECIO UNITARIO SIN IMPUESTO
                        discount: producto.descuento || 0,
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

            console.log(`✅ Factura creada en Alegra: ${bill.id} - ${bill.numberTemplate?.number || bill.reference}`);

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
            console.log(`✅ Producto creado: ${newProduct.id} - ${newProduct.name}`);

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