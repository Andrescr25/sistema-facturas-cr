/**
 * Ver UNA nota de crédito entera: sus líneas, la factura a la que se aplicó
 * y, si Hacienda la aceptó, su comprobante.
 *
 * POR QUÉ EXISTE (2026-10-11). La nota solo se veía como una tarjeta dentro
 * de su factura; no había forma de leerla completa. El usuario pidió que al
 * cliente le llegue «la nota de crédito por correo, el pdf con sus xml», y un
 * PDF necesita el documento entero.
 *
 * DEVUELVE LA MISMA FORMA QUE `obtenerFactura` a propósito: el papel de la
 * nota se dibuja con el código del de la factura (factura.pdf.js).
 *
 * EL CLIENTE. La nota guarda nombre y cédula; el teléfono, la dirección y el
 * correo salen de la copia fija de SU FACTURA, que es el mismo cliente en el
 * mismo momento. No de la ficha: el papel se reimprime igual en dos años.
 */

const { pool } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { COLUMNAS_LINEA, lineaAVista, numero } = require('./facturaConsulta.service');

async function obtenerNota(id) {
  const n = idValido(id);
  const nota = (await pool.query('SELECT * FROM nota_credito WHERE id = $1', [n])).rows[0];
  if (!nota) throw httpError(404, 'No existe esa nota de crédito.');

  const [lineas, facturas] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNAS_LINEA}
         FROM nota_credito_linea WHERE nota_credito_id = $1 ORDER BY numero_linea`,
      [n]
    ),
    pool.query(
      `SELECT f.id, COALESCE(f.numero, nf.factura_numero) AS numero, f.tipo_documento, f.electronica,
              f.clave_hacienda, f.moneda, f.cliente_tipo_identificacion, f.cliente_correo,
              f.cliente_telefono, f.cliente_direccion, nf.monto
         FROM nota_credito_factura nf LEFT JOIN factura f ON f.id = nf.factura_id
        WHERE nf.nota_credito_id = $1 ORDER BY nf.id`,
      [n]
    )
  ]);
  const factura = facturas.rows[0] || {};
  const fiscal = nota.electronica
    ? await require('../../integrations/hacienda/lectura.service').notaAceptada(pool, n)
    : null;
  // Al anular, el motivo se agrega a las observaciones ("Anulada: …").
  const anulacion = /^Anulada: (.+)$/m.exec(nota.observaciones || '');

  return {
    id: nota.id,
    numero: nota.numero,
    estado: nota.estado,
    fecha: nota.fecha,
    historica: Boolean(nota.alegra_id),
    electronica: Boolean(nota.electronica),
    haciendaEstado: nota.hacienda_estado,
    fiscal,
    motivo: nota.motivo,
    motivoTexto: nota.motivo_texto,
    motivoAnulacion: anulacion ? anulacion[1] : null,
    cliente: {
      id: nota.cliente_id,
      nombre: nota.cliente_nombre,
      identificacion: nota.cliente_identificacion,
      tipoIdentificacion: factura.cliente_tipo_identificacion,
      correo: factura.cliente_correo,
      telefono: factura.cliente_telefono,
      direccion: factura.cliente_direccion
    },
    moneda: factura.moneda || 'CRC',
    subtotal: numero(nota.subtotal),
    descuento: numero(nota.descuento),
    impuesto: numero(nota.impuesto),
    total: numero(nota.total),
    facturas: facturas.rows.map(f => ({
      id: f.id, numero: f.numero, tipoDocumento: f.tipo_documento,
      electronica: Boolean(f.electronica), claveHacienda: f.clave_hacienda, monto: numero(f.monto)
    })),
    lineas: lineas.rows.map(lineaAVista)
  };
}

module.exports = { obtenerNota };
