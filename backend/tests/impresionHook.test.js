const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Ejecuta los manejadores reales con estado React simulado; las llamadas a
// Alegra están controladas por cada prueba, sin navegador ni red externa.
async function montar(api) {
  const src = path.resolve(__dirname, '../../frontend/src');
  const utils = await import(pathToFileURL(path.join(src, 'utils/impresionUtils.js')));
  const fuente = fs.readFileSync(path.join(src, 'hooks/useImpresion.js'), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '')
    .replace('export function useImpresion', 'function useImpresion');
  const estados = [];
  let indice = 0;
  const useState = valor => {
    const i = indice++;
    if (!(i in estados)) estados[i] = valor;
    return [estados[i], nuevo => { estados[i] = typeof nuevo === 'function' ? nuevo(estados[i]) : nuevo; }];
  };
  const useRef = valor => {
    const i = indice++;
    if (!(i in estados)) estados[i] = { current: valor };
    return estados[i];
  };
  const nombres = ['useState', 'useRef', 'useEffect', 'useDialog', 'alegraService', ...Object.keys(utils)];
  const valores = [useState, useRef, () => {}, () => ({ confirm: async () => true }), api, ...Object.values(utils)];
  const hook = new Function(...nombres, `${fuente}\nreturn useImpresion;`)(...valores);
  return () => { indice = 0; return hook(); };
}

const turno = () => new Promise(resolve => setImmediate(resolve));
const factura = id => ({ alegra_id: id, ajustes_realizados: [] });
const linea = id => ({ id, reference: `ZZ-${id}`, description: `ZZ ${id}`, quantity: 2, price: 100, tax: [] });
const apiInmediata = {
  getInvoiceById: async id => ({ success: true, data: { items: [linea(id)] } }),
  getProductoInfoAlegra: async id => ({ success: true, producto: { id, reference: `ZZ-${id}`, price: 130 } })
};

test('una respuesta atrasada de otra factura no pisa los productos de la que está abierta', async () => {
  const respuestas = new Map();
  const render = await montar({ ...apiInmediata, getInvoiceById: id => new Promise(resolve => respuestas.set(id, resolve)) });
  render().handleIniciarEdicion(factura(101));
  render().handleCancelarEdicion();
  assert.equal(render().cargandoItems, false);
  render().handleIniciarEdicion(factura(202));
  respuestas.get(202)({ success: true, data: { items: [linea(202)] } });
  await turno();
  assert.equal(render().itemsEditados[0].id, 202);
  respuestas.get(101)({ success: true, data: { items: [linea(101)] } });
  await turno();
  assert.equal(render().itemsEditados[0].id, 202);
  assert.equal(render().facturaEditando.alegra_id, 202);
  assert.equal(render().cargandoItems, false);
});

test('el precio mostrado del catálogo no se confunde con uno escrito a mano', async () => {
  const render = await montar(apiInmediata);
  render().handleIniciarEdicion(factura(101));
  await turno();
  assert.equal(render().itemsEditados[0].price, 130);
  assert.equal(render().itemsEditados[0].precio_editado, false);
  render().handleItemChange(0, 'price', '90');
  assert.equal(render().itemsEditados[0].price, 90);
  assert.equal(render().itemsEditados[0].precio_editado, true);
});

test('borrar el último producto mantiene la edición vacía y bloquea guardar', async () => {
  let enviados = 0;
  const render = await montar({ ...apiInmediata, procesarFacturaIndividual: async () => { enviados++; } });
  render().handleIniciarEdicion(factura(101));
  await turno();
  render().handleEliminarItem(0);
  assert.equal(render().modoEdicion, true);
  await render().handleGuardarFactura();
  assert.equal(enviados, 0);
  assert.match(render().error, /al menos un producto/);
});

test('restaurar una cantidad positiva quita la marca de eliminación', async () => {
  const render = await montar(apiInmediata);
  render().handleIniciarEdicion(factura(101));
  await turno();
  render().handleItemChange(0, 'quantity', '0');
  assert.equal(render().itemsEditados[0].eliminar_por_faltante, true);
  render().handleItemChange(0, 'quantity', '2');
  assert.equal(render().itemsEditados[0].eliminar_por_faltante, false);
});
