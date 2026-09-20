const Imap = require('imap');
const { simpleParser } = require('mailparser');
const imapConfig = require('../config/imap');
const XmlParser = require('./xmlParser');
const DatabaseService = require('./databaseService');
const notasCreditoService = require('./notasCreditoService');
const { getProductService } = require('../src/integrations/alegra');
const almacenamiento = require('../src/integrations/almacenamiento');

// Configuración de logging
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;

class EmailService {
    constructor() {
        this.imap = null;
        this.xmlParser = new XmlParser();
        this.dbService = new DatabaseService();
        this.alegraProductService = getProductService();
        this.isConnected = false;
        this.isMonitoring = false;
        this.isClosingIntentionally = false; // ✅ Flag para evitar reconexión cuando cerramos a propósito
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 30000; // 30 segundos
        this.checkInterval = null;
        this.lastCheckTime = null; // ✅ Para debugging
    }

    /**
     * Configura los event handlers del IMAP
     */
    setupEventHandlers() {
        this.imap.once('ready', () => {
            console.log('📧 ✅ Conectado al buzón de Gmail');
            this.isConnected = true;
            this.isClosingIntentionally = false;
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
            
            // ✅ Solo reconectar si no fue cierre intencional
            if (!this.isClosingIntentionally) {
                this.handleDisconnection();
            }
        });

        this.imap.once('end', () => {
            console.log('📧 Conexión IMAP cerrada');
            this.isConnected = false;
            // ✅ Solo reconectar si no fue cierre intencional
            if (!this.isClosingIntentionally) {
                this.handleDisconnection();
            }
        });

        // ✅ FIX: Manejar cierre inesperado - AHORA también llama handleDisconnection
        this.imap.on('close', (hadError) => {
            if (hadError) {
                console.error('⚠️ Conexión cerrada con errores');
            } else {
                console.log('📧 Conexión cerrada (close event)');
            }
            this.isConnected = false;
            
            // ✅ FIX: Llamar handleDisconnection si no fue cierre intencional
            if (!this.isClosingIntentionally && this.isMonitoring) {
                console.log('🔄 Reconectando después de cierre inesperado...');
                this.handleDisconnection();
            }
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
            // ✅ FIX: En lugar de solo resetear, programar la próxima revisión
            console.log('⚠️ Máximo de reintentos alcanzado. Programando próxima revisión en 15 minutos...');
            this.reconnectAttempts = 0;
            // Programar siguiente check aunque hayan fallado los reintentos
            this.scheduleNextCheck();
        }
    }

    /**
     * Busca nuevos emails con facturas
     */
    async checkForNewEmails() {
        if (!this.imap || this.imap.state !== 'authenticated') {
            console.log('⚠️ IMAP no está autenticado. Estado:', this.imap?.state || 'no inicializado');
            // ✅ FIX: Siempre programar siguiente revisión aunque haya error
            this.scheduleNextCheck();
            return;
        }

        console.log('🔍 Buscando facturas de los últimos 30 días...');

        // openBox también puede lanzar de forma síncrona si la conexión murió
        // justo después del 'ready'.
        try {
            this.imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('❌ Error abriendo INBOX:', err);
                // ✅ FIX: Siempre programar siguiente revisión aunque haya error
                this.scheduleNextCheck();
                return;
            }

            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - 30);

            const fechaIMAPString = this.formatDateForIMAP(fechaLimite);

            console.log(`📅 Buscando emails desde: ${fechaIMAPString} (${fechaLimite.toLocaleDateString()})`);

            const searchCriteria = [['SINCE', fechaIMAPString]];

            // OJO: imap.search() lanza la excepción de forma SÍNCRONA cuando la
            // conexión se cayó entre el openBox y este punto ("No mailbox is
            // currently selected") — no la reporta por el callback. Como esto
            // corre dentro de un callback, sin este try/catch esa excepción sube
            // hasta el handler de uncaughtException de server.js y apaga el
            // servidor ENTERO: un tropiezo de Gmail dejaba sin API a facturación,
            // catálogo y todo lo demás. Visto en producción local.
            try {
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
            } catch (error) {
                console.error('❌ La conexión IMAP se cayó antes de poder buscar:', error.message);
                this.scheduleNextCheck();
            }
            });
        } catch (error) {
            console.error('❌ La conexión IMAP se cayó antes de abrir el buzón:', error.message);
            this.scheduleNextCheck();
        }
    }

    /**
     * Búsqueda alternativa si falla la primera
     */
    fallbackSearch(fechaIMAPString) {
        console.log('🔄 Búsqueda alternativa: solo por fecha...');

        // Mismo motivo que en checkForNewEmails: search() puede lanzar de forma
        // síncrona si la conexión ya no tiene buzón seleccionado.
        try {
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
        } catch (error) {
            console.error('❌ La conexión IMAP se cayó en la búsqueda alternativa:', error.message);
            this.scheduleNextCheck();
        }
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
    async processEmails(emailIds) {
        try {
            console.log(`📩 Procesando ${emailIds.length} emails en lotes de 3 para proteger la BD...`);

            // Dividir en lotes de 3
            const BATCH_SIZE = 3;
            const batches = [];
            for (let i = 0; i < emailIds.length; i += BATCH_SIZE) {
                batches.push(emailIds.slice(i, i + BATCH_SIZE));
            }

            let emailsProcessed = 0;
            let facturesFound = 0;

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`🔄 Procesando lote ${i + 1}/${batches.length} (${batch.length} emails)...`);

                // Procesar lote actual y ESPERAR a que termine
                const results = await this.processEmailBatch(batch);
                
                emailsProcessed += results.processed;
                facturesFound += results.found;

                // Pequeña pausa entre lotes para dejar respirar a la BD
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            console.log(`\n✅ Procesamiento completado:`);
            console.log(`📧 Emails procesados: ${emailsProcessed}`);
            console.log(`📄 Facturas encontradas: ${facturesFound}`);

            // Al final y no por cada NC: una nota puede llegar en el mismo
            // lote que su factura, así que aplicarlas cuando ya se ingirió
            // todo evita dejarlas pendientes hasta la próxima corrida.
            try {
                const aplicadas = await notasCreditoService.aplicarNotasCreditoPendientes();
                if (aplicadas.length > 0) {
                    console.log(`💳 Notas de crédito aplicadas: ${aplicadas.length}`);
                }
            } catch (error) {
                console.error('❌ Error aplicando notas de crédito:', error.message);
            }

            this.scheduleNextCheck();

        } catch (error) {
            console.error('❌ Error en processEmails:', error);
            this.scheduleNextCheck();
        }
    }

    /**
     * Procesa un lote específico de emails
     */
    processEmailBatch(batchIds) {
        return new Promise((resolve) => {
            let processed = 0;
            let found = 0;
            let pending = batchIds.length;

            const fetch = this.imap.fetch(batchIds, {
                bodies: '',
                markSeen: false
            });

            fetch.on('message', (msg, seqno) => {
                msg.on('body', (stream, info) => {
                    simpleParser(stream, async (err, parsed) => {
                        if (!err) {
                            const isFactura = await this.handleParsedEmail(parsed, seqno);
                            if (isFactura) found++;
                        }
                        processed++;
                        pending--;
                        if (pending === 0) resolve({ processed, found });
                    });
                });
            });

            fetch.once('error', (err) => {
                console.error('❌ Error fetch batch:', err);
                resolve({ processed, found }); // Resolver aunque falle para continuar con sgte lote
            });

            fetch.once('end', () => {
                // Fallback por si el conteo manual falla
                if (pending > 0) {
                     // Esperar un poco más por si quedan parsers pendientes
                     setTimeout(() => resolve({ processed, found }), 5000);
                }
            });
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

        const normalizedFilename = filename.toLowerCase();
        const isXmlFile = normalizedFilename.endsWith('.xml');
        const numericSequenceMatch = filename.match(/\d{20,50}/);

        let xmlPreview = '';
        let containsKnownTag = false;

        if (isXmlFile) {
            const previewLength = Math.min(2048, attachment.content.length);
            xmlPreview = attachment.content.toString('utf8', 0, previewLength);
            containsKnownTag = /<(FacturaElectronica|NotaCreditoElectronica|NotaDebitoElectronica|TiqueteElectronico)/i.test(xmlPreview);
        }

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
            filename.includes('NotaDebito') ||
            (isXmlFile && numericSequenceMatch) ||
            (isXmlFile && containsKnownTag)
        );

        if (!isFacturaCR) {
            return;
        }

        if (VERBOSE_LOGGING) console.log(`\n📄 Documento electrónico CR detectado: ${filename}`);

        // EL XML SE GUARDA ACÁ, ANTES DE PARSEAR NADA — es la última vez que
        // el Buffer completo existe en el camino. Hasta hoy se parseaba y se
        // descartaba: la columna `archivo_xml` solo guarda el NOMBRE del
        // adjunto, nunca su contenido (comprobado en las 862/882 facturas ya
        // recibidas: ninguna trae un `<`). Se guarda como ruta, no como
        // contenido — mismo criterio que las facturas de venta
        // (`independencia/015`) — en un almacenamiento que NO se sirve por
        // HTTP: un comprobante fiscal no puede quedar accesible sin sesión.
        //
        // Que no se pueda guardar no puede tumbar la ingestión: se sigue sin
        // él, como se venía haciendo hasta ahora.
        let xmlGuardado = null;
        try {
            xmlGuardado = await almacenamiento.guardarArchivo({
                carpeta: 'compras-proveedor',
                prefijo: 'xml',
                buffer: attachment.content,
                extension: 'xml'
            });
        } catch (error) {
            console.error(`⚠️ No se pudo guardar el XML de ${filename}:`, error.message);
        }
        const xmlRuta = xmlGuardado?.ruta || null;

        // Las notas de crédito se desvían ANTES del flujo de compra: no son
        // una compra, son un descuento sobre una factura anterior. Meterlas
        // por el camino normal sumaría productos al inventario que en
        // realidad se devolvieron o ni siquiera se movieron.
        if (XmlParser.esNotaCredito(attachment.content)) {
            return this.procesarNotaCredito(attachment.content, filename, xmlRuta);
        }

        try {
            // Verificar si ya existe en BD
            let claveFactura = claveMatch ? claveMatch[1] : null;

            let xmlContentFull = null;

            if (!claveFactura && xmlPreview) {
                const claveFromPreview = xmlPreview.match(/<Clave>(\d{50})<\/Clave>/);
                if (claveFromPreview) {
                    claveFactura = claveFromPreview[1];
                }
            }

            if (!claveFactura && isXmlFile) {
                xmlContentFull = attachment.content.toString('utf8');
                const claveFromContent = xmlContentFull.match(/<Clave>(\d{50})<\/Clave>/);
                if (claveFromContent) {
                    claveFactura = claveFromContent[1];
                }
            }

            if (claveFactura) {
                const facturaExistente = await this.dbService.prisma.factura.findUnique({
                    where: { clave: claveFactura }
                });
                if (facturaExistente) {
                    if (VERBOSE_LOGGING) console.log(`⚠️ Factura ya existe en BD: ${claveFactura}`);
                    if (xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
                    return;
                }
            }

            // Parsear el XML de la factura
            const facturaData = await this.xmlParser.parseFacturaXML(attachment.content);

            // Validar que sea una factura válida
            this.xmlParser.validateFacturaCR(facturaData);

            // Ignorar facturas de nuestra propia empresa
            if (facturaData.emisor.identificacion.numero === '204050474') {
                if (VERBOSE_LOGGING) console.log(`🚫 Factura de nuestra empresa (Distribuidora Tachi), ignorando`);
                if (xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
                return;
            }

            // Generar resumen
            const resumen = this.xmlParser.generateSummary(facturaData);

            if (VERBOSE_LOGGING) {
                console.log(`\n📋 NUEVA FACTURA ENCONTRADA:`);
                console.log(`📄 ${resumen.titulo}`);
                console.log(`🏢 Proveedor: ${resumen.proveedor}`);
                console.log(`📅 Fecha: ${resumen.fecha}`);
                console.log(`📦 Productos: ${resumen.productos}`);
                console.log(`💰 Total: ${resumen.total}`);
            }

            // Procesar la factura parseada
            await this.processParsedFactura(facturaData, filename, `${seqno}`, xmlRuta);

        } catch (error) {
            console.error(`❌ Error procesando ${filename}:`, error.message);
            if (xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
        }
    }

    /**
     * Guarda una nota de crédito de proveedor. Solo afecta el dinero que se
     * le debe (ver notasCreditoService); el inventario queda marcado para
     * revisión humana porque el XML no distingue una devolución física de una
     * corrección de precio.
     */
    async procesarNotaCredito(contenido, filename, xmlRuta = null) {
        try {
            const nc = await this.xmlParser.parseNotaCreditoXML(contenido);
            this.xmlParser.validateNotaCredito(nc);

            // Las notas emitidas por nosotros mismos no son un crédito a
            // nuestro favor — mismo criterio que con las facturas.
            if (nc.emisor.identificacion?.numero === '204050474') {
                if (VERBOSE_LOGGING) console.log('🚫 Nota de crédito emitida por nosotros, ignorando');
                if (xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
                return false;
            }

            // `guardarNotaCredito` ya borra el XML si resulta ser un
            // duplicado (`ON CONFLICT DO NOTHING`), así que acá no hace
            // falta repetirlo.
            const { guardada } = await notasCreditoService.guardarNotaCredito(nc, xmlRuta);
            if (guardada) {
                console.log(`💳 Nota de crédito de ${nc.emisor.nombre}: ₡${nc.montoTotal} sobre la factura ${nc.claveReferencia} (${nc.razon || 'sin razón'})`);
            } else if (VERBOSE_LOGGING) {
                console.log(`⚠️ Nota de crédito ya registrada: ${nc.clave}`);
            }
            return true;
        } catch (error) {
            console.error(`❌ Error procesando nota de crédito ${filename}:`, error.message);
            if (xmlRuta) await almacenamiento.borrarPrivado(xmlRuta).catch(() => {});
            return false;
        }
    }

    /**
     * Procesa una factura ya parseada - INTEGRACIÓN COMPLETA
     */
    async processParsedFactura(facturaData, filename, emailId, xmlRuta = null) {
        try {
            if (VERBOSE_LOGGING) console.log(`\n🔄 PROCESANDO FACTURA COMPLETA...`);

            // 1. Guardar factura en base de datos
            if (VERBOSE_LOGGING) console.log('💾 Guardando factura en base de datos...');
            const facturaGuardada = await this.dbService.saveFactura(
                facturaData,
                filename,
                emailId,
                xmlRuta
            );

            // 2. Procesar relacionado inteligente (solo productos PENDIENTES)
            if (VERBOSE_LOGGING) console.log('🔍 Iniciando relacionado inteligente...');
            let productosRelacionados = 0;
            let productosPendientes = 0;

            for (const producto of facturaGuardada.productos) {
                // ✅ VERIFICAR SI YA ESTÁ RELACIONADO (por mapeo existente)
                // Un mapeo existente lo puso una persona: se reusa sin
                // preguntar y sin volver a evaluarlo. Ese es todo el valor de
                // guardarlo — la segunda vez ya no hay que decidir nada.
                if (producto.estadoRelacionado === 'RELACIONADO') {
                    if (VERBOSE_LOGGING) console.log(`✅ ${producto.descripcion} - YA RELACIONADO (mapeo previo)`);
                    productosRelacionados++;
                    continue;
                }

                // Solo procesar productos PENDIENTES
                if (VERBOSE_LOGGING) console.log(`\n🔍 Procesando: ${producto.descripcion}`);

                // NO SE CREA NINGÚN MAPEO AUTOMÁTICO.
                //
                // Antes, un parecido de texto del 80% bastaba para crear el
                // mapeo y darlo por bueno para siempre. Un acierto del 80% en
                // nombres de ferretería —"DISCO 4 1/2" contra "DISCO 4 1/2
                // 1000 HOJAS"— es una moneda al aire, y el error quedaba
                // grabado: la siguiente factura lo reusaba sin volver a
                // mirarlo, y el costo del producto equivocado terminaba
                // afectando su precio de venta.
                //
                // La primera vez lo decide una persona en Revisión de
                // Precios. A partir de ahí el sistema lo reusa solo, que es
                // cuando de verdad hay certeza.
                const similares = await this.alegraProductService.findSimilarProducts(
                    producto.descripcion,
                    producto.codigoProveedor
                );

                if (similares.length > 0) {
                    // Solo se registra en el log como pista para quien revise.
                    console.log(`💡 Posible coincidencia (sin aplicar): ${similares[0].name}`);
                    productosPendientes++;
                } else {
                    console.log(`❌ Sin productos similares`);
                    productosPendientes++;
                }
            }

            // 3. Actualizar estado — salvo que la factura ya se haya marcado
            // como gasto recurrente al guardarla. Ese estado la mantiene fuera
            // de Revisión de Precios a propósito, y pisarlo acá con
            // PROCESADA/RELACIONADA la devolvía al flujo de compras: era la
            // razón por la que la intercepción "funcionaba" en el log y aun
            // así la factura terminaba en PROCESADA.
            //
            // `estadoFinal` se declara ACÁ AFUERA, no dentro del `if`: estaba
            // adentro y se leía en el resumen de más abajo, fuera de ese
            // bloque. Eso lanzaba `ReferenceError: estadoFinal is not
            // defined` en TODA factura procesada, atrapado por el catch de
            // esta función — la factura ya estaba guardada, así que no se
            // perdía nada, pero el log decía "Error en procesamiento
            // completo" siempre, incluso cuando todo había salido bien.
            let estadoFinal = facturaGuardada.estado;
            if (facturaGuardada.estado !== 'GASTO_RECURRENTE') {
                estadoFinal = productosPendientes === 0 ? 'RELACIONADA' : 'PROCESADA';
                await this.dbService.prisma.factura.update({
                    where: { id: facturaGuardada.id },
                    data: { estado: estadoFinal }
                });
            }

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
        // ✅ Marcar que estamos cerrando intencionalmente
        this.isClosingIntentionally = true;
        
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
        this.lastCheckTime = new Date();
        console.log(`⏰ Próxima revisión en ${nextCheckDelay/60000} minutos (${new Date(Date.now() + nextCheckDelay).toLocaleTimeString()})...`);
        
        this.checkInterval = setTimeout(() => {
            console.log('\n🔄 ========== NUEVA REVISIÓN DE EMAILS ==========');
            console.log(`📅 Hora: ${new Date().toLocaleString()}`);
            this.isClosingIntentionally = false; // ✅ Resetear flag antes de conectar
            this.connect();
        }, nextCheckDelay);
    }

    /**
     * Inicia el monitoreo continuo
     */
    startMonitoring() {
        // Rama aislada: el buzón es el mismo que usa producción. Leerlo desde
        // acá metería facturas reales en la copia y competiría con main.
        // Misma llave que revisa `connect()` — antes cada método tenía la
        // suya y quedaban desincronizadas si alguien encendía una sin la otra.
        if (!require('../config/aislado').lecturaBuzonPermitida()) {
            console.log('📭 Rama aislada: el buzón de facturas no se lee sin PERMITIR_LECTURA_BUZON=true (ver config/aislado.js)');
            return;
        }
        if (this.isMonitoring) {
            console.log('⚠️ El monitoreo ya está activo');
            return;
        }

        console.log('🚀 ========== INICIANDO MONITOREO CONTINUO DE EMAILS ==========');
        console.log('📧 Sistema de extracción automática de facturas');
        console.log('🔄 Revisión cada 15 minutos');
        console.log('📅 Busca facturas de los últimos 30 días');
        console.log('🐕 Watchdog activo cada 20 minutos\n');

        this.isMonitoring = true;
        this.lastCheckTime = new Date();
        this.connect();
        
        // ✅ WATCHDOG: Verificar cada 20 minutos que el polling sigue activo
        this.watchdogInterval = setInterval(() => {
            const now = new Date();
            const minutesSinceLastCheck = (now - this.lastCheckTime) / (1000 * 60);
            
            console.log(`🐕 Watchdog: Última revisión hace ${minutesSinceLastCheck.toFixed(1)} minutos`);
            
            // Si han pasado más de 20 minutos sin un check, algo salió mal - reiniciar
            if (minutesSinceLastCheck > 20 && this.isMonitoring) {
                console.log('🐕⚠️ Watchdog: Polling parece detenido! Reiniciando...');
                
                // Limpiar cualquier timer pendiente
                if (this.checkInterval) {
                    clearTimeout(this.checkInterval);
                    this.checkInterval = null;
                }
                
                // Forzar nueva conexión
                this.isClosingIntentionally = false;
                this.reconnectAttempts = 0;
                this.connect();
            }
        }, 20 * 60 * 1000); // Cada 20 minutos
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
        
        // ✅ Limpiar watchdog
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }

        if (this.imap && this.isConnected) {
            this.imap.end();
        }
    }

    /**
     * Conecta al servidor IMAP
     */
    connect() {
        // Rama aislada: el buzón es el mismo que usa producción. Esta guarda
        // vivía SOLO en `startMonitoring()`; algo que llamara a `connect()`
        // directamente se conectaba sin que nada lo frenara. Un recuperador
        // de XML históricos (ver scripts/independencia/) es exactamente ese
        // "algo", así que ahora la revisión está acá también.
        if (!require('../config/aislado').lecturaBuzonPermitida()) {
            console.log('📭 Rama aislada: el buzón de facturas no se lee sin PERMITIR_LECTURA_BUZON=true (ver config/aislado.js)');
            return;
        }

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

