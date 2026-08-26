/**
 * Servicio para gestión de Órdenes de Compra y WhatsApp
 */

const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { query } = require('../../../config/database');

/**
 * Deja un teléfono costarricense como lo espera WhatsApp: 506 + 8 dígitos.
 *
 * QUÉ SE ROMPÍA
 * La limpieza anterior quitaba espacios, guiones, paréntesis y "+", y le
 * ponía el 506 solo si quedaban EXACTAMENTE 8 caracteres. Un número copiado
 * y pegado suele traer marcas invisibles de dirección de texto (U+202A a
 * U+202E, U+200E, U+200F, U+2066 a U+2069) que no se ven en pantalla pero
 * cuentan como carácter. Con una sola de esas, "84084937" mide 9, la
 * condición falla, el número sale SIN código de país y WhatsApp responde que
 * no existe — culpando al proveedor, que sí tenía WhatsApp.
 *
 * La regla ahora es al revés: se conserva únicamente lo que es dígito y se
 * descarta todo lo demás. Así no hay lista de caracteres raros que mantener
 * al día — nada que no sea un número puede colarse.
 *
 * Lanza si lo que queda no puede ser un teléfono de Costa Rica, en vez de
 * mandarle basura a WhatsApp y recibir un error que apunta al lugar
 * equivocado.
 */
function normalizarTelefonoCR(telefono) {
  const original = String(telefono ?? '');
  let digitos = original.replace(/\D/g, '');

  // Prefijo internacional escrito como 00506.
  if (digitos.startsWith('00')) digitos = digitos.slice(2);

  if (digitos.length === 8) return `506${digitos}`;
  if (digitos.length === 11 && digitos.startsWith('506')) return digitos;

  // Ya viene con otro código de país: se respeta, no todo proveedor es tico.
  if (digitos.length > 8 && digitos.length <= 15) return digitos;

  throw new Error(
    `El teléfono "${original.trim()}" no es un número válido: se le encontraron ${digitos.length} dígito(s) ` +
    `y hacen falta 8 (o 11 con el 506 adelante). Corrija el teléfono del proveedor.`
  );
}

/**
 * Convierte un fallo de Evolution API en algo que se pueda leer y arreglar.
 *
 * Antes el error de axios subía tal cual y el usuario veía
 * "Request failed with status code 400" — o peor, el genérico "Error interno
 * del servidor". Con eso no hay forma de saber si el problema es el número
 * del proveedor, el WhatsApp desvinculado o una variable mal puesta en
 * Render, que son arreglos completamente distintos. Diagnosticar el 400 de
 * un número sin WhatsApp costó una sesión entera.
 *
 * El texto es para quien está en el mostrador, no para quien programó.
 */
function explicarFalloWhatsApp(error, { telefono, waUrl, waInstance }) {
  const status = error.response?.status;
  const detalle = error.response?.data;
  const textoDetalle = JSON.stringify(detalle || '').toLowerCase();

  // Ni siquiera se llegó al servidor.
  if (!error.response) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      return `No se pudo contactar el servidor de WhatsApp en ${waUrl}. Revise que esté encendido y que WHATSAPP_API_URL apunte a la dirección correcta.`;
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return `El servidor de WhatsApp (${waUrl}) no respondió a tiempo. Intente de nuevo en un momento.`;
    }
    return `No se pudo contactar el servidor de WhatsApp en ${waUrl}: ${error.message}`;
  }

  if (status === 401 || status === 403) {
    return 'El servidor de WhatsApp rechazó la clave de acceso. Revise que WHATSAPP_API_KEY sea la misma que tiene configurada Evolution API.';
  }

  if (status === 404) {
    return `No existe una instancia de WhatsApp llamada "${waInstance}" en ${waUrl}. El nombre debe coincidir exactamente con el de Evolution API (variable WHATSAPP_INSTANCE_NAME).`;
  }

  // La instancia existe pero el teléfono no está vinculado.
  if (textoDetalle.includes('not connected') || textoDetalle.includes('close') || textoDetalle.includes('disconnected')) {
    return `La instancia "${waInstance}" no está conectada a WhatsApp. Vuelva a vincular el teléfono escaneando el código QR en Evolution API.`;
  }

  // Lo más común de todos: el número no tiene WhatsApp. Evolution contesta
  // 400 sin decir por qué, así que se nombra la causa probable en vez de
  // repetir el código de estado.
  if (status === 400) {
    return `El número ${telefono} no pudo recibir el mensaje. Lo más probable es que no tenga WhatsApp (por ejemplo, si es un teléfono fijo) o que esté mal escrito. Verifique el número del proveedor.`;
  }

  const mensajeEvolution = detalle?.message || detalle?.error || error.message;
  return `El servidor de WhatsApp devolvió un error (${status}): ${typeof mensajeEvolution === 'string' ? mensajeEvolution : JSON.stringify(mensajeEvolution)}`;
}

// Colores tomados del logo (muestreo de los píxeles del PNG): el naranja es
// el único acento y se reserva para lo que el proveedor tiene que ver primero
// — las cantidades — más la regla del encabezado y los rótulos de sección.
const MARCA = {
  naranja: '#E9501C',
  naranjaSuave: '#FDEEE8',
  naranjaOscuro: '#B0410F',
  gris: '#616161',
  tinta: '#1A1A1A',
  grisSuave: '#8A8A8A',
  linea: '#E4E4E4',
  cebra: '#FAFAFA',
  panel: '#F5F5F5'
};

const LOGO = path.join(__dirname, '../../../assets/logo-tachi.png');
const LOGO_RATIO = 276 / 1000; // alto/ancho del PNG original

/** Referencia citable por teléfono, derivada del momento del envío. */
function referenciaOrden(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `OC-${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}-${p(fecha.getHours())}${p(fecha.getMinutes())}`;
}

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
          -- Sin confidence: todos los mapeos los asignó una persona y valen
          -- lo mismo. Manda el uso reciente y la frecuencia.
          ORDER BY last_used_date DESC NULLS LAST, times_used DESC
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
          codigoInterno: producto.codigoInterno || producto.codigo || null,
          nombreInterno: producto.nombreInterno || producto.nombre || null,
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
    const doc = new PDFDocument({ margin: 40, size: 'letter', bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));

    const pdfPromise = new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const M = 40;
    const ANCHO = doc.page.width - M * 2;
    const ahora = new Date();
    const totalUnidades = productosEnriquecidos.reduce((s, p) => s + (parseInt(p.cantidad, 10) || 0), 0);

    // ==================== Encabezado ====================
    let cursor = M;
    if (fs.existsSync(LOGO)) {
      const anchoLogo = 130;
      doc.image(LOGO, M, cursor - 4, { width: anchoLogo });
      cursor += anchoLogo * LOGO_RATIO + 2;
    } else {
      doc.font('Helvetica-Bold').fontSize(17).fillColor(MARCA.naranja).text('TACHI', M, cursor);
      doc.font('Helvetica').fontSize(8).fillColor(MARCA.gris).text('DISTRIBUIDORA', M, cursor + 20, { characterSpacing: 2 });
      cursor += 36;
    }

    doc.font('Helvetica-Bold').fontSize(15).fillColor(MARCA.tinta)
      .text('ORDEN DE COMPRA', doc.page.width - M - 240, M + 2, { width: 240, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MARCA.naranja)
      .text(referenciaOrden(ahora), doc.page.width - M - 240, M + 22, { width: 240, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(MARCA.gris)
      .text(ahora.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }),
        doc.page.width - M - 240, M + 36, { width: 240, align: 'right' });

    const yRegla = Math.max(cursor + 18, M + 56);
    doc.rect(M, yRegla, ANCHO, 2.5).fill(MARCA.naranja);

    // ==================== Proveedor y totales ====================
    let y = yRegla + 18;
    doc.font('Helvetica').fontSize(7.5).fillColor(MARCA.grisSuave)
      .text('PROVEEDOR', M, y, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(MARCA.tinta)
      .text(proveedor || 'Sin especificar', M, y + 12, { width: ANCHO - 180 });

    const anchoCaja = 168;
    const xCaja = doc.page.width - M - anchoCaja;
    doc.roundedRect(xCaja, y - 6, anchoCaja, 52, 5).fillAndStroke('#FFFFFF', MARCA.linea);
    doc.font('Helvetica-Bold').fontSize(17).fillColor(MARCA.naranja)
      .text(String(productosEnriquecidos.length), xCaja, y + 5, { width: anchoCaja / 2, align: 'center' })
      .text(String(totalUnidades), xCaja + anchoCaja / 2, y + 5, { width: anchoCaja / 2, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor(MARCA.grisSuave)
      .text('PRODUCTOS', xCaja, y + 28, { width: anchoCaja / 2, align: 'center', characterSpacing: 0.5 })
      .text('UNIDADES', xCaja + anchoCaja / 2, y + 28, { width: anchoCaja / 2, align: 'center', characterSpacing: 0.5 });

    y = yRegla + 76;

    // ==================== Tabla ====================
    const X_CANTIDAD = M + 6;
    const ANCHO_CANTIDAD = 54;
    const X_NOMBRE = M + 74;
    const ANCHO_NOMBRE = ANCHO - 74 - 96;
    const X_CODIGO = M + ANCHO - 96;
    const LIMITE = doc.page.height - 52;

    const encabezadoTabla = () => {
      doc.font('Helvetica').fontSize(7).fillColor(MARCA.grisSuave)
        .text('CANT.', X_CANTIDAD, y, { width: ANCHO_CANTIDAD, align: 'center', characterSpacing: 0.8 })
        .text('PRODUCTO', X_NOMBRE, y, { characterSpacing: 0.8 })
        .text('CÓDIGO', X_CODIGO, y, { width: 96, align: 'right', characterSpacing: 0.8 });
      y += 12;
      doc.rect(M, y, ANCHO, 1).fill(MARCA.tinta);
      y += 6;
    };

    let cebra = false;
    const paginaNueva = () => { doc.addPage(); y = M; encabezadoTabla(); cebra = false; };

    const renderProducto = (producto) => {
      const nombre = producto.nombre_pdf || 'Sin descripción';
      // La descripción de factura y las observaciones van en su propia línea.
      // Antes se concatenaban al nombre ("PLATO N-6 LINK 1X15 - urge") y se
      // leían como parte del producto.
      const notas = [producto.descripcionFactura, producto.observaciones]
        .map(t => (t || '').trim()).filter(Boolean).join('   ·   ');

      const altoNombre = doc.font('Helvetica-Bold').fontSize(10.5).heightOfString(nombre, { width: ANCHO_NOMBRE });
      // El código también puede envolverse (los internos llegan a ser largos):
      // si no se cuenta su alto, la segunda línea se sale de la fila y pisa la
      // siguiente.
      const codigo = producto.codigo_pdf || '—';
      const altoCodigo = doc.font('Helvetica').fontSize(8.5).heightOfString(codigo, { width: 96 });
      const alto = Math.max(altoNombre + (notas ? 11 : 0) + 12, altoCodigo + 12, 28);

      if (y + alto > LIMITE) paginaNueva();
      if (cebra) doc.rect(M, y - 2, ANCHO, alto).fill(MARCA.cebra);
      cebra = !cebra;

      // La cantidad es lo que el proveedor busca: va destacada y pegada al
      // nombre, no a 300pt de distancia como en la versión anterior.
      doc.roundedRect(X_CANTIDAD, y + 1, ANCHO_CANTIDAD, alto - 8, 4).fill(MARCA.naranjaSuave);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(MARCA.naranja)
        .text(String(producto.cantidad ?? 0), X_CANTIDAD, y + (alto - 8) / 2 - 6, { width: ANCHO_CANTIDAD, align: 'center' });

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(MARCA.tinta)
        .text(nombre, X_NOMBRE, y + 3, { width: ANCHO_NOMBRE });
      if (notas) {
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(MARCA.naranjaOscuro)
          .text(notas, X_NOMBRE, y + 3 + altoNombre + 1, { width: ANCHO_NOMBRE });
      }
      doc.font('Helvetica').fontSize(8.5).fillColor(MARCA.gris)
        .text(codigo, X_CODIGO, y + 5, { width: 96, align: 'right' });

      y += alto;
      doc.rect(M, y - 2, ANCHO, 0.5).fill(MARCA.linea);
    };

    const renderSeccion = (titulo, nota) => {
      if (y + 46 > LIMITE) paginaNueva();
      y += 7;
      doc.rect(M, y, ANCHO, 20).fill(MARCA.naranjaSuave);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MARCA.naranjaOscuro)
        .text(titulo, M + 8, y + 6, { characterSpacing: 0.5 });
      doc.font('Helvetica').fontSize(7.5)
        .text(nota, M + 8, y + 6.5, { width: ANCHO - 16, align: 'right' });
      y += 25;
      cebra = false;
    };

    encabezadoTabla();
    productosConCodigoProveedor.forEach(renderProducto);

    if (productosSinCodigoProveedor.length > 0) {
      renderSeccion('SIN CÓDIGO DE PROVEEDOR', 'usar la referencia interna');
      productosSinCodigoProveedor.forEach(renderProducto);
    }

    if (productosSinMapeo.length > 0) {
      renderSeccion('SIN EQUIVALENCIA REGISTRADA', 'confirmar antes de despachar');
      productosSinMapeo.forEach(renderProducto);
    }

    // ==================== Cierre ====================
    // Totales y firma en una sola banda: separados costaban 120pt de alto y
    // empujaban a una segunda página sin agregar información.
    if (y + 52 > doc.page.height - 42) { doc.addPage(); y = M; }
    y += 8;
    doc.rect(M, y, ANCHO, 44).fill(MARCA.panel);
    doc.rect(M, y, 3, 44).fill(MARCA.naranja);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(MARCA.tinta)
      .text(`${productosEnriquecidos.length} productos`, M + 16, y + 9)
      .text(`${totalUnidades} unidades`, M + 122, y + 9);
    doc.font('Helvetica').fontSize(7.5).fillColor(MARCA.gris)
      .text('Cualquier faltante, confirmarlo antes de despachar.', M + 16, y + 27, { width: 260 });

    const xFirma = M + ANCHO - 232;
    doc.moveTo(xFirma, y + 27).lineTo(xFirma + 104, y + 27).lineWidth(0.5).stroke(MARCA.grisSuave);
    doc.moveTo(xFirma + 120, y + 27).lineTo(M + ANCHO - 12, y + 27).stroke(MARCA.grisSuave);
    doc.font('Helvetica').fontSize(7).fillColor(MARCA.grisSuave)
      .text('Recibido por', xFirma, y + 31)
      .text('Fecha', xFirma + 120, y + 31);

    // ==================== Pie con paginación ====================
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(rango.start + i);
      // pdfkit agrega una página en blanco si se escribe por debajo del margen
      // inferior, y el pie va justo ahí.
      const margenOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const yPie = doc.page.height - 30;
      doc.rect(M, yPie - 8, ANCHO, 0.5).fill(MARCA.linea);
      doc.font('Helvetica').fontSize(7).fillColor(MARCA.grisSuave)
        .text(`${referenciaOrden(ahora)}   ·   ${proveedor || ''}`, M, yPie, { width: ANCHO - 110 })
        .text(`Página ${i + 1} de ${rango.count}`, M + ANCHO - 110, yPie, { width: 110, align: 'right' });
      doc.page.margins.bottom = margenOriginal;
    }

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
    const telefonoLimpio = normalizarTelefonoCR(telefono);

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

    try {
      const response = await axios.post(`${waUrl}/message/sendMedia/${waInstance}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'apikey': waApiKey
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(explicarFalloWhatsApp(error, { telefono: telefonoLimpio, waUrl, waInstance }));
    }
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
   * Guarda o actualiza el teléfono de WhatsApp de un proveedor.
   *
   * Se guarda YA NORMALIZADO (506 + 8 dígitos). Limpiarlo solo al enviar
   * dejaría la basura invisible guardada para siempre, reapareciendo en cada
   * pantalla que muestre el teléfono; y un número imposible se rechaza acá,
   * al escribirlo, que es cuando la persona todavía lo tiene a la vista.
   */
  async guardarProveedorContacto(nombreProveedor, cedulaProveedor, telefono) {
    const telefonoLimpio = normalizarTelefonoCR(telefono);

    const result = await query(`
      INSERT INTO proveedor_contactos (nombre_proveedor, cedula_proveedor, telefono_whatsapp, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (nombre_proveedor) DO UPDATE SET
        telefono_whatsapp = EXCLUDED.telefono_whatsapp,
        cedula_proveedor = COALESCE(EXCLUDED.cedula_proveedor, proveedor_contactos.cedula_proveedor),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [nombreProveedor, cedulaProveedor || null, telefonoLimpio]);

    return result.rows[0];
  }
}

module.exports = OrdersWhatsappService;
// Se exporta aparte para poder probar los mensajes de error sin red ni PDF.
module.exports.explicarFalloWhatsApp = explicarFalloWhatsApp;
module.exports.normalizarTelefonoCR = normalizarTelefonoCR;
