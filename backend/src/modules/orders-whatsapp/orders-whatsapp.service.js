/**
 * Servicio para gestión de Órdenes de Compra y WhatsApp
 */

const { generarPdfCompra } = require('./ordenProveedor.pdf');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { query } = require('../../../config/database');
// La conversación con Evolution vive en un solo lugar: acá solo se arma el
// PDF y se pide el envío. El traductor de errores se mudó con ella.
const whatsapp = require('../../integrations/whatsapp');
const enviosWhatsapp = require('../envios-whatsapp/envios.service');
const { httpError } = require('../../utils/validacion');

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
        producto_id as "productoId",
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

    // Por el id PROPIO del producto (`producto.id`), que es el que manda el
    // reporte. Un id que no sea un entero positivo no es de ningún producto.
    const getMappingByProducto = async (productoId) => {
      const id = Number(productoId);
      if (!Number.isInteger(id) || id <= 0) return null;
      const rows = await fetchMappings(
        `${mappingSelect}
          WHERE producto_id = $1
          ORDER BY last_used_date DESC, times_used DESC
          LIMIT 10`,
        [id]
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
          productoId: producto.productoId || producto.producto_id || null,
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
          const mappingByProducto = await getMappingByProducto(payloadInfo.productoId);
          if (mappingByProducto) {
            mapping = mappingByProducto;
            mappingFuente = 'productoId';
          }
        }

        if (!mapping) {
          const mappingBySearch = await getMappingByFlexibleSearch(payloadInfo);
          if (mappingBySearch) {
            mapping = mappingBySearch;
            mappingFuente = 'flex';
          }
        }

        if (mapping && mappingFuente !== 'mappingId' && mappingFuente !== 'productoId' && !mappingMatchesProveedor(mapping)) {
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

    const ahora = new Date();
    const pdfBuffer = await generarPdfCompra({
      referencia: referenciaOrden(ahora),
      proveedor,
      fecha: hoyEnCostaRica(ahora),
      lineas: productosEnriquecidos.map(p => ({
        codigo: p.codigo_pdf,
        descripcion: p.nombre_pdf,
        cantidad: p.cantidad,
        factor: p.factorConversion,
        descripcionFactura: p.descripcionFactura,
        observaciones: p.observaciones,
        seccion: p.origen === 'sin_codigo_proveedor' ? 'sin_codigo' :
          ['sin_mapeo', 'error'].includes(p.origen) ? 'sin_mapeo' : null
      }))
    });
    return { pdfBuffer, cantidadProductos: productosEnriquecidos.length };
  }

  /**
   * Envía la orden de compra en PDF por WhatsApp a través de Evolution API.
   *
   * QUEDA ANOTADO
   * Pasa por `enviarYRegistrar` en vez de hablarle directo al cliente de
   * Evolution, para que el envío quede en `envio_whatsapp`. De ahí sale la
   * marca de "ya se le mandó el pedido" en la tarjeta del proveedor: sin
   * registro, quien abría el reporte desde otra máquina no tenía forma de
   * saber a quién ya le habían escrito, y el proveedor recibía el mismo
   * pedido dos veces.
   *
   * La referencia es el nombre del proveedor, que es la única llave que
   * comparten este reporte y el registro de envíos (el reporte se arma por
   * nombre, no por cédula). `anotar` recorta la referencia a 60 caracteres;
   * hoy el nombre más largo mide 54, pero si algún día se pasa habría que
   * comparar recortado de los dos lados.
   */
  async enviarOrdenCompraWhatsApp(proveedor, telefono, productos, preferirDatosProveedor = true, mensaje = '', usuarioId = null) {
    // 1. Generar el PDF
    const { pdfBuffer } = await this.generarOrdenCompraPDFBuffer(proveedor, productos, preferirDatosProveedor);

    // 2. Formatear número
    const telefonoLimpio = normalizarTelefonoCR(telefono);

    // 3. Mandarlo. El proveedor es el sujeto: si el número no recibe, hay que
    //    revisar SU ficha, no la de un cliente.
    console.log(`📤 Enviando orden de compra al proveedor ${proveedor} (${telefonoLimpio})`);

    return enviosWhatsapp.enviarYRegistrar({
      tipo: 'orden_compra',
      referencia: proveedor,
      telefono: telefonoLimpio,
      mensaje: mensaje || 'Hola buenas, adjunto el pedido\ngracias',
      pdf: pdfBuffer,
      nombreArchivo: `orden-${proveedor.replace(/\s+/g, '-')}.pdf`,
      usuarioId,
      sujeto: 'proveedor'
    });
  }

  getOrdenesEnviadas(desde) { return require('./historialEnviosProveedor.service').getOrdenesEnviadas(desde); }
  eliminarRegistroTemporal(...args) { return require('./temporalesProveedor.service').eliminarRegistroTemporal(...args); }
  getCantidadesModificadas() { return require('./temporalesProveedor.service').getCantidadesModificadas(); }
  guardarCantidades(...args) { return require('./temporalesProveedor.service').guardarCantidades(...args); }
  limpiarCantidades() { return require('./temporalesProveedor.service').limpiarCantidades(); }
  registrarProductoEliminado(...args) { return require('./temporalesProveedor.service').registrarProductoEliminado(...args); }
  registrarProductoAgregado(...args) { return require('./temporalesProveedor.service').registrarProductoAgregado(...args); }

  /**
   * La ficha del proveedor de una orden de compra, o null si no tiene.
   *
   * El reporte identifica a cada proveedor por la cédula con que se le asignó
   * el faltante, y a los que se asignaron a mano, solo por el nombre. Se busca
   * por CÉDULA, que en el maestro es única. Por nombre solo cuando la orden
   * no trae cédula y hay UNA ficha con ese nombre exacto: el mismo proveedor
   * aparece con dos grafías, y elegir entre dos fichas sería adivinar a quién
   * se le escribe.
   */
  async fichaDelProveedor({ cedula, nombre } = {}) {
    const ced = String(cedula || '').trim();
    if (ced && ced !== 'SIN_PROVEEDOR') {
      const { rows } = await query(
        'SELECT id, nombre, telefono_whatsapp FROM proveedor WHERE identificacion = $1', [ced]);
      return rows[0] || null;
    }

    const texto = String(nombre || '').trim();
    if (!texto) return null;
    const { rows } = await query(
      'SELECT id, nombre, telefono_whatsapp FROM proveedor WHERE lower(trim(nombre)) = lower($1) LIMIT 2', [texto]);
    return rows.length === 1 ? rows[0] : null;
  }

  /**
   * El WhatsApp al que se le manda la orden a ese proveedor: el de su FICHA.
   *
   * Hasta el 2026-10-04 salía de `proveedor_contactos`, una tabla aparte
   * llaveada por el NOMBRE del proveedor. La ficha tiene su propio campo
   * ("WhatsApp (para la orden de compra)") y no se usaba: cambiarlo ahí no
   * cambiaba a dónde iba la orden. Eran dos lugares para el mismo dato.
   */
  async getProveedorContacto({ cedula, nombre } = {}) {
    const ficha = await this.fichaDelProveedor({ cedula, nombre });
    return {
      proveedorId: ficha ? ficha.id : null,
      telefono: ficha?.telefono_whatsapp || null
    };
  }

  /**
   * Guarda en la ficha el WhatsApp que se usó para mandar la orden.
   *
   * Un número imposible se rechaza acá, al escribirlo, que es cuando la
   * persona todavía lo tiene a la vista — y nunca se guarda con la basura
   * invisible que trae un número copiado y pegado.
   *
   * Pasa por `editarFicha`, igual que si lo cambiaran desde la pestaña Fichas:
   * misma validación, EL MISMO FORMATO en que la ficha guarda sus teléfonos
   * ("8888 2222"; al mandar se le vuelve a poner el 506), y queda en la
   * bitácora quién lo cambió. Un proveedor sin ficha no tiene dónde
   * guardarlo: se dice, y la orden se manda igual con el número escrito.
   */
  async guardarProveedorContacto({ cedula, nombre, telefono } = {}, usuarioId = null) {
    const telefonoLimpio = normalizarTelefonoCR(telefono);

    const ficha = await this.fichaDelProveedor({ cedula, nombre });
    if (!ficha) {
      throw Object.assign(
        new Error(`${String(nombre || 'Ese proveedor').trim()} no tiene ficha: el número no se guardó. Se puede crear en la pestaña Fichas.`),
        { status: 404 });
    }
    // Sin cambio no se escribe: no ensucia la bitácora con cada envío. Se
    // comparan como número, porque la ficha puede tenerlo con o sin el 506.
    let actual = null;
    try { actual = ficha.telefono_whatsapp ? normalizarTelefonoCR(ficha.telefono_whatsapp) : null; } catch { actual = null; }
    if (actual === telefonoLimpio) {
      return { proveedorId: ficha.id, telefono: ficha.telefono_whatsapp, cambiado: false };
    }

    const { editarFicha } = require('../proveedores/proveedores.maestro.service');
    const guardada = await editarFicha(ficha.id, { telefono_whatsapp: telefonoLimpio }, usuarioId);
    return { proveedorId: ficha.id, telefono: guardada.telefono_whatsapp, cambiado: true };
  }
}

module.exports = OrdersWhatsappService;
// Se exporta aparte para poder probar los mensajes de error sin red ni PDF.
// Se mantiene el nombre exportado: se mudó de archivo, no desapareció.
module.exports.explicarFalloWhatsApp = (error, contexto = {}) =>
  whatsapp.explicarFallo(error, {
    ...contexto,
    url: contexto.waUrl,
    instancia: contexto.waInstance,
    sujeto: contexto.sujeto || 'proveedor'
  });
module.exports.normalizarTelefonoCR = normalizarTelefonoCR;
