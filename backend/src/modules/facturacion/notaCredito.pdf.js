/**
 * El PDF de una nota de crédito.
 *
 * POR QUÉ EXISTE (2026-10-11). El usuario revisó Facturación y notó que «en
 * nota de crédito está faltando enviar la nota de crédito por correo al
 * cliente, el pdf con sus xml». Los dos XML ya estaban; el PDF no: la nota
 * nunca tuvo papel propio.
 *
 * SE DIBUJA CON EL CÓDIGO DE LA FACTURA (factura.pdf.js): mismo emisor, misma
 * tabla, mismo impuesto por tarifa, mismo sello de anulada. Acá solo va lo
 * que una nota dice distinto:
 *   · qué documento es (y su consecutivo fiscal si Hacienda la aceptó);
 *   · A QUÉ FACTURA SE APLICA, que es lo primero que busca quien la recibe;
 *   · por qué se hizo, en vez de la condición y el medio de pago;
 *   · sin las cuentas para pagar: una nota le devuelve al cliente, no le cobra.
 */

const { generarPdfFactura } = require('./factura.pdf');
const { fechaLarga } = require('../../utils/marcaPdf');

/** El motivo que eligió quien hizo la nota, como lo lee el cliente. */
const MOTIVOS = {
  devolucion: 'Devolución', error: 'Error en la factura', anulacion: 'Anulación',
  descuento: 'Descuento posterior', otro: 'Otro'
};

/**
 * El número de la factura a la que se aplica, o null.
 *
 * Si la nota es electrónica sale de SU XML firmado (la clave de la factura
 * que referencia); si no, de la factura. El consecutivo fiscal son los 20
 * dígitos de la clave que siguen a país, fecha y cédula (posiciones 21 a 40).
 */
function facturaDeReferencia(nota) {
  const factura = (nota.facturas || [])[0];
  const clave = nota.fiscal?.referencia?.clave || (factura?.electronica ? factura.claveHacienda : null);
  if (/^\d{50}$/.test(String(clave || ''))) return String(clave).slice(21, 41);
  return factura?.numero || null;
}

/** Lo que el papel de la nota dice distinto del de la factura. */
function papelDeNota(nota) {
  const fiscal = (nota.electronica && nota.haciendaEstado === 'aceptada' && nota.fiscal) || null;
  const referencia = facturaDeReferencia(nota);
  return {
    fiscal,
    titulo: fiscal ? 'NOTA DE CRÉDITO ELECTRÓNICA' : 'NOTA DE CRÉDITO',
    numeroPropio: 'Nota:',
    datos: [
      ['Fecha de creación:', fechaLarga(nota.fecha)],
      ...(referencia ? [['Se aplica a la factura:', referencia]] : [])
    ],
    condiciones: [
      ['Motivo:', MOTIVOS[nota.motivo] || null],
      ['Moneda:', nota.moneda || 'CRC']
    ],
    observacion: nota.motivoTexto ? { titulo: 'DETALLE DEL MOTIVO', texto: nota.motivoTexto } : null,
    terminos: false
  };
}

/**
 * @param {object} nota lo que devuelve notaCreditoConsulta.obtenerNota()
 * @returns {Promise<Buffer>}
 */
function generarPdfNotaCredito(nota, empresa = null) {
  return generarPdfFactura(nota, empresa, nota ? papelDeNota(nota) : null);
}

module.exports = { generarPdfNotaCredito, papelDeNota, facturaDeReferencia };
