const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { parseString } = require('xml2js');
const { excelMensual } = require('../src/modules/reporte-contador/contador.excel');
const { resumenMoneda, ventasPorTarifa } = require('../src/modules/reporte-contador/contador.excelDatos');
const { mesDeMuestra } = require('./fixtures/contadorMes');
const filas = (b, nombre) => XLSX.utils.sheet_to_json(b.Sheets[nombre], { range: 5, defval: null });

test('resumen: notas restan sólo ventas, monedas separadas y gastos anulados fuera', () => {
  const mes = mesDeMuestra();
  const crc = resumenMoneda(mes, 'CRC'), usd = resumenMoneda(mes, 'USD');
  assert.equal(crc.find(r => r[0] === 'VENTAS NETAS')[2], 152200);
  assert.equal(crc.find(r => r[0] === 'Base neta de ventas')[2], 140000);
  assert.equal(crc.find(r => r[0] === 'Impuestos netos de ventas')[2], 12200);
  assert.equal(usd.find(r => r[0] === 'VENTAS NETAS')[2], 113);
  assert.equal(crc.find(r => r[0] === 'Gastos operativos')[2], 56300);
  assert.equal(crc.find(r => r[0] === 'Gasto deducible revisado')[2], 45000);
  assert.equal(crc.find(r => r[0] === 'Gastos por revisar')[2], 11300);
});

test('el archivo conserva códigos, fechas, precisión, notas sin desglose y aprobación pendiente', () => {
  const mes = mesDeMuestra();
  mes.documentos[0].contraparte = '=HYPERLINK("https://example.com")';
  mes.documentos[0].total = 113000.12345;
  const antes = JSON.stringify(mes);
  const b = XLSX.read(excelMensual(mes).buffer, { type: 'buffer' });
  assert.equal(b.SheetNames[0], 'Resumen');
  assert.equal(b.SheetNames.length, 9);
  assert.equal(b.Sheets.Ventas.B7.v, '000000001');
  assert.equal(b.Sheets.Ventas.C7.t, 's');
  assert.equal(b.Sheets.Ventas.C7.f, undefined);
  assert.equal(filas(b, 'Ventas')[0]['Total comprobante'], 113000.12345);
  const nc = filas(b, 'Compras').find(f => f['Tipo de documento'] === 'Nota de crédito proveedor');
  assert.equal(nc['Impuestos del detalle'], null);
  const pendiente = filas(b, 'Gastos operativos').find(f => f.Revisión === 'Por revisar');
  assert.equal(pendiente['IVA acreditable revisado'], null);
  assert.equal(pendiente['Gasto deducible revisado'], null);
  assert.equal(filas(b, 'Soporte documental')[0]['Clave electrónica'], '0'.repeat(51) + '1');
  const dia = XLSX.SSF.parse_date_code(b.Sheets.Ventas.A7.v);
  assert.deepEqual([dia.y, dia.m, dia.d], [2026, 9, 15]);
  assert.equal(JSON.stringify(mes), antes, 'exportar no cambia los datos del reporte');
});

test('Excel lleva estilos reales, filtros sólo en tabla y paneles/impresión válidos', async () => {
  const buffer = excelMensual(mesDeMuestra()).buffer;
  const zip = XLSX.CFB.read(buffer, { type: 'buffer' });
  assert.equal(new Set(zip.FullPaths).size, zip.FullPaths.length, 'sin entradas ZIP duplicadas que Excel podría interpretar distinto');
  const xml = (ruta) => XLSX.CFB.find(zip, `/${ruta}`).content.toString('utf8');
  const parsear = texto => new Promise((resolve, reject) => parseString(texto, (e, r) => e ? reject(e) : resolve(r)));
  // Releer TODO el XML detecta corrupción silenciosa en celdas vacías o escapes.
  for (const [i, ruta] of zip.FullPaths.entries()) {
    if (/\.(xml|rels)$/.test(ruta)) await parsear(zip.FileIndex[i].content.toString('utf8'));
  }
  const styles = (await parsear(xml('xl/styles.xml'))).styleSheet;
  for (const tipo of ['fonts', 'fills', 'borders', 'cellXfs']) {
    const etiqueta = { fonts: 'font', fills: 'fill', borders: 'border', cellXfs: 'xf' }[tipo];
    assert.equal(Number(styles[tipo][0].$.count), styles[tipo][0][etiqueta].length);
  }
  assert.ok(styles.fills[0].fill.some(f => f.patternFill?.[0].fgColor?.[0].$.rgb === 'FF12263F'));
  const venta = (await parsear(xml('xl/worksheets/sheet2.xml'))).worksheet;
  assert.equal(venta.autoFilter[0].$.ref, 'A6:J10');
  assert.deepEqual(venta.sheetViews[0].sheetView[0].pane[0].$, {
    xSplit: '2', ySplit: '6', topLeftCell: 'C7', activePane: 'bottomRight', state: 'frozen'
  });
  assert.equal(venta.pageSetup[0].$.fitToWidth, '1');
  assert.match(xml('xl/workbook.xml'), /_xlnm.Print_Titles/);
  const cabecera = venta.sheetData[0].row.find(r => r.$.r === '6').c[0];
  const cuerpo = venta.sheetData[0].row.find(r => r.$.r === '7').c[0];
  assert.notEqual(cabecera.$.s, cuerpo.$.s);
  assert.ok(Number(cabecera.$.s) < styles.cellXfs[0].xf.length);
});

test('mes vacío mantiene encabezados utilizables y no inventa movimientos ni pendientes', () => {
  const mes = { ...mesDeMuestra(), documentos: [], gastos: [], empresa: null, finalizado: false };
  const b = XLSX.read(excelMensual(mes).buffer, { type: 'buffer' });
  assert.match(b.Sheets.Resumen.A4.v, /MES EN CURSO/);
  assert.equal(b.Sheets.Ventas.A6.v, 'Fecha');
  assert.match(b.Sheets.Ventas.A7.v, /Sin movimientos/);
});

test('tarifas: resta notas, separa monedas y conserva desconocidos sin inferirlos', () => {
  const mes = mesDeMuestra();
  const tarifas = ventasPorTarifa(mes.documentos);
  const trece = tarifas.find(t => t.moneda === 'CRC' && t.tarifa === '13 %');
  assert.equal(trece.base_neta, 90000);
  assert.equal(trece.impuestos_ventas, 13000);
  assert.equal(trece.impuestos_notas, 1300);
  assert.equal(trece.impuestos_netos, 11700);
  assert.equal(tarifas.find(t => t.moneda === 'USD').impuestos_netos, 13);
  mes.documentos[0].lineas[0].tarifa = null;
  mes.documentos[0].lineas[0].impuestos = null;
  const sinTarifa = ventasPorTarifa(mes.documentos).find(t => t.tarifa === 'Sin tarifa guardada');
  assert.equal(sinTarifa.impuestos_netos, null);
  assert.equal(sinTarifa.base_neta, 100000);
});
