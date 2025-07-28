const Imap = require('imap');
const { simpleParser } = require('mailparser');
const imapConfig = require('../config/imap');
const XmlParser = require('./xmlParser');
const DatabaseService = require('./databaseService');
const AlegraService = require('./alegraService');

class EmailService {
    constructor() {
        this.imap = new Imap(imapConfig);
        this.xmlParser = new XmlParser();
        this.dbService = new DatabaseService();
        this.alegraService = new AlegraService();
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.imap.once('ready', () => {
            console.log('📧 Conectado al buzón de Gmail');
            this.checkForNewEmails();
        });

        this.imap.once('error', (err) => {
            console.error('❌ Error IMAP:', err);
        });

        this.imap.once('end', () => {
            console.log('📧 Conexión IMAP cerrada');
        });
    }

    async checkForNewEmails() {
        if (this.imap.state === 'authenticated') {
            console.log('🔍 Buscando facturas de los últimos 15 días...');

            this.imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    console.error('Error abriendo INBOX:', err);
                    return;
                }

                // ===== OPTIMIZACIÓN: BÚSQUEDA DIRECTA POR FECHA =====
                const fechaLimite = new Date();
                fechaLimite.setDate(fechaLimite.getDate() - 30); // Últimos 15 días

                // Formato de fecha para IMAP (DD-MMM-YYYY)
                const fechaIMAPString = this.formatDateForIMAP(fechaLimite);

                console.log(`📅 Buscando emails desde: ${fechaIMAPString} (${fechaLimite.toLocaleDateString()})`);

                // Búsqueda optimizada: emails recientes + con palabra "factura"
                const searchCriteria = [['SINCE', fechaIMAPString]];

                this.imap.search(searchCriteria, (err, results) => {
                    console.log('\n🔍 DEBUG BÚSQUEDA:');
                    console.log('Criterios de búsqueda:', JSON.stringify(searchCriteria, null, 2));
                    console.log('Fecha límite IMAP:', fechaIMAPString);
                    console.log('Resultados encontrados:', results?.length || 0);

                    if (results?.length > 0) {
                        console.log('IDs de emails encontrados:', results.slice(0, 10));
                        console.log('Total emails en búsqueda:', results.length);
                    }

                    if (err) {
                        console.error('Error buscando emails:', err);
                        // Fallback: buscar solo por fecha si falla la búsqueda combinada
                        this.fallbackSearch(fechaIMAPString);
                        return;
                    }

                    if (results.length === 0) {
                        console.log('📭 No hay emails con facturas en los últimos 30 días');
                        console.log('🔍 Intentando búsqueda más amplia...');
                        this.fallbackSearch(fechaIMAPString);
                        return;
                    }

                    console.log(`📬 Facturas encontradas: ${results.length}`);

                    // ===== SIN LÍMITE ARTIFICIAL: Procesar TODAS las facturas encontradas =====
                    console.log(`🎯 Procesando todas las ${results.length} facturas encontradas`);
                    this.processEmails(results);
                });
            });
        } else {
            console.log('⚠️ IMAP no está autenticado. Estado:', this.imap.state);
        }
    }

    // Búsqueda alternativa si falla la primera
    fallbackSearch(fechaIMAPString) {
        console.log('🔄 Búsqueda alternativa: solo por fecha...');

        this.imap.search(['SINCE', fechaIMAPString], (err, results) => {
            if (err) {
                console.error('Error en búsqueda alternativa:', err);
                this.imap.end();
                return;
            }

            if (results.length === 0) {
                console.log('📭 No hay emails en los últimos 15 días');
                this.imap.end();
                return;
            }

            console.log(`📬 Emails encontrados (sin filtro de asunto): ${results.length}`);
            console.log(`🎯 Procesando todos los emails para buscar facturas`);

            this.processEmails(results);
        });
    }

    // Convierte fecha a formato IMAP (DD-MMM-YYYY)
    formatDateForIMAP(date) {
        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        const day = date.getDate().toString().padStart(2, '0');
        const month = months[date.getMonth()];
        const year = date.getFullYear();

        return `${day}-${month}-${year}`;
    }

    processEmails(emailIds) {
        const fetch = this.imap.fetch(emailIds, {
            bodies: '',
            markSeen: false
        });

        let emailsProcessed = 0;
        let facturesFound = 0;

        fetch.on('message', (msg, seqno) => {
            console.log(`📨 Procesando email #${seqno} (${emailsProcessed + 1}/${emailIds.length})`);

            msg.on('body', (stream, info) => {
                simpleParser(stream, (err, parsed) => {
                    if (err) {
                        console.error('Error parseando email:', err);
                        return;
                    }

                    const isFactura = this.handleParsedEmail(parsed, seqno);
                    if (isFactura) facturesFound++;

                    emailsProcessed++;
                });
            });
        });

        fetch.once('error', (err) => {
            console.error('Error fetch:', err);
        });

        fetch.once('end', () => {
            console.log(`\n✅ Procesamiento completado:`);
            console.log(`📧 Emails procesados: ${emailsProcessed}`);
            console.log(`📄 Facturas encontradas: ${facturesFound}`);
            this.imap.end();
        });
    }

    handleParsedEmail(parsed, seqno) {
        const emailDate = new Date(parsed.date);
        const subject = parsed.subject || '';

        // ===== VERIFICACIÓN OPTIMIZADA DE FECHAS =====
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        // Log detallado para debugging
        console.log(`\n📧 EMAIL #${seqno}:`);
        console.log(`📅 Fecha: ${emailDate.toLocaleDateString()} (${emailDate.toISOString()})`);
        console.log(`📝 Asunto: ${subject}`);
        console.log(`👤 De: ${parsed.from?.text || 'Desconocido'}`);

        if (emailDate < fifteenDaysAgo) {
            console.log(`⏰ Email anterior a 15 días, ignorando`);
            return false;
        }

        // ===== FILTRO MÁS FLEXIBLE DE ASUNTO =====
        const esPosibleFactura = (
            subject.toLowerCase().includes('factura') ||
            subject.toLowerCase().includes('invoice') ||
            subject.toLowerCase().includes('fe-') ||
            subject.toLowerCase().includes('documento') ||
            subject.toLowerCase().includes('comprobante') ||
            (parsed.attachments && parsed.attachments.some(att =>
                att.filename && att.filename.toLowerCase().includes('.xml')
            ))
        );

        if (!esPosibleFactura) {
            console.log(`📝 Email no parece contener factura`);
            return false;
        }

        console.log(`📎 Adjuntos: ${parsed.attachments?.length || 0}`);

        // Buscar archivos XML
        let xmlFound = false;
        if (parsed.attachments && parsed.attachments.length > 0) {
            parsed.attachments.forEach((attachment, index) => {
                if (attachment.filename &&
                    typeof attachment.filename === 'string' &&
                    attachment.filename.toLowerCase().includes('.xml')) {

                    console.log(`📎 XML encontrado: ${attachment.filename}`);
                    this.saveXmlAttachment(attachment, seqno);
                    xmlFound = true;
                } else if (attachment.filename) {
                    console.log(`📎 Adjunto: ${attachment.filename}`);
                }
            });
        }

        return xmlFound;
    }

    async saveXmlAttachment(attachment, seqno) {
        console.log(`💾 Procesando XML: ${attachment.filename} (${attachment.size} bytes)`);

        const filename = attachment.filename;

        // ===== DETECCIÓN MEJORADA DE FACTURAS CR =====
        const claveMatch = filename.match(/(\d{50})/);

        const isFacturaCR = (
            filename.startsWith('FE-') ||
            filename.startsWith('TE-') ||
            filename.startsWith('NC-') ||
            filename.startsWith('ND-') ||
            claveMatch ||
            filename.includes('FacturaElectronica') ||
            filename.includes('Factura Electronica') ||
            filename.includes('Factura_XML') ||
            filename.match(/^[0-9]{50}/) ||
            (filename.includes('Factura') && filename.includes('XML')) ||
            filename.includes('TiqueteElectronico') ||
            filename.includes('NotaCredito') ||
            filename.includes('NotaDebito')
        );

        if (isFacturaCR) {
            console.log(`✅ Documento electrónico CR detectado: ${filename}`);

            if (claveMatch) {
                console.log(`🔑 Clave detectada: ${claveMatch[1]}`);
            }

            try {
                // ===== VERIFICAR SI YA EXISTE EN BD =====
                const claveFactura = claveMatch ? claveMatch[1] : null;
                if (claveFactura) {
                    const facturaExistente = await this.dbService.prisma.factura.findUnique({
                        where: { clave: claveFactura }
                    });
                    if (facturaExistente) {
                        console.log(`⚠️ Factura ya existe en BD: ${claveFactura}`);
                        return;
                    }
                }

                // Parsear el XML de la factura
                const facturaData = await this.xmlParser.parseFacturaXML(attachment.content);

                // Validar que sea una factura válida
                this.xmlParser.validateFacturaCR(facturaData);
                if (facturaData.emisor.identificacion.numero === '204050474') {
                    console.log(`🚫 Factura de nuestra empresa (Distribuidora Tachi), ignorando: ${facturaData.numeroConsecutivo}`);
                    return;
                }

                // Generar resumen
                const resumen = this.xmlParser.generateSummary(facturaData);

                console.log(`\n📋 NUEVA FACTURA ENCONTRADA:`);
                console.log(`📄 ${resumen.titulo}`);
                console.log(`🏢 Proveedor: ${resumen.proveedor}`);
                console.log(`📅 Fecha: ${resumen.fecha}`);
                console.log(`📦 Productos: ${resumen.productos}`);
                console.log(`💰 Total: ${resumen.total}`);

                // Procesar la factura parseada
                await this.processParsedFactura(facturaData, filename, `${seqno}`);

            } catch (error) {
                console.error(`❌ Error procesando ${filename}:`, error.message);
            }
        } else {
            console.log(`⚠️ XML no es documento CR: ${filename}`);
        }
    }

    /**
     * Procesa una factura ya parseada - INTEGRACIÓN COMPLETA
     */
    async processParsedFactura(facturaData, filename, emailId) {
        console.log(`\n🔄 Procesando factura: ${filename}`);

        try {
            console.log(`\n🔄 INICIANDO PROCESAMIENTO COMPLETO...`);

            // 1. Guardar factura en base de datos
            console.log('💾 Guardando factura en base de datos...');
            const facturaGuardada = await this.dbService.saveFactura(
                facturaData,
                filename,
                emailId
            );

            // 2. Procesar relacionado inteligente
            console.log('🔍 Iniciando relacionado inteligente...');
            let productosRelacionados = 0;
            let productosPendientes = 0;

            for (const producto of facturaGuardada.productos) {
                console.log(`\n🔍 Procesando: ${producto.descripcion}`);

                const mapeosExistentes = await this.dbService.findSimilarProducts(
                    producto.codigoProveedor,
                    facturaData.emisor.identificacion.numero,
                    producto.descripcion
                );

                if (mapeosExistentes.length > 0) {
                    const mejorMapeo = mapeosExistentes[0];

                    if (mejorMapeo.tipo === 'EXACTO') {
                        // Mapeo exacto encontrado - Relacionar automáticamente
                        console.log(`🎯 Mapeo exacto encontrado: ${mejorMapeo.mapeo.alegraName} (100%)`);

                        await this.dbService.updateProductMapping(
                            producto.id,
                            mejorMapeo.mapeo.alegraItemId,
                            mejorMapeo.mapeo.id,
                            100
                        );

                        console.log(`✅ Relacionado automáticamente por mapeo existente (100%)`);
                        productosRelacionados++;

                    } else if (mejorMapeo.tipo === 'SIMILAR' && mejorMapeo.confianza >= 80) {
                        // Mapeo similar con alta confianza
                        console.log(`💡 Mapeo similar encontrado: ${mejorMapeo.mapeo.alegraName} (${mejorMapeo.confianza}%)`);

                        await this.dbService.updateProductMapping(
                            producto.id,
                            mejorMapeo.mapeo.alegraItemId,
                            mejorMapeo.mapeo.id,
                            mejorMapeo.confianza
                        );

                        console.log(`✅ Relacionado automáticamente por mapeo similar (${mejorMapeo.confianza}%)`);
                        productosRelacionados++;

                    } else {
                        console.log(`⚠️ Mapeo con baja confianza (${mejorMapeo.confianza}%) - Requiere revisión manual`);
                        productosPendientes++;
                    }

                } else {
                    // 3. NO hay mapeos - Buscar en productos de Alegra como fallback
                    console.log(`🔍 No hay mapeos existentes, buscando en productos de Alegra...`);

                    const similaresAlegra = await this.alegraService.findSimilarProducts(
                        producto.descripcion,
                        producto.codigoProveedor
                    );

                    if (similaresAlegra.length > 0) {
                        const mejorMatch = similaresAlegra[0];

                        console.log(`💡 Mejor match en Alegra: ${mejorMatch.name} (${mejorMatch.similarityScore}%)`);

                        if (mejorMatch.similarityScore >= 80) {
                            const mapeoData = {
                                supplierName: facturaData.emisor.nombre,
                                supplierCedula: facturaData.emisor.identificacion.numero,
                                supplierCode: producto.codigoProveedor,
                                supplierDesc: producto.descripcion,
                                alegraItemId: mejorMatch.alegraId,
                                alegraReference: mejorMatch.reference,
                                alegraName: mejorMatch.name,
                                confidence: mejorMatch.similarityScore,
                                createdBy: 'automatic'
                            };

                            const mapeo = await this.dbService.createProductMapping(mapeoData);

                            await this.dbService.updateProductMapping(
                                producto.id,
                                mejorMatch.alegraId,
                                mapeo.id,
                                mejorMatch.similarityScore
                            );

                            console.log(`✅ Relacionado automáticamente y mapeo creado (${mejorMatch.similarityScore}%)`);
                            productosRelacionados++;
                        } else {
                            console.log(`⚠️ Requiere revisión manual (${mejorMatch.similarityScore}%)`);
                            productosPendientes++;
                        }
                    } else {
                        console.log(`❌ Sin productos similares en Alegra`);
                        productosPendientes++;
                    }
                }
            }

            // 3. Actualizar estado
            const estadoFinal = productosPendientes === 0 ? 'RELACIONADA' : 'PROCESADA';
            await this.dbService.prisma.factura.update({
                where: { id: facturaGuardada.id },
                data: { estado: estadoFinal }
            });

            // 4. Resumen
            console.log('\n📊 PROCESAMIENTO COMPLETADO:');
            console.log(`📄 Factura: ${facturaData.numeroConsecutivo}`);
            console.log(`🏢 Proveedor: ${facturaData.emisor.nombre}`);
            console.log(`💰 Total: ${facturaData.resumen.totales.comprobante.toLocaleString()}`);
            console.log(`✅ Relacionados: ${productosRelacionados}`);
            console.log(`⚠️ Pendientes: ${productosPendientes}`);
            console.log(`🔄 Estado: ${estadoFinal}`);
            console.log(`💾 ID: ${facturaGuardada.id}`);

        } catch (error) {
            console.error('❌ Error en procesamiento completo:', error);
        }
    }

    connect() {
        console.log('🔌 Conectando a Gmail para buscar facturas de últimos 15 días...');
        this.imap.connect();
    }

    async disconnect() {
        await this.dbService.disconnect();
        await this.alegraService.disconnect();
    }
}

module.exports = EmailService;