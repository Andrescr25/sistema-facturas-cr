const xml2js = require('xml2js');
const moment = require('moment');

// Configuración de logging
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;

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
     * Tipos de comprobante que representan una COMPRA y por lo tanto se
     * ingestan como factura de proveedor (productos, inventario, costos).
     *
     * A propósito NO incluye notas de crédito ni de débito: esas son ajustes
     * sobre un comprobante anterior y meterlas por acá sumaría productos que
     * en realidad se devolvieron. Las notas de crédito tienen su propio
     * camino — ver parseNotaCreditoXML — que solo afecta el dinero que se le
     * debe al proveedor, nunca el inventario.
     */
    static get TIPOS_COMPRA() {
        return ['FacturaElectronica', 'TiqueteElectronico'];
    }

    static get TIPO_NOTA_CREDITO() {
        return 'NotaCreditoElectronica';
    }

    /**
     * ¿Este XML es una nota de crédito? Se usa para enrutar antes de parsear,
     * sin tener que intentar el parseo de compra y fallar.
     */
    static esNotaCredito(xmlContent) {
        return /<(\w+:)?NotaCreditoElectronica/i.test(String(xmlContent).slice(0, 4096));
    }

    /**
     * Parsea una nota de crédito de proveedor.
     *
     * Lo que importa es InformacionReferencia.Numero: trae la clave de 50
     * dígitos de la factura que se está acreditando, que es el vínculo para
     * rebajar el saldo correcto. Verificado contra NC reales de proveedores.
     *
     * Se guardan también las líneas y la razón, pero SOLO como evidencia para
     * que una persona decida si hubo devolución física: contra datos reales
     * hay NC con razón "no sirve precio" que igual listan 12 unidades (es una
     * corrección de precio, la mercadería nunca volvió), y todas llegan con
     * Codigo "01" sin importar el caso. No se puede inferir el inventario de
     * acá, y por eso este parser no lo intenta.
     */
    async parseNotaCreditoXML(xmlContent) {
        try {
            const result = await this.parser.parseStringPromise(xmlContent);
            const nc = result[XmlParser.TIPO_NOTA_CREDITO];

            if (!nc) {
                throw new Error('XML no es una nota de crédito electrónica');
            }

            const ref = nc.InformacionReferencia || {};
            const referencias = Array.isArray(ref) ? ref : [ref];
            const principal = referencias[0] || {};

            const detalle = nc.DetalleServicio?.LineaDetalle;
            const lineas = detalle ? (Array.isArray(detalle) ? detalle : [detalle]) : [];

            return {
                clave: nc.Clave,
                numeroConsecutivo: nc.NumeroConsecutivo,
                fechaEmision: this.parseDate(nc.FechaEmision),
                emisor: this.extractEmisorData(nc.Emisor),
                receptor: this.extractReceptorData(nc.Receptor),
                // Clave de la factura acreditada. Sin esto la NC no se puede
                // aplicar a nada y queda huérfana.
                claveReferencia: principal.Numero || null,
                codigoReferencia: principal.Codigo || null,
                razon: principal.Razon || null,
                montoTotal: parseFloat(nc.ResumenFactura?.TotalComprobante) || 0,
                moneda: nc.ResumenFactura?.CodigoTipoMoneda?.CodigoMoneda || 'CRC',
                lineas: lineas.map(l => ({
                    descripcion: l.Detalle,
                    cantidad: parseFloat(l.Cantidad) || 0,
                    unidadMedida: l.UnidadMedida,
                    montoTotal: parseFloat(l.MontoTotal) || 0
                })),
                metadata: {
                    fechaProcesamiento: new Date().toISOString(),
                    tipoDocumento: XmlParser.TIPO_NOTA_CREDITO,
                    pais: 'CR'
                }
            };
        } catch (error) {
            console.error('❌ Error parseando nota de crédito:', error.message);
            throw error;
        }
    }

    validateNotaCredito(nc) {
        const errors = [];
        if (!nc.clave) errors.push('Falta clave de la nota de crédito');
        if (nc.clave && !/^\d{50}$/.test(nc.clave)) errors.push('Formato de clave inválido');
        if (!nc.claveReferencia) errors.push('No referencia ninguna factura (InformacionReferencia.Numero)');
        if (!nc.montoTotal || nc.montoTotal <= 0) errors.push('Monto total inválido');
        if (!nc.emisor || !nc.emisor.nombre) errors.push('Falta información del emisor');

        if (errors.length > 0) {
            throw new Error(`Nota de crédito inválida: ${errors.join(', ')}`);
        }
        return true;
    }

    async parseFacturaXML(xmlContent) {
        try {
            if (VERBOSE_LOGGING) console.log('🔍 Parseando XML de comprobante CR...');

            const result = await this.parser.parseStringPromise(xmlContent);

            // El tiquete electrónico se emite cuando el comprador no da su
            // cédula; es una compra igual de válida que una factura y comparte
            // toda la estructura salvo el Receptor, que no trae.
            const tipoDocumento = XmlParser.TIPOS_COMPRA.find(tipo => result[tipo]);

            if (!tipoDocumento) {
                const raices = Object.keys(result).join(', ') || 'ninguna';
                throw new Error(`XML no es un comprobante de compra (raíz: ${raices})`);
            }

            const facturaData = this.extractFacturaData(result[tipoDocumento], tipoDocumento);

            if (VERBOSE_LOGGING) console.log(`✅ XML parseado (${tipoDocumento}): ${facturaData.numeroConsecutivo}`);
            return facturaData;
        } catch (error) {
            console.error('❌ Error parseando XML:', error.message);
            throw error;
        }
    }

    extractFacturaData(factura, tipoDocumento = 'FacturaElectronica') {
        return {
            clave: factura.Clave,
            numeroConsecutivo: factura.NumeroConsecutivo,
            fechaEmision: this.parseDate(factura.FechaEmision),
            // La versión 4.4 del formato de Hacienda lo renombró a
            // CodigoActividadEmisor; se aceptan ambos.
            codigoActividad: factura.CodigoActividad || factura.CodigoActividadEmisor,
            emisor: this.extractEmisorData(factura.Emisor),
            // Un tiquete no lleva Receptor — por eso puede venir null.
            receptor: this.extractReceptorData(factura.Receptor),
            condicionVenta: factura.CondicionVenta,
            plazoCredito: factura.PlazoCredito,
            medioPago: factura.MedioPago || factura.ResumenFactura?.MedioPago,
            // Hacienda no tiene campo estándar de vencimiento: los emisores
            // lo ponen como texto libre en <Otros>. Se extrae acá, que es el
            // único momento en que tenemos el XML — no se persiste completo.
            ...XmlParser.extraerOtros(factura.Otros),
            productos: this.extractProductosData(factura.DetalleServicio),
            // `<OtrosCargos>` es hermano de `<ResumenFactura>`, no está
            // dentro: por eso se lee de `factura` y no de `factura.ResumenFactura`.
            otrosCargos: XmlParser.extractOtrosCargos(factura.OtrosCargos),
            resumen: this.extractResumenData(factura.ResumenFactura),
            metadata: {
                fechaProcesamiento: new Date().toISOString(),
                tipoDocumento,
                pais: 'CR'
            }
        };
    }

    /**
     * Datos útiles del bloque <Otros>, que es texto libre por emisor.
     * Verificado contra una factura real de Liberty:
     *   <OtroTexto codigo="Fecha_Vencimiento">20-08-2026</OtroTexto>
     *   <OtroTexto codigo="Periodo_Facturado">01 Jul 2026 al 31 Jul 2026</OtroTexto>
     * Importa porque la condición de venta puede decir "contado" y plazo 0
     * mientras el recibo vence 18 días después.
     */
    static extraerOtros(otros) {
        if (!otros) return {};
        const textos = [].concat(otros.OtroTexto || []);
        const valorDe = (codigo) => {
            for (const t of textos) {
                const c = t?.$?.codigo || t?.codigo;
                if (String(c || '').toLowerCase() === codigo.toLowerCase()) {
                    return String(t?._ ?? t?.['#text'] ?? (typeof t === 'string' ? t : '')).trim();
                }
            }
            return null;
        };

        const vencimiento = valorDe('Fecha_Vencimiento');
        const periodo = valorDe('Periodo_Facturado');
        return {
            fechaVencimientoTexto: vencimiento || null,
            periodoFacturadoTexto: periodo || null
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

    /**
     * Los tiquetes electrónicos no llevan Receptor (se emiten sin identificar
     * al comprador), así que puede venir ausente. Devuelve null en ese caso en
     * vez de reventar.
     */
    extractReceptorData(receptor) {
        if (!receptor) return null;

        return {
            nombre: receptor.Nombre,
            identificacion: receptor.Identificacion ? {
                tipo: receptor.Identificacion.Tipo,
                numero: receptor.Identificacion.Numero
            } : null,
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

    /**
     * Suma el campo de monto de un nodo que puede venir repetido.
     *
     * Un `<Descuento>` o un `<Impuesto>` de la línea admite hasta 5 (4.3;
     * la 4.4 los agrupa en `<Descuentos>`/`<Impuestos>`). Con
     * `explicitArray: false` de xml2js, dos o más hermanos con el mismo
     * nombre llegan como ARRAY; uno solo llega como objeto suelto. El código
     * de más abajo asumía siempre lo segundo y hacía
     * `parseFloat(array.MontoDescuento)` → `NaN` en cuanto había más de uno.
     * Medido sobre la copia local: 6.013 de 8.600 líneas de compra tienen
     * descuento mayor que cero, así que el caso no es raro — es el
     * candidato directo al descuadre entre el total de la factura y la suma
     * de sus líneas.
     */
    sumarMontoRepetible(nodo, campoMonto) {
        const lista = Array.isArray(nodo) ? nodo : [nodo];
        return lista.reduce((suma, item) => suma + (parseFloat(item?.[campoMonto]) || 0), 0);
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
            if (VERBOSE_LOGGING) console.log(`⚠️ Producto sin código interno: "${linea.Detalle}" -> Generando código: "${codigoProveedor}"`);
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
            // `NaturalezaDescuento` se une con "; " cuando hay más de un
            // descuento y traen motivos distintos: se guarda como texto
            // porque hoy no hay dónde poner una lista, pero no se descarta
            // ninguno.
            descuento: linea.Descuento ? {
                monto: this.sumarMontoRepetible(linea.Descuento, 'MontoDescuento'),
                naturaleza: Array.isArray(linea.Descuento)
                    ? [...new Set(linea.Descuento.map((d) => d.NaturalezaDescuento).filter(Boolean))].join('; ')
                    : linea.Descuento.NaturalezaDescuento
            } : null,
            // Con más de un `<Impuesto>` (IVA más un impuesto selectivo de
            // consumo, por ejemplo), `monto` es la suma de los dos —es lo
            // único que se usa después, para que la línea cuadre con
            // `MontoTotalLinea`—; `codigo`, `codigoTarifa` y `tarifa`
            // describen el primero, porque hoy nada los usa por separado.
            impuesto: linea.Impuesto ? (() => {
                const primero = Array.isArray(linea.Impuesto) ? linea.Impuesto[0] : linea.Impuesto;
                return {
                    codigo: primero.Codigo,
                    codigoTarifa: primero.CodigoTarifa || primero.CodigoTarifaIVA,
                    tarifa: parseFloat(primero.Tarifa),
                    monto: this.sumarMontoRepetible(linea.Impuesto, 'Monto')
                };
            })() : null,
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
                // Los dos campos que faltaban y que explican por qué el total
                // del comprobante no siempre es la suma de las líneas — ver
                // migración 022. `otrosCargos` es un cargo a nivel de FACTURA
                // (flete, manejo); `ivaDevuelto` es la devolución de IVA
                // (turistas, zonas francas). Antes ninguno de los dos se leía,
                // así que una factura con cualquiera de los dos "no cuadraba"
                // sin que hubiera dónde ver por qué.
                otrosCargos: parseFloat(resumen.TotalOtrosCargos || 0),
                ivaDevuelto: parseFloat(resumen.TotalIVADevuelto || 0),
                comprobante: parseFloat(resumen.TotalComprobante || 0)
            }
        };
    }

    /**
     * El bloque `<OtrosCargos>` del comprobante: cargos a nivel de FACTURA,
     * no de línea. Es el detalle detrás de `TotalOtrosCargos` — la suma sola
     * dice cuánto, esto dice qué fue y quién lo cobró, que es lo que hace
     * falta para explicarle a una persona una diferencia de miles de colones
     * entre el total y la suma de las líneas.
     */
    static extractOtrosCargos(otrosCargos) {
        if (!otrosCargos) return [];
        const lista = Array.isArray(otrosCargos) ? otrosCargos : [otrosCargos];
        return lista.map((c) => ({
            tipo: c.TipoDocumento || null,
            detalle: c.Detalle || null,
            porcentaje: c.Porcentaje !== undefined ? parseFloat(c.Porcentaje) : null,
            monto: parseFloat(c.MontoCargo || 0)
        }));
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
