const XmlParser = require('../../../services/xmlParser');
const { leerArchivoPrivado } = require('../../integrations/almacenamiento');
const { parsear, texto } = require('../../integrations/hacienda/xml/util');
const { validarXml } = require('../../integrations/hacienda/xml/validar');
const { httpError } = require('../../utils/validacion');

const lista = (v) => v ? (Array.isArray(v) ? v : [v]) : [];
const cedula = (v) => String(v || '').replace(/[\s-]/g, '').replace(/^0+/, '');
const importe = (v) => Number(v || 0);

/** El impuesto único del combustible NO es IVA. No se acredita el resumen entero. */
function ivaDeLineas(lineas) {
  return lista(lineas).reduce((suma, l) => {
    const iva = lista(l.Impuesto).filter(i => i.Codigo === '01' && !['10', '11'].includes(i.CodigoTarifaIVA || i.CodigoTarifa))
      .reduce((s, i) => s + Math.max(0, importe(i.Monto) - importe(i.Exoneracion?.MontoExoneracion)), 0);
    const neto = l.ImpuestoNeto === undefined ? iva : Math.max(0, importe(l.ImpuestoNeto));
    return suma + Math.min(iva, neto);
  }, 0);
}

/** Se conserva el XML íntegro en disco; acá sólo una foto de sus datos originales. */
async function analizarOriginal(db, f, recibida = null) {
  const base = { originales: recibida || {}, validacion: 'requiere_revision', ivaMaximo: 0 };
  const buffer = f.xml_ruta && await leerArchivoPrivado(f.xml_ruta);
  if (!buffer) return { ...base, motivo: 'Falta el XML original del proveedor. Conservá el comprobante para poder validarlo.' };
  try {
    const xml = buffer.toString('utf8');
    const doc = parsear(xml);
    if (doc.documentElement.localName !== 'FacturaElectronica') {
      throw httpError(422, 'Este gasto requiere una factura electrónica con receptor; no un tiquete ni una nota.');
    }
    const parser = new XmlParser();
    const datos = await parser.parseFacturaXML(xml);
    const raw = await parser.parser.parseStringPromise(xml);
    const original = raw.FacturaElectronica;
    base.originales = { ...datos, lineasOriginales: lista(original.DetalleServicio?.LineaDetalle) };
    const empresa = (await db.query('SELECT identificacion FROM empresa WHERE id=1')).rows[0];
    if (!cedula(empresa?.identificacion) || cedula(datos.receptor?.identificacion?.numero) !== cedula(empresa.identificacion)) {
      throw httpError(422, 'El receptor del XML no es la empresa. Revisá el comprobante con el proveedor.');
    }
    if (datos.clave !== f.clave || datos.numeroConsecutivo !== f.numero_consecutivo ||
      cedula(datos.emisor?.identificacion?.numero) !== cedula(f.proveedor_cedula) ||
      Math.abs(importe(datos.resumen?.totales?.comprobante) - importe(f.total_factura)) > 0.01) {
      throw httpError(422, 'La clave, proveedor, número o total del XML no coincide con la factura recibida.');
    }
    parser.validateFacturaCR(datos);
    if (!/\/v4\.4\//.test(doc.documentElement.namespaceURI || '')) {
      throw httpError(422, 'Esta versión del XML requiere revisión; la validación automática admite el esquema oficial 4.4.');
    }
    await validarXml(xml, '01');
    // XSD valida la estructura, no prueba aceptación de Hacienda ni derecho a crédito.
    base.ivaMaximo = Math.min(importe(datos.resumen.totales.impuesto), ivaDeLineas(original.DetalleServicio?.LineaDetalle));
    return { ...base, validacion: 'validado', motivo: null };
  } catch (e) {
    return { ...base, motivo: e.status ? e.message : 'No se pudo validar el XML original. Revisá el comprobante antes de registrarlo.' };
  }
}

module.exports = { analizarOriginal, ivaDeLineas, cedula };
