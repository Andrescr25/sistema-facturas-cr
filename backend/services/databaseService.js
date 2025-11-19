const { PrismaClient } = require('@prisma/client');

class DatabaseService {
    constructor() {
        // Usar singleton de Prisma si existe
        if (global.prismaInstance) {
            this.prisma = global.prismaInstance;
        } else {
            this.prisma = new PrismaClient();
            global.prismaInstance = this.prisma;
        }
    }

    /**
     * Guarda una factura parseada en la base de datos
     * @param {Object} facturaData - Datos de la factura parseada
     * @param {String} archivoXML - Nombre del archivo XML
     * @param {String} emailId - ID del email (opcional)
     * @returns {Object} Factura guardada con productos
     */
    async saveFactura(facturaData, archivoXML, emailId = null) {
        try {
            console.log(`💾 Guardando factura en BD: ${facturaData.numeroConsecutivo}`);

            // Verificar si la factura ya existe
            const facturaExistente = await this.prisma.factura.findUnique({
                where: { clave: facturaData.clave }
            });

            if (facturaExistente) {
                console.log(`⚠️ Factura ya existe en BD: ${facturaData.clave}`);
                return facturaExistente;
            }

            // PASO 1: Buscar mapeos existentes para auto-relacionar productos
            const proveedorCedula = facturaData.emisor.identificacion.numero;
            const productosConMapeo = [];

            console.log(`🔍 Buscando mapeos existentes para proveedor ${proveedorCedula}...`);

            for (const producto of facturaData.productos) {
                // Buscar mapeo existente con este proveedor y código
                const mapeo = await this.prisma.supplierProductMapping.findUnique({
                    where: {
                        supplierCedula_supplierCode: {
                            supplierCedula: proveedorCedula,
                            supplierCode: producto.codigo
                        }
                    }
                });

                if (mapeo) {
                    console.log(`✅ Mapeo encontrado: ${producto.codigo} → ${mapeo.alegraName} (${mapeo.alegraItemId})`);
                    productosConMapeo.push({
                        ...producto,
                        alegraItemId: mapeo.alegraItemId,
                        mapeoId: mapeo.id,
                        estadoRelacionado: 'RELACIONADO',
                        confianza: mapeo.confidence
                    });
                } else {
                    console.log(`⚠️ Sin mapeo previo: ${producto.codigo} - ${producto.descripcion.substring(0, 50)}`);
                    productosConMapeo.push({
                        ...producto,
                        estadoRelacionado: 'PENDIENTE'
                    });
                }
            }

            // PASO 2: Crear la factura con sus productos (ya con relaciones aplicadas)
            const facturaGuardada = await this.prisma.factura.create({
                data: {
                    clave: facturaData.clave,
                    numeroConsecutivo: facturaData.numeroConsecutivo,
                    fechaEmision: new Date(facturaData.fechaEmision.iso),

                    // Información del proveedor (con TRIM para evitar espacios)
                    proveedorNombre: facturaData.emisor.nombre.trim(),
                    proveedorCedula: proveedorCedula,
                    proveedorEmail: facturaData.emisor.correoElectronico,
                    proveedorTelefono: facturaData.emisor.telefono?.numero,

                    // Totales
                    totalProductos: productosConMapeo.length,
                    totalFactura: facturaData.resumen.totales.comprobante,
                    moneda: facturaData.resumen.moneda.codigo,

                    // Estados
                    estado: 'PROCESADA',

                    // Metadatos
                    archivoXML: archivoXML,
                    emailId: emailId,

                    // Crear productos relacionados (con mapeos aplicados)
                    productos: {
                        create: productosConMapeo.map(producto => ({
                            numeroLinea: producto.numeroLinea,
                            codigoProveedor: producto.codigo,
                            codigoComercial: producto.codigoComercial?.codigo,
                            codigoCabys: producto.codigoCabys,
                            descripcion: producto.descripcion,
                            cantidad: producto.cantidad,
                            unidadMedida: producto.unidadMedida,
                            precioUnitario: producto.precioUnitario,
                            descuento: producto.descuento?.monto || 0,
                            impuesto: producto.impuesto?.monto || 0,
                            totalLinea: producto.montoTotalLinea,
                            estadoRelacionado: producto.estadoRelacionado,
                            alegraItemId: producto.alegraItemId || null,
                            mapeoId: producto.mapeoId || null,
                            confianza: producto.confianza || null
                        }))
                    }
                },
                include: {
                    productos: true
                }
            });

            // PASO 3: Actualizar timesUsed en mapeos utilizados
            const mapeosUsados = productosConMapeo.filter(p => p.mapeoId);
            if (mapeosUsados.length > 0) {
                await Promise.all(mapeosUsados.map(async (p) => {
                    await this.prisma.supplierProductMapping.update({
                        where: { id: p.mapeoId },
                        data: {
                            timesUsed: { increment: 1 },
                            lastUsedDate: new Date()
                        }
                    });
                }));
            }

            // PASO EXTRA: Registrar cuenta por pagar si la factura es a crédito
            try {
                const condicionVenta = facturaData.condicionVenta || null;
                const plazoCreditoValor = parseInt(facturaData.plazoCredito, 10);
                const plazoDias = Number.isFinite(plazoCreditoValor)
                    ? plazoCreditoValor
                    : (condicionVenta === '02' ? 30 : 0);

                const requiereCuenta = condicionVenta === '02' || plazoDias > 0;
                if (requiereCuenta) {
                    const fechaEmisionDate = facturaData.fechaEmision?.iso
                        ? new Date(facturaData.fechaEmision.iso)
                        : new Date();
                    const fechaVencimiento = new Date(fechaEmisionDate);
                    fechaVencimiento.setDate(fechaVencimiento.getDate() + Math.max(plazoDias, 0));

                    const montoTotal = Number(facturaData.resumen?.totales?.comprobante || facturaGuardada.totalFactura || 0);
                    const saldoPendiente = montoTotal;
                    const estadoInicial = fechaVencimiento < new Date() ? 'VENCIDA' : 'PENDIENTE';

                    await this.prisma.cuentaPorPagar.upsert({
                        where: { facturaId: facturaGuardada.id },
                        update: {
                            proveedorNombre: facturaGuardada.proveedorNombre,
                            proveedorCedula: facturaGuardada.proveedorCedula,
                            numeroConsecutivo: facturaGuardada.numeroConsecutivo,
                            condicionVenta,
                            plazoCredito: plazoDias,
                            fechaEmision: fechaEmisionDate,
                            fechaVencimiento,
                            montoTotal,
                            saldoPendiente,
                            estado: estadoInicial
                        },
                        create: {
                            facturaId: facturaGuardada.id,
                            proveedorNombre: facturaGuardada.proveedorNombre,
                            proveedorCedula: facturaGuardada.proveedorCedula,
                            numeroConsecutivo: facturaGuardada.numeroConsecutivo,
                            condicionVenta,
                            plazoCredito: plazoDias,
                            fechaEmision: fechaEmisionDate,
                            fechaVencimiento,
                            montoTotal,
                            saldoPendiente,
                            estado: estadoInicial
                        }
                    });
                }
            } catch (cuentaError) {
                console.error('⚠️ Error registrando cuenta por pagar:', cuentaError.message);
            }

            const productosRelacionados = productosConMapeo.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
            const productosPendientes = productosConMapeo.filter(p => p.estadoRelacionado === 'PENDIENTE').length;
            const porcentajeRelacionado = Math.round((productosRelacionados / productosConMapeo.length) * 100);

            // PASO 4: Actualizar estado de la factura si está relacionada
            if (porcentajeRelacionado > 0) {
                try {
                    await this.prisma.factura.update({
                        where: { id: facturaGuardada.id },
                        data: {
                            porcentajeRelacionado: porcentajeRelacionado,
                            estadoRelacionado: porcentajeRelacionado === 100 ? 'RELACIONADO' : null
                        }
                    });

                    if (porcentajeRelacionado === 100) {
                        console.log(`🎉 Factura 100% relacionada automáticamente!`);
                    }
                } catch (err) {
                    // Ignorar si campos no existen (migración pendiente)
                    console.log(`⚠️ No se pudo actualizar porcentaje (campos no existen)`);
                }
            }

            console.log(`✅ Factura guardada: ${facturaGuardada.id}`);
            console.log(`📦 ${facturaGuardada.productos.length} productos guardados`);
            console.log(`   ✅ ${productosRelacionados} productos auto-relacionados (${porcentajeRelacionado}%)`);
            console.log(`   ⚠️ ${productosPendientes} productos pendientes de relacionar`);

            return facturaGuardada;

        } catch (error) {
            console.error('❌ Error guardando factura:', error);
            throw error;
        }
    }

    /**
     * Busca productos similares para relacionado inteligente
     * @param {String} codigoProveedor - Código del producto del proveedor
     * @param {String} proveedorCedula - Cédula del proveedor
     * @param {String} descripcion - Descripción del producto
     * @returns {Array} Productos relacionados encontrados
     */
    async findSimilarProducts(codigoProveedor, proveedorCedula, descripcion) {
        try {
            // 1. Buscar mapeo exacto existente
            const mapeoExacto = await this.prisma.supplierProductMapping.findFirst({
                where: {
                    supplierCedula: proveedorCedula,
                    supplierCode: codigoProveedor
                }
            });

            if (mapeoExacto) {
                console.log(`🎯 Mapeo exacto encontrado: ${mapeoExacto.alegraName}`);
                return [{
                    tipo: 'EXACTO',
                    confianza: 100,
                    mapeo: mapeoExacto
                }];
            }

            // 2. Buscar mapeos similares por descripción
            const palabrasClave = descripcion.toLowerCase()
                .split(' ')
                .filter(palabra => palabra.length > 3)
                .slice(0, 3); // Tomar solo las primeras 3 palabras importantes

            if (palabrasClave.length > 0) {
                const mapeosSimilares = await this.prisma.supplierProductMapping.findMany({
                    where: {
                        OR: palabrasClave.map(palabra => ({
                            supplierDesc: {
                                contains: palabra,
                                mode: 'insensitive'
                            }
                        }))
                    },
                    orderBy: {
                        timesUsed: 'desc'
                    },
                    take: 5
                });

                const sugerencias = mapeosSimilares.map(mapeo => {
                    // Calcular confianza básica basada en palabras coincidentes
                    const coincidencias = palabrasClave.filter(palabra =>
                        mapeo.supplierDesc.toLowerCase().includes(palabra)
                    ).length;

                    const confianza = Math.round((coincidencias / palabrasClave.length) * 80);

                    return {
                        tipo: 'SIMILAR',
                        confianza: confianza,
                        mapeo: mapeo
                    };
                }).filter(sugerencia => sugerencia.confianza > 30);

                if (sugerencias.length > 0) {
                    console.log(`💡 ${sugerencias.length} sugerencias encontradas`);
                    return sugerencias;
                }
            }

            // 3. No se encontraron sugerencias
            console.log(`🔍 No se encontraron productos similares para: ${descripcion}`);
            return [];

        } catch (error) {
            console.error('❌ Error buscando productos similares:', error);
            return [];
        }
    }

    /**
     * Crea un nuevo mapeo de producto
     * @param {Object} mappingData - Datos del mapeo
     * @returns {Object} Mapeo creado
     */
    async createProductMapping(mappingData) {
        try {
            // Verificar si ya existe el mapeo
            const mapeoExistente = await this.prisma.supplierProductMapping.findUnique({
                where: {
                    supplierCedula_supplierCode: {
                        supplierCedula: mappingData.supplierCedula,
                        supplierCode: mappingData.supplierCode
                    }
                }
            });

            if (mapeoExistente) {
                // ✅ Determinar si es IMAP (automático) o manual
                const esAutomatico = mappingData.origen === 'imap';
                const eraManual = mapeoExistente.origen === 'manual';

                // ⚠️ Si el mapeo existente era manual y llega uno automático, SOBRESCRIBIR
                if (eraManual && esAutomatico) {
                    console.log(`🔄 SOBRESCRIBIENDO mapeo MANUAL con IMAP: ${mappingData.supplierCode} → ${mappingData.alegraName}`);
                } else if (esAutomatico) {
                    console.log(`✅ Actualizando mapeo automático: ${mappingData.supplierCode} → ${mappingData.alegraName}`);
                } else {
                    console.log(`✅ Actualizando mapeo: ${mappingData.supplierCode} → ${mappingData.alegraName}`);
                }

                // Actualizar el mapeo existente (incluyendo origen si es automático)
                const dataToUpdate = {
                    supplierName: mappingData.supplierName.trim(),
                    supplierDesc: mappingData.supplierDesc,
                    alegraItemId: mappingData.alegraItemId,
                    alegraReference: mappingData.alegraReference,
                    alegraName: mappingData.alegraName,
                    confidence: mappingData.confidence || 100,
                    lastUsedDate: new Date(),
                    timesUsed: { increment: 1 }
                };

                // Si es automático, actualizar también el origen
                if (esAutomatico) {
                    dataToUpdate.origen = 'imap';
                }

                const mapeoActualizado = await this.prisma.supplierProductMapping.update({
                    where: { id: mapeoExistente.id },
                    data: dataToUpdate
                });

                return mapeoActualizado;
            }

            // Si no existe, crear nuevo mapeo
            const nuevoMapeo = await this.prisma.supplierProductMapping.create({
                data: {
                    supplierName: mappingData.supplierName.trim(),
                    supplierCedula: mappingData.supplierCedula,
                    supplierCode: mappingData.supplierCode,
                    supplierDesc: mappingData.supplierDesc,
                    alegraItemId: mappingData.alegraItemId,
                    alegraReference: mappingData.alegraReference,
                    alegraName: mappingData.alegraName,
                    confidence: mappingData.confidence || 100,
                    origen: mappingData.origen || 'manual' // ✅ Usar 'origen' en lugar de 'createdBy'
                }
            });

            console.log(`✅ Mapeo creado: ${nuevoMapeo.supplierCode} → ${nuevoMapeo.alegraName}`);
            return nuevoMapeo;

        } catch (error) {
            console.error('❌ Error creando mapeo:', error);
            throw error;
        }
    }

    /**
     * Actualiza un producto con su relación a Alegra
     * @param {String} productoId - ID del producto en la BD
     * @param {String} alegraItemId - ID del ítem en Alegra
     * @param {String} mapeoId - ID del mapeo utilizado
     * @param {Number} confianza - Nivel de confianza del relacionado
     */
    async updateProductMapping(productoId, alegraItemId, mapeoId, confianza = 100) {
        try {
            const productoActualizado = await this.prisma.productoFactura.update({
                where: { id: productoId },
                data: {
                    alegraItemId: alegraItemId,
                    mapeoId: mapeoId,
                    confianza: confianza,
                    estadoRelacionado: 'RELACIONADO'
                }
            });

            // Actualizar estadísticas del mapeo
            if (mapeoId) {
                await this.prisma.supplierProductMapping.update({
                    where: { id: mapeoId },
                    data: {
                        timesUsed: { increment: 1 },
                        lastUsedDate: new Date()
                    }
                });
            }

            console.log(`✅ Producto relacionado: ${productoId} → ${alegraItemId}`);
            return productoActualizado;

        } catch (error) {
            console.error('❌ Error actualizando relación:', error);
            throw error;
        }
    }

    /**
     * Obtiene facturas pendientes de procesar
     * @param {String} estado - Estado de las facturas a buscar
     * @returns {Array} Facturas encontradas
     */
    async getFacturasByEstado(estado = 'PROCESADA') {
        try {
            const facturas = await this.prisma.factura.findMany({
                where: { estado: estado },
                include: {
                    productos: {
                        include: {
                            mapeo: true
                        }
                    }
                },
                orderBy: {
                    fechaEmision: 'desc'
                }
            });

            return facturas;

        } catch (error) {
            console.error('❌ Error obteniendo facturas:', error);
            throw error;
        }
    }

    /**
     * Obtiene estadísticas generales
     * @returns {Object} Estadísticas del sistema
     */
    async getEstadisticas() {
        try {
            const stats = await this.prisma.factura.aggregate({
                _count: { id: true },
                _sum: { totalFactura: true }
            });

            const facturasPorEstado = await this.prisma.factura.groupBy({
                by: ['estado'],
                _count: { id: true }
            });

            const productosPendientes = await this.prisma.productoFactura.count({
                where: { estadoRelacionado: 'PENDIENTE' }
            });

            const totalMapeos = await this.prisma.supplierProductMapping.count();

            return {
                totalFacturas: stats._count.id,
                totalMonto: stats._sum.totalFactura || 0,
                facturasPorEstado: facturasPorEstado,
                productosPendientes: productosPendientes,
                totalMapeos: totalMapeos
            };

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            throw error;
        }
    }

    /**
     * Cierra la conexión con la base de datos
     */
    async disconnect() {
        // No desconectar si se está usando el singleton global
        if (!global.prismaInstance) {
            await this.prisma.$disconnect();
        }
    }
}

module.exports = DatabaseService;

