const { test } = require('node:test');
const assert = require('node:assert/strict');

// PDFKit real, con observación del dibujo y de las páginas físicas. Detecta
// saltos automáticos por desborde; no sustituye fuentes, medidas ni renderer.
const pdfKitId = require.resolve('pdfkit'), PDFDocument = require('pdfkit');
const documentos = [];
class PdfObservado extends PDFDocument {
  constructor(opciones) { super(opciones); this.trazos = []; documentos.push(this); }
  addPage(opciones) { this.indice = (this.indice ?? -1) + 1; return super.addPage(opciones); }
  switchToPage(indice) { this.indice = indice; return super.switchToPage(indice); }
  text(valor, x, y, opciones) {
    this.trazos.push({ texto: String(valor), x, y, alto: this.heightOfString(String(valor), opciones), pagina: this.indice });
    return super.text(valor, x, y, opciones);
  }
}
require.cache[pdfKitId].exports = PdfObservado;
const { generarPdfCatalogo } = require('../src/modules/portal-clientes/preventa.pdf');
require.cache[pdfKitId].exports = PDFDocument;

function modelo(tamanos, largos = false) {
  let id = 900000;
  return {
    negocio: 'Distribuidora Tachi', cliente: largos ? 'Cliente con razón social extensa '.repeat(6) : 'Cliente de prueba',
    referencia: 'R1-C1', fecha: '2026-10-05',
    ciclo: { semana: '2026-10-12', rutaNombre: largos ? 'Ruta de prueba con nombre extenso '.repeat(4) : 'Ruta de prueba' },
    total: tamanos.reduce((a, n) => a + n, 0),
    secciones: tamanos.map((n, grupo) => ({
      titulo: largos ? `Categoría ${grupo}: ` + 'Clasificación extensa '.repeat(8) : `Categoría ${grupo}`,
      subcategoria: largos ? `Subcategoría ${grupo}: ` + 'Tipo de producto '.repeat(8) : `Subcategoría ${grupo}`,
      productos: Array.from({ length: n }, () => ({
        codigo: `P-${++id}`, nombre: largos ? `Producto ${id} ` + 'con nombre muy largo '.repeat(11) : `Producto ${id}`,
        referencia: largos ? 'REFERENCIA-LARGA-1234567890' : 'REF',
        precio: 124.3, precioAnterior: 145, etiquetas: ['Oferta', 'Liquidación'],
      })),
    })),
  };
}

async function comprobar(m, cantidades) {
  const pdf = await generarPdfCatalogo(m), doc = documentos.at(-1), rango = doc.bufferedPageRange();
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  // PDFKit vacía el buffer al terminar; el índice de los pies confirma las
  // hojas reales. Un quinto producto o una hoja automática falla el recuento.
  assert.equal(rango.count, 0);
  const pies = doc.trazos.filter(t => /^\d+ \/ \d+$/.test(t.texto));
  assert.equal(pies.length, cantidades.length);
  assert.deepEqual(pies.map(t => t.texto), cantidades.map((_, i) => `${i + 1} / ${cantidades.length}`));
  const codigos = doc.trazos.filter(t => /^P-\d+ · Ref\./.test(t.texto));
  assert.deepEqual(cantidades.map((_, i) => codigos.filter(t => t.pagina === i).length), cantidades);
  const fichas = m.secciones.flatMap(s => s.productos.map(p => ({ s, p })));
  assert.deepEqual(codigos.map(t => t.texto.split(' · ')[0]), fichas.map(({ p }) => p.codigo));
  assert.equal(new Set(codigos.map(t => t.texto)).size, m.total);
  for (const [i, { s, p }] of fichas.entries()) {
    const nombre = doc.trazos.findIndex(t => t.texto === p.nombre), codigo = doc.trazos[nombre + 1];
    assert.ok(nombre >= 0);
    const cabecera = doc.trazos.slice(0, nombre).findLast(t => t.texto === s.titulo);
    const sub = doc.trazos.slice(0, nombre).findLast(t => t.texto === s.subcategoria);
    assert.equal(cabecera.pagina, codigo.pagina); assert.equal(sub.pagina, codigo.pagina);
    assert.equal(cabecera.x, codigo.x); assert.equal(sub.x, codigo.x);
    assert.ok(cabecera.y + cabecera.alto <= sub.y);
    assert.ok(sub.y + sub.alto < doc.trazos[nombre].y);
    assert.ok(doc.trazos[nombre].y + doc.trazos[nombre].alto <= codigo.y);
    assert.ok(codigo.y + codigo.alto <= doc.trazos[nombre + 2].y);
    const siguienteProducto = fichas[i + 2], siguienteCodigo = codigos[i + 2];
    const siguienteFila = siguienteCodigo?.pagina === codigo.pagina
      ? doc.trazos.slice(0, doc.trazos.findIndex(t => t.texto === siguienteProducto.p.nombre)).findLast(t => t.texto === siguienteProducto.s.titulo).y
      : 726;
    assert.ok(doc.trazos[nombre + 3].y + doc.trazos[nombre + 3].alto < siguienteFila);
  }
  return doc;
}

test('grupos impares y cambios de categoría llenan cuatro fichas, sin huecos entre grupos', async () => {
  const doc = await comprobar(modelo([1, 1, 3, 1, 3, 1]), [4, 4, 2]);
  const primera = doc.trazos.filter(t => /^P-\d+ · Ref\./.test(t.texto) && t.pagina === 0);
  assert.equal(primera[0].y, primera[1].y);
  assert.equal(primera[2].y, primera[3].y);
  assert.ok(primera[0].x < primera[1].x);
  assert.ok(primera[0].y < primera[2].y);
});

test('cuatro categorías distintas por página conservan títulos y textos largos completos', async () => {
  await comprobar(modelo([1, 1, 1, 1, 1, 1, 1, 1], true), [4, 4]);
});

test('la categoría repetida en otra hoja sigue identificando sus productos, con última hoja parcial', async () => {
  await comprobar(modelo([5]), [4, 1]);
});

test('cuatro productos ocupan una sola hoja y las secciones vacías no añaden separadores', async () => {
  await comprobar(modelo([0, 1, 0, 3, 0]), [4]);
});
