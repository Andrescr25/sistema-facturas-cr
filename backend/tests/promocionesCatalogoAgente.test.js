const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fuente = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/promocionesCatalogoAgente.js'), 'utf8');
const { conPromocionesDelCatalogo } = new Function(`${fuente.replace(/^export /gm, '')}\nreturn { conPromocionesDelCatalogo };`)();

const producto = (id, name) => ({ id: String(id), name, price: [{ price: 1000 }], tax: [{ percentage: 13 }], subcategoria: { nombre: 'Herramientas' } });

test('la oferta en la ficha normal conserva el precio base, familia y orden', () => {
  const productos = [producto(2, 'Martillo'), producto(1, 'Alicate')];
  const antes = JSON.stringify(productos);
  const [normal, oferta] = conPromocionesDelCatalogo(productos, [{ id: 1, precioAntes: 1500, bajaPorcentaje: 25 }]);
  assert.equal(normal, productos[0], 'ficha normal conserva identidad para memo');
  assert.equal(oferta.id, '1');
  assert.equal(oferta.price[0].price, 1000, 'precio ya rebajado no se vuelve a descontar');
  assert.equal(oferta.precioAntes, 1500);
  assert.equal(oferta.subcategoria, productos[1].subcategoria);
  assert.equal(oferta.descuentoPorcentaje, undefined, 'baja no se convierte en liquidación');
  assert.equal(JSON.stringify(productos), antes, 'caché cruda intacta');
});

test('oferta y liquidación superpuestas conservan un producto y un solo descuento adicional', () => {
  const productos = [producto(1, 'Alicate')];
  const r = conPromocionesDelCatalogo(productos, [{ id: '1', precioAntes: 1500, bajaPorcentaje: 25 }], [{ id: 1, descuentoPorcentaje: 20 }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].precioAntes, 1500);
  assert.equal(r[0].descuentoPorcentaje, 20);
  assert.equal(r[0].price[0].price, 1000, 'la tarjeta aplica solo la liquidación sobre el base');
});

test('una promoción retirada deja de decorar al volver a calcular con la caché original', () => {
  const p = producto(1, 'Alicate');
  assert.equal(conPromocionesDelCatalogo([p], [{ id: '1', precioAntes: 1500 }])[0].precioAntes, 1500);
  assert.equal(conPromocionesDelCatalogo([p])[0], p);
  assert.equal(p.precioAntes, undefined);
});

test('no introduce fichas ajenas al catálogo ni duplica por repetir metadatos', () => {
  const p = producto(1, 'Alicate');
  const r = conPromocionesDelCatalogo([p], [{ id: '2', precioAntes: 1500 }, { id: '2', precioAntes: 1400 }]);
  assert.deepEqual(r, [p]);
});
