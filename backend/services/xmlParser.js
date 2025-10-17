const xml2js = require('xml2js');
const moment = require('moment');

class XmlParser {
    constructor() {
        this.parser = new xml2js.Parser({
            explicitArray: false,
            ignoreAttrs: false,
            tagNameProcessors: [xml2js.processors.stripPrefix],
            attrNameProcessors: [xml2js.processors.stripPrefix]
        });
    }

    async parseFacturaXML(xmlContent) {
        try {
            console.log('🔍 Parseando XML de factura CR...');

            const result = await this.parser.parseStringPromise(xmlContent);
            const factura = result.FacturaElectronica;

            if (!factura) {
                throw new Error('XML no es una factura electrónica válida');
            }

            const facturaData = this.extractFacturaData(factura);

            console.log(`✅ XML parseado: ${facturaData.numeroConsecutivo}`);
            return facturaData;
        } catch (error) {
            console.error('❌ Error parseando XML:', error.message);
            throw error;
        }
    }

    extractFacturaData(factura) {
        return {
            clave: factura.Clave,
            numeroConsecutivo: factura.NumeroConsecutivo,
            fechaEmision: this.parseDate(factura.FechaEmision),
            codigoActividad: factura.CodigoActividad,
            emisor: this.extractEmisorData(factura.Emisor),
            receptor: this.extractReceptorData(factura.Receptor),
            condicionVenta: factura.CondicionVenta,
            plazoCredito: factura.PlazoCredito,
            medioPago: factura.MedioPago,
            productos: this.extractProductosData(factura.DetalleServicio),
            resumen: this.extractResumenData(factura.ResumenFactura),
            metadata: {
                fechaProcesamiento: new Date().toISOString(),
                tipoDocumento: 'FacturaElectronica',
                pais: 'CR'
            }
        };
    }

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
            correoElectronico: emisor.CorreoElectronico
        };
    }

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

    extractTelefonoData(telefono) {
        if (!telefono) return null;
        return {
            codigoPais: telefono.CodigoPais,
            numero: telefono.NumTelefono
        };
    }

    extractProductosData(detalleServicio) {
        if (!detalleServicio || !detalleServicio.LineaDetalle) return [];

        const lineas = Array.isArray(detalleServicio.LineaDetalle)
            ? detalleServicio.LineaDetalle
            : [detalleServicio.LineaDetalle];

        return lineas.map(linea => this.extractLineaDetalle(linea));
    }

    /**
     * Genera un código único basado en la descripción del producto
     * Usado cuando el proveedor no proporciona código interno
     */
    generateCodigoFromDescripcion(descripcion) {
        if (!descripcion) return null;
        
        // Normalizar descripción: quitar espacios extras, mayúsculas, caracteres especiales
        const normalized = descripcion
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '-') // Espacios -> guiones
            .replace(/[^A-Z0-9-]/g, '') // Solo letras, números y guiones
            .substring(0, 50); // Máximo 50 caracteres
        
        return `DESC-${normalized}`;
    }

    extractLineaDetalle(linea) {
        // Primero intentamos obtener el código comercial del proveedor
        let codigoProveedor = null;
        let tieneCodigoReal = false;
        
        if (linea.CodigoComercial) {
            if (Array.isArray(linea.CodigoComercial)) {
                // Buscar código del proveedor (Tipo 04) o código interno (Tipo 01)
                let codigo = linea.CodigoComercial.find(c => c.Tipo === '04');
                if (!codigo) codigo = linea.CodigoComercial.find(c => c.Tipo === '01');
                // Si no hay 04 ni 01, buscar cualquiera que NO sea CABYS (99)
                if (!codigo && linea.CodigoComercial.length > 0) {
                    codigo = linea.CodigoComercial.find(c => c.Tipo !== '99');
                }
                codigoProveedor = codigo?.Codigo;
            } else {
                codigoProveedor = linea.CodigoComercial.Codigo;
            }
            tieneCodigoReal = !!codigoProveedor;
        }
        
        // Si hay campo "Codigo" directo (raro pero posible), usarlo
        if (!codigoProveedor && linea.Codigo) {
            codigoProveedor = linea.Codigo;
            tieneCodigoReal = true;
        }
        
        // ⚠️ IMPORTANTE: NO usar CABYS como código de producto
        // CABYS es un código FISCAL usado por múltiples productos
        // Si no hay código del proveedor, generar uno desde la descripción
        if (!codigoProveedor) {
            codigoProveedor = this.generateCodigoFromDescripcion(linea.Detalle);
            console.log(`⚠️ Producto sin código interno: "${linea.Detalle}" -> Generando código: "${codigoProveedor}"`);
        }

        return {
            numeroLinea: parseInt(linea.NumeroLinea),
            codigoCabys: linea.CodigoCABYS || null, // Solo para referencia fiscal
            codigo: codigoProveedor, // Código ÚNICO del producto
            tieneCodigoReal: tieneCodigoReal, // Flag para saber si es código real o generado
            codigoComercial: (() => {
                if (!linea.CodigoComercial) return null;

                if (Array.isArray(linea.CodigoComercial)) {
                    const primer = linea.CodigoComercial.find(c => c.Tipo !== '99') ||
                        linea.CodigoComercial[0];
                    return {
                        tipo: primer?.Tipo,
                        codigo: primer?.Codigo
                    };
                }

                return {
                    tipo: linea.CodigoComercial.Tipo,
                    codigo: linea.CodigoComercial.Codigo
                };
            })(),
            descripcion: linea.Detalle,
            cantidad: parseFloat(linea.Cantidad),
            unidadMedida: linea.UnidadMedida,
            precioUnitario: parseFloat(linea.PrecioUnitario),
            montoTotal: parseFloat(linea.MontoTotal),
            subtotal: parseFloat(linea.SubTotal),
            descuento: linea.Descuento ? {
                monto: parseFloat(linea.Descuento.MontoDescuento),
                naturaleza: linea.Descuento.NaturalezaDescuento
            } : null,
            impuesto: linea.Impuesto ? {
                codigo: linea.Impuesto.Codigo,
                codigoTarifa: linea.Impuesto.CodigoTarifa || linea.Impuesto.CodigoTarifaIVA,
                tarifa: parseFloat(linea.Impuesto.Tarifa),
                monto: parseFloat(linea.Impuesto.Monto)
            } : null,
            montoTotalLinea: parseFloat(linea.MontoTotalLinea)
        };
    }

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

    parseDate(fechaString) {
        if (!fechaString) return null;

        try {
            const fecha = moment(fechaString);
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

    validateFacturaCR(facturaData) {
        const errors = [];

        if (!facturaData.clave) errors.push('Falta clave de la factura');
        if (!facturaData.numeroConsecutivo) errors.push('Falta número consecutivo');
        if (!facturaData.emisor || !facturaData.emisor.nombre) errors.push('Falta información del emisor');
        if (!facturaData.productos || facturaData.productos.length === 0) errors.push('No hay productos en la factura');
        if (facturaData.clave && !/^\d{50}$/.test(facturaData.clave)) errors.push('Formato de clave inválido');

        if (errors.length > 0) {
            throw new Error(`Factura inválida: ${errors.join(', ')}`);
        }

        return true;
    }

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
