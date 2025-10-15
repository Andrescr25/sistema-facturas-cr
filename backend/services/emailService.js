const Imap = require('imap');
const { simpleParser } = require('mailparser');
const imapConfig = require('../config/imap');
const XmlParser = require('./xmlParser');
const DatabaseService = require('./databaseService');
const AlegraService = require('./alegraService');

class EmailService {
    constructor() {
        this.imap = null;
        this.xmlParser = new XmlParser();
        this.dbService = new DatabaseService();
        this.alegraService = new AlegraService();
        this.isConnected = false;
        this.isMonitoring = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 30000; // 30 segundos
        this.checkInterval = null;
    }

    /**
     * Configura los event handlers del IMAP
     */
    setupEventHandlers() {
        this.imap.once('ready', () => {
            console.log('📧 ✅ Conectado al buzón de Gmail');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.checkForNewEmails();
        });

        this.imap.on('error', (err) => {
            console.error('❌ Error IMAP:', err.message);
            this.isConnected = false;
            
            // Si es un error de credenciales, no reintentar
            if (err.message && err.message.includes('Invalid credentials')) {
                console.error('🚨 ERROR DE CREDENCIALES IMAP:');
                console.error('   Las credenciales IMAP son inválidas.');
                console.error('   Verifica tu archivo .env:');
                console.error('   1. IMAP_PASSWORD NO debe tener espacios');
                console.error('   2. Debe ser una contraseña de app de Gmail');
                console.error('   3. El acceso IMAP debe estar activado en Gmail');
                console.error('   ℹ️ Monitoreo de emails detenido hasta corregir credenciales');
                this.isMonitoring = false; // Detener monitoreo
                return;
            }
            
            this.handleDisconnection();
        });

        this.imap.once('end', () => {
            console.log('📧 Conexión IMAP cerrada');
            this.isConnected = false;
            this.handleDisconnection();
        });

        // Manejar cierre inesperado
        this.imap.on('close', (hadError) => {
            if (hadError) {
                console.error('⚠️ Conexión cerrada con errores');
            } else {
                console.log('📧 Conexión cerrada normalmente');
            }
            this.isConnected = false;
        });
    }

    /**
     * Maneja la desconexión y reintenta conectar
     */
    handleDisconnection() {
        if (!this.isMonitoring) {
            console.log('🔌 Monitoreo detenido, no se reintentará la conexión');
            return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            console.log(`🔄 Reintentando conexión en ${delay/1000}s (intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.error('❌ Máximo de reintentos alcanzado. Esperando próximo ciclo de verificación...');
            this.reconnectAttempts = 0;
        }
    }

    /**
     * Busca nuevos emails con facturas
     */
    async checkForNewEmails() {
        if (!this.imap || this.imap.state !== 'authenticated') {
            console.log('⚠️ IMAP no está autenticado. Estado:', this.imap?.state || 'no inicializado');
            return;
        }

        console.log('🔍 Buscando facturas de los últimos 30 días...');

        this.imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('❌ Error abriendo INBOX:', err);
                return;
            }

            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - 30);

            const fechaIMAPString = this.formatDateForIMAP(fechaLimite);

            console.log(`📅 Buscando emails desde: ${fechaIMAPString} (${fechaLimite.toLocaleDateString()})`);

            const searchCriteria = [['SINCE', fechaIMAPString]];

            this.imap.search(searchCriteria, (err, results) => {
                if (err) {
                    console.error('❌ Error buscando emails:', err);
                    this.fallbackSearch(fechaIMAPString);
                    return;
                }

                if (results.length === 0) {
                    console.log('📭 No hay emails con facturas en los últimos 30 días');
                    this.scheduleNextCheck();
                    return;
                }

                console.log(`📬 Emails encontrados: ${results.length}`);
                this.processEmails(results);
            });
        });
    }

    /**
     * Búsqueda alternativa si falla la primera
     */
    fallbackSearch(fechaIMAPString) {
        console.log('🔄 Búsqueda alternativa: solo por fecha...');

        this.imap.search(['SINCE', fechaIMAPString], (err, results) => {
            if (err) {
                console.error('❌ Error en búsqueda alternativa:', err);
                this.scheduleNextCheck();
                return;
            }

            if (results.length === 0) {
                console.log('📭 No hay emails en los últimos 30 días');
                this.scheduleNextCheck();
                return;
            }

            console.log(`📬 Emails encontrados (sin filtro de asunto): ${results.length}`);
            this.processEmails(results);
        });
    }

    /**
     * Convierte fecha a formato IMAP (DD-MMM-YYYY)
     */
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

    /**
     * Procesa los emails encontrados
     */
    processEmails(emailIds) {
        const fetch = this.imap.fetch(emailIds, {
            bodies: '',
            markSeen: false
        });

        let emailsProcessed = 0;
        let facturesFound = 0;

        fetch.on('message', (msg, seqno) => {
            msg.on('body', (stream, info) => {
                simpleParser(stream, async (err, parsed) => {
                    if (err) {
                        console.error('❌ Error parseando email:', err);
                        return;
                    }

                    const isFactura = await this.handleParsedEmail(parsed, seqno);
                    if (isFactura) facturesFound++;

                    emailsProcessed++;
                });
            });
        });

        fetch.once('error', (err) => {
            console.error('❌ Error fetch:', err);
        });

        fetch.once('end', () => {
            console.log(`\n✅ Procesamiento completado:`);
            console.log(`📧 Emails procesados: ${emailsProcessed}`);
            console.log(`📄 Facturas encontradas: ${facturesFound}`);
            
            // Programar la próxima revisión
            this.scheduleNextCheck();
        });
    }

    /**
     * Maneja un email parseado
     */
    async handleParsedEmail(parsed, seqno) {
        const emailDate = new Date(parsed.date);
        const subject = parsed.subject || '';

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        if (emailDate < thirtyDaysAgo) {
            return false;
        }

        // Filtro flexible de facturas
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
            return false;
        }

        // Buscar archivos XML
        let xmlFound = false;
        if (parsed.attachments && parsed.attachments.length > 0) {
            for (const attachment of parsed.attachments) {
                if (attachment.filename &&
                    typeof attachment.filename === 'string' &&
                    attachment.filename.toLowerCase().includes('.xml')) {
                    
                    await this.saveXmlAttachment(attachment, seqno);
                    xmlFound = true;
                }
            }
        }

        return xmlFound;
    }

    /**
     * Guarda y procesa un adjunto XML
     */
    async saveXmlAttachment(attachment, seqno) {
        const filename = attachment.filename;

        // Detección mejorada de facturas CR
        const claveMatch = filename.match(/(\d{50})/);

        const isFacturaCR = (
            filename.startsWith('FE-') ||
            filename.startsWith('TE-') ||
            filename.startsWith('NC-') ||
            filename.startsWith('ND-') ||
            claveMatch ||
            filename.includes('FacturaElectronica') ||
            filename.includes('Factura_XML') ||
            filename.match(/^[0-9]{50}/) ||
            (filename.includes('Factura') && filename.includes('XML')) ||
            filename.includes('TiqueteElectronico') ||
            filename.includes('NotaCredito') ||
            filename.includes('NotaDebito')
        );

        if (!isFacturaCR) {
            return;
        }

        console.log(`\n📄 Documento electrónico CR detectado: ${filename}`);

        try {
            // Verificar si ya existe en BD
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
            
            // Ignorar facturas de nuestra propia empresa
            if (facturaData.emisor.identificacion.numero === '204050474') {
                console.log(`🚫 Factura de nuestra empresa (Distribuidora Tachi), ignorando`);
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
    }

    /**
     * Procesa una factura ya parseada - INTEGRACIÓN COMPLETA
     */
    async processParsedFactura(facturaData, filename, emailId) {
        try {
            console.log(`\n🔄 PROCESANDO FACTURA COMPLETA...`);

            // 1. Guardar factura en base de datos
            console.log('💾 Guardando factura en base de datos...');
            const facturaGuardada = await this.dbService.saveFactura(
                facturaData,
                filename,
                emailId
            );

            // 2. Procesar relacionado inteligente (solo productos PENDIENTES)
            console.log('🔍 Iniciando relacionado inteligente...');
            let productosRelacionados = 0;
            let productosPendientes = 0;

            for (const producto of facturaGuardada.productos) {
                // ✅ VERIFICAR SI YA ESTÁ RELACIONADO (por mapeo existente)
                if (producto.estadoRelacionado === 'RELACIONADO') {
                    console.log(`✅ ${producto.descripcion} - YA RELACIONADO (mapeo previo)`);
                    productosRelacionados++;
                    continue; // Saltar este producto
                }

                // Solo procesar productos PENDIENTES
                console.log(`\n🔍 Procesando: ${producto.descripcion}`);

                const similares = await this.alegraService.findSimilarProducts(
                    producto.descripcion,
                    producto.codigoProveedor
                );

                if (similares.length > 0) {
                    const mejorMatch = similares[0];

                    console.log(`💡 Mejor match: ${mejorMatch.name} (${mejorMatch.similarityScore}%)`);

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
                            origen: 'imap' // ✅ Cambiado de 'createdBy: automatic' a 'origen: imap'
                        };

                        const mapeo = await this.dbService.createProductMapping(mapeoData);

                        await this.dbService.updateProductMapping(
                            producto.id,
                            mejorMatch.alegraId,
                            mapeo.id,
                            mejorMatch.similarityScore
                        );

                        console.log(`✅ Relacionado automáticamente (${mejorMatch.similarityScore}%)`);
                        productosRelacionados++;
                    } else {
                        console.log(`⚠️ Requiere revisión manual (${mejorMatch.similarityScore}%)`);
                        productosPendientes++;
                    }
                } else {
                    console.log(`❌ Sin productos similares`);
                    productosPendientes++;
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
            console.log(`💰 Total: ₡${facturaData.resumen.totales.comprobante.toLocaleString()}`);
            console.log(`✅ Relacionados: ${productosRelacionados}`);
            console.log(`⚠️ Pendientes: ${productosPendientes}`);
            console.log(`🔄 Estado: ${estadoFinal}`);
            console.log(`💾 ID: ${facturaGuardada.id}`);

        } catch (error) {
            console.error('❌ Error en procesamiento completo:', error);
        }
    }

    /**
     * Programa la próxima revisión
     */
    scheduleNextCheck() {
        // Cerrar la conexión actual
        if (this.imap && this.isConnected) {
            this.imap.end();
        }

        if (!this.isMonitoring) {
            console.log('🔌 Monitoreo detenido');
            return;
        }

        // Programar próxima revisión en 15 minutos
        const nextCheckDelay = 15 * 60 * 1000; // 15 minutos
        console.log(`⏰ Próxima revisión en ${nextCheckDelay/60000} minutos...`);
        
        this.checkInterval = setTimeout(() => {
            console.log('\n🔄 ========== NUEVA REVISIÓN DE EMAILS ==========');
            this.connect();
        }, nextCheckDelay);
    }

    /**
     * Inicia el monitoreo continuo
     */
    startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ El monitoreo ya está activo');
            return;
        }

        console.log('🚀 ========== INICIANDO MONITOREO CONTINUO DE EMAILS ==========');
        console.log('📧 Sistema de extracción automática de facturas');
        console.log('🔄 Revisión cada 15 minutos');
        console.log('📅 Busca facturas de los últimos 30 días\n');

        this.isMonitoring = true;
        this.connect();
    }

    /**
     * Detiene el monitoreo continuo
     */
    stopMonitoring() {
        console.log('🛑 Deteniendo monitoreo de emails...');
        this.isMonitoring = false;
        
        if (this.checkInterval) {
            clearTimeout(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.imap && this.isConnected) {
            this.imap.end();
        }
    }

    /**
     * Conecta al servidor IMAP
     */
    connect() {
        if (!imapConfig.user || !imapConfig.password) {
            console.error('❌ Configuración IMAP incompleta. Verifica IMAP_USER e IMAP_PASSWORD en .env');
            return;
        }

        console.log('🔌 Conectando a Gmail...');
        
        // Crear nueva instancia de IMAP
        this.imap = new Imap(imapConfig);
        this.setupEventHandlers();
        this.imap.connect();
    }

    /**
     * Desconecta y limpia recursos
     */
    async disconnect() {
        this.stopMonitoring();
        await this.dbService.disconnect();
        console.log('✅ Servicio de email desconectado');
    }
}

module.exports = EmailService;

