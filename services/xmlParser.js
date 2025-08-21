const xml2js = require('xml2js');
const moment = require('moment-timezone');

class XmlParser {
    constructor() {
        this.parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false,
            tagNameProcessors: [xml2js.processors.stripPrefix],
            attrNameProcessors: [xml2js.processors.stripPrefix]
        });
    }

    /**
     * Parsea un XML de factura de Costa Rica
     * @param {Buffer|String} xmlContent - Contenido del XML
     * @returns {Object} Datos estructurados de la factura
     */
    async parseFacturaXML(xmlContent) {
        try {
            console.log('🔍 Parseando XML de factura CR...');

            const result = await this.parser.parseStringPromise(xmlContent);
            const factura = result.FacturaElectronica;

            if (!factura) {
                throw new Error('XML no es una factura electrónica válida');
            }

            const facturaData = this.extractFacturaData(factura);

            console.log('XML parseado exitosamente');
            console.log(`📄 Factura: ${facturaData.numeroConsecutivo}`);
            console.log(`🏢 Proveedor: ${facturaData.emisor.nombre}`);
            console.log(`📦 Productos: ${facturaData.productos.length}`);

            return facturaData;

        } catch (error) {
            console.error('❌ Error parseando XML:', error.message);
            throw error;
        }
    }

    /**
     * Extrae los datos principales de la factura
     */
    extractFacturaData(factura) {
        return {
            // Datos básicos de la factura
            clave: factura.Clave,
            numeroConsecutivo: factura.NumeroConsecutivo,
            fechaEmision: this.parseDate(factura.FechaEmision),
            codigoActividad: factura.CodigoActividad,

            // Información del emisor (proveedor)
            emisor: this.extractEmisorData(factura.Emisor),

            // Información del receptor (tu empresa)
            receptor: this.extractReceptorData(factura.Receptor),

            // Condiciones de venta
            condicionVenta: factura.CondicionVenta,
            plazoCredito: factura.PlazoCredito,
            medioPago: factura.MedioPago,

            // Productos/servicios
            productos: this.extractProductosData(factura.DetalleServicio),

            // Resumen financiero
            resumen: this.extractResumenData(factura.ResumenFactura),

            // Metadatos para procesamiento
            metadata: {
                fechaProcesamiento: new Date().toISOString(),
                tipoDocumento: 'FacturaElectronica',
                pais: 'CR'
            }
        };
    }

    /**
     * Extrae datos del emisor (proveedor)
     */
    extractEmisorData(emisor) {
        return {
            nombre: emisor.Nombre,
            nombreComercial: emisor.NombreComercial || emisor.Nombre,
            identificacion: {
                tipo: emisor.Identificacion.Tipo,
                numero: emisor.Identificacion.Numero
            },
            ubicacion: this.extractUbicacionData(emisor.Ubicacion),
            telefono: this.extractTelefonoData(emisor.Telefono),
            fax: emisor.Fax ? this.extractTelefonoData(emisor.Fax) : null,
            correoElectronico: emisor.CorreoElectronico
        };
    }

    /**
     * Extrae datos del receptor (tu empresa)
     */
    extractReceptorData(receptor) {
        return {
            nombre: receptor.Nombre,
            identificacion: {
                tipo: receptor.Identificacion.Tipo,
                numero: receptor.Identificacion.Numero
            },
            telefono: receptor.Telefono ? this.extractTelefonoData(receptor.Telefono) : null,
            correoElectronico: receptor.CorreoElectronico
        };
    }

    /**
     * Extrae ubicación
     */
    extractUbicacionData(ubicacion) {
        if (!ubicacion) return null;

        return {
            provincia: ubicacion.Provincia,
            canton: ubicacion.Canton,
            distrito: ubicacion.Distrito,
            barrio: ubicacion.Barrio,
            otrasSenas: ubicacion.OtrasSenas
        };
    }

    /**
     * Extrae teléfono
     */
    extractTelefonoData(telefono) {
        if (!telefono) return null;

        return {
            codigoPais: telefono.CodigoPais,
            numero: telefono.NumTelefono
        };
    }

    /**
     * Extrae productos/servicios
     */
    extractProductosData(detalleServicio) {
        if (!detalleServicio || !detalleServicio.LineaDetalle) {
            return [];
        }

        // Si solo hay un producto, LineaDetalle no es array
        const lineas = Array.isArray(detalleServicio.LineaDetalle)
            ? detalleServicio.LineaDetalle
            : [detalleServicio.LineaDetalle];

        return lineas.map(linea => this.extractLineaDetalle(linea));
    }

    /**
     * Extrae datos de una línea de detalle (producto)
     */
    extractLineaDetalle(linea) {
        console.log('🔍 DEBUGGEANDO CÓDIGOS:');
        console.log('  - Descripción:', linea.Detalle);
        console.log('  - Codigo (CABYS):', linea.Codigo);
        console.log('  - CodigoComercial objeto:', linea.CodigoComercial);
        console.log('  - CodigoComercial?.Codigo:', linea.CodigoComercial?.Codigo);
        console.log('---');

        return {
            numeroLinea: parseInt(linea.NumeroLinea),

            // ✅ CÓDIGO CABYS ROBUSTO - Buscar en múltiples campos
            codigoCabys: (() => {
                // Prioridad 1: CodigoCABYS explícito
                if (linea.CodigoCABYS) {
                    return linea.CodigoCABYS;
                }

                // Prioridad 2: Codigo (campo genérico)
                if (linea.Codigo) {
                    return linea.Codigo;
                }

                // Prioridad 3: Buscar en códigos comerciales si es CABYS
                if (Array.isArray(linea.CodigoComercial)) {
                    const codigoCabys = linea.CodigoComercial.find(c =>
                        c.Tipo === '99' || // Tipo CABYS
                        (c.Codigo && c.Codigo.length >= 10) // Código largo típico de CABYS
                    );
                    if (codigoCabys) return codigoCabys.Codigo;
                }

                console.warn(`⚠️ No se encontró código CABYS para: ${linea.Detalle}`);
                return null;
            })(),

            // Códigos del producto (lógica existente - para compatibilidad)
            codigo: (() => {
                if (!linea.CodigoComercial) return linea.CodigoCABYS || linea.Codigo;

                // Si es array, buscar el primer código válido (prioridad: 04, 01, 02, cualquier otro)
                if (Array.isArray(linea.CodigoComercial)) {
                    // Buscar tipo 04 primero (código del proveedor más común)
                    let codigoProveedor = linea.CodigoComercial.find(c => c.Tipo === '04');

                    // Si no hay tipo 04, buscar tipo 01
                    if (!codigoProveedor) {
                        codigoProveedor = linea.CodigoComercial.find(c => c.Tipo === '01');
                    }

                    // Si no hay tipo 01, tomar el primer código disponible (excluyendo CABYS)
                    if (!codigoProveedor && linea.CodigoComercial.length > 0) {
                        codigoProveedor = linea.CodigoComercial.find(c => c.Tipo !== '99') ||
                            linea.CodigoComercial[0];
                    }

                    return codigoProveedor?.Codigo || linea.CodigoCABYS || linea.Codigo;
                }

                // Si es objeto simple
                return linea.CodigoComercial.Codigo || linea.CodigoCABYS || linea.Codigo;
            })(),

            // CÓDIGO COMERCIAL 
            codigoComercial: (() => {
                if (!linea.CodigoComercial) return null;

                if (Array.isArray(linea.CodigoComercial)) {
                    // Buscar el primer código que NO sea CABYS
                    const primer = linea.CodigoComercial.find(c => c.Tipo !== '99') ||
                        linea.CodigoComercial[0];
                    return {
                        tipo: primer?.Tipo,
                        codigo: primer?.Codigo
                    };
                }

                // Si es objeto simple
                return {
                    tipo: linea.CodigoComercial.Tipo,
                    codigo: linea.CodigoComercial.Codigo
                };
            })(),


            // Descripción del producto
            descripcion: linea.Detalle,

            // Cantidades y unidades
            cantidad: parseFloat(linea.Cantidad),
            unidadMedida: linea.UnidadMedida,
            unidadMedidaComercial: linea.UnidadMedidaComercial,

            // Precios
            precioUnitario: parseFloat(linea.PrecioUnitario),
            montoTotal: parseFloat(linea.MontoTotal),
            subtotal: parseFloat(linea.SubTotal),

            // Descuentos
            descuento: linea.Descuento ? {
                monto: parseFloat(linea.Descuento.MontoDescuento),
                naturaleza: linea.Descuento.NaturalezaDescuento
            } : null,

            // Impuestos
            impuesto: linea.Impuesto ? {
                codigo: linea.Impuesto.Codigo,
                codigoTarifa: linea.Impuesto.CodigoTarifa,
                tarifa: parseFloat(linea.Impuesto.Tarifa),
                monto: parseFloat(linea.Impuesto.Monto)
            } : null,

            // Total de la línea
            montoTotalLinea: parseFloat(linea.MontoTotalLinea)
        };
    }

    /**
     * Extrae resumen financiero
     */
    extractResumenData(resumen) {
        if (!resumen) return null;

        return {
            moneda: {
                codigo: resumen.CodigoTipoMoneda.CodigoMoneda,
                tipoCambio: parseFloat(resumen.CodigoTipoMoneda.TipoCambio)
            },
            totales: {
                mercanciasGravadas: parseFloat(resumen.TotalMercanciasGravadas || 0),
                gravado: parseFloat(resumen.TotalGravado || 0),
                venta: parseFloat(resumen.TotalVenta || 0),
                descuentos: parseFloat(resumen.TotalDescuentos || 0),
                ventaNeta: parseFloat(resumen.TotalVentaNeta || 0),
                impuesto: parseFloat(resumen.TotalImpuesto || 0),
                comprobante: parseFloat(resumen.TotalComprobante || 0)
            }
        };
    }

    /**
     * Parsea fecha de Costa Rica
     */
    parseDate(fechaString) {
        if (!fechaString) return null;

        try {
            // Las fechas vienen en formato: 2025-07-03T15:55:00
            const fecha = moment.tz(fechaString, 'America/Costa_Rica');

            return {
                original: fechaString,
                iso: fecha.toISOString(),
                local: fecha.format('YYYY-MM-DD HH:mm:ss'),
                fecha: fecha.format('YYYY-MM-DD'),
                hora: fecha.format('HH:mm:ss')
            };
        } catch (error) {
            console.warn('⚠️ Error parseando fecha:', fechaString);
            return {
                original: fechaString,
                iso: null,
                local: null,
                fecha: null,
                hora: null
            };
        }
    }

    /**
     * Valida que el XML sea una factura válida de Costa Rica
     */
    validateFacturaCR(facturaData) {
        const errors = [];

        // Validaciones básicas
        if (!facturaData.clave) {
            errors.push('Falta clave de la factura');
        }

        if (!facturaData.numeroConsecutivo) {
            errors.push('Falta número consecutivo');
        }

        if (!facturaData.emisor || !facturaData.emisor.nombre) {
            errors.push('Falta información del emisor');
        }

        if (!facturaData.productos || facturaData.productos.length === 0) {
            errors.push('No hay productos en la factura');
        }

        // Validar que la clave tenga formato correcto (50 dígitos)
        if (facturaData.clave && !/^\d{50}$/.test(facturaData.clave)) {
            errors.push('Formato de clave inválido');
        }

        if (errors.length > 0) {
            throw new Error(`Factura inválida: ${errors.join(', ')}`);
        }

        return true;
    }

    /**
     * Genera resumen legible de la factura
     */
    generateSummary(facturaData) {
        const productos = facturaData.productos.length;
        const total = facturaData.resumen?.totales.comprobante || 0;
        const moneda = facturaData.resumen?.moneda.codigo || 'CRC';

        return {
            titulo: `Factura ${facturaData.numeroConsecutivo}`,
            proveedor: facturaData.emisor.nombre,
            fecha: facturaData.fechaEmision.fecha,
            productos: productos,
            total: `${moneda} ${total.toLocaleString()}`,
            estado: 'Parseada correctamente'
        };
    }
}

module.exports = XmlParser;