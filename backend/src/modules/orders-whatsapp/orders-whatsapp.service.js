/**
 * Servicio para gestión de Órdenes de Compra y WhatsApp
 */

const { query } = require('../../../config/database');
// La conversación con WhatsApp vive en un solo lugar; acá solo se traduce su
// error para el proveedor.
const whatsapp = require('../../integrations/whatsapp');

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


class OrdersWhatsappService {
  // generarOrdenCompraPDFBuffer y enviarOrdenCompraWhatsApp se retiraron el
  // 2026-10-20: eran el envío global anterior (ninguna pantalla los usaba; la
  // ruta de envío ya respondía 409) y armaban la referencia «OC-fecha», que el
  // usuario pidió quitar. Hoy se envía desde el Reporte (envioDesdeReporte).

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
