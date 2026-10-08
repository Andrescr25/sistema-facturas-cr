const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { prepararAjustes, cantidadFinal } = require('../src/modules/invoices/ajustesImpresion');
const utilidades = import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/impresionUtils.js')));

const items = [
  { id: 101, reference: { code: 'ZZ-A' }, description: 'ZZ primero', quantity: 10, price: 100, discount: 10, tax: [{ id: 7, percentage: 1 }] },
  { id: 202, reference: 'ZZ-B', description: 'ZZ segundo', quantity: 4, price: 200, tax: [{ id: 9, percentage: 13 }] }
];
const ajuste = (datos = {}) => ({ producto_codigo: 'ZZ-A', cantidad_faltante: 3, cantidad_entregada: 0, estado: 'no_llego', requiere_actualizacion: true, ...datos });

describe('el pedido de Reporte Clientes llega a la edición', () => {
  test('se busca por referencia aunque Alegra tenga un id distinto', async () => {
    const { normalizarItemsFactura } = await utilidades;
    const editados = normalizarItemsFactura(items, { ajustes_realizados: [ajuste()] });
    assert.equal(editados[0].quantity, 7);
    assert.equal(editados[1].quantity, 4);
  });

  test('no llegó lo faltante, pero se conserva lo que estaba en bodega', async () => {
    const { normalizarItemsFactura, construirPayloadItems, validarItemsParaGuardar } = await utilidades;
    const editados = normalizarItemsFactura(items, { ajustes_realizados: [ajuste()] });
    assert.equal(editados[0].eliminar_por_faltante, false);
    assert.equal(validarItemsParaGuardar(construirPayloadItems(editados), editados), null);
  });

  test('entrega parcial y completa dan la misma cantidad en edición y en automático', async () => {
    const { normalizarItemsFactura } = await utilidades;
    for (const [estado, cantidad_entregada, cantidad] of [['parcial', 1, 8], ['completo', 3, 10], ['no_llego', 0, 7]]) {
      const ajustes = prepararAjustes(items, [ajuste({ estado, cantidad_entregada })]);
      assert.equal(cantidadFinal(ajustes[0]), cantidad);
      assert.equal(normalizarItemsFactura(items, { ajustes_realizados: ajustes })[0].quantity, cantidad);
    }
  });

  test('un producto que faltó todo se elimina; recuperar puede volver a incluirlo', async () => {
    const { normalizarItemsFactura } = await utilidades;
    const originales = prepararAjustes(items, [ajuste({ cantidad_faltante: 10 })]);
    const sinPrimero = [items[1]];
    let editados = normalizarItemsFactura(sinPrimero, { ajustes_realizados: originales });
    assert.equal(editados[1].quantity, 0);
    assert.equal(editados[1].eliminar_por_faltante, true);
    const recibidos = prepararAjustes(sinPrimero, [ajuste({ cantidad_faltante: 10, cantidad_entregada: 10, estado: 'completo' })], originales);
    editados = normalizarItemsFactura(sinPrimero, { ajustes_realizados: recibidos });
    assert.equal(editados[1].quantity, 10);
  });

  test('recuperar o reintentar no rebaja otra vez', async () => {
    const { normalizarItemsFactura } = await utilidades;
    const originales = prepararAjustes(items, [ajuste()]);
    const yaRebajados = [{ ...items[0], quantity: 7 }, items[1]];
    const repetidos = prepararAjustes(yaRebajados, [ajuste()], originales);
    assert.equal(cantidadFinal(repetidos[0]), 7);
    assert.equal(normalizarItemsFactura(yaRebajados, { ajustes_realizados: repetidos })[0].quantity, 7);
  });

  test('impuestos por línea y descuentos se conservan en el payload y en el total', async () => {
    const { normalizarItemsFactura, construirPayloadItems, totalItemsImpresion } = await utilidades;
    const editados = normalizarItemsFactura(items, { ajustes_realizados: [ajuste()] });
    const payload = construirPayloadItems(editados);
    assert.equal(payload[0].discount, 10);
    assert.deepEqual(payload[0].tax, items[0].tax);
    assert.equal(payload[0].precio_editado, false);
    assert.ok(Math.abs(totalItemsImpresion(editados) - (7 * 100 * .9 * 1.01 + 4 * 200 * 1.13)) < 1e-8);
  });

  test('no permite guardar una factura sin productos ni con precio negativo', async () => {
    const { validarItemsParaGuardar } = await utilidades;
    assert.match(validarItemsParaGuardar([], []), /al menos un producto/);
    assert.match(validarItemsParaGuardar([{ reference: 'ZZ', quantity: 1, price: -1 }], [{}]), /precios/);
  });

  test('el total usa la tarifa de cada producto, incluidas las tarifas reducidas y la exenta', async () => {
    const { totalItemsImpresion } = await utilidades;
    for (const percentage of [0, 1, 2, 4, 8, 13]) {
      assert.equal(totalItemsImpresion([{ quantity: 2, price: 1000, discount: 10, tax: [{ percentage }] }]), 1800 * (1 + percentage / 100));
    }
  });
});

describe('los ajustes se aplican al producto identificado', () => {
  test('el id de Alegra identifica referencias ausentes o antiguas', () => {
    const preparados = prepararAjustes([{ ...items[0], reference: null }], [ajuste({ producto_alegra_id: 101 })]);
    assert.equal(cantidadFinal(preparados[0]), 7);
  });

  test('sin referencia, usa el mapeo local por id', () => {
    const preparados = prepararAjustes([{ ...items[0], reference: null }], [ajuste()], [], new Map([['101', 'ZZ-A']]));
    assert.equal(cantidadFinal(preparados[0]), 7);
  });

  test('un nombre igual no modifica otro código', () => {
    assert.throws(() => prepararAjustes(items, [ajuste({ producto_codigo: 'ZZ-OTRO', producto_nombre: items[0].description })]), /No se encontró/);
  });

  test('un producto repetido se revisa antes de rebajarlo dos veces', () => {
    assert.throws(() => prepararAjustes([items[0], items[0]], [ajuste()]), /varias líneas/);
  });

  test('rechaza faltantes mayores al pedido y entregas mayores al faltante', () => {
    for (const datos of [{ cantidad_faltante: 11 }, { cantidad_entregada: 4 }, { estado: 'pendiente' }]) {
      const preparados = prepararAjustes(items, [ajuste(datos)]);
      assert.throws(() => cantidadFinal(preparados[0]), /inválidos/);
    }
  });
});
