const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * Regla del negocio: un mapeo proveedor→producto lo asigna una PERSONA la
 * primera vez. A partir de ahí el sistema lo reusa solo, porque ya no hay
 * nada que decidir.
 *
 * Antes, un parecido de texto del 80% bastaba para crear el mapeo y darlo
 * por bueno para siempre. Sobre nombres de ferretería eso es una moneda al
 * aire, y el error quedaba grabado: la siguiente factura lo reusaba sin
 * volver a mirarlo y el costo del producto equivocado terminaba moviendo su
 * precio de venta.
 *
 * Estas pruebas leen el código fuente a propósito. No comprueban un cálculo
 * sino que una decisión de negocio no se reintroduzca sin que nadie lo note.
 */

const raiz = path.join(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

test('el importador de correo NO crea mapeos por parecido de texto', () => {
  const src = leer('services/emailService.js');

  // La creación automática vivía en este bloque exacto.
  assert.ok(!/similarityScore\s*>=\s*80/.test(src),
    'volvió el umbral de parecido que creaba mapeos solo');
  assert.ok(!/createProductMapping\(mapeoData\)/.test(src),
    'volvió la creación automática de mapeos en el importador');
  assert.ok(!/confidence:\s*mejorMatch\.similarityScore/.test(src),
    'volvió a guardarse el parecido como si fuera confianza');
});

test('ningún módulo elige mapeos ordenando por confianza', () => {
  // Ordenar por confidence hacía que un valor inventado (999.99) le ganara a
  // los mapeos reales, que tenían 100.
  for (const archivo of [
    'services/proveedorAsignacionService.js',
    'src/modules/orders-whatsapp/orders-whatsapp.service.js'
  ]) {
    const src = leer(archivo);
    const lineas = src.split('\n').filter(l =>
      /ORDER BY\s+confidence/i.test(l) && !l.trim().startsWith('--'));
    assert.deepStrictEqual(lineas, [], `${archivo} volvió a ordenar por confianza`);
  }
});

test('la selección de proveedor no desempata por confianza', () => {
  const src = leer('services/proveedorAsignacionService.js');
  assert.ok(!/b\.confidence\s*-\s*a\.confidence/.test(src),
    'volvió el desempate por confianza en la asignación de proveedor');
});
