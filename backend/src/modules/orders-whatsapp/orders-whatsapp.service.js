/**
 * Servicio para gestión de Órdenes de Compra y WhatsApp
 */

const axios = require('axios');
const { query } = require('../../../config/database');

class OrdersWhatsappService {
  /**
   * Genera el PDF de la orden de compra enriqueciendo los productos con mapeos de base de datos
   */
  async generarOrdenCompraPDFBuffer(proveedor, productos, preferirDatosProveedor = true) {
    const preferirDatosProveedorGlobal = preferirDatosProveedor !== false;

    const normalize = (value) => value ? value.toString().trim() : '';
    const canonicalizeNombre = (value) => {
      if (!value) return '';
      return value
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
    };
    const proveedorCanonico = canonicalizeNombre(proveedor);

    const mappingSelect = `
      SELECT 
        id,
        supplier_code as "supplierCode",
        supplier_desc as "supplierDesc",
        supplier_name as "supplierName",
        supplier_cedula as "supplierCedula",
        alegra_reference as "alegraReference",
        alegra_name as "alegraName",
        alegra_item_id as "alegraItemId",
        confidence,
        origen,
        factor_conversion as "factorConversion",
        last_used_date as "lastUsedDate",
        times_used as "timesUsed"
      FROM supplier_product_mapping 
    `;

    const fetchMappings = async (sql, params) => {
      const result = await query(sql, params);
      return result.rows || [];
    };

    const sanitizeCodigoProveedor = (valor) => {
      if (!valor) return null;
      const cleaned = valor.toString().trim();
      if (!cleaned || cleaned.toUpperCase() === 'N/A') return null;
      return cleaned;
    };

    const mappingMatchesProveedor = (mapping, { skipStrictValidation = false } = {}) => {
      if (!mapping) return false;
      if (skipStrictValidation) return true;
      if (!mapping.supplierName) return false;
      return canonicalizeNombre(mapping.supplierName) === proveedorCanonico;
    };

    const pickFirstMatching = (rows, { skipStrictValidation = false } = {}) => {
      if (!rows || rows.length === 0) {
        return null;
      }
      const matchingProvider = rows.find(row => mappingMatchesProveedor(row));
      if (matchingProvider) {
        return matchingProvider;
      }
      if (skipStrictValidation) {
        console.log(`⚠️ [PDF] No hay mapping para el proveedor actual, usando fallback del primero disponible`);
        return rows[0];
      }
      return null;
    };

    const getMappingById = async (mappingId) => {
      if (!mappingId) return null;
      const rows = await fetchMappings(
        `${mappingSelect} WHERE id = $1`,
        [mappingId]
      );
      return rows[0] || null;
    };

    const getMappingBySupplierCode = async (codigoProveedor) => {
      if (!codigoProveedor) return null;
      const rows = await fetchMappings(
        `${mappingSelect} 
          WHERE supplier_code = $1 
          ORDER BY last_used_date DESC, times_used DESC
          LIMIT 10`,
        [codigoProveedor]
      );
      return pickFirstMatching(rows);
    };

    const getMappingByAlegraId = async (alegraItemId) => {
      if (!alegraItemId) return null;
      const rows = await fetchMappings(
        `${mappingSelect}
          WHERE alegra_item_id::text = $1
          ORDER BY last_used_date DESC, times_used DESC
          LIMIT 10`,
        [alegraItemId.toString()]
      );
      return pickFirstMatching(rows, { skipStrictValidation: false });
    };

    const getMappingByFlexibleSearch = async (productoPayload) => {
      const referencia = productoPayload.codigoInterno || null;
      const nombreBusqueda = productoPayload.nombreProveedorEntrada || productoPayload.nombreInterno || null;

      if (!referencia && !nombreBusqueda) return null;

      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (referencia) {
        conditions.push(`alegra_reference = $${paramIdx}`);
        params.push(referencia);
        paramIdx++;
      }

      if (nombreBusqueda) {
        const likePattern = `%${nombreBusqueda}%`;
        conditions.push(`(supplier_desc ILIKE $${paramIdx} OR alegra_name ILIKE $${paramIdx})`);
        params.push(likePattern);
        paramIdx++;
      }

      if (conditions.length === 0) return null;

      const rows = await fetchMappings(
        `${mappingSelect}
          WHERE ${conditions.join(' OR ')}
          ORDER BY confidence DESC, last_used_date DESC, times_used DESC
          LIMIT 20`,
        params
      );
      return pickFirstMatching(rows);
    };

    const productosEnriquecidos = [];

    for (const producto of productos) {
      try {
        const preferirDatosProveedorActual = typeof producto.preferirDatosProveedor === 'boolean'
          ? producto.preferirDatosProveedor
          : preferirDatosProveedorGlobal;

        const payloadInfo = {
          codigoInterno: producto.codigo || producto.codigoInterno || null,
          nombreInterno: producto.nombre || producto.nombreInterno || null,
          codigoProveedorEntrada: sanitizeCodigoProveedor(producto.codigoProveedor || producto.codigo_proveedor),
          nombreProveedorEntrada: normalize(producto.nombreProveedor || producto.nombre_proveedor),
          mappingId: producto.mappingId || producto.mapping_id || null,
          alegraItemId: producto.alegraItemId || producto.alegra_item_id || null,
          cantidadFinal: parseInt(producto.cantidad, 10) || 0,
          factorConversion: producto.factorConversion || producto.factor_conversion || 1,
          observaciones: producto.observaciones || '',
          descripcionFactura: producto.descripcionFactura || producto.descripcion_factura || ''
        };

        if (!preferirDatosProveedorActual) {
          productosEnriquecidos.push({
            codigo_pdf: payloadInfo.codigoInterno || payloadInfo.codigoProveedorEntrada || 'N/A',
            nombre_pdf: payloadInfo.nombreInterno || payloadInfo.nombreProveedorEntrada || 'Sin descripción',
            cantidad: payloadInfo.cantidadFinal,
            codigo_interno: payloadInfo.codigoInterno,
            nombre_interno: payloadInfo.nombreInterno,
            confianza: 0,
            factorConversion: payloadInfo.factorConversion,
            origen: 'interno_manual',
            datosProveedorReales: false,
            mappingId: payloadInfo.mappingId || null,
            observaciones: payloadInfo.observaciones || '',
            descripcionFactura: payloadInfo.descripcionFactura || ''
          });
          continue;
        }

        let mapping = null;
        let mappingFuente = null;

        if (payloadInfo.mappingId) {
          mapping = await getMappingById(payloadInfo.mappingId);
          mappingFuente = 'mappingId';
        }

        if (!mapping) {
          const mappingByCode = await getMappingBySupplierCode(payloadInfo.codigoProveedorEntrada);
          if (mappingByCode) {
            mapping = mappingByCode;
            mappingFuente = 'supplierCode';
          }
        }

        if (!mapping) {
          const mappingByAlegra = await getMappingByAlegraId(payloadInfo.alegraItemId);
          if (mappingByAlegra) {
            mapping = mappingByAlegra;
            mappingFuente = 'alegraId';
          }
        }

        if (!mapping) {
          const mappingBySearch = await getMappingByFlexibleSearch(payloadInfo);
          if (mappingBySearch) {
            mapping = mappingBySearch;
            mappingFuente = 'flex';
          }
        }

        if (mapping && mappingFuente !== 'mappingId' && mappingFuente !== 'alegraId' && !mappingMatchesProveedor(mapping)) {
          mapping = null;
        }

        const codigoProveedorPreferido =
          sanitizeCodigoProveedor(payloadInfo.codigoProveedorEntrada) ||
          sanitizeCodigoProveedor(mapping?.supplierCode) ||
          null;

        const fontColor = '#000000';
        const nombreProveedorPreferido = 
          (mapping?.supplierDesc && normalize(mapping.supplierDesc)) ||
          normalize(payloadInfo.nombreProveedorEntrada) ||
          null;

        const nombrePDF = nombreProveedorPreferido
          || (mapping?.alegraName && normalize(mapping.alegraName))
          || payloadInfo.nombreInterno
          || 'Sin descripción';
        
        const tieneMapping = Boolean(mapping);

        const codigoPDF = codigoProveedorPreferido
          || payloadInfo.codigoInterno
          || mapping?.alegraReference
          || 'N/A';

        const origenEtiqueta = tieneMapping
          ? (codigoProveedorPreferido ? 'con_codigo_proveedor' : 'sin_codigo_proveedor')
          : 'sin_mapeo';

        productosEnriquecidos.push({
          codigo_pdf: codigoPDF,
          nombre_pdf: nombrePDF,
          cantidad: payloadInfo.cantidadFinal,
          codigo_interno: payloadInfo.codigoInterno,
          nombre_interno: payloadInfo.nombreInterno,
          confianza: mapping?.confidence || 0,
          factorConversion: payloadInfo.factorConversion,
          origen: origenEtiqueta,
          datosProveedorReales: tieneMapping,
          mappingId: mapping?.id || payloadInfo.mappingId || null,
          observaciones: payloadInfo.observaciones || '',
          descripcionFactura: payloadInfo.descripcionFactura || ''
        });
      } catch (mappingError) {
        console.error(`❌ Error buscando mapping para ${producto.codigo || producto.codigoInterno}:`, mappingError.message);
        productosEnriquecidos.push({
          codigo_pdf: producto.codigo || 'N/A',
          nombre_pdf: producto.nombre || 'Sin descripción',
          cantidad: parseInt(producto.cantidad, 10) || 0,
          codigo_interno: producto.codigo || null,
          nombre_interno: producto.nombre || null,
          confianza: 0,
          factorConversion: producto.factorConversion || 1,
          origen: 'error',
          datosProveedorReales: false,
          mappingId: producto.mappingId || producto.mapping_id || null,
          observaciones: producto.observaciones || '',
          descripcionFactura: producto.descripcionFactura || producto.descripcion_factura || ''
        });
      }
    }

    const productosConCodigoProveedor = productosEnriquecidos.filter(p =>
      p.origen === 'con_codigo_proveedor' || p.origen === 'interno_manual'
    );
    const productosSinCodigoProveedor = productosEnriquecidos.filter(p => p.origen === 'sin_codigo_proveedor');
    const productosSinMapeo = productosEnriquecidos.filter(p => p.origen === 'sin_mapeo' || p.origen === 'error');

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    const pdfPromise = new Promise((resolve) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });
    });

    // Header principal
    doc.fontSize(20)
      .font('Helvetica-Bold')
      .text('ORDEN DE COMPRA', 50, 50);

    // Información del proveedor
    doc.fontSize(16)
      .font('Helvetica-Bold')
      .text(`Proveedor: ${proveedor}`, 50, 100);

    // Fecha
    const fecha = new Date().toLocaleDateString('es-CR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.fontSize(12)
      .font('Helvetica')
      .text(`Fecha: ${fecha}`, 50, 130);

    // Línea separadora
    doc.moveTo(50, 160)
      .lineTo(550, 160)
      .stroke();

    let yPos = 180;
    let totalUnidades = 0;
    const pageBottom = doc.page.height - doc.page.margins.bottom;

    const drawTableHeader = () => {
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .text('Código', 50, yPos)
        .text('Descripción', 150, yPos)
        .text('Cantidad', 450, yPos);

      yPos += 15;
      doc.moveTo(50, yPos)
        .lineTo(550, yPos)
        .stroke();
      yPos += 10;
      doc.font('Helvetica').fillColor('#000000');
    };

    const startNewPage = () => {
      doc.addPage();
      yPos = 50;
      drawTableHeader();
    };

    const ensureSpace = (needed = 50) => {
      if (yPos + needed > pageBottom) {
        startNewPage();
      }
    };

    const rowHeightForDescription = (descripcion) => {
      const text = descripcion || 'Sin descripción';
      return Math.max(
        doc.heightOfString(text, { width: 280, align: 'left' }),
        14
      );
    };

    const renderProducto = (producto) => {
      let descripcion = producto.nombre_pdf || 'Sin descripción';

      if (producto.descripcionFactura && producto.descripcionFactura.trim() !== '') {
        descripcion += ` (${producto.descripcionFactura.trim()})`;
      }

      if (producto.observaciones && producto.observaciones.trim() !== '') {
        descripcion += ` - ${producto.observaciones.trim()}`;
      }

      const codigo = producto.codigo_pdf || 'N/A';
      const cantidadTexto = (producto.cantidad ?? 0).toString();

      const rowHeight = rowHeightForDescription(descripcion);
      ensureSpace(rowHeight + 15);

      doc.fontSize(11).font('Helvetica');
      doc.text(codigo, 50, yPos, { width: 80 });
      doc.text(descripcion, 150, yPos, { width: 280 });
      doc.text(cantidadTexto, 450, yPos, { width: 80 });

      yPos += rowHeight + 8;
      totalUnidades += parseInt(producto.cantidad) || 0;
    };

    const renderSeccion = (lista) => {
      lista.forEach(renderProducto);
    };

    const drawSectionLabel = (texto) => {
      ensureSpace(25);
      doc.fontSize(10)
        .font('Helvetica-Oblique')
        .fillColor('#555555')
        .text(texto, 50, yPos);
      doc.fillColor('#000000').font('Helvetica');
      yPos += 15;
    };

    drawTableHeader();

    renderSeccion(productosConCodigoProveedor);

    if (productosSinCodigoProveedor.length > 0) {
      drawSectionLabel('Productos sin código del proveedor (usar referencia interna)');
      renderSeccion(productosSinCodigoProveedor);
    }

    if (productosSinMapeo.length > 0) {
      drawSectionLabel('Productos sin mapeo (datos originales)');
      renderSeccion(productosSinMapeo);
    }

    ensureSpace(40);
    doc.moveTo(50, yPos)
      .lineTo(550, yPos)
      .stroke();

    yPos += 20;
    doc.fontSize(12)
      .font('Helvetica-Bold')
      .text(`Total productos: ${productosEnriquecidos.length}`, 50, yPos)
      .text(`Total unidades: ${totalUnidades}`, 300, yPos);

    yPos += 40;
    doc.fontSize(10)
      .font('Helvetica')
      .text(`Generado el ${new Date().toLocaleString('es-CR')}`, 50, yPos);

    doc.end();

    const pdfBuffer = await pdfPromise;
    return { pdfBuffer, cantidadProductos: productosEnriquecidos.length };
  }

  /**
   * Envía la orden de compra en PDF por WhatsApp a través de Evolution API
   */
  async enviarOrdenCompraWhatsApp(proveedor, telefono, productos, preferirDatosProveedor = true, mensaje = '') {
    // 1. Generar el PDF
    const { pdfBuffer } = await this.generarOrdenCompraPDFBuffer(proveedor, productos, preferirDatosProveedor);

    // 2. Formatear número
    let telefonoLimpio = telefono.replace(/[\s\-\(\)\+]/g, '');
    if (!telefonoLimpio.startsWith('506') && telefonoLimpio.length === 8) {
      telefonoLimpio = '506' + telefonoLimpio;
    }

    // 3. Obtener variables de entorno
    const waUrl = process.env.WHATSAPP_API_URL || 'http://localhost:8080';
    const waApiKey = process.env.WHATSAPP_API_KEY || 'facturas_cr_secret_key_2026';
    const waInstance = process.env.WHATSAPP_INSTANCE_NAME || 'facturas_instance';

    // 4. Preparar payload para la versión 2.x
    const rawBase64 = pdfBuffer.toString('base64');
    const captionTexto = mensaje || "Hola buenas, adjunto el pedido\ngracias";
    const payload = {
      number: telefonoLimpio,
      mediatype: 'document',
      mimetype: 'application/pdf',
      media: rawBase64,
      fileName: `orden-${proveedor.replace(/\s+/g, '-')}.pdf`,
      caption: captionTexto
    };

    console.log(`📤 Enviando orden de compra a Evolution API en ${waUrl}/message/sendMedia/${waInstance} para el número ${telefonoLimpio}`);

    const response = await axios.post(`${waUrl}/message/sendMedia/${waInstance}`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': waApiKey
      }
    });

    return response.data;
  }

  /**
   * Obtiene todas las cantidades modificadas temporalmente para una orden de compra
   */
  async getCantidadesModificadas() {
    const result = await query(`
      SELECT 
        proveedor_nombre,
        producto_codigo,
        producto_nombre,
        cantidad_original,
        cantidad_modificada,
        accion,
        created_at,
        updated_at
      FROM orden_compra_temporal
      ORDER BY proveedor_nombre, producto_nombre
    `);

    const modificadas = result.rows.filter(r => !r.accion || r.accion === 'modificado');
    const eliminadas = result.rows.filter(r => r.accion === 'eliminado');
    const agregadas = result.rows.filter(r => r.accion === 'agregado');

    return {
      rows: result.rows,
      modificadas,
      eliminadas,
      agregadas
    };
  }

  /**
   * Guarda múltiples cantidades modificadas en la base de datos
   */
  async guardarCantidades(cantidades) {
    let cantidadesGuardadas = 0;

    for (const cantidad of cantidades) {
      const {
        proveedor_nombre,
        producto_codigo,
        producto_nombre,
        cantidad_original,
        cantidad_modificada
      } = cantidad;

      if (!proveedor_nombre || !producto_codigo || !producto_nombre ||
        cantidad_original === undefined || cantidad_modificada === undefined) {
        continue;
      }

      await query(`
        INSERT INTO orden_compra_temporal (
          proveedor_nombre, producto_codigo, producto_nombre, 
          cantidad_original, cantidad_modificada
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (proveedor_nombre, producto_codigo) 
        DO UPDATE SET 
          producto_nombre = $3,
          cantidad_original = $4,
          cantidad_modificada = $5,
          updated_at = CURRENT_TIMESTAMP
      `, [proveedor_nombre, producto_codigo, producto_nombre, cantidad_original, cantidad_modificada]);

      cantidadesGuardadas++;
    }

    return cantidadesGuardadas;
  }

  /**
   * Limpia toda la tabla temporal de orden de compra
   */
  async limpiarCantidades() {
    const countResult = await query('SELECT COUNT(*) FROM orden_compra_temporal');
    const totalRegistros = parseInt(countResult.rows[0].count);

    await query('DELETE FROM orden_compra_temporal');
    return totalRegistros;
  }

  /**
   * Registra la eliminación temporal de un producto para un proveedor
   */
  async registrarProductoEliminado(proveedorNombre, productoCodigo, productoNombre, cantidadOriginal) {
    await query(`
      INSERT INTO orden_compra_temporal 
        (proveedor_nombre, producto_codigo, producto_nombre, cantidad_original, cantidad_modificada, accion)
      VALUES ($1, $2, $3, $4, 0, 'eliminado')
      ON CONFLICT (proveedor_nombre, producto_codigo)
      DO UPDATE SET 
        accion = 'eliminado',
        cantidad_original = EXCLUDED.cantidad_original,
        updated_at = CURRENT_TIMESTAMP
    `, [proveedorNombre, productoCodigo, productoNombre || productoCodigo, cantidadOriginal || 0]);
  }

  /**
   * Registra la adición temporal de un nuevo producto para un proveedor
   */
  async registrarProductoAgregado(proveedorNombre, productoCodigo, productoNombre, cantidad) {
    await query(`
      INSERT INTO orden_compra_temporal 
        (proveedor_nombre, producto_codigo, producto_nombre, cantidad_original, cantidad_modificada, accion)
      VALUES ($1, $2, $3, 0, $4, 'agregado')
      ON CONFLICT (proveedor_nombre, producto_codigo)
      DO UPDATE SET 
        accion = 'agregado',
        producto_nombre = EXCLUDED.producto_nombre,
        cantidad_modificada = EXCLUDED.cantidad_modificada,
        updated_at = CURRENT_TIMESTAMP
    `, [proveedorNombre, productoCodigo, productoNombre, cantidad]);
  }

  /**
   * Obtiene el teléfono de WhatsApp registrado de un proveedor
   */
  async getProveedorContacto(nombreProveedor) {
    const result = await query(
      'SELECT telefono_whatsapp FROM proveedor_contactos WHERE nombre_proveedor = $1',
      [nombreProveedor]
    );
    return result.rows.length > 0 ? result.rows[0].telefono_whatsapp : null;
  }

  /**
   * Guarda o actualiza el teléfono de WhatsApp de un proveedor
   */
  async guardarProveedorContacto(nombreProveedor, cedulaProveedor, telefono) {
    const result = await query(`
      INSERT INTO proveedor_contactos (nombre_proveedor, cedula_proveedor, telefono_whatsapp, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (nombre_proveedor) DO UPDATE SET
        telefono_whatsapp = EXCLUDED.telefono_whatsapp,
        cedula_proveedor = COALESCE(EXCLUDED.cedula_proveedor, proveedor_contactos.cedula_proveedor),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [nombreProveedor, cedulaProveedor || null, telefono]);

    return result.rows[0];
  }
}

module.exports = OrdersWhatsappService;
