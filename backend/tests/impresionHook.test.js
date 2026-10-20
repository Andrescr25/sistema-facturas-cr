const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Manejadores reales del formulario con estado React simulado y API propia
// controlada: permite resolver las respuestas en orden inverso, sin red.
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
  const nombres = ['useState', 'useRef', 'useEffect', 'useDialog', 'colaImpresionService', ...Object.keys(utils)];
  const valores = [useState, useRef, () => {}, () => ({ confirm: async () => true }), api, ...Object.values(utils)];
  const hook = new Function(...nombres, `${fuente}\nreturn useImpresion;`)(...valores);
  return () => { indice = 0; return hook(); };
}

const turno = () => new Promise(resolve => setImmediate(resolve));
const factura = id => ({ factura_id: id });
const linea = id => ({ productoId: id, referencia: `ZZ-${id}`, nombre: `ZZ ${id}`, cantidad: 3, precio: 1200 });
const apiInmediata = { detalle: async id => ({ lineas: [linea(id)] }) };

test('la respuesta atrasada de otra factura propia no cambia la edición abierta', async () => {
  const respuestas = new Map();
  const render = await montar({ detalle: id => new Promise(resolve => respuestas.set(id, resolve)) });
  render().handleIniciarEdicion(factura(101));
  render().handleCancelarEdicion();
  assert.equal(render().cargandoItems, false);
  render().handleIniciarEdicion(factura(202));
  respuestas.get(202)({ lineas: [linea(202)] });
  await turno();
  respuestas.get(101)({ lineas: [linea(101)] });
  await turno();
  assert.equal(render().itemsEditados[0].productoId, 202);
  assert.equal(render().facturaEditando.factura_id, 202);
  assert.equal(render().cargandoItems, false);
});

test('cambiar de pestaña invalida también un error tardío', async () => {
  let rechazar;
  const render = await montar({ detalle: () => new Promise((resolve, reject) => { rechazar = reject; }) });
  render().handleIniciarEdicion(factura(101));
  render().setActiveTab('procesadas');
  rechazar(new Error('ZZ carga anterior'));
  await turno();
  assert.equal(render().error, null);
  assert.equal(render().cargandoItems, false);
  assert.equal(render().facturaEditando, null);
});

test('el precio del catálogo es automático; escribirlo a mano lo marca y elegir un producto lo restablece', async () => {
  const render = await montar(apiInmediata);
  render().handleIniciarEdicion(factura(101));
  await turno();
  assert.equal(render().itemsEditados[0].precioEditado, false);
  render().handleItemChange(0, 'price', '900');
  assert.equal(render().itemsEditados[0].price, 900);
  assert.equal(render().itemsEditados[0].precioEditado, true);
  render().handleAgregarItem();
  render().handleItemChange(1, 'price', '10');
  render().seleccionarProductoBusqueda(1, { productoId: 302, price: 1400 });
  assert.equal(render().itemsEditados[1].precioEditado, false);
  assert.equal(render().itemsEditados[1].price, 1400);
});

test('borrar el último producto mantiene la edición vacía y bloquea procesar', async () => {
  let enviados = 0;
  const render = await montar({ ...apiInmediata, procesar: async () => { enviados++; } });
  render().handleIniciarEdicion(factura(101));
  await turno();
  render().handleEliminarItem(0);
  assert.equal(render().modoEdicion, true);
  await render().handleGuardarFactura();
  assert.equal(enviados, 0);
  assert.match(render().error, /sin productos/);
});

test('guardar durante la carga no procesa la propuesta sin revisarla', async () => {
  let enviados = 0;
  let resolver;
  const render = await montar({
    detalle: () => new Promise(resolve => { resolver = resolve; }),
    procesar: async () => { enviados++; }
  });
  render().handleIniciarEdicion(factura(101));
  await render().handleGuardarFactura();
  assert.equal(enviados, 0);
  resolver({ lineas: [linea(101)] });
  await turno();
});

// «Imprimir y emitir» (2026-10-20): «que el proceso de rebajas y ajustes de
// precios en impresión se haga primero y después se emita».
const conCola = (extra) => ({ pendientes: async () => ({ data: {} }), procesadas: async () => ({ data: [] }), ...extra });
const conCorreo = { factura_id: 7, numero_factura: 'ZZ-7', categoria: 'sin_pendientes', cliente_email: 'zz@ejemplo.com' };

test('imprimir y emitir guarda los ajustes primero y recién entonces pasa la factura a emitir, sin abrir el PDF', async () => {
  const pasos = [];
  let terminar;
  const render = await montar(conCola({
    procesar: (id, opciones) => { pasos.push(['procesar', id, opciones]); return new Promise(r => { terminar = r; }); },
    abrirPdf: async () => { pasos.push(['pdf']); }
  }));
  const enCurso = render().handleProcesarSinCambios(conCorreo, 'emitir');
  await turno();
  assert.equal(render().porEmitir, null, 'nada se emite mientras los ajustes no están guardados');
  terminar({});
  await enCurso;
  assert.deepEqual(pasos, [['procesar', 7, { actualizarPrecios: false }]], 'el PDF se imprime después de emitir, no acá');
  assert.equal(render().porEmitir, conCorreo);
  render().cerrarEmision();
  assert.equal(render().porEmitir, null);
});

test('si guardar los ajustes falla, no se emite', async () => {
  const render = await montar(conCola({ procesar: async () => { throw new Error('ZZ la factura quedaría sin productos'); } }));
  await render().handleProcesarSinCambios({ ...conCorreo, categoria: 'requiere_cambios' }, 'emitir');
  assert.equal(render().porEmitir, null);
  assert.match(render().error, /ZZ la factura quedaría sin productos/);
});

test('desde la revisión, imprimir y emitir aplica la propuesta y cierra la revisión antes de emitir', async () => {
  const pedidos = [];
  const render = await montar(conCola({ procesar: async (id, opciones) => { pedidos.push([id, opciones]); } }));
  const f = { ...conCorreo, categoria: 'requiere_cambios' };
  render().abrirRevision(f);
  await render().handleGuardarFactura('emitir');
  assert.deepEqual(pedidos, [[7, {}]], 'sin líneas: el servidor aplica la propuesta (faltantes y precios)');
  assert.equal(render().facturaEditando, null);
  assert.equal(render().porEmitir, f);
});
