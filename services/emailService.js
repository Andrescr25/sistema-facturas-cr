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
        console.log('🔍 Buscando emails del último mes...');

        this.imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Error abriendo INBOX:', err);
                return;
            }

            // Por ahora, buscar todos los emails
            // Filtraremos por fecha en el código JavaScript
            console.log(`📅 Buscando emails con facturas...`);

            this.imap.search(['ALL'], (err, results) => {
                if (err) {
                    console.error('Error buscando emails:', err);
                    return;
                }

                if (results.length === 0) {
                    console.log('📭 No hay emails');
                    this.imap.end();
                    return;
                }

                console.log(`📬 Total emails encontrados: ${results.length}`);
                
                // Tomar solo los últimos 20 emails
                const recentResults = results.slice(-20);
                console.log(`🎯 Procesando los últimos ${recentResults.length} emails`);
                
                this.processEmails(recentResults);
            });
        });
    }

    processEmails(emailIds) {
        const fetch = this.imap.fetch(emailIds, {
            bodies: '',
            markSeen: false  // No marcar como leído por ahora
        });

        fetch.on('message', (msg, seqno) => {
            console.log(`📨 Procesando email #${seqno}`);

            msg.on('body', (stream, info) => {
                simpleParser(stream, (err, parsed) => {
                    if (err) {
                        console.error('Error parseando email:', err);
                        return;
                    }

                    this.handleParsedEmail(parsed, seqno);
                });
            });
        });

        fetch.once('error', (err) => {
            console.error('Error fetch:', err);
        });

        fetch.once('end', () => {
            console.log('✅ Procesamiento de emails completado');
            this.imap.end();
        });
    }

    handleParsedEmail(parsed, seqno) {
        // Filtrar por fecha (último mes)
        const emailDate = new Date(parsed.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        if (emailDate < thirtyDaysAgo) {
            console.log(`⏰ Email muy antiguo, ignorando: ${emailDate.toDateString()}`);
            return;
        }

        // Filtrar por asunto (que contenga "factura")
        const subject = parsed.subject || '';
        if (!subject.toLowerCase().includes('factura')) {
            console.log(`📝 Email no es factura, ignorando: ${subject}`);
            return;
        }

        console.log(`\n📧 EMAIL #${seqno}:`);
        console.log(`De: ${parsed.from?.text || 'Desconocido'}`);
        console.log(`Asunto: ${subject}`);
        console.log(`Fecha: ${parsed.date || 'Sin fecha'}`);
        console.log(`Adjuntos: ${parsed.attachments?.length || 0}`);

        // Buscar archivos XML - CON VALIDACIÓN
        if (parsed.attachments && parsed.attachments.length > 0) {
            parsed.attachments.forEach((attachment, index) => {
                // VALIDAR que filename existe y no es undefined
                if (attachment.filename &&
                    typeof attachment.filename === 'string' &&
                    attachment.filename.toLowerCase().includes('.xml')) {

                    console.log(`📎 XML encontrado: ${attachment.filename}`);
                    this.saveXmlAttachment(attachment, seqno);
                } else if (attachment.filename) {
                    console.log(`📎 Adjunto ignorado: ${attachment.filename} (no XML)`);
                } else {
                    console.log(`📎 Adjunto sin nombre (#${index}) - ignorado`);
                }
            });
        }
    }

    async saveXmlAttachment(attachment, seqno) {
        console.log(`💾 XML para procesar: ${attachment.filename} (${attachment.size} bytes)`);

        // DETECCIÓN MEJORADA de facturas de Costa Rica
        const filename = attachment.filename;
        
        // Buscar clave de 50 dígitos en el nombre del archivo
        const claveMatch = filename.match(/(\d{50})/);
        
        // Patrones que indican factura de Costa Rica
        const isFacturaCR = (
            filename.startsWith('FE-') ||                           // Formato estándar: FE-xxxxx.xml
            claveMatch ||                                           // Contiene clave de 50 dígitos
            filename.includes('FacturaElectronica') ||              // FacturaElectronica506xxx.xml
            filename.includes('Factura_XML') ||                     // Factura_XML_xxx.xml
            filename.match(/^[0-9]{50}/) ||                        // Empieza con 50 dígitos
            (filename.includes('Factura') && filename.includes('XML'))
        );

        if (isFacturaCR) {
            console.log(`✅ Factura CR detectada: ${filename}`);
            
            if (claveMatch) {
                console.log(`🔑 Clave detectada: ${claveMatch[1]}`);
            }
            
            try {
                // Parsear el XML de la factura
                const facturaData = await this.xmlParser.parseFacturaXML(attachment.content);
                
                // Validar que sea una factura válida
                this.xmlParser.validateFacturaCR(facturaData);
                
                // Generar resumen
                const resumen = this.xmlParser.generateSummary(facturaData);
                
                console.log(`\n📋 RESUMEN DE FACTURA:`);
                console.log(`📄 ${resumen.titulo}`);
                console.log(`🏢 Proveedor: ${resumen.proveedor}`);
                console.log(`📅 Fecha: ${resumen.fecha}`);
                console.log(`📦 Productos: ${resumen.productos}`);
                console.log(`💰 Total: ${resumen.total}`);
                
                // Procesar la factura parseada CON INTEGRACIÓN COMPLETA
                await this.processParsedFactura(facturaData, filename, `${seqno}`);
                
            } catch (error) {
                console.error(`❌ Error procesando factura ${filename}:`, error.message);
                
                // Si es error de parsing, podría ser formato diferente
                if (error.message.includes('XML no es una factura')) {
                    console.log(`⚠️ Posible formato XML diferente, verificando...`);
                } else {
                    console.log(`💡 Revisar estructura del XML de ${filename}`);
                }
            }
        } else {
            console.log(`⚠️ XML no es factura CR: ${filename}`);
        }
    }

    /**
     * Procesa una factura ya parseada - CON INTEGRACIÓN COMPLETA
     */
    async processParsedFactura(facturaData, filename, emailId) {
        console.log(`\n🔄 Procesando factura: ${filename}`);
        
        // Mostrar productos para relacionado inteligente
        facturaData.productos.forEach((producto, index) => {
            console.log(`\n📦 PRODUCTO ${index + 1}:`);
            console.log(`   Código proveedor: ${producto.codigo}`);
            console.log(`   Código comercial: ${producto.codigoComercial?.codigo || 'N/A'}`);
            console.log(`   Descripción: ${producto.descripcion}`);
            console.log(`   Cantidad: ${producto.cantidad} ${producto.unidadMedida}`);
            console.log(`   Precio unitario: ₡${producto.precioUnitario.toLocaleString()}`);
            
            if (producto.descuento) {
                console.log(`   Descuento: ₡${producto.descuento.monto.toLocaleString()} (${producto.descuento.naturaleza})`);
            }
            
            if (producto.impuesto) {
                console.log(`   Impuesto: ${producto.impuesto.tarifa}% = ₡${producto.impuesto.monto.toLocaleString()}`);
            }
            
            console.log(`   💰 Total línea: ₡${producto.montoTotalLinea.toLocaleString()}`);
        });
        
        console.log(`\n💡 Esta factura está lista para el relacionado inteligente`);
        console.log(`🎯 Proveedor: ${facturaData.emisor.nombre}`);
        console.log(`📋 Cédula: ${facturaData.emisor.identificacion.numero}`);
        console.log(`📞 Teléfono: ${facturaData.emisor.telefono?.numero || 'N/A'}`);
        console.log(`📧 Email: ${facturaData.emisor.correoElectronico || 'N/A'}`);
        
        // ====== INTEGRACIÓN COMPLETA ======
        try {
            console.log(`\n🔄 INICIANDO PROCESAMIENTO COMPLETO...`);
            
            // 1. Guardar factura en base de datos
            console.log('💾 Guardando factura en base de datos...');
            const facturaGuardada = await this.dbService.saveFactura(
                facturaData, 
                filename, 
                emailId
            );

            // 2. Procesar relacionado inteligente para cada producto
            console.log('🔍 Iniciando relacionado inteligente...');
            let productosRelacionados = 0;
            let productosPendientes = 0;

            for (const producto of facturaGuardada.productos) {
                console.log(`\n🔍 Procesando producto: ${producto.descripcion}`);

                // Buscar productos similares en Alegra
                const similares = await this.alegraService.findSimilarProducts(
                    producto.descripcion,
                    producto.codigoProveedor
                );

                if (similares.length > 0) {
                    // Tomar el producto con mayor similitud
                    const mejorMatch = similares[0];
                    
                    console.log(`💡 Mejor match encontrado: ${mejorMatch.name} (${mejorMatch.similarityScore}%)`);
                    
                    if (mejorMatch.similarityScore >= 80) {
                        // Crear mapeo automático para productos con alta confianza
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
                        
                        // Actualizar producto con la relación
                        await this.dbService.updateProductMapping(
                            producto.id,
                            mejorMatch.alegraId,
                            mapeo.id,
                            mejorMatch.similarityScore
                        );

                        console.log(`✅ Producto relacionado automáticamente: ${mejorMatch.name} (${mejorMatch.similarityScore}%)`);
                        productosRelacionados++;
                    } else {
                        console.log(`⚠️ Producto requiere revisión manual (${mejorMatch.similarityScore}%)`);
                        productosPendientes++;
                    }
                } else {
                    console.log(`❌ No se encontraron productos similares`);
                    productosPendientes++;
                }
            }

            // 3. Actualizar estado de la factura
            const estadoFinal = productosPendientes === 0 ? 'RELACIONADA' : 'PROCESADA';
            await this.dbService.prisma.factura.update({
                where: { id: facturaGuardada.id },
                data: { estado: estadoFinal }
            });

            // 4. Resumen del procesamiento
            console.log('\n📊 RESUMEN DEL PROCESAMIENTO COMPLETO:');
            console.log(`📄 Factura: ${facturaData.numeroConsecutivo}`);
            console.log(`🏢 Proveedor: ${facturaData.emisor.nombre}`);
            console.log(`💰 Total: ${facturaData.resumen.moneda.simbolo} ${facturaData.resumen.totales.comprobante.toLocaleString()}`);
            console.log(`✅ Productos relacionados automáticamente: ${productosRelacionados}`);
            console.log(`⚠️ Productos pendientes de revisión: ${productosPendientes}`);
            console.log(`🔄 Estado final: ${estadoFinal}`);
            console.log(`💾 ID en base de datos: ${facturaGuardada.id}`);

        } catch (error) {
            console.error('❌ Error en procesamiento completo:', error);
            console.log('⚠️ Factura parseada pero no procesada completamente');
        }
    }

    connect() {
        console.log('🔌 Conectando a Gmail...');
        this.imap.connect();
    }

    /**
     * Desconecta todos los servicios
     */
    async disconnect() {
        await this.dbService.disconnect();
        await this.alegraService.disconnect();
    }
}

module.exports = EmailService;