const { httpError, texto, opcion, numero } = require('../../utils/validacion');

const CATEGORIAS = ['combustible', 'alimentacion'];
const TRATAMIENTOS = ['comercial', ...CATEGORIAS, 'mixto'];
const uuid = (v) => {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(v))) {
    throw httpError(400, 'Identificador de factura inválido.');
  }
  return String(v);
};
const categoria = (v) => opcion(CATEGORIAS)(v, 'Categoría');
const monto = (v, max, etiqueta) => numero({ min: 0, max })(v, etiqueta) ?? 0;

/** La categoría no decide deducción, IVA ni confirmación: cada uno se revisa. */
function revisionFiscal(datos, gasto) {
  const renta = opcion(['pendiente', 'deducible', 'parcial', 'no_deducible'])(datos.renta, 'Renta');
  const iva = opcion(['pendiente', 'total', 'parcial', 'sin_credito'])(datos.iva, 'IVA');
  const limiteIva = Number(gasto.iva_maximo);
  const credito = iva === 'total' ? limiteIva : iva === 'parcial'
    ? monto(datos.iva_credito, limiteIva, 'Crédito de IVA') : 0;
  const maxGasto = Math.max(0, Number(gasto.total_factura) - credito);
  const deducible = renta === 'deducible' ? maxGasto : renta === 'parcial'
    ? monto(datos.gasto_deducible, maxGasto, 'Gasto deducible') : 0;
  const respuesta = datos.respuesta ? opcion(['1', '2', '3'])(datos.respuesta, 'Respuesta') : null;
  const motivo = texto(160)(datos.motivo_fiscal ?? null, 'Justificación');
  if ((renta !== 'pendiente' || iva !== 'pendiente' || respuesta) && !motivo) {
    throw httpError(400, 'Indicá la justificación y el uso empresarial del gasto.');
  }
  if (respuesta === '3' && (credito > 0 || deducible > 0)) {
    throw httpError(400, 'Un rechazo no puede declarar crédito de IVA ni gasto deducible.');
  }
  const completo = renta !== 'pendiente' && iva !== 'pendiente' && Boolean(respuesta) && gasto.validacion === 'validado';
  return { renta, iva, iva_credito: credito, gasto_deducible: deducible,
    respuesta, motivo_fiscal: motivo, completo };
}

/** Se usa también dentro del bloqueo fiscal; nadie salta la revisión por otra API. */
function opcionesFiscales(gasto) {
  if (!gasto?.revisado_en || gasto.validacion !== 'validado' || !gasto.compra_id) {
    throw httpError(409, 'Revisá el comprobante, la deducibilidad y el IVA del gasto antes de responder a Hacienda.');
  }
  return {
    mensaje: gasto.respuesta, condicionImpuesto: { total: '01', parcial: '02', sin_credito: '04' }[gasto.iva],
    impuestoAcreditar: gasto.iva_credito, gastoAplicable: gasto.gasto_deducible,
    detalle: gasto.motivo_fiscal
  };
}

module.exports = { CATEGORIAS, TRATAMIENTOS, uuid, categoria, revisionFiscal, opcionesFiscales };
