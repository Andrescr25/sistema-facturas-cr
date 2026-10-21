const { test } = require('node:test');
const assert = require('node:assert/strict');
const { revisionFiscal, opcionesFiscales } = require('../src/modules/gastos-operativos/gastos.validacion');
const { ivaDeLineas } = require('../src/modules/gastos-operativos/gastos.originales');
const { pdfParaXml } = require('../src/modules/gastos-operativos/gastos.archivos');

test('el impuesto único del combustible no se convierte en IVA', () => {
  assert.equal(ivaDeLineas([{ Impuesto: { Codigo: '03', Monto: '2500' } }]), 0);
  assert.equal(ivaDeLineas([{ Impuesto: [{ Codigo: '03', Monto: '2500' }, { Codigo: '01', CodigoTarifaIVA: '11', Monto: '0' }] }]), 0);
  assert.equal(ivaDeLineas([{ Impuesto: [{ Codigo: '01', CodigoTarifaIVA: '08', Monto: '130', Exoneracion: { MontoExoneracion: '30' } }, { Codigo: '02', Monto: '40' }], ImpuestoNeto: '140' }]), 100);
});

const GASTO = { validacion: 'validado', total_factura: '113', iva_maximo: '13' };
test('recibir o clasificar no elige tratamiento fiscal', () => {
  const r = revisionFiscal({ renta: 'pendiente', iva: 'pendiente' }, GASTO);
  assert.equal(r.completo, false);
  assert.equal(r.gasto_deducible, 0);
  assert.equal(r.iva_credito, 0);
  assert.throws(() => opcionesFiscales({ ...GASTO, ...r }), /Revisá/);
});

test('renta, IVA y aceptación son decisiones independientes y justificadas', () => {
  const r = revisionFiscal({ renta: 'parcial', gasto_deducible: '50', iva: 'parcial', iva_credito: '6', respuesta: '2', motivo_fiscal: 'ZZ uso mixto documentado' }, GASTO);
  assert.equal(r.completo, true);
  assert.equal(r.gasto_deducible, 50);
  assert.equal(r.iva_credito, 6);
  assert.equal(opcionesFiscales({ ...GASTO, ...r, compra_id: 1, revisado_en: new Date() }).condicionImpuesto, '02');
  assert.throws(() => revisionFiscal({ renta: 'deducible', iva: 'total', respuesta: '1' }, GASTO), /justificación/);
});

test('no se permite crédito por encima del IVA ni gasto por encima del comprobante', () => {
  assert.throws(() => revisionFiscal({ renta: 'deducible', iva: 'parcial', iva_credito: 14 }, GASTO), /entre 0 y 13/);
  assert.throws(() => revisionFiscal({ renta: 'parcial', gasto_deducible: 114, iva: 'sin_credito' }, GASTO), /entre 0 y 113/);
  assert.throws(() => revisionFiscal({ renta: 'deducible', iva: 'total', respuesta: '3', motivo_fiscal: 'ZZ rechazo' }, GASTO), /rechazo/);
  const rechazo = revisionFiscal({ renta: 'no_deducible', iva: 'sin_credito', respuesta: '3', motivo_fiscal: 'ZZ operación no reconocida' }, GASTO);
  assert.equal(rechazo.completo, true);
  assert.equal(rechazo.gasto_deducible + rechazo.iva_credito, 0);
});

test('no se adjunta el PDF de otra factura cuando el correo es ambiguo', () => {
  const xml = { filename: 'factura1.xml' }, propio = { filename: 'factura1.pdf' }, otro = { filename: 'factura2.pdf' };
  assert.equal(pdfParaXml(xml, [xml, propio, otro]), propio);
  assert.equal(pdfParaXml(xml, [xml, otro]), otro, 'un único XML y PDF en el correo');
  assert.equal(pdfParaXml(xml, [xml, { filename: 'otra.xml' }, otro]), null);
  assert.equal(pdfParaXml(xml, [xml, { filename: 'a.pdf' }, otro]), null);
});

test('la presentación conserva moneda y distingue un pendiente tributario de un pago', async () => {
  const { camposGeneralesGasto, pagoDelGasto, resumenFiscalGasto, TRATAMIENTOS_FACTURA } = await import('../../frontend/src/utils/gastosOperativos.js');
  assert.equal(TRATAMIENTOS_FACTURA[0].valor, 'comercial');
  assert.deepEqual(camposGeneralesGasto({ categoria: 'combustible', descripcion: 'ZZ' }), { categoria: 'combustible', descripcion: 'ZZ', empleado: '', placa: '' });
  assert.equal(pagoDelGasto({ compra_id: 1, saldo: 113 }).texto, 'Pendiente de pago');
  assert.equal(pagoDelGasto({ compra_id: 1, saldo: 103, pagado: 10 }).texto, 'Pago parcial');
  assert.equal(resumenFiscalGasto({}).includes('por revisar'), true);
});
