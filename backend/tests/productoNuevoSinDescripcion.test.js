/**
 * Un producto nuevo de Revisión de Precios llega a Alegra con la descripción
 * EN BLANCO (pedido del usuario, 2026-09-30: "necesito que se envíe en blanco
 * y se mantenga así").
 *
 * LO QUE PASABA. El modal ya no tiene el campo y el servicio de revisión
 * manda `description: ''`, pero la capa que habla con Alegra hacía
 * `data.description || data.name`: el texto vacío es falso en JavaScript y se
 * volvía el nombre. Los últimos productos creados (2170 a 2175) quedaron con
 * la descripción igual al nombre.
 *
 * Todo con un doble del cliente de Alegra: no se crea nada de verdad.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AlegraProductService = require('../src/integrations/alegra/services/alegra-product.service');

async function crear(datos) {
  const enviados = [];
  const doble = { client: { api: { post: async (ruta, cuerpo) => { enviados.push({ ruta, cuerpo }); return { data: { id: 9999 } }; } } } };
  await AlegraProductService.prototype.createProduct.call(doble, datos);
  return enviados[0].cuerpo;
}

const BASE = { name: 'FUSIBLE SET 5 PZAS 15 AMPERIOS TW', price: 1000, cost: 700, type: 'product', unit: 'unit' };

test('sin descripción, a Alegra va vacía y NO el nombre', async () => {
  assert.equal((await crear({ ...BASE, description: '' })).description, '');
  assert.equal((await crear({ ...BASE })).description, '', 'tampoco si el campo ni viene');
});

test('si alguien sí escribe una descripción, se respeta', async () => {
  assert.equal((await crear({ ...BASE, description: 'Caja de 5' })).description, 'Caja de 5');
});

test('al crear un producto desde una línea del proveedor tampoco se rellena con el nombre', () => {
  // Desde el 2026-10-04 ese producto nace en el maestro propio
  // (productoDesdeLinea.js), no en Alegra: sin descripción queda sin
  // descripción. Que se guarde así de verdad está probado contra PostgreSQL
  // en productoDesdeLinea.test.js.
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'productoDesdeLinea.js'), 'utf8');
  assert.match(fuente, /descripcion: limpio\(datos\.descripcion\) \|\| null,/);
  assert.doesNotMatch(fuente, /descripcion: [^\n]*nombre/);
});
