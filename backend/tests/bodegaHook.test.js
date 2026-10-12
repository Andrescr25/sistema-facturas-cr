const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Manejadores reales y promesas controladas: respuestas viejas y borradores. */
async function montar(api, guardado = {}) {
  const src = path.resolve(__dirname, '../../frontend/src');
  const utils = await import(pathToFileURL(path.join(src, 'utils/facturasBodegaUtils.js')));
  const fuentes = ['useFacturaBodegaAbierta', 'useFacturasBodega'].map(nombre =>
    fs.readFileSync(path.join(src, `hooks/${nombre}.js`), 'utf8')
      .replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '')
      .replace(`export function ${nombre}`, `function ${nombre}`)).join('\n');
  const estados = [], almacen = new Map(Object.entries(guardado));
  let indice = 0;
  const useState = inicial => {
    const i = indice++;
    if (!(i in estados)) estados[i] = typeof inicial === 'function' ? inicial() : inicial;
    return [estados[i], v => { estados[i] = typeof v === 'function' ? v(estados[i]) : v; }];
  };
  const useRef = inicial => {
    const i = indice++;
    if (!(i in estados)) estados[i] = { current: inicial };
    return estados[i];
  };
  const lectura = { vigente: true, esActual: () => true, confirmar() {} };
  const localStorage = { getItem: clave => almacen.get(clave) || null,
    setItem: (clave, valor) => almacen.set(clave, String(valor)), removeItem: clave => almacen.delete(clave) };
  const nombres = ['useState', 'useRef', 'useEffect', 'useCallback', 'useMemo', 'useContextoConsulta',
    'useFiltroCicloOperacion', 'bodegaPropiaService', 'alegraService', 'localStorage', ...Object.keys(utils)];
  const valores = [useState, useRef, () => {}, f => f, f => f(), () => lectura,
    () => ({ params: {} }), api, {}, localStorage, ...Object.values(utils)];
  const hook = new Function(...nombres, `${fuentes}\nreturn useFacturasBodega;`)(...valores);
  return { render: () => { indice = 0; return hook(); }, almacen };
}

const factura = id => ({ factura_id: id, cliente_nombre: `ZZ ${id}`, estado_bodega: 'pendiente',
  items: [{ producto_id: id, nombre: 'ZZ Producto', referencia: `ZZ-${id}`, cantidad: 2 }] });
const noVigente = () => Object.assign(new Error('Request failed with status code 409'),
  { response: { status: 409, data: { code: 'FACTURA_NO_VIGENTE', message: 'La factura está anulada: no se alista.' } } });
const lista = facturas => ({ success: true, data: { pendientes: facturas, listas: [] } });

test('abrir una pendiente cacheada anulada la quita de pantalla y caché, conservando su borrador', async () => {
  const f = factura(101), borrador = JSON.stringify({ 'REF-ZZ-101': { tipo: 'total', cantidadFaltante: 2 } });
  const { render, almacen } = await montar({ listar: async () => lista([f]), estados: async () => { throw noVigente(); } },
    { 'facturasBodegaPropia:draft:101': borrador });
  await render().actualizar();
  assert.equal(render().conteos.porPreparar, 1);
  await render().abrirFactura(f);
  assert.equal(render().facturaSeleccionada, null);
  assert.equal(render().conteos.porPreparar, 0);
  assert.deepEqual(JSON.parse(almacen.get('facturasBodegaPropia:data')).pendientes, []);
  assert.equal(almacen.get('facturasBodegaPropia:draft:101'), borrador);
  assert.equal(almacen.has('facturasBodegaPropia:selectedId'), false);
  assert.match(render().aviso, /anulada/);
});

test('una validación tardía de A no cierra B ni borra lo que se está preparando', async () => {
  const respuestas = new Map();
  const { render } = await montar({ estados: id => new Promise((resolve, reject) => respuestas.set(id, { resolve, reject })) });
  const a = render().abrirFactura(factura(101));
  render().cerrarFactura();
  const b = render().abrirFactura(factura(202));
  respuestas.get(202).resolve([]); await b;
  render().marcarModoFaltante('REF-ZZ-202', 'total', 2);
  respuestas.get(101).reject(noVigente()); await a;
  assert.equal(render().facturaSeleccionada.factura_id, 202);
  assert.equal(render().faltantesDraft['REF-ZZ-202'].tipo, 'total');
  assert.equal(render().aviso, null);
});

test('cerrar y reabrir la misma factura invalida también la primera respuesta', async () => {
  const respuestas = [];
  const { render } = await montar({ estados: () => new Promise((resolve, reject) => respuestas.push({ resolve, reject })) });
  const primera = render().abrirFactura(factura(101));
  render().cerrarFactura();
  const segunda = render().abrirFactura(factura(101));
  respuestas[1].resolve([]); await segunda;
  respuestas[0].reject(noVigente()); await primera;
  assert.equal(render().facturaSeleccionada.factura_id, 101);
  assert.equal(render().aviso, null);
});

test('validar una pendiente conserva lo marcado mientras espera; todavía no deja guardarla', async () => {
  let resolver, enviados = 0;
  const { render } = await montar({ estados: () => new Promise(r => { resolver = r; }),
    registrarFaltantes: async () => { enviados++; } });
  const abrir = render().abrirFactura(factura(101));
  render().marcarModoFaltante('REF-ZZ-101', 'total', 2);
  await render().handleRegistrarFaltantes();
  assert.equal(enviados, 0);
  resolver([{ productoId: 101, tipoFaltante: 'completo', cantidadFaltante: 0 }]); await abrir;
  assert.equal(render().faltantesDraft['REF-ZZ-101'].tipo, 'total');
  assert.equal(render().cargandoEstados, false);
});

test('anulada después de abrir: rechaza al guardar, vuelve a lista y no marca lista ni envía a impresión', async () => {
  let despachos = 0;
  const { render } = await montar({ listar: async () => lista([factura(101)]), estados: async () => [],
    registrarFaltantes: async () => { throw noVigente(); }, actualizarEstado: async () => { despachos++; } });
  await render().actualizar();
  await render().abrirFactura(factura(101));
  render().marcarModoFaltante('REF-ZZ-101', 'total', 2);
  await render().handleRegistrarFaltantes();
  assert.equal(despachos, 0);
  assert.equal(render().facturaSeleccionada, null);
  assert.equal(render().conteos.porPreparar, 0);
  assert.equal(render().clienteCompletado, null);
  assert.match(render().aviso, /anulada/);
});

test('un fallo de red conserva factura y borrador para reintentar', async () => {
  const { render } = await montar({ estados: async () => { throw new Error('ZZ sin red'); } });
  await render().abrirFactura(factura(101));
  render().marcarModoFaltante('REF-ZZ-101', 'total', 2);
  assert.equal(render().facturaSeleccionada.factura_id, 101);
  assert.equal(render().faltantesDraft['REF-ZZ-101'].tipo, 'total');
  assert.match(render().aviso, /conserva/);
});
