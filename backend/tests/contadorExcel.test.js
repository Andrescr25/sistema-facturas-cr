const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseString } = require('xml2js');
const { excelMensual } = require('../src/modules/reporte-contador/contador.excel');
const { resumenExcel } = require('../src/modules/reporte-contador/contador.excelDatos');
const { mesDeMuestra } = require('./fixtures/contadorMes');
const libro = mes => XLSX.read(excelMensual(mes).buffer, { type: 'buffer' });
const filas = (b, nombre) => XLSX.utils.sheet_to_json(b.Sheets[nombre], { header: 1, defval: null });
const total = (b, nombre) => filas(b, nombre).filter(f => f[0] === 'TOTAL');

test('sólo tres hojas resumidas, con cinco columnas y sin documentos individuales', () => {
  const mes = mesDeMuestra(), antes = JSON.stringify(mes), b = libro(mes);
  assert.deepEqual(b.SheetNames, ['Ventas', 'Compras', 'Gastos operativos']);
  assert.deepEqual(filas(b, 'Ventas')[5], ['Tipo de impuesto', 'Subtotal', 'Descuento', 'Impuestos', 'Total']);
  assert.deepEqual(total(b, 'Ventas')[0], ['TOTAL', 140000, 0, 12200, 152200]);
  assert.deepEqual(total(b, 'Compras')[0], ['TOTAL', 200000, 0, 26000, 226000]);
  assert.deepEqual(total(b, 'Gastos operativos')[0], ['TOTAL', 56300, 0, 0, 56300]);
  for (const nombre of b.SheetNames) {
    const texto = JSON.stringify(filas(b, nombre));
    assert.ok(!texto.includes(mes.documentos[0].clave));
    assert.ok(!texto.includes(mes.documentos[0].contraparte));
    assert.ok(!texto.includes('Pago actual'));
    assert.equal(XLSX.utils.decode_range(b.Sheets[nombre]['!ref']).e.c, 4);
  }
  assert.equal(JSON.stringify(mes), antes);
});

test('subtotal antes del descuento y notas restadas una sola vez por tarifa', () => {
  const mes = { ...mesDeMuestra(), gastos: [], documentos: [
    { tipo: 'Venta', moneda: 'CRC', base: 170, descuento: 30, impuestos: 13, total: 183, lineas: [
      { base: 100, descuento: 20, impuestos: 13, total: 113, tarifa: 13 },
      { base: 70, descuento: 10, impuestos: 0, total: 70, tarifa: 0 }
    ] },
    { tipo: 'Nota de crédito', moneda: 'CRC', base: 10, descuento: 2, impuestos: 1.3, total: 11.3,
      lineas: [{ base: 10, descuento: 2, impuestos: 1.3, total: 11.3, tarifa: 13 }] }
  ] };
  const r = resumenExcel(mes)[0].filas;
  assert.deepEqual(r.find(f => f.concepto === 'IVA 13%'), { moneda: 'CRC', concepto: 'IVA 13%', subtotal: 108, descuento: 18, impuestos: 11.7, total: 101.7 });
  const t = total(libro(mes), 'Ventas')[0];
  assert.deepEqual(t, ['TOTAL', 188, 28, 11.7, 171.7]);
});

test('no mezcla monedas ni muestra un total combinado de colones y dólares', () => {
  const b = libro(mesDeMuestra());
  assert.deepEqual(total(b, 'Ventas').map(f => f[4]), [152200, 113]);
  assert.deepEqual(total(b, 'Gastos operativos').map(f => f[4]), [56300, 22.6]);
  assert.ok(filas(b, 'Ventas').some(f => f[0] === 'Moneda: USD'));
});

test('sin tarifa no inventa IVA; combustible conserva su impuesto como impuesto, no crédito', () => {
  const mes = mesDeMuestra();
  mes.documentos = mes.documentos.filter(d => d.tipo === 'Compra');
  delete mes.documentos[0].lineas[0].tarifa;
  const compra = resumenExcel(mes)[1].filas[0];
  assert.equal(compra.concepto, 'Impuestos sin tarifa registrada');
  assert.equal(compra.impuestos, 26000);
  mes.gastos = [{ ...mes.gastos[0], total: 120, totales_originales: { venta: 100, descuentos: 0, impuesto: 20 } }];
  assert.deepEqual(total(libro(mes), 'Gastos operativos')[0], ['TOTAL', 100, 0, 20, 120]);
});

test('el total del comprobante se conserva aunque difiera del detalle, sin perder decimales', () => {
  const mes = mesDeMuestra();
  mes.documentos = [mes.documentos[0]];
  mes.documentos[0].total = 113000.12345;
  const b = libro(mes), ajuste = filas(b, 'Ventas').find(f => f[0] === 'Ajustes del comprobante');
  assert.ok(Math.abs(ajuste[4] - 0.12345) < 1e-8);
  assert.equal(total(b, 'Ventas')[0][4], 113000.12345);
});

test('notas de proveedor sin destino quedan informadas aparte, sin descontar mercadería al azar', () => {
  const b = libro(mesDeMuestra());
  const r = filas(b, 'Compras'), posicion = r.findIndex(f => f[0] === 'TOTAL');
  const nota = r.findIndex(f => f[0] === 'Notas de proveedor por clasificar');
  assert.ok(nota > posicion);
  assert.deepEqual(r[nota], ['Notas de proveedor por clasificar', null, null, null, -9000]);
  assert.equal(r[posicion][4], 226000);
});

test('gastos rechazados/anulados fuera, campos desconocidos vacíos y período vacío utilizable', () => {
  const mes = mesDeMuestra();
  mes.gastos = [{ ...mes.gastos[0], totales_originales: {} },
    { ...mes.gastos[1], decision: 'rechazado', revision: 'Rechazado' }, mes.gastos[2]];
  assert.deepEqual(total(libro(mes), 'Gastos operativos')[0], ['TOTAL', null, null, null, 45000]);
  const vacio = libro({ ...mes, documentos: [], gastos: [], empresa: null });
  for (const nombre of vacio.SheetNames) {
    assert.deepEqual(total(vacio, nombre)[0], ['TOTAL', 0, 0, 0, 0]);
    assert.match(vacio.Sheets[nombre].A3.v, /01 de septiembre de 2026.*30 de septiembre de 2026/);
  }
});

test('estilos OOXML reales, números formateados y cada resumen listo para imprimir', async () => {
  const zip = XLSX.CFB.read(excelMensual(mesDeMuestra()).buffer, { type: 'buffer' });
  assert.equal(new Set(zip.FullPaths).size, zip.FullPaths.length);
  const xml = ruta => XLSX.CFB.find(zip, `/${ruta}`).content.toString('utf8');
  const parsear = texto => new Promise((resolve, reject) => parseString(texto, (e, r) => e ? reject(e) : resolve(r)));
  for (const [i, ruta] of zip.FullPaths.entries()) if (/\.(xml|rels)$/.test(ruta)) await parsear(zip.FileIndex[i].content.toString('utf8'));
  const styles = (await parsear(xml('xl/styles.xml'))).styleSheet;
  assert.ok(styles.fills[0].fill.some(f => f.patternFill?.[0].fgColor?.[0].$.rgb === 'FF12263F'));
  for (let i = 1; i <= 3; i++) {
    const h = (await parsear(xml(`xl/worksheets/sheet${i}.xml`))).worksheet;
    assert.equal(h.autoFilter, undefined);
    assert.deepEqual(h.sheetViews[0].sheetView[0].pane[0].$, { ySplit: '6', topLeftCell: 'A7', activePane: 'bottomLeft', state: 'frozen' });
    assert.equal(h.pageSetup[0].$.fitToWidth, '1');
    assert.equal(h.pageSetup[0].$.fitToHeight, '1');
    assert.equal(h.pageSetup[0].$.orientation, 'landscape');
    for (const r of h.sheetData[0].row) for (const c of r.c || []) assert.ok(Number(c.$.s) < styles.cellXfs[0].xf.length);
  }
  assert.match(xml('xl/workbook.xml'), /_xlnm.Print_Titles/);
  const b = XLSX.read(excelMensual(mesDeMuestra()).buffer, { type: 'buffer', cellNF: true });
  assert.equal(b.Sheets.Ventas.B7.t, 'n');
  assert.match(b.Sheets.Ventas.B7.z, /#,##0.00/);
});
