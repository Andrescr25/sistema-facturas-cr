const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const codigo = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/telefonosProveedor.js'), 'utf8').replace(/^export /gm, '');
const { revisarTelefonoProveedor, filasTelefonosProveedor, revisarTelefonosProveedor } = new Function(codigo + '\nreturn {revisarTelefonoProveedor,filasTelefonosProveedor,revisarTelefonosProveedor}')();

test('teléfono de proveedor: acepta formato CR y devuelve el destino exacto sin adivinar', () => {
  for (const valor of ['88888888', '8888 8888', '(8888)-8888', '+506 8888 8888', '50688888888', '8888.8888']) {
    assert.deepEqual(revisarTelefonoProveedor(valor), { numero: '50688888888', nacional: '88888888', formateado: '8888 8888' });
  }
  assert.equal(revisarTelefonoProveedor('2222 3333').numero, '50622223333');
  assert.equal(revisarTelefonoProveedor('9999 9999').numero, '50699999999');
  for (const invalido of ['', '8888888', '888888888', '+50788888888', '88888888 87777777', '8888 8888 José', '8888\n8888']) {
    assert.ok(revisarTelefonoProveedor(invalido).error, invalido);
  }
});

test('las filas vacías no crean contactos y cada teléfono mantiene su separación al guardar', () => {
  const filas = filasTelefonosProveedor('8888 8888\r\n\n+50687777777');
  assert.deepEqual(filas, ['8888 8888', '+50687777777']);
  assert.deepEqual(revisarTelefonosProveedor(['8888 8888', '', '+50687777777']), { valor: '8888 8888\n8777 7777', errores: ['', '', ''], error: '' });
  assert.equal(revisarTelefonosProveedor(['', ' ']).valor, null);
});

test('no permite guardar teléfonos duplicados ni una anotación como si fuera otro contacto', () => {
  const repetidos = revisarTelefonosProveedor(['8888 8888', '+50688888888']);
  assert.equal(repetidos.error, 'Este número ya está registrado.');
  assert.equal(repetidos.errores[1], repetidos.error);
  assert.match(revisarTelefonosProveedor(['88888888 / 87777777']).error, /solo número/);
  assert.match(revisarTelefonosProveedor(['88888888', 'CONTACTO']).error, /anotaciones/);
});

test('la ficha admite hasta diez números y rechaza superar el límite', () => {
  const diez = Array.from({ length: 10 }, (_, i) => `8888000${i}`);
  assert.equal(revisarTelefonosProveedor(diez).error, '');
  assert.match(revisarTelefonosProveedor([...diez, '87778888']).error, /hasta 10/);
});
