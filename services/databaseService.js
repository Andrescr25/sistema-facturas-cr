const { PrismaClient } = require('@prisma/client');

class DatabaseService {
    constructor() {
        this.prisma = new PrismaClient();
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

            // Crear la factura con sus productos
            const facturaGuardada = await this.prisma.factura.create({
                data: {
                    clave: facturaData.clave,
                    numeroConsecutivo: facturaData.numeroConsecutivo,
                    fechaEmision: new Date(facturaData.fechaEmision.iso),

                    // Información del proveedor
                    proveedorNombre: facturaData.emisor.nombre,
                    proveedorCedula: facturaData.emisor.identificacion.numero,
                    proveedorEmail: facturaData.emisor.correoElectronico,
                    proveedorTelefono: facturaData.emisor.telefono?.numero,

                    // Totales
                    totalProductos: facturaData.productos.length,
                    totalFactura: facturaData.resumen.totales.comprobante,
                    moneda: facturaData.resumen.moneda.codigo,

                    // Estados
                    estado: 'PROCESADA',

                    // Metadatos
                    archivoXML: archivoXML,
                    emailId: emailId,

                    // Crear productos relacionados
                    productos: {
                        create: facturaData.productos.map(producto => ({
                            numeroLinea: producto.numeroLinea,
                            codigoProveedor: producto.codigo,
                            codigoComercial: producto.codigoComercial?.codigo,
                            descripcion: producto.descripcion,
                            cantidad: producto.cantidad,
                            unidadMedida: producto.unidadMedida,
                            precioUnitario: producto.precioUnitario,
                            descuento: producto.descuento?.monto || 0,
                            impuesto: producto.impuesto?.monto || 0,
                            totalLinea: producto.montoTotalLinea,
                            estadoRelacionado: 'PENDIENTE'
                        }))
                    }
                },
                include: {
                    productos: true
                }
            });

            console.log(`✅ Factura guardada: ${facturaGuardada.id}`);
            console.log(`📦 ${facturaGuardada.productos.length} productos guardados`);

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
                console.log(`✅ Mapeo ya existe, actualizando: ${mappingData.supplierCode} → ${mappingData.alegraName}`);

                // Actualizar el mapeo existente
                const mapeoActualizado = await this.prisma.supplierProductMapping.update({
                    where: { id: mapeoExistente.id },
                    data: {
                        alegraItemId: mappingData.alegraItemId,
                        alegraReference: mappingData.alegraReference,
                        alegraName: mappingData.alegraName,
                        confidence: mappingData.confidence || 100,
                        lastUsedDate: new Date(),
                        timesUsed: { increment: 1 }
                    }
                });

                return mapeoActualizado;
            }

            // Si no existe, crear nuevo mapeo
            const nuevoMapeo = await this.prisma.supplierProductMapping.create({
                data: {
                    supplierName: mappingData.supplierName,
                    supplierCedula: mappingData.supplierCedula,
                    supplierCode: mappingData.supplierCode,
                    supplierDesc: mappingData.supplierDesc,
                    alegraItemId: mappingData.alegraItemId,
                    alegraReference: mappingData.alegraReference,
                    alegraName: mappingData.alegraName,
                    confidence: mappingData.confidence || 100,
                    createdBy: mappingData.createdBy || 'manual'
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
        await this.prisma.$disconnect();
    }
}

module.exports = DatabaseService;