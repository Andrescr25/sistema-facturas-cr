const path = require('node:path');
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { guardarArchivo, leerArchivoPrivado, borrarPrivado } = require('../../integrations/almacenamiento');
const { httpError, idValido } = require('../../utils/validacion');
const { parsear, texto } = require('../../integrations/hacienda/xml/util');
const { cedula } = require('./gastos.originales');

/** Sólo coincidencia documental, o un correo inequívoco con un XML y un PDF. */
function pdfParaXml(adjunto, adjuntos) {
  const base = path.basename(adjunto.filename || '', path.extname(adjunto.filename || '')).toLowerCase();
  const pdfs = adjuntos.filter(a => /\.pdf$/i.test(a.filename || ''));
  const iguales = pdfs.filter(a => path.basename(a.filename, path.extname(a.filename)).toLowerCase() === base);
  if (iguales.length === 1) return iguales[0];
  const xmls = adjuntos.filter(a => /\.xml$/i.test(a.filename || ''));
  return xmls.length === 1 && pdfs.length === 1 ? pdfs[0] : null;
}

async function conservarPdf(facturaId, buffer, usuarioId = null) {
  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw httpError(400, 'El archivo no es un PDF válido.');
  }
  const archivo = await guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'pdf', extension: 'pdf', buffer, maximoBytes: 8 * 1024 * 1024 });
  let vinculado = false;
  try {
    await enTransaccion(pool, async (db) => {
      const f = (await db.query('SELECT id, pdf_ruta FROM facturas_proveedores WHERE id=$1 FOR UPDATE', [facturaId])).rows[0];
      if (!f) throw httpError(404, 'No existe esa factura.');
      if (f.pdf_ruta) return; // El original ya conservado nunca se reemplaza.
      await db.query('UPDATE facturas_proveedores SET pdf_ruta=$2 WHERE id=$1', [facturaId, archivo.ruta]);
      const gasto = (await db.query('SELECT id FROM gasto_operativo WHERE factura_id=$1', [facturaId])).rows[0];
      await registrarCambio(db, { entidad: gasto ? 'gasto_operativo' : 'factura_proveedor', entidadId: gasto?.id || facturaId,
        accion: 'adjuntar_pdf', despues: { pdfConservado: true }, usuarioId });
      vinculado = true;
    });
  } finally {
    if (!vinculado) await borrarPrivado(archivo.ruta).catch(() => {});
  }
  return { pdfConservado: true };
}

async function descargar(id, tipo) {
  if (!['xml', 'pdf'].includes(tipo)) throw httpError(400, 'Archivo no disponible.');
  const g = (await pool.query(`SELECT f.xml_ruta, f.pdf_ruta FROM gasto_operativo g
    JOIN facturas_proveedores f ON f.id=g.factura_id WHERE g.id=$1`, [idValido(id)])).rows[0];
  if (!g) throw httpError(404, 'No existe ese gasto.');
  const buffer = await leerArchivoPrivado(g[`${tipo}_ruta`]);
  if (!buffer) throw httpError(404, `Este gasto todavía no conserva el archivo ${tipo.toUpperCase()}.`);
  return buffer;
}

/** Completar un original faltante no permite reemplazar el XML de otro gasto. */
async function conservarXml(id, buffer, usuarioId) {
  const doc = parsear(buffer.toString('utf8'));
  if (doc.documentElement.localName !== 'FacturaElectronica') throw httpError(400, 'Elegí la factura electrónica original del proveedor.');
  const archivo = await guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'xml', extension: 'xml', buffer, maximoBytes: 2 * 1024 * 1024 });
  let vinculado = false;
  try {
    await enTransaccion(pool, async db => {
      const f = (await db.query(`SELECT f.* FROM facturas_proveedores f JOIN gasto_operativo g
        ON g.factura_id=f.id WHERE g.id=$1 FOR UPDATE OF f`, [idValido(id)])).rows[0];
      if (!f) throw httpError(404, 'No existe ese gasto.');
      if (f.xml_ruta) throw httpError(409, 'Ya se conserva el XML original; no se reemplaza.');
      const emisor = doc.getElementsByTagNameNS('*', 'Emisor')[0];
      const total = Number(texto(doc, 'TotalComprobante'));
      if (texto(doc, 'Clave') !== f.clave || cedula(texto(emisor, 'Numero')) !== cedula(f.proveedor_cedula) ||
        texto(doc, 'NumeroConsecutivo') !== f.numero_consecutivo || !Number.isFinite(total) || Math.abs(total - Number(f.total_factura)) > 0.01) {
        throw httpError(400, 'El XML no corresponde a esta factura, proveedor y total.');
      }
      await db.query('UPDATE facturas_proveedores SET xml_ruta=$2 WHERE id=$1', [f.id, archivo.ruta]);
      await registrarCambio(db, { entidad: 'gasto_operativo', entidadId: id, accion: 'adjuntar_xml', despues: { xmlConservado: true }, usuarioId });
      vinculado = true;
    });
  } finally {
    if (!vinculado) await borrarPrivado(archivo.ruta).catch(() => {});
  }
}

module.exports = { pdfParaXml, conservarPdf, conservarXml, descargar };
