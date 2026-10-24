const CAMPOS = ['subtotal', 'descuento', 'impuestos', 'total'];
const numero = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const suma = valores => valores.some(v => v == null) ? null : valores.reduce((s, v) => s + v, 0);
const sumarFilas = filas => Object.fromEntries(CAMPOS.map(c => [c, suma(filas.map(f => f[c]))]));
const signo = (fila, factor) => Object.fromEntries(CAMPOS.map(c => [c, fila[c] == null ? null : fila[c] * factor]));

function importes(base, descuento, impuestos, total) {
  const b = numero(base), d = numero(descuento);
  return { subtotal: b == null || d == null ? null : b + d, descuento: d,
    impuestos: numero(impuestos), total: numero(total) };
}

function tipoImpuesto(l) {
  if (numero(l.tarifa) != null) return Number(l.tarifa) === 0 ? 'Sin impuesto' : `IVA ${Number(l.tarifa)}%`;
  if (Number(l.impuestos) === 0 && l.impuestos != null) return 'Sin impuesto';
  return 'Impuestos sin tarifa registrada';
}

/** Una fila por tipo, nunca una por factura. No se deduce una tarifa dividiendo. */
function comerciales(documentos, tipo) {
  const filas = [];
  for (const d of documentos) {
    if (![tipo, ...(tipo === 'Venta' ? ['Nota de crédito'] : [])].includes(d.tipo)) continue;
    const factor = d.tipo === 'Nota de crédito' ? -1 : 1;
    const lineas = d.lineas || [];
    const descuento = d.descuento == null ? (lineas.length ? suma(lineas.map(l => numero(l.descuento))) : null) : numero(d.descuento);
    const encabezado = importes(d.base, descuento, d.impuestos, d.total);
    const detalle = lineas.map(l => ({ moneda: d.moneda, concepto: tipoImpuesto(l), ...importes(l.base, l.descuento, l.impuestos, l.total) }));
    if (!detalle.length || detalle.some(l => CAMPOS.some(c => l[c] == null))) {
      filas.push({ moneda: d.moneda, concepto: 'Sin desglose', ...signo(encabezado, factor) });
      continue;
    }
    filas.push(...detalle.map(l => ({ ...l, ...signo(l, factor) })));
    // El total del comprobante manda. Una diferencia real no desaparece al
    // resumir ni se reparte inventando impuestos sobre las demás tarifas.
    const sumado = sumarFilas(detalle);
    const ajuste = Object.fromEntries(CAMPOS.map(c => [c, encabezado[c] == null ? null : encabezado[c] - sumado[c]]));
    if (CAMPOS.some(c => ajuste[c] != null && Math.abs(ajuste[c]) > 0.000001)) {
      filas.push({ moneda: d.moneda, concepto: 'Ajustes del comprobante', ...signo(ajuste, factor) });
    }
  }
  return filas;
}

function gastos(gastos) {
  return gastos.filter(g => g.estado !== 'anulada' && g.decision !== 'rechazado' && !['Anulado', 'Rechazado'].includes(g.revision))
    .map(g => ({ moneda: g.moneda, concepto: g.categoria === 'combustible' ? 'Combustible' : 'Alimentación y viáticos',
      subtotal: numero(g.totales_originales?.venta), descuento: numero(g.totales_originales?.descuentos),
      impuestos: numero(g.totales_originales?.impuesto), total: numero(g.total) }));
}

function agrupar(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const clave = JSON.stringify([f.moneda, f.concepto]);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  }
  return [...grupos.values()].map(g => ({ moneda: g[0].moneda, concepto: g[0].concepto, ...sumarFilas(g) }))
    .sort((a, b) => a.moneda.localeCompare(b.moneda) || a.concepto.localeCompare(b.concepto, 'es', { numeric: true }));
}

function resumenExcel(mes) {
  return [
    // Separar por la emisión propia del documento, igual que Facturación y
    // la pantalla. No deducirla del número, la clave o la factura acreditada.
    { nombre: 'Facturas y notas electrónicas', filas: agrupar(comerciales(mes.documentos.filter(d => d.electronica === true), 'Venta')), notas: [] },
    { nombre: 'Compras', filas: agrupar(comerciales(mes.documentos, 'Compra')),
      // El vínculo de estas notas a mercadería/gasto no está resuelto. Se
      // informa el ajuste aparte, sin descontarlo de una clase al azar.
      notas: agrupar(mes.documentos.filter(d => d.tipo === 'Nota de crédito proveedor').map(d => ({
        moneda: d.moneda, concepto: 'Notas de proveedor por clasificar',
        subtotal: null, descuento: null, impuestos: null, total: -Number(d.total)
      }))) },
    { nombre: 'Facturas y notas', filas: agrupar(comerciales(mes.documentos.filter(d => d.electronica !== true), 'Venta')), notas: [] },
    { nombre: 'Gastos operativos', filas: agrupar(gastos(mes.gastos)), notas: [] }
  ];
}

module.exports = { resumenExcel, sumarFilas };
