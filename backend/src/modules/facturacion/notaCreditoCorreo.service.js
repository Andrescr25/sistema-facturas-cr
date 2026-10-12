/**
 * Entregarle al cliente su nota de crédito electrónica: el PDF, el XML
 * firmado y la respuesta de Hacienda.
 *
 * QUÉ SE PIDIÓ (2026-10-11): «en nota de crédito está faltando enviar la
 * nota de crédito por correo al cliente, el pdf con sus xml». La factura ya
 * se entregaba sola al aceptarse; la nota, que es el documento que le dice
 * al cliente que esa factura cambió, no le llegaba a nadie.
 *
 * MISMAS REGLAS QUE LA FACTURA (facturaCorreo.service.js, de donde salen las
 * piezas): va al correo de la FICHA del cliente, nunca a uno de la petición;
 * solo una nota aceptada por Hacienda; no se reintenta sola; y NO LANZA —la
 * nota ya está aceptada y eso no depende del correo—. Devuelve qué pasó:
 *   { estado: 'enviado', para }
 *   { estado: 'sin_correo', motivo }   la ficha no tiene un correo válido
 *   { estado: 'error', para?, motivo } no se pudo mandar
 */
const { pool } = require('../../../config/database');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../../../config/aislado');
const { httpError } = require('../../utils/validacion');
const { obtenerNota } = require('./notaCreditoConsulta.service');
const { generarPdfNotaCredito, facturaDeReferencia } = require('./notaCredito.pdf');
const {
  correoDeFicha, adjuntosFiscales, exigirCorreoConfigurado, despachar, paraArchivo
} = require('./facturaCorreo.service');

async function entregarNotaElectronica(id) {
  let para = '';
  try {
    // Frenar antes de consultar o armar el PDF, igual que la factura.
    if (salidasBloqueadas()) throw errorSalidaBloqueada('enviar notas de crédito por correo');
    const nota = await obtenerNota(id);
    if (nota.estado !== 'emitida') throw httpError(409, 'Solo se manda por correo una nota de crédito emitida.');
    // Se promete "el PDF con sus XML": sin comprobante aceptado no sale un
    // correo a medias con ese nombre.
    if (!nota.fiscal) throw httpError(409, 'La nota de crédito todavía no está aceptada por Hacienda.');
    para = await correoDeFicha(nota.cliente);
    if (!para) return { estado: 'sin_correo', motivo: 'El cliente no tiene un correo válido en su ficha.' };
    exigirCorreoConfigurado();

    const { rows } = await pool.query('SELECT * FROM empresa WHERE id = 1');
    const numero = nota.fiscal.consecutivo;
    const factura = facturaDeReferencia(nota);
    await despachar({
      para,
      asunto: `Nota de crédito electrónica ${numero}`,
      mensaje: `Adjuntamos su nota de crédito electrónica ${numero}` +
        (factura ? `, que se aplica a la factura ${factura}` : '') +
        ', aceptada por el Ministerio de Hacienda: el PDF, el comprobante XML y la respuesta de Hacienda.',
      adjuntos: [
        {
          filename: `nota-credito-${paraArchivo(nota.numero || nota.id)}.pdf`,
          content: await generarPdfNotaCredito(nota, rows[0] || null),
          contentType: 'application/pdf'
        },
        ...await adjuntosFiscales(nota.fiscal)
      ]
    });
    return { estado: 'enviado', para };
  } catch (e) {
    // Solo el texto de un error propio; el de nodemailer puede traer el
    // servidor o el usuario y `despachar` ya lo reemplaza.
    return { estado: 'error', ...(para ? { para } : {}), motivo: e?.status ? e.message : 'No se pudo enviar el correo al cliente.' };
  }
}

module.exports = { entregarNotaElectronica };
