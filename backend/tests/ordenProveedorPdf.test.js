const { test } = require('node:test');
const assert = require('node:assert/strict');

// PDFKit real: observar sus medidas y hojas descubre desbordes automáticos,
// cantidades repetidas y texto perdido, sin simular fuentes ni paginación.
const pdfKitId = require.resolve('pdfkit'), PDFDocument = require('pdfkit');
const documentos = [];
class PdfObservado extends PDFDocument {
  constructor(opciones) { super(opciones); this.trazos = []; documentos.push(this); }
  addPage(opciones) { this.indice = (this.indice ?? -1) + 1; return super.addPage(opciones); }
  switchToPage(indice) { this.indice = indice; return super.switchToPage(indice); }
  text(valor, x, y, opciones) {
    this.trazos.push({ texto: String(valor), x, y, tam: this._fontSize,
      alto: this.heightOfString(String(valor), opciones), pagina: this.indice });
    return super.text(valor, x, y, opciones);
  }
}
require.cache[pdfKitId].exports = PdfObservado;
const { generarPdfOrden } = require('../src/modules/orders-whatsapp/ordenesCiclo.pdf');
const { generarPdfCompra } = require('../src/modules/orders-whatsapp/ordenProveedor.pdf');
require.cache[pdfKitId].exports = PDFDocument;

const linea = (n, cambios = {}) => ({ producto_id: n, producto_nombre: `Producto propio ${n}`,
  codigo_interno: `INTERNO-${n}`, codigo_proveedor: `PROV-${n}`, nombre_proveedor: `Descripción proveedor ${n}`,
  factor_conversion: 6, cantidad_proveedor: 300 + n, cantidad_propia: (300 + n) * 6, mapping_id: n, ...cambios });
const orden = lineas => ({ referencia: 'OC-123', proveedor_nombre: 'ZZ Proveedor de pruebas', version: 7, lineas });
function comprobar(pdf) {
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const d = documentos.at(-1), pies = d.trazos.filter(t => /^Página \d+ de \d+$/.test(t.texto));
  assert.ok(pies.length);
  assert.deepEqual(pies.map(t => t.texto), pies.map((_, i) => `Página ${i + 1} de ${pies.length}`));
  for (const t of d.trazos) {
    assert.ok(t.x >= 40 && t.x <= 572, `fuera de margen horizontal: ${t.texto}`);
    assert.ok(t.y >= 40 && t.y <= 762, `fuera de margen vertical: ${t.texto}`);
    if (t.y < 740) assert.ok(t.y + t.alto <= 746, `invade el pie: ${t.texto.slice(0, 80)}`);
  }
  assert.equal(pies.length, d.indice + 1, 'no genera una hoja automática sin pie');
  return d;
}
const cantidades = d => d.trazos.filter(t => t.x === 46 && t.tam === 14).map(t => t.texto);

test('la orden comercial muestra código, descripción, factor y cantidad del proveedor sin cuentas internas', async () => {
  const o = orden([linea(1), linea(2, { factor_conversion: 1 })]), antes = structuredClone(o);
  const d = comprobar(await generarPdfOrden(o)), textos = d.trazos.map(t => t.texto);
  assert.equal(d.trazos.filter(t => /^Página /.test(t.texto)).length, 1);
  assert.deepEqual(cantidades(d), ['301', '302']);
  for (const esperado of ['CANT.', 'PRODUCTO', 'CÓDIGO', 'PROV-1', 'PROV-2', 'Descripción proveedor 1',
    'Factor: 6', 'Factor: 1', '603 unidades', 'Recibido por']) assert.ok(textos.includes(esperado), esperado);
  assert.ok(!textos.some(t => /Producto propio|Unidades propias|Revisión 7|P-1/.test(t)));
  assert.deepEqual(o, antes, 'renderizar no modifica el snapshot');
});

test('datos propios y referencias faltantes conservan cantidad proveedor y factor sin inventar P-id', async () => {
  const o = orden([linea(1), linea(2, { codigo_proveedor: null }),
    linea(3, { mapping_id: null, codigo_proveedor: null, codigo_interno: null })]);
  const d = comprobar(await generarPdfOrden(o)), textos = d.trazos.map(t => t.texto);
  assert.ok(textos.includes('SIN CÓDIGO DE PROVEEDOR'));
  assert.ok(textos.includes('SIN EQUIVALENCIA REGISTRADA'));
  assert.ok(textos.includes('INTERNO-2')); assert.ok(textos.includes('—'));
  assert.deepEqual(cantidades(d), ['301', '302', '303']);
  const propio = comprobar(await generarPdfOrden(o, { preferirDatosProveedor: false }));
  assert.ok(propio.trazos.some(t => t.texto === 'Producto propio 1'));
  assert.ok(propio.trazos.some(t => t.texto === 'INTERNO-1'));
  assert.ok(!propio.trazos.some(t => /^SIN CÓDIGO|^SIN EQUIVALENCIA/.test(t.texto)));
  assert.deepEqual(cantidades(propio), ['301', '302', '303']);
});

test('muchos productos conservan líneas, factores y cantidades una vez y repiten columnas al cambiar hoja', async () => {
  const ls = Array.from({ length: 80 }, (_, i) => linea(i + 1));
  const d = comprobar(await generarPdfOrden(orden(ls))), pies = d.trazos.filter(t => /^Página /.test(t.texto));
  assert.ok(pies.length > 1);
  assert.deepEqual(cantidades(d), ls.map(l => String(l.cantidad_proveedor)));
  assert.deepEqual(d.trazos.filter(t => /^PROV-\d+$/.test(t.texto)).map(t => t.texto), ls.map(l => l.codigo_proveedor));
  assert.equal(d.trazos.filter(t => t.texto === 'Factor: 6').length, 80);
  for (const p of pies) {
    if (d.trazos.some(t => t.pagina === p.pagina && /^PROV-\d+$/.test(t.texto))) {
      for (const columna of ['CANT.', 'PRODUCTO', 'CÓDIGO']) {
        assert.ok(d.trazos.some(t => t.pagina === p.pagina && t.texto === columna));
      }
    }
  }
});

test('descripción y código mayores que una hoja continúan completos sin repetir cantidad ni factor', async () => {
  const descripcion = 'Descripción extensa de proveedor con presentación y detalle. '.repeat(250);
  const codigo = 'REFERENCIA-EXTENSA-'.repeat(150);
  const d = comprobar(await generarPdfOrden(orden([linea(1, { nombre_proveedor: descripcion, codigo_proveedor: codigo })])));
  assert.ok(d.trazos.filter(t => /^Página /.test(t.texto)).length > 2);
  assert.equal(d.trazos.filter(t => t.x === 114 && t.tam === 10.5).map(t => t.texto).join(''), descripcion);
  assert.equal(d.trazos.filter(t => t.x === 476 && t.tam === 8.5).map(t => t.texto).join(''), codigo);
  assert.deepEqual(cantidades(d), ['301']);
  assert.equal(d.trazos.filter(t => t.texto === 'Factor: 6').length, 1);
});

test('el generador compartido conserva notas separadas y el total en unidades del proveedor', async () => {
  const d = comprobar(await generarPdfCompra({ referencia: 'OC-456', proveedor: 'ZZ Proveedor', fecha: '2026-10-14',
    lineas: [{ codigo: 'ABC', descripcion: 'Producto proveedor', cantidad: 3, factor: 12,
      descripcionFactura: 'Caja cerrada', observaciones: 'Confirmar disponibilidad' }] }));
  const textos = d.trazos.map(t => t.texto);
  assert.ok(textos.includes('Producto proveedor'));
  assert.ok(textos.includes('Caja cerrada   ·   Confirmar disponibilidad'));
  assert.ok(textos.includes('Factor: 12')); assert.ok(textos.includes('3 unidades'));
  assert.deepEqual(cantidades(d), ['3']);
});
