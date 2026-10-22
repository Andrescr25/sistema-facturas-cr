const etiquetas = {
  pendiente: 'Por revisar', deducible: 'Deducible', parcial: 'Parcial',
  no_deducible: 'No deducible', total: 'Total', sin_credito: 'Sin crédito',
  PAGADA: 'Pagado', PARCIAL: 'Pago parcial', PENDIENTE: 'Pendiente',
  VENCIDA: 'Pendiente vencido', CONTADO: 'Pendiente de registrar pago'
};
const sumar = (filas, clave) => Math.round(filas.reduce((s, f) => s + Number(f[clave] || 0), 0) * 100) / 100;
const monto = (v) => v == null ? null : Number(v);
function gastosExcel(gastos) {
  return gastos.map(g => ({
    ...g, identidad: `gasto-${g.id}`, tipo: 'Gasto operativo',
    subtotal_original: monto(g.totales_originales?.venta),
    descuentos_originales: monto(g.totales_originales?.descuentos),
    impuestos_originales: monto(g.totales_originales?.impuesto),
    renta_texto: etiquetas[g.renta], iva_texto: etiquetas[g.iva],
    respuesta_texto: { 1: 'Aceptación', 2: 'Aceptación parcial', 3: 'Rechazo' }[g.respuesta] || 'Por decidir',
    pago_texto: etiquetas[g.estado_pago] || 'Por validar',
    hacienda_texto: g.estado_hacienda || 'Sin respuesta registrada',
    xml: g.tiene_xml ? `gasto-${g.id}.xml` : 'Falta XML',
    pdf: g.tiene_pdf ? `gasto-${g.id}.pdf` : 'Sin PDF adjunto'
  }));
}

function pendientesExcel(documentos, gastos) {
  const pendientes = [];
  const agregar = (d, motivos) => {
    if (motivos.length) pendientes.push({ ...d, observacion: motivos.join(' · ') });
  };
  for (const d of documentos) {
    const motivos = [];
    if (d.tipo === 'Nota de crédito proveedor') motivos.push('Revisar aplicación a compra/gasto; sin desglose de impuestos guardado');
    else if (!d.lineas.length) motivos.push('Sin detalle de líneas guardado');
    else {
      const detalle = sumar(d.lineas, 'total');
      if (Math.abs(detalle - d.total) > 0.02) motivos.push('Total del comprobante distinto del detalle; conciliar con el original');
    }
    if (d.tipo === 'Nota de crédito' && !d.documento_asociado) motivos.push('Sin factura asociada guardada');
    agregar(d, motivos);
  }
  for (const g of gastos) {
    if (g.revision === 'Anulado') continue;
    const motivos = [];
    if (g.revision !== 'Revisado') motivos.push('Revisión fiscal pendiente: deducción e IVA sin aprobar');
    if (g.validacion !== 'validado') motivos.push(g.motivo_validacion || 'Validación del comprobante pendiente');
    if (!g.tiene_xml) motivos.push('Falta XML original');
    agregar(g, motivos);
  }
  return pendientes;
}

function resumenMoneda(mes, moneda) {
  // El Excel y la pantalla parten de los mismos totales del mes.
  const r = mes.resumen.find(f => f.moneda === moneda);
  const ds = mes.documentos.filter(d => d.moneda === moneda);
  const gs = mes.gastos.filter(g => g.moneda === moneda && g.revision !== 'Anulado');
  const ventas = ds.filter(d => d.tipo === 'Venta'), notas = ds.filter(d => d.tipo === 'Nota de crédito');
  const compras = ds.filter(d => d.tipo === 'Compra'), nc = ds.filter(d => d.tipo === 'Nota de crédito proveedor');
  const revisados = gs.filter(g => g.revision === 'Revisado'), pendientes = gs.filter(g => g.revision !== 'Revisado');
  const netoVentas = campo => {
    if ([...ventas, ...notas].some(d => d[campo] == null)) return null;
    return Math.round((sumar(ventas, campo) - sumar(notas, campo)) * 100) / 100;
  };
  return [
    ['Ventas emitidas', ventas.length, r.ventas, 'Total de comprobantes del mes, con impuestos.'],
    ['Notas de crédito de ventas', notas.length, -r.devoluciones, 'Se restan de las ventas.'],
    ['VENTAS NETAS', ventas.length + notas.length, Math.round((r.ventas - r.devoluciones) * 100) / 100, 'Ventas menos notas de crédito de ventas.'],
    ['Base neta de ventas', ventas.length + notas.length, netoVentas('base'), 'Base registrada de ventas menos base de sus notas; descuentos ya aplicados.'],
    ['Impuestos netos de ventas', ventas.length + notas.length, netoVentas('impuestos'), 'Impuestos registrados de ventas menos los de sus notas; no es el impuesto final a pagar.'],
    ['Compras de mercadería', compras.length, r.compras, 'Compras vigentes; los gastos operativos van aparte.'],
    ['Notas de crédito de proveedores', nc.length, -r.creditos_proveedores, 'Ajustes por clasificar: compra/gasto e impuestos.'],
    ['Gastos operativos', gs.length, r.gastos, 'Combustible y alimentación/viáticos, sin anulados.'],
    ['Gasto deducible revisado', revisados.length, r.gasto_deducible, 'Importe aprobado en la revisión de gastos, para renta.'],
    ['IVA acreditable de gastos revisados', revisados.length, r.iva_credito_gastos, 'Sólo IVA aprobado de gastos; no es todo el IVA de compras.'],
    ['Gastos por revisar', pendientes.length, sumar(pendientes, 'total'), 'Ya incluidos en gastos; deducción/crédito aún sin aprobar.']
  ];
}

function ventasPorTarifa(documentos) {
  const grupos = new Map();
  for (const d of documentos) {
    if (!['Venta', 'Nota de crédito'].includes(d.tipo)) continue;
    for (const l of d.lineas) {
      const tarifa = l.tarifa == null ? null : Number(l.tarifa);
      const clave = JSON.stringify([d.moneda, tarifa]);
      if (!grupos.has(clave)) grupos.set(clave, {
        moneda: d.moneda, tarifa, documentos: new Set(), lineas: 0,
        base_neta: 0, impuestos_ventas: 0, impuestos_notas: 0, baseCompleta: true, impuestosCompletos: true
      });
      const g = grupos.get(clave), nota = d.tipo === 'Nota de crédito';
      g.documentos.add(d.identidad);
      g.lineas++;
      if (l.base == null) g.baseCompleta = false;
      else g.base_neta += Number(l.base) * (nota ? -1 : 1);
      if (l.impuestos == null) g.impuestosCompletos = false;
      else g[nota ? 'impuestos_notas' : 'impuestos_ventas'] += Number(l.impuestos);
    }
  }
  return [...grupos.values()]
    .sort((a, b) => a.moneda.localeCompare(b.moneda) || (a.tarifa ?? Infinity) - (b.tarifa ?? Infinity))
    .map(g => ({
      moneda: g.moneda, tarifa: g.tarifa == null ? 'Sin tarifa guardada' : `${g.tarifa} %`,
      documentos: g.documentos.size, lineas: g.lineas,
      base_neta: g.baseCompleta ? g.base_neta : null,
      impuestos_ventas: g.impuestosCompletos ? g.impuestos_ventas : null,
      impuestos_notas: g.impuestosCompletos ? g.impuestos_notas : null,
      impuestos_netos: g.impuestosCompletos ? g.impuestos_ventas - g.impuestos_notas : null
    }));
}

module.exports = { gastosExcel, pendientesExcel, resumenMoneda, ventasPorTarifa };
