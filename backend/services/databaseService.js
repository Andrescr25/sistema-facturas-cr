const prisma = require('../lib/prisma');
const {
    mapeosDelProveedor, productoDeLineasPorMapeo, recalcularAvance
} = require('../src/modules/productos-revision/relacionPropia');
const { guardarXmlRutaDeFactura, guardarTotalesDelResumen } = require('../src/utils/xmlRutaComprobante');
const almacenamiento = require('../src/integrations/almacenamiento');
const {
    normalizar,
    esReferenciaConfiable,
    calcularScoreSimilitud
} = require('../src/modules/precios/matcher');

const UMBRAL_DESCRIPCION_MAPEO_DEBIL = 70;

function esCodigoGeneradoPorDescripcion(codigo) {
    return String(codigo || '').startsWith('DESC-');
}

function descripcionesCompatibles(actual, guardada) {
    if (!actual || !guardada) return true;
    if (normalizar(actual) === normalizar(guardada)) return true;
    return calcularScoreSimilitud(actual, guardada) >= UMBRAL_DESCRIPCION_MAPEO_DEBIL;
}

function mapeoSeguroParaReusar(producto, mapeo) {
    if (esCodigoGeneradoPorDescripcion(producto.codigo)) return true;
    if (esReferenciaConfiable(producto.codigo)) return true;
    return descripcionesCompatibles(producto.descripcion, mapeo.supplierDesc);
}

class DatabaseService {
    constructor() {
        this.prisma = prisma;
    }

    /**
     * Guarda una factura parseada en la base de datos
     * @param {Object} facturaData - Datos de la factura parseada
     * @param {String} archivoXML - Nombre del archivo XML
     * @param {String} emailId - ID del email (opcional)
     * @param {String} xmlRuta - Ruta del XML ya guardado en almacenamiento
     *   privado (ver `saveXmlAttachment`), o `null` si no se pudo guardar
     * @returns {Object} Factura guardada con productos
     */
    async saveFactura(facturaData, archivoXML, emailId = null, xmlRuta = null) {
        // Marca el punto sin retorno: a partir de acá la fila existe y
        // `xml_ruta` apunta al archivo, así que un error posterior (los
        // mapeos, la cuenta por pagar) ya NO puede borrarlo.
        let facturaCreada = false;
        try {
            console.log(`💾 Guardando factura en BD: ${facturaData.numeroConsecutivo}`);

            // Verificar si la factura ya existe
            const facturaExistente = await this.prisma.factura.findUnique({
                where: { clave: facturaData.clave }
            });

            if (facturaExistente) {
                console.log(`⚠️ Factura ya existe en BD: ${facturaData.clave}`);
                // El XML que se acaba de guardar en disco es un duplicado de
                // uno que la factura existente ya trae (o nunca tuvo): no se
                // deja huérfano.
                if (xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
                return facturaExistente;
            }

            // Antes de buscar mapeos: un restaurante/gasolinera configurado no
            // crea relaciones, costos ni stock. Su registro es una transacción
            // documental propia, sin aceptación fiscal ni pago automáticos.
            const gastos = require('../src/modules/gastos-operativos/gastos.recepcion');
            const tratamiento = await gastos.tratamientoDelProveedor(facturaData.emisor.identificacion.numero);
            const gasto = await gastos.recibirGasto(facturaData, archivoXML, emailId, xmlRuta, tratamiento);
            if (gasto) {
                facturaCreada = !gasto.duplicada;
                if (gasto.duplicada && xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
                return gasto;
            }

            // PASO 1: Buscar mapeos existentes para auto-relacionar productos
            const proveedorCedula = facturaData.emisor.identificacion.numero;
            const productosConMapeo = [];

            console.log(`🔍 Buscando mapeos existentes para proveedor ${proveedorCedula}...`);

            // Los mapeos de todos los códigos de la factura, en UNA consulta y
            // con su producto PROPIO (`producto.id`). Antes era una consulta
            // por línea y lo que se copiaba a la línea era el id de Alegra del
            // mapeo: un producto creado en el sistema, sin ficha allá, se
            // relacionaba a mano una vez y a la factura siguiente volvía a
            // quedar a medias.
            const mapeos = tratamiento === 'mixto' ? new Map()
                : await mapeosDelProveedor(proveedorCedula, facturaData.productos.map(p => p.codigo));

            for (const producto of facturaData.productos) {
                const mapeo = mapeos.get(String(producto.codigo)) || null;

                // UN MAPEO SIN PRODUCTO PROPIO NO RELACIONA NADA. Quedan 4 así,
                // de productos que ya no existen: reusarlos dejaba la línea
                // "relacionada" con nada, y la factura pasaba a revisión de
                // precios con un renglón sin producto.
                if (mapeo && mapeo.productoId && mapeoSeguroParaReusar(producto, mapeo)) {
                    console.log(`✅ Mapeo encontrado: ${producto.codigo} → ${mapeo.productoNombre} (producto ${mapeo.productoId})`);
                    productosConMapeo.push({
                        ...producto,
                        // El id de Alegra va solo como referencia, y sale del
                        // producto propio: sin ficha allá, queda vacío.
                        alegraItemId: mapeo.alegraId,
                        mapeoId: mapeo.id,
                        estadoRelacionado: 'RELACIONADO',
                        confianza: mapeo.confidence
                    });
                } else {
                    if (mapeo && !mapeo.productoId) {
                        console.warn(`⚠️ Mapeo sin producto propio, no se reusa: ${producto.codigo} ("${mapeo.supplierDesc}")`);
                    } else if (mapeo) {
                        console.warn(
                            `⚠️ Mapeo ignorado por código débil/descripción distinta: ` +
                            `${producto.codigo} guardado como "${mapeo.supplierDesc}" y llegó "${producto.descripcion}"`
                        );
                    }
                    console.log(`⚠️ Sin mapeo previo: ${producto.codigo} - ${producto.descripcion.substring(0, 50)}`);
                    productosConMapeo.push({
                        ...producto,
                        estadoRelacionado: 'PENDIENTE'
                    });
                }
            }

            // Los servicios facturados por correo (internet, telefonía) están
            // registrados como gasto recurrente por la cédula de su emisor.
            // Esas facturas NO entran al flujo de compras: nacen con el estado
            // GASTO_RECURRENTE, que Revisión de Precios no lista, y las recoge
            // Pagos Recurrentes. Sin esto, cada mes pedirían relacionar
            // "servicio de internet" con un producto del catálogo.
            let estadoInicial = 'PROCESADA';
            try {
                const facturasRecibidas = require('../src/modules/pagos-recurrentes/scrapers/facturas-recibidas.adapter');
                if (await facturasRecibidas.esEmisorDeGastoRecurrente(proveedorCedula)) {
                    estadoInicial = facturasRecibidas.ESTADO_GASTO_RECURRENTE;
                    console.log(`   💡 ${facturaData.emisor.nombre}: gasto recurrente, no entra a Revisión de Precios`);
                }
            } catch (error) {
                // Si la comprobación falla, la factura sigue el camino normal:
                // es preferible que aparezca de más en Revisión de Precios a
                // que se pierda por un error en una consulta accesoria.
                console.warn('   ⚠️ No se pudo comprobar si es gasto recurrente:', error.message);
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
                    estado: estadoInicial,

                    // Del bloque <Otros>: el vencimiento real y el período de
                    // consumo. La condición de venta no sirve para esto —
                    // Liberty declara contado y plazo 0 con vencimiento a 18
                    // días.
                    fechaVencimiento: (() => {
                        const t = facturaData.fechaVencimientoTexto;
                        if (!t) return null;
                        const cr = String(t).match(/^(\d{2})-(\d{2})-(\d{4})$/);
                        if (cr) return new Date(Number(cr[3]), Number(cr[2]) - 1, Number(cr[1]));
                        const iso = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/);
                        return iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : null;
                    })(),
                    periodoFacturado: facturaData.periodoFacturadoTexto || null,

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
                    productos: {
                        include: {
                            mapeo: true
                        }
                    }
                }
            });

            facturaCreada = true;

            if (tratamiento === 'mixto') {
                await require('../config/database').query(
                    "UPDATE facturas_proveedores SET tratamiento='mixto' WHERE id=$1", [facturaGuardada.id]);
            }

            // La ruta del XML y los totales del resumen se guardan aparte,
            // por SQL (ver el porqué en xmlRutaComprobante.js). No falla si
            // no se puede: la factura ya quedó guardada.
            await guardarXmlRutaDeFactura(facturaGuardada.id, xmlRuta);
            await guardarTotalesDelResumen(facturaGuardada.id, facturaData.resumen?.totales, facturaData.otrosCargos);

            // Las líneas que entraron ya relacionadas por un mapeo existente
            // quedan con el producto propio de ese mapeo (migración 038).
            // Prisma no conoce esa columna, así que se escribe aparte. No falla
            // si no se puede: la factura ya quedó guardada, y registrar la
            // compra sabe caer al producto del mapeo.
            try {
                await productoDeLineasPorMapeo(facturaGuardada.id);
            } catch (error) {
                console.warn('⚠️ No se pudo colgar el producto propio de las líneas:', error.message);
            }

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
                            estado: estadoInicial,
                            liberada: false
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
                            estado: estadoInicial,
                            liberada: false
                        }
                    });
                }
            } catch (cuentaError) {
                console.error('⚠️ Error registrando cuenta por pagar:', cuentaError.message);
            }

            const productosRelacionados = productosConMapeo.filter(p => p.estadoRelacionado === 'RELACIONADO').length;
            const productosPendientes = productosConMapeo.filter(p => p.estadoRelacionado === 'PENDIENTE').length;
            const porcentajeRelacionado = Math.round((productosRelacionados / productosConMapeo.length) * 100);

            // PASO 4: el avance de la factura, contado desde sus líneas con la
            // misma función que usa Relacionar Productos (ver
            // decision/el-avance-de-la-factura-sale-de-sus-lineas en el grafo).
            // El cálculo propio que había acá redondeaba: 199 de 200 daba 100.
            try {
                const [avance] = await recalcularAvance({ facturaId: facturaGuardada.id });
                if (avance?.completa) console.log(`🎉 Factura 100% relacionada automáticamente!`);
            } catch (err) {
                console.log(`⚠️ No se pudo actualizar el avance de la factura: ${err.message}`);
            }

            console.log(`✅ Factura guardada: ${facturaGuardada.id}`);
            console.log(`📦 ${facturaGuardada.productos.length} productos guardados`);
            console.log(`   ✅ ${productosRelacionados} productos auto-relacionados (${porcentajeRelacionado}%)`);
            console.log(`   ⚠️ ${productosPendientes} productos pendientes de relacionar`);

            return facturaGuardada;

        } catch (error) {
            console.error('❌ Error guardando factura:', error);
            // El archivo se guardó en disco antes de llegar acá; si la
            // factura no llegó a existir en la base, no puede quedar un
            // XML sin ningún registro que lo señale. Si SÍ llegó a existir,
            // su fila ya lo señala: borrarlo dejaría la ruta apuntando a nada.
            if (xmlRuta && !facturaCreada) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
            throw error;
        }
    }

    // Se quitaron `findSimilarProducts`, `createProductMapping`,
    // `updateProductMapping`, `getFacturasByEstado` y `getEstadisticas`: no
    // los llamaba nadie, y los tres primeros leían o escribían la relación por
    // el id de Alegra.

    async disconnect() {}
}

module.exports = DatabaseService;
