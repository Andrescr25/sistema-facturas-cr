/**
 * Impresión sobre la factura PROPIA (sección 11 del checklist, paso 3):
 * lo que se le rebaja a la factura, la propuesta de líneas y lo que muestra
 * la pantalla. Funciones puras; el recorrido contra la base está en
 * faltantesIdsPropios.test.js.
 *
 * LO QUE SE CUIDA
 *  - Un faltante se rebaja UNA vez: procesar aplica la diferencia contra lo
 *    ya rebajado (`cantidad_rebajada`). Antes se calculaba sobre la cantidad
 *    de hoy y una factura recuperada y vuelta a procesar se rebajaba dos veces.
 *  - Si después llegó más, se le devuelve a la línea (o vuelve la línea).
 *  - El precio del catálogo se pone solo si se pidió, y nunca un 0.
 *  - El total que ve la pantalla es el mismo que calcula el servidor: con la
 *    tarifa de CADA línea y su descuento (antes se comparaba sin impuesto
 *    contra el original con impuesto).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const p = require('../src/modules/reprinting/procesarImpresion');
const { armarLineas } = require('../src/modules/facturacion/facturaPropia.service');

const linea = (productoId, cantidad, extra = {}) => ({
  producto_id: productoId, nombre: `P${productoId}`, referencia: `R${productoId}`, descripcion: null,
  cantidad: String(cantidad), precio_unitario: '1000.00', descuento_porcentaje: '0', tarifa: '13', precio_catalogo: '1200.00', ...extra
});
const faltante = (productoId, cantidad, estado, extra = {}) => ({
  id: productoId * 10, producto_id: productoId, cantidad_faltante: cantidad, cantidad_rebajada: '0',
  estado, cantidad_entregada: 0, nombre: `P${productoId}`, referencia: `R${productoId}`, precio_catalogo: '1200.00', tarifa: '13', ...extra
});

describe('cuánto se rebaja por un faltante', () => {
  test('según lo que llegó', () => {
    assert.equal(p.rebajaObjetivo({ cantidad_faltante: 3, estado: 'completo' }), 0);
    assert.equal(p.rebajaObjetivo({ cantidad_faltante: 3, estado: 'parcial', cantidad_entregada: 1 }), 2);
    assert.equal(p.rebajaObjetivo({ cantidad_faltante: 3, estado: 'no_llego' }), 3);
    assert.equal(p.rebajaObjetivo({ cantidad_faltante: 3, estado: null }), 3, 'sin respuesta: nada confirma que se entregó');
  });
});

describe('la propuesta de líneas', () => {
  test('rebaja lo que no llegó y pone el precio del catálogo', () => {
    const [l] = p.proponerLineas([linea(1, 10)], [faltante(1, 3, 'no_llego')], { actualizarPrecios: true });
    assert.equal(l.cantidad, 7);
    assert.equal(l.cantidadOriginal, 10);
    assert.equal(l.rebaja, 3);
    assert.equal(l.precio, 1200);
  });

  test('sin actualizar precios, queda el de la factura; y un catálogo en 0 nunca se pone', () => {
    assert.equal(p.proponerLineas([linea(1, 10)], [], { actualizarPrecios: false })[0].precio, 1000);
    assert.equal(p.proponerLineas([linea(1, 10, { precio_catalogo: '0' })], [], { actualizarPrecios: true })[0].precio, 1000);
  });

  test('lo ya rebajado NO se vuelve a rebajar (recuperada y vuelta a procesar)', () => {
    const [l] = p.proponerLineas([linea(1, 7)], [faltante(1, 3, 'no_llego', { cantidad_rebajada: '3' })], { actualizarPrecios: false });
    assert.equal(l.cantidad, 7);
    assert.equal(l.rebaja, 0);
  });

  test('si después llegó todo, se le devuelve a la línea lo que se le había quitado', () => {
    const [l] = p.proponerLineas([linea(1, 7)], [faltante(1, 3, 'completo', { cantidad_rebajada: '3' })], { actualizarPrecios: false });
    assert.equal(l.cantidad, 10);
    assert.equal(l.rebaja, -3);
  });

  test('si la línea ya se había quitado, vuelve con el precio del catálogo', () => {
    const lineas = p.proponerLineas([linea(2, 5)], [faltante(1, 4, 'parcial', { cantidad_entregada: 4, cantidad_rebajada: '4' })], { actualizarPrecios: false });
    const vuelta = lineas.find((l) => l.productoId === 1);
    assert.equal(vuelta.cantidad, 4);
    assert.equal(vuelta.precio, 1200);
    assert.equal(vuelta.agregada, true);
    assert.equal(vuelta.rebaja, -4);
  });

  test('un producto en dos líneas: la rebaja sigue en la segunda', () => {
    const lineas = p.proponerLineas([linea(1, 2), linea(1, 5)], [faltante(1, 4, 'no_llego')], { actualizarPrecios: false });
    assert.deepEqual(lineas.map((l) => l.cantidad), [0, 3]);
  });

  test('conserva el descuento y la nota de la línea', () => {
    const [l] = p.proponerLineas([linea(1, 10, { descuento_porcentaje: '5', descripcion: 'AZUL' })], [], { actualizarPrecios: true });
    assert.equal(l.descuento, 5);
    assert.equal(l.nota, 'AZUL');
  });
});

describe('cuándo se edita la factura', () => {
  const actuales = [linea(1, 10, { descripcion: 'AZUL' })];
  const igual = { productoId: 1, cantidad: 10, precio: 1000, descuento: 0, nota: 'AZUL' };

  test('si nada cambió, no se toca', () => {
    assert.equal(p.cambiaron(actuales, [igual]), false);
  });

  test('una cantidad, un precio, la nota o una línea de más es un cambio', () => {
    assert.equal(p.cambiaron(actuales, [{ ...igual, cantidad: 9 }]), true);
    assert.equal(p.cambiaron(actuales, [{ ...igual, precio: 1200 }]), true);
    assert.equal(p.cambiaron(actuales, [{ ...igual, nota: null }]), true);
    assert.equal(p.cambiaron(actuales, [igual, { ...igual, productoId: 2 }]), true);
  });
});

describe('las líneas que manda la pantalla', () => {
  test('cada una tiene que ser de un producto del catálogo, con cantidad y precio válidos', () => {
    assert.throws(() => p.lineasDePantalla([{ productoId: null, cantidad: 1, precio: 1 }]), (e) => e.status === 400 && /producto del catálogo/.test(e.message));
    assert.throws(() => p.lineasDePantalla([{ productoId: 1, cantidad: -1, precio: 1 }]), (e) => e.status === 400);
    assert.throws(() => p.lineasDePantalla([{ productoId: 1, cantidad: 1, precio: 'x' }]), (e) => e.status === 400);
    assert.throws(() => p.lineasDePantalla(null), (e) => e.status === 400);
  });

  test('las de cantidad 0 se quitan', () => {
    const r = p.lineasDePantalla([{ productoId: 1, cantidad: 0, precio: 5 }, { productoId: 2, cantidad: '2', precio: '5', nota: 'X' }]);
    assert.deepEqual(r, [{ productoId: 2, cantidad: 2, precio: 5, descuento: 0, nota: 'X' }]);
  });
});

describe('lo que muestra y manda la pantalla', () => {
  let u;
  const cargar = async () => { u = u || await import('../../frontend/src/utils/impresionUtils.js'); return u; };

  test('una línea propuesta en la forma del formulario, con su nota aparte', async () => {
    const { aItemDeEdicion } = await cargar();
    const item = aItemDeEdicion({ productoId: 1, nombre: 'FOLDER', referencia: '790', nota: 'CTE', cantidad: 0, cantidadOriginal: 80, precio: 15, descuento: 0, tarifa: 13, rebaja: 80 });
    assert.equal(item.description, 'FOLDER', 'el título es el nombre');
    assert.equal(item.nota, 'CTE', 'la nota no se pierde');
    assert.equal(item.eliminar_por_faltante, true);
    assert.equal(item.cantidad_faltante, 80);
  });

  test('se manda por el id propio de cada producto', async () => {
    const { lineasParaProcesar } = await cargar();
    assert.deepEqual(lineasParaProcesar([{ productoId: 1, quantity: '2', price: '15', descuento: 0, nota: 'CTE', description: 'FOLDER' }]),
      [{ productoId: 1, cantidad: 2, precio: 15, descuento: 0, nota: 'CTE' }]);
  });

  test('no deja guardar un producto nuevo sin elegirlo, ni una factura vacía', async () => {
    const { validarItemsParaProcesar } = await cargar();
    assert.match(validarItemsParaProcesar([{ productoId: null, quantity: 1 }]), /buscador/);
    assert.match(validarItemsParaProcesar([{ productoId: 1, quantity: 0 }]), /mayores a cero/);
    assert.match(validarItemsParaProcesar([{ productoId: 1, quantity: 0, eliminar_por_faltante: true }]), /sin productos/);
    assert.equal(validarItemsParaProcesar([{ productoId: 1, quantity: 0, eliminar_por_faltante: true }, { productoId: 2, quantity: 1 }]), null);
  });

  test('el total nuevo es el mismo que calcula el servidor, con la tarifa de cada línea', async () => {
    const { totalDeItems } = await cargar();
    const items = [
      { productoId: 1, quantity: 3, price: 1234.56, descuento: 5, tarifa: 13 },
      { productoId: 2, quantity: 7, price: 333.33, descuento: 0, tarifa: 1 },
      { productoId: 3, quantity: 1, price: 999, descuento: 0, tarifa: 0 }
    ];
    const productos = new Map(items.map((i) => [String(i.productoId), { id: i.productoId, nombre: `P${i.productoId}`, activo: true, tarifa: i.tarifa }]));
    const servidor = armarLineas(items.map((i) => ({ productoId: i.productoId, quantity: i.quantity, price: i.price, discount: i.descuento })), productos, (i) => i.productoId);
    assert.equal(totalDeItems(items), servidor.total);
  });
});
