require('dotenv').config();
const express = require('express');
const path = require('path');
const DatabaseService = require('./services/databaseService');
const AlegraService = require('./services/alegraService');

const app = express();
const PORT = process.env.WEB_PORT || 3001;

// Servicios
const dbService = new DatabaseService();
const alegraService = new AlegraService();

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// CORS para desarrollo
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    next();
});

/**
 * RUTAS PRINCIPALES
 */

// Dashboard principal
app.get('/', (req, res) => {
    res.redirect('/relacionar.html');
});

/**
 * API ENDPOINTS
 */

// Obtener estadísticas del dashboard
app.get('/api/dashboard', async (req, res) => {
    try {
        console.log('📊 Obteniendo estadísticas del dashboard...');

        const stats = await dbService.getEstadisticas();

        // Obtener facturas recientes
        const facturasRecientes = await dbService.prisma.factura.findMany({
            orderBy: { fechaProcesada: 'desc' },
            take: 5,
            include: {
                productos: {
                    include: {
                        mapeo: true
                    }
                }
            }
        });

        // Calcular resumen por factura
        const facturasConResumen = facturasRecientes.map(factura => {
            const totalProductos = factura.productos.length;
            const productosRelacionados = factura.productos.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
            const productosPendientes = factura.productos.filter(p => p.estadoRelacionado === 'PENDIENTE').length;

            return {
                ...factura,
                resumen: {
                    totalProductos,
                    productosRelacionados,
                    productosPendientes,
                    porcentajeCompletado: Math.round((productosRelacionados / totalProductos) * 100)
                }
            };
        });

        res.json({
            success: true,
            stats: {
                ...stats,
                facturasRecientes: facturasConResumen
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo estadísticas del dashboard'
        });
    }
});

// Obtener productos pendientes de confirmación
app.get('/api/productos-pendientes', async (req, res) => {
    try {
        console.log('📦 Obteniendo productos pendientes...');

        // Buscar productos pendientes con sugerencias
        const productosPendientes = await dbService.prisma.productoFactura.findMany({
            where: {
                estadoRelacionado: 'PENDIENTE'
            },
            include: {
                factura: true
            },
            orderBy: {
                factura: {
                    fechaProcesada: 'desc'
                }
            }
        });

        // Para cada producto pendiente, buscar sugerencias
        const productosConSugerencias = [];

        for (const producto of productosPendientes) {
            // Buscar productos similares en Alegra
            const similares = await alegraService.findSimilarProducts(
                producto.descripcion,
                producto.codigoProveedor
            );

            // Filtrar solo los que tienen confianza >= 40%
            const sugerencias = similares.filter(s => s.similarityScore >= 40)
                .slice(0, 3); // Máximo 3 sugerencias

            if (sugerencias.length > 0) {
                productosConSugerencias.push({
                    ...producto,
                    sugerencias: sugerencias
                });
            }
        }

        res.json({
            success: true,
            productos: productosConSugerencias,
            total: productosConSugerencias.length
        });

    } catch (error) {
        console.error('❌ Error obteniendo productos pendientes:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo productos pendientes'
        });
    }
});

// Confirmar relación de producto
app.post('/api/confirmar-producto', async (req, res) => {
    try {
        const { productoId, alegraItemId, confianza } = req.body;

        console.log(`✅ Confirmando producto: ${productoId} → ${alegraItemId}`);

        // Obtener información del producto y factura
        const producto = await dbService.prisma.productoFactura.findUnique({
            where: { id: productoId },
            include: { factura: true }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // CAMBIO: Obtener producto directamente de Alegra API
        let alegraProduct;
        try {
            const response = await alegraService.api.get(`/items/${alegraItemId}`);
            alegraProduct = {
                alegraId: response.data.id,
                name: response.data.name,
                reference: response.data.reference?.reference || response.data.reference || '',
                price: response.data.price?.[0]?.price || 0
            };
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'Producto de Alegra no encontrado en API'
            });
        }

        // Crear mapeo (el sistema aprende)
        const mapeoData = {
            supplierName: producto.factura.proveedorNombre,
            supplierCedula: producto.factura.proveedorCedula,
            supplierCode: producto.codigoProveedor,
            supplierDesc: producto.descripcion,
            alegraItemId: alegraProduct.alegraId,
            alegraReference: alegraProduct.reference,
            alegraName: alegraProduct.name,
            confidence: confianza || 100,
            createdBy: 'manual'
        };

        const mapeo = await dbService.createProductMapping(mapeoData);

        // Actualizar producto con la relación
        await dbService.updateProductMapping(
            productoId,
            alegraItemId,
            mapeo.id,
            confianza || 100
        );

        console.log(`✅ Producto confirmado y mapeo creado: ${producto.descripcion} → ${alegraProduct.name}`);

        res.json({
            success: true,
            message: 'Producto confirmado exitosamente',
            mapeo: mapeo
        });

    } catch (error) {
        console.error('❌ Error confirmando producto:', error);
        res.status(500).json({
            success: false,
            error: 'Error confirmando producto'
        });
    }
});

// Ajustar cantidad y precio de producto
app.post('/api/ajustar-producto', async (req, res) => {
    try {
        const { productoId, nuevaCantidad, nuevoPrecio } = req.body;

        console.log(`⚙️ Ajustando producto: ${productoId} → ${nuevaCantidad} × ₡${nuevoPrecio}`);

        // Actualizar el producto en la base de datos
        const productoActualizado = await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                cantidad: nuevaCantidad,
                precioUnitario: nuevoPrecio,
                totalLinea: nuevaCantidad * nuevoPrecio
            }
        });

        console.log(`✅ Producto ajustado: ${productoActualizado.descripcion}`);

        res.json({
            success: true,
            message: 'Producto ajustado exitosamente',
            producto: productoActualizado
        });

    } catch (error) {
        console.error('❌ Error ajustando producto:', error);
        res.status(500).json({
            success: false,
            error: 'Error ajustando producto'
        });
    }
});


// Rechazar sugerencia de producto
app.post('/api/rechazar-producto', async (req, res) => {
    try {
        const { productoId, accion } = req.body;

        const nuevoEstado = accion === 'reactivar' ? 'PENDIENTE' : 'IGNORADO';
        const mensaje = accion === 'reactivar' ? 'Producto reactivado' : 'Producto marcado como ignorado';

        console.log(`🔄 Actualizando estado de producto: ${productoId} → ${nuevoEstado}`);

        await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: { estadoRelacionado: nuevoEstado }
        });

        res.json({
            success: true,
            message: mensaje
        });

    } catch (error) {
        console.error('❌ Error actualizando producto:', error);
        res.status(500).json({
            success: false,
            error: 'Error actualizando producto'
        });
    }
});

// Obtener facturas por estado
app.get('/api/facturas/:estado?', async (req, res) => {
    try {
        const estado = req.params.estado || 'PROCESADA';

        console.log(`📄 Obteniendo facturas con estado: ${estado}`);

        const facturas = await dbService.getFacturasByEstado(estado);

        res.json({
            success: true,
            facturas: facturas,
            total: facturas.length
        });

    } catch (error) {
        console.error('❌ Error obteniendo facturas:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo facturas'
        });
    }
});

// Actualizar estado de factura cuando esté 100% relacionada
app.put('/api/factura/:id/actualizar-estado', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🔄 Verificando estado de factura: ${id}`);

        // Obtener factura con productos
        const factura = await dbService.prisma.factura.findUnique({
            where: { id: id },
            include: { productos: true }
        });

        if (!factura) {
            return res.status(404).json({
                success: false,
                error: 'Factura no encontrada'
            });
        }

        // Calcular progreso
        const totalProductos = factura.productos.length;
        const productosRelacionados = factura.productos.filter(p =>
            p.estadoRelacionado === 'RELACIONADO'
        ).length;

        const porcentajeRelacionado = totalProductos > 0 ?
            Math.round((productosRelacionados / totalProductos) * 100) : 0;

        let nuevoEstado = factura.estado;

        // Determinar nuevo estado
        if (porcentajeRelacionado === 100 && factura.estado === 'PROCESADA') {
            nuevoEstado = 'RELACIONADA';
        }

        // Actualizar estado si cambió
        if (nuevoEstado !== factura.estado) {
            await dbService.prisma.factura.update({
                where: { id: id },
                data: { estado: nuevoEstado }
            });

            console.log(`✅ Estado actualizado: ${factura.estado} → ${nuevoEstado}`);
        }

        res.json({
            success: true,
            estadoAnterior: factura.estado,
            estadoNuevo: nuevoEstado,
            porcentajeRelacionado: porcentajeRelacionado
        });

    } catch (error) {
        console.error('❌ Error actualizando estado:', error);
        res.status(500).json({
            success: false,
            error: 'Error actualizando estado de factura'
        });
    }
});

// =================== NUEVOS ENDPOINTS DE BÚSQUEDA =================== //

// Buscar productos en Alegra (búsqueda manual)
app.get('/api/buscar-productos', async (req, res) => {
    try {
        const termino = req.query.q;

        if (!termino || termino.trim().length < 2) {
            return res.json({
                success: false,
                error: 'Término de búsqueda debe tener al menos 2 caracteres'
            });
        }

        console.log(`🔍 Búsqueda directa en Alegra: "${termino}"`);

        // Buscar directamente en API de Alegra
        const response = await alegraService.api.get('/items', {
            params: {
                name: termino.trim(),
                limit: 20
            }
        });

        const productos = response.data || [];

        // Calcular relevancia de cada resultado
        const productosConRelevancia = productos.map(producto => {
            let relevancia = 0;
            const terminoLower = termino.toLowerCase();
            const nombreLower = producto.name.toLowerCase();
            const referenceLower = (producto.reference?.reference || producto.reference || '').toLowerCase();

            // Coincidencia exacta en nombre = 100 puntos
            if (nombreLower === terminoLower) {
                relevancia += 100;
            }
            // Coincidencia al inicio del nombre = 50 puntos
            else if (nombreLower.startsWith(terminoLower)) {
                relevancia += 50;
            }
            // Coincidencia en cualquier parte del nombre = 20 puntos
            else if (nombreLower.includes(terminoLower)) {
                relevancia += 20;
            }

            // Coincidencia en referencia = 30 puntos
            if (referenceLower.includes(terminoLower)) {
                relevancia += 30;
            }

            // Bonus por productos con precio y costo
            if (producto.price && producto.price.length > 0) relevancia += 5;
            if (producto.inventory?.unitCost > 0) relevancia += 5;

            return {
                ...producto,
                relevancia,
                // Normalizar datos para compatibilidad
                alegraId: producto.id,
                name: producto.name,
                reference: producto.reference?.reference || producto.reference || '',
                price: producto.price?.[0]?.price || 0,
                cost: producto.inventory?.unitCost || 0
            };
        });

        // Ordenar por relevancia
        const productosOrdenados = productosConRelevancia
            .sort((a, b) => b.relevancia - a.relevancia)
            .slice(0, 15); // Top 15 resultados

        console.log(`✅ ${productosOrdenados.length} productos encontrados en Alegra para "${termino}"`);

        res.json({
            success: true,
            productos: productosOrdenados,
            total: productosOrdenados.length,
            termino: termino
        });

    } catch (error) {
        console.error('❌ Error buscando en Alegra:', error);
        res.status(500).json({
            success: false,
            error: 'Error buscando productos en Alegra'
        });
    }
});

// Obtener detalles específicos de un producto de Alegra
app.get('/api/producto-alegra/:alegraId', async (req, res) => {
    try {
        const { alegraId } = req.params;

        console.log(`📦 Obteniendo detalles del producto: ${alegraId}`);

        const producto = await dbService.prisma.alegraProduct.findUnique({
            where: { alegraId: alegraId }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            producto: producto,
            // Datos adicionales para precios (compatibilidad)
            precio: producto.price || 0,
            costo: producto.cost || 0,
            nombre: producto.name,
            referencia: producto.reference,
            categoria: producto.category,
            descripcion: producto.description
        });

    } catch (error) {
        console.error('❌ Error obteniendo producto:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo detalles del producto'
        });
    }
});

// =================== ENVÍO A ALEGRA =================== //

// NUEVO: Enviar factura completa a Alegra
app.post('/api/enviar-alegra', async (req, res) => {
    try {
        const { facturaId } = req.body;

        console.log(`🚀 Iniciando envío a Alegra de factura: ${facturaId}`);

        // Obtener factura con productos
        const factura = await dbService.prisma.factura.findUnique({
            where: { id: facturaId },
            include: {
                productos: {
                    include: {
                        mapeo: true
                    }
                }
            }
        });

        if (!factura) {
            return res.status(404).json({
                success: false,
                error: 'Factura no encontrada'
            });
        }

        // Verificar que esté 100% relacionada
        const total = factura.productos.length;
        const relacionados = factura.productos.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
        
        if (relacionados !== total) {
            return res.status(400).json({
                success: false,
                error: 'La factura debe estar 100% relacionada antes del envío'
            });
        }

        // Simular productos aprobados (todos los relacionados)
        factura.productos.forEach(p => p.estadoRevision = 'APROBADO');

        // Procesar factura completa en Alegra
        const resultado = await alegraService.processCompleteBill(factura);

        // Actualizar estado de la factura a ENVIADA
        await dbService.prisma.factura.update({
            where: { id: facturaId },
            data: { estado: 'ENVIADA' }
        });

        console.log(`✅ Factura enviada exitosamente a Alegra: ${resultado.alegraFacturaId}`);

        res.json({
            success: true,
            message: 'Factura enviada exitosamente a Alegra',
            resultado: resultado
        });

    } catch (error) {
        console.error('❌ Error enviando factura a Alegra:', error);
        res.status(500).json({
            success: false,
            error: `Error enviando a Alegra: ${error.message}`
        });
    }
});

/**
 * MANEJO DE ERRORES
 */
app.use((err, req, res, next) => {
    console.error('❌ Error del servidor:', err);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

// Ruta 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Ruta no encontrada'
    });
});

/**
 * INICIAR SERVIDOR
 */
async function startWebServer() {
    try {
        console.log('🌐 Iniciando servidor web para papá...');

        app.listen(PORT, () => {
            console.log(`✅ Servidor web iniciado en puerto ${PORT}`);
            console.log(`🌐 Dashboard disponible en: http://localhost:${PORT}`);
            console.log('📋 Rutas disponibles:');
            console.log('   - GET /              - Dashboard principal');
            console.log('   - GET /api/dashboard - Estadísticas');
            console.log('   - GET /api/productos-pendientes - Productos para confirmar');
            console.log('   - POST /api/confirmar-producto - Confirmar relación');
            console.log('   - POST /api/rechazar-producto - Rechazar sugerencia');
            console.log('   - GET /api/facturas/:estado - Facturas por estado');
            console.log('   - PUT /api/factura/:id/actualizar-estado - Actualizar estado de factura');
            console.log('   - GET /api/buscar-productos?q=termino - Búsqueda manual de productos');
            console.log('   - GET /api/producto-alegra/:id - Detalles y precio de producto');
            console.log('   - POST /api/enviar-alegra - Enviar factura completa a Alegra');
        });

    } catch (error) {
        console.error('❌ Error iniciando servidor web:', error);
        process.exit(1);
    }
}

// Manejo de cierre
process.on('SIGINT', async () => {
    console.log('\n🔌 Cerrando servidor web...');
    await dbService.disconnect();
    await alegraService.disconnect();
    process.exit(0);
});

// Iniciar servidor
startWebServer();