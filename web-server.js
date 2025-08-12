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
    res.redirect('/facturas.html');
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

// Desconectar/rechazar relación de producto
app.post('/api/rechazar-producto', async (req, res) => {
    try {
        const { productoId, accion } = req.body;

        console.log(`🔄 Desconectando producto: ${productoId}`);

        // Obtener información del producto
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

        // Actualizar producto para desconectarlo
        const productoActualizado = await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                alegraItemId: null,        // Quitar relación con Alegra
                estadoRelacionado: 'PENDIENTE',  // Volver a pendiente
                confianza: null,           // Quitar confianza
                mapeoId: null             // Quitar mapeo
            }
        });

        console.log(`✅ Producto desconectado: ${producto.descripcion}`);

        res.json({
            success: true,
            message: 'Producto desconectado exitosamente',
            producto: productoActualizado
        });

    } catch (error) {
        console.error('❌ Error desconectando producto:', error);
        res.status(500).json({
            success: false,
            error: 'Error desconectando producto'
        });
    }
});

// ✅ NUEVO: Endpoint específico para actualizar PRECIO DE VENTA
app.post('/api/actualizar-precio-venta', async (req, res) => {
    try {
        const { productoId, nuevoPrecioVenta, alegraItemId } = req.body;

        console.log(`💰 Actualizando precio de venta: ${productoId} → ₡${nuevoPrecioVenta}`);

        // Si hay alegraItemId, actualizar precio de venta en Alegra
        if (alegraItemId) {
            try {
                // Obtener producto de BD para calcular impuesto real
                const productoBD = await dbService.prisma.productoFactura.findUnique({
                    where: { id: productoId }
                });

                if (!productoBD) {
                    throw new Error('Producto no encontrado en BD');
                }

                // Calcular porcentaje de impuesto real del producto
                const impuestoTotal = productoBD.impuesto || 0;
                const totalSinImpuesto = productoBD.totalLinea - impuestoTotal;
                const porcentajeImpuesto = totalSinImpuesto > 0 ? (impuestoTotal / totalSinImpuesto) * 100 : 0;

                // Calcular precio sin IVA usando el porcentaje REAL
                const precioConIVA = nuevoPrecioVenta;
                const factorIVA = 1 + (porcentajeImpuesto / 100);
                const precioSinIVA = precioConIVA / factorIVA;

                console.log(`📊 Actualizando PRECIO DE VENTA en Alegra:`);
                console.log(`📊 Precio con IVA: ₡${precioConIVA} → Precio sin IVA: ₡${precioSinIVA.toFixed(2)}`);
                console.log(`📊 Impuesto real: ${porcentajeImpuesto.toFixed(1)}%`);

                // ✅ CAMBIO: Usar método específico para precio de venta
                await alegraService.updateProductPrice(alegraItemId, precioSinIVA);

                console.log(`✅ Precio de venta actualizado en Alegra: ${alegraItemId}`);

            } catch (alegraError) {
                console.error('❌ Error actualizando precio en Alegra:', alegraError);
                // Continuar para actualizar BD local aunque falle Alegra
            }
        }

        // Actualizar SOLO el precio en la base de datos (NO cantidad ni costo)
        const productoActualizado = await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                precioUnitario: nuevoPrecioVenta  // Solo precio, NO cantidad ni totalLinea
            }
        });

        console.log(`✅ Precio de venta actualizado en BD: ${productoActualizado.descripcion}`);

        res.json({
            success: true,
            message: 'Precio de venta actualizado exitosamente',
            precioAnterior: productoActualizado.precioUnitario,
            precioNuevo: nuevoPrecioVenta,
            producto: productoActualizado
        });

    } catch (error) {
        console.error('❌ Error actualizando precio de venta:', error);
        res.status(500).json({
            success: false,
            error: 'Error actualizando precio de venta'
        });
    }
});

// Ajustar cantidad y precio de producto
app.post('/api/ajustar-producto', async (req, res) => {
    try {
        const { productoId, nuevaCantidad, nuevoPrecio, alegraItemId } = req.body;

        console.log(`⚙️ Ajustando producto: ${productoId} → ${nuevaCantidad} × ₡${nuevoPrecio}`);

        // ✅ OBTENER producto actual para calcular totalLinea correctamente
        const productoActual = await dbService.prisma.productoFactura.findUnique({
            where: { id: productoId }
        });

        if (!productoActual) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // ✅ CALCULAR nuevos valores
        const cantidadFinal = nuevaCantidad || productoActual.cantidad;
        const precioFinal = nuevoPrecio || productoActual.precioUnitario;
        const totalLineaFinal = cantidadFinal * precioFinal;

        // ✅ SI SOLO se actualiza cantidad (NO precio), no tocar Alegra
        const soloActualizaCantidad = nuevaCantidad && !nuevoPrecio;
        
        // ✅ SI se actualiza precio Y hay alegraItemId, actualizar precio en Alegra
        if (nuevoPrecio && alegraItemId) {
            try {
                console.log(`💰 Actualizando PRECIO DE VENTA en Alegra: ${alegraItemId}`);

                // CALCULAR porcentaje de impuesto real del producto
                const impuestoTotal = productoActual.impuesto || 0;
                const totalSinImpuesto = productoActual.totalLinea - impuestoTotal;
                const porcentajeImpuesto = totalSinImpuesto > 0 ? (impuestoTotal / totalSinImpuesto) * 100 : 0;

                // Calcular precio sin IVA usando el porcentaje REAL
                const precioConIVA = nuevoPrecio;
                const factorIVA = 1 + (porcentajeImpuesto / 100);
                const precioSinIVA = precioConIVA / factorIVA;

                console.log(`📊 Producto tiene ${porcentajeImpuesto.toFixed(1)}% de impuesto`);
                console.log(`📊 Precio con IVA: ₡${precioConIVA} → Precio sin IVA: ₡${precioSinIVA.toFixed(2)}`);

                // ✅ USAR método específico para actualizar precio de venta
                await alegraService.updateProductPrice(alegraItemId, precioSinIVA);

                console.log(`✅ PRECIO DE VENTA actualizado en Alegra: ${alegraItemId} → ₡${precioSinIVA.toFixed(2)}`);
                
            } catch (alegraError) {
                console.error('❌ Error actualizando precio en Alegra:', alegraError);
                // ✅ CONTINUAR aunque falle Alegra (actualizar BD local)
            }
        }

        // ✅ ACTUALIZAR producto en la base de datos (solo campos que cambiaron)
        const datosActualizacion = {};
        
        if (nuevaCantidad) {
            datosActualizacion.cantidad = cantidadFinal;
        }
        
        if (nuevoPrecio) {
            datosActualizacion.precioUnitario = precioFinal;
        }
        
        // ✅ RECALCULAR totalLinea solo si cambió cantidad o precio
        if (nuevaCantidad || nuevoPrecio) {
            datosActualizacion.totalLinea = totalLineaFinal;
        }

        const productoActualizado = await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: datosActualizacion
        });

        console.log(`✅ Producto ajustado en BD: ${productoActualizado.descripcion}`);
        console.log(`   📊 Cantidad: ${productoActual.cantidad} → ${productoActualizado.cantidad}`);
        console.log(`   💰 Precio: ₡${productoActual.precioUnitario} → ₡${productoActualizado.precioUnitario}`);
        console.log(`   📋 Total línea: ₡${productoActual.totalLinea} → ₡${productoActualizado.totalLinea}`);

        res.json({
            success: true,
            message: 'Producto ajustado exitosamente',
            cambios: {
                cantidadAnterior: productoActual.cantidad,
                cantidadNueva: productoActualizado.cantidad,
                precioAnterior: productoActual.precioUnitario,
                precioNuevo: productoActualizado.precioUnitario,
                totalAnterior: productoActual.totalLinea,
                totalNuevo: productoActualizado.totalLinea,
                actualizoAlegra: !!(nuevoPrecio && alegraItemId)
            },
            producto: productoActualizado
        });

    } catch (error) {
        console.error('❌ Error ajustando producto:', error);
        res.status(500).json({
            success: false,
            error: 'Error ajustando producto: ' + error.message
        });
    }
});

// =================== GESTIÓN DE PRODUCTOS RELACIONADOS =================== //

// Obtener todos los productos relacionados con filtros
app.get('/api/productos-relacionados', async (req, res) => {
    try {
        const { proveedor, estado, confianza, busqueda, page = 1, limit = 20 } = req.query;

        console.log('📊 Obteniendo productos relacionados...');

        // Construir filtros
        const filtros = {};
        
        if (proveedor) {
            filtros.factura = {
                proveedorNombre: {
                    contains: proveedor,
                    mode: 'insensitive'
                }
            };
        }

        if (estado && estado !== 'TODOS') {
            filtros.estadoRelacionado = estado;
        }

        if (confianza) {
            const [min, max] = confianza.split('-').map(Number);
            filtros.confianza = {
                gte: min,
                lte: max || 100
            };
        }

        if (busqueda) {
            filtros.OR = [
                {
                    descripcion: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                },
                {
                    codigoProveedor: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        // Obtener productos con paginación
        const skip = (page - 1) * limit;
        
        const [productos, total] = await Promise.all([
            dbService.prisma.productoFactura.findMany({
                where: filtros,
                include: {
                    factura: true,
                    mapeo: true
                },
                orderBy: [
                    { estadoRelacionado: 'desc' },
                    { confianza: 'desc' },
                    { factura: { fechaProcesada: 'desc' } }
                ],
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            dbService.prisma.productoFactura.count({ where: filtros })
        ]);

        // ✅ SIMPLIFICADO: NO llamar API Alegra para mostrar datos
        const productosEnriquecidos = productos.map(producto => {
            // Usar datos del MAPEO (que ya están en BD)
            let alegraInfo = null;
            
            if (producto.estadoRelacionado === 'RELACIONADO' && producto.mapeo) {
                alegraInfo = {
                    alegraId: producto.alegraItemId,
                    name: producto.mapeo.alegraName,           // ✅ DESDE BD
                    reference: producto.mapeo.alegraReference, // ✅ DESDE BD  
                    price: 0, // No necesario para visualizar
                    cost: 0   // No necesario para visualizar
                };
            }

            return {
                ...producto,
                alegraInfo: alegraInfo
            };
        });

        // Calcular estadísticas
        const estadisticas = await calcularEstadisticasRelaciones();

        res.json({
            success: true,
            productos: productosEnriquecidos,
            total: total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
            estadisticas: estadisticas
        });

    } catch (error) {
        console.error('❌ Error obteniendo productos relacionados:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo productos relacionados'
        });
    }
});

// Editar relación existente
app.put('/api/relacion/:productoId/editar', async (req, res) => {
    try {
        const { productoId } = req.params;
        const { nuevoAlegraItemId, motivo } = req.body;

        console.log(`✏️ Editando relación del producto: ${productoId} → ${nuevoAlegraItemId}`);

        // Obtener producto actual
        const producto = await dbService.prisma.productoFactura.findUnique({
            where: { id: productoId },
            include: { factura: true, mapeo: true }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // Obtener información del nuevo producto de Alegra
        let nuevoAlegraProduct;
        try {
            const response = await alegraService.api.get(`/items/${nuevoAlegraItemId}`);
            nuevoAlegraProduct = {
                alegraId: response.data.id,
                name: response.data.name,
                reference: response.data.reference?.reference || response.data.reference || '',
                price: response.data.price?.[0]?.price || 0
            };
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'Nuevo producto de Alegra no encontrado'
            });
        }

        // Crear nuevo mapeo
        const nuevoMapeoData = {
            supplierName: producto.factura.proveedorNombre,
            supplierCedula: producto.factura.proveedorCedula,
            supplierCode: producto.codigoProveedor,
            supplierDesc: producto.descripcion,
            alegraItemId: nuevoAlegraProduct.alegraId,
            alegraReference: nuevoAlegraProduct.reference,
            alegraName: nuevoAlegraProduct.name,
            confidence: 100, // Manual = 100% confianza
            createdBy: 'manual_edit'
        };

        const nuevoMapeo = await dbService.createProductMapping(nuevoMapeoData);

        // Actualizar producto
        const productoActualizado = await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                alegraItemId: nuevoAlegraItemId,
                estadoRelacionado: 'RELACIONADO',
                confianza: 100,
                mapeoId: nuevoMapeo.id
            }
        });

        // Registrar el cambio en historial
        await registrarCambioRelacion(productoId, {
            accion: 'EDITAR',
            alegraAnterior: producto.alegraItemId,
            alegraNuevo: nuevoAlegraItemId,
            motivo: motivo || 'Edición manual',
            fecha: new Date()
        });

        console.log(`✅ Relación editada: ${producto.descripcion} → ${nuevoAlegraProduct.name}`);

        res.json({
            success: true,
            message: 'Relación editada exitosamente',
            producto: productoActualizado,
            nuevoMapeo: nuevoMapeo
        });

    } catch (error) {
        console.error('❌ Error editando relación:', error);
        res.status(500).json({
            success: false,
            error: 'Error editando relación'
        });
    }
});

// Eliminar relación (volver a pendiente)
app.delete('/api/relacion/:productoId', async (req, res) => {
    try {
        const { productoId } = req.params;
        const { motivo } = req.body;

        console.log(`🗑️ Eliminando relación del producto: ${productoId}`);

        // Obtener producto actual
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

        const alegraAnterior = producto.alegraItemId;

        // Actualizar producto para quitar relación
        const productoActualizado = await dbService.prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                alegraItemId: null,
                estadoRelacionado: 'PENDIENTE',
                confianza: null,
                mapeoId: null
            }
        });

        // Registrar el cambio en historial
        await registrarCambioRelacion(productoId, {
            accion: 'ELIMINAR',
            alegraAnterior: alegraAnterior,
            alegraNuevo: null,
            motivo: motivo || 'Eliminación manual',
            fecha: new Date()
        });

        console.log(`✅ Relación eliminada: ${producto.descripcion}`);

        res.json({
            success: true,
            message: 'Relación eliminada exitosamente',
            producto: productoActualizado
        });

    } catch (error) {
        console.error('❌ Error eliminando relación:', error);
        res.status(500).json({
            success: false,
            error: 'Error eliminando relación'
        });
    }
});

// Obtener historial de cambios de un producto
app.get('/api/relacion/:productoId/historial', async (req, res) => {
    try {
        const { productoId } = req.params;

        // Por ahora simulamos el historial (puedes implementar una tabla de auditoría después)
        const historial = await obtenerHistorialRelacion(productoId);

        res.json({
            success: true,
            historial: historial
        });

    } catch (error) {
        console.error('❌ Error obteniendo historial:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo historial de relación'
        });
    }
});

// =================== FUNCIONES AUXILIARES =================== //

async function calcularEstadisticasRelaciones() {
    try {
        const [
            totalProductos,
            relacionados,
            pendientes,
            ignorados,
            porProveedor,
            porConfianza
        ] = await Promise.all([
            dbService.prisma.productoFactura.count(),
            dbService.prisma.productoFactura.count({ where: { estadoRelacionado: 'RELACIONADO' } }),
            dbService.prisma.productoFactura.count({ where: { estadoRelacionado: 'PENDIENTE' } }),
            dbService.prisma.productoFactura.count({ where: { estadoRelacionado: 'IGNORADO' } }),
            // ✅ ARREGLADO: Sin include, solo groupBy básico
            dbService.prisma.productoFactura.groupBy({
                by: ['facturaId'],
                _count: { id: true },
                take: 10
            }),
            dbService.prisma.productoFactura.groupBy({
                by: ['confianza'],
                _count: { id: true },
                where: { confianza: { not: null } },
            })
        ]);

        return {
            totales: {
                total: totalProductos,
                relacionados,
                pendientes,
                ignorados,
                porcentajeRelacionado: totalProductos > 0 ? Math.round((relacionados / totalProductos) * 100) : 0
            },
            porProveedor: porProveedor.slice(0, 5), // Top 5 proveedores
            porConfianza: porConfianza
        };

    } catch (error) {
        console.error('Error calculando estadísticas:', error);
        return {
            totales: { total: 0, relacionados: 0, pendientes: 0, ignorados: 0, porcentajeRelacionado: 0 },
            porProveedor: [],
            porConfianza: []
        };
    }
}

async function registrarCambioRelacion(productoId, cambio) {
    // Por ahora solo logueamos, después puedes crear una tabla de auditoría
    console.log(`📝 Historial de cambio: ${productoId}`, cambio);
    
    // TODO: Implementar tabla de auditoría si necesitas historial persistente
    // await dbService.prisma.historialRelacion.create({
    //     data: {
    //         productoId,
    //         ...cambio
    //     }
    // });
}

async function obtenerHistorialRelacion(productoId) {
    // Por ahora devolvemos historial simulado
    // TODO: Implementar consulta real cuando tengas tabla de auditoría
    
    return [
        {
            id: '1',
            fecha: new Date(),
            accion: 'CREAR',
            descripcion: 'Relación creada automáticamente',
            usuario: 'sistema'
        }
    ];
}

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

        console.log(`🔍 Búsqueda única: "${termino}"`);

        // ✅ UNA SOLA CONSULTA QUE BUSCA EN AMBOS CAMPOS
        const response = await alegraService.api.get('/items', {
            params: {
                query: termino.trim(), // Usar 'query' en lugar de 'name'
                limit: 20
            }
        });

        const productos = response.data || [];

        // Normalizar y filtrar
        const productosNormalizados = productos.map(producto => ({
            ...producto,
            alegraId: producto.id,
            name: producto.name,
            reference: producto.reference?.reference || producto.reference || '',
            price: producto.price?.[0]?.price || 0,
            cost: producto.inventory?.unitCost || 0
        }));

        console.log(`✅ ${productosNormalizados.length} productos encontrados`);

        res.json({
            success: true,
            productos: productosNormalizados,
            total: productosNormalizados.length,
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

// Función para limpiar y normalizar cada producto
function normalizarProducto(producto) {
    return {
        alegraId: producto.id,
        name: producto.name,
        reference: producto.reference?.reference || producto.reference || '',
        price: producto.price?.[0]?.price || 0,
        cost: producto.inventory?.unitCost || 0
    };
}


// Obtener detalles específicos de un producto de Alegra
app.get('/api/producto-alegra/:alegraId', async (req, res) => {
    try {
        const { alegraId } = req.params;

        console.log(`📦 Obteniendo detalles del producto desde Alegra API: ${alegraId}`);

        // NUEVO: Buscar directamente en API de Alegra
        const response = await alegraService.api.get(`/items/${alegraId}`);
        const productoAlegra = response.data;

        if (!productoAlegra) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado en Alegra'
            });
        }

        // Extraer precio principal
        const precioVenta = productoAlegra.price?.[0]?.price || 0;

        // Extraer costo del inventario
        const costo = productoAlegra.inventory?.unitCost || 0;

        // Extraer referencia
        const referencia = productoAlegra.reference?.reference || productoAlegra.reference || '';

        // Respuesta normalizada
        const productoNormalizado = {
            alegraId: productoAlegra.id,
            name: productoAlegra.name, // ✅ NOMBRE DE ALEGRA (no del proveedor)
            reference: referencia,
            description: productoAlegra.description || '',
            category: productoAlegra.category?.name || '',
            price: precioVenta,
            cost: costo,
            status: productoAlegra.status || 'active',
            type: productoAlegra.type || 'product'
        };

        console.log(`✅ Producto obtenido de Alegra: ${productoNormalizado.name} (₡${precioVenta})`);

        res.json({
            success: true,
            producto: productoNormalizado,
            // Datos adicionales para compatibilidad
            precio: precioVenta,
            costo: costo,
            nombre: productoNormalizado.name,
            referencia: referencia,
            categoria: productoAlegra.category?.name || '',
            descripcion: productoAlegra.description || ''
        });

    } catch (error) {
        console.error('❌ Error obteniendo producto de Alegra:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo detalles del producto desde Alegra'
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