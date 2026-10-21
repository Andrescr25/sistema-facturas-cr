/** Ejercita el servicio real: perder el acuse no pierde líneas, cliente ni la clave. */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let copias;
before(async () => { copias = await import('../../frontend/src/utils/facturasLocales.js'); });
const fuente = fs.readFileSync(require('node:path').join(__dirname, '../../frontend/src/services/facturacionService.js'), 'utf8');
const pendiente = { localId: 4, clienteId: 7, claveIdempotencia: 'dispositivo-misma-clave',
  items: [{ productoId: 9, quantity: 2, price: 100 }] };
const fotografia = { id: 'local-4', localId: 4, esPropia: true,
  cliente: { id: 7, nombre: 'Cliente original' }, lineas: [{ productoId: 9, cantidad: 2 }],
  pendienteSincronizar: true, estado: 'borrador' };
function montar(respuesta, { fallaCache = false, fallaLectura = false } = {}) {
  const cola = structuredClone(pendiente), cache = new Map([['local-4', structuredClone(fotografia)]]);
  const envios = [], actos = [];
  const db = {
    getFacturasPendientes: async () => cola.sincronizada ? [] : [cola],
    getFacturaById: async id => { if (fallaLectura) throw new Error('IndexedDB no abre'); return cache.get(String(id)); },
    saveFacturasCache: async filas => {
      if (fallaCache) throw new Error('No se pudo guardar la copia');
      for (const f of filas) cache.set(String(f.id), copias.combinarCopiaFactura(cache.get(String(f.id)), f));
      actos.push('guardar');
    },
    markFacturaSincronizada: async () => { cola.sincronizada = true; actos.push('confirmar'); },
    deleteFacturaCache: async id => { cache.delete(String(id)); actos.push('retirar'); },
    markFacturaError: async (_id, mensaje) => { cola.errorSincronizacion = mensaje; }
  };
  const api = { post: async (ruta, cuerpo) => {
    envios.push({ ruta, cuerpo: structuredClone(cuerpo) });
    return { data: { success: true, data: respuesta } };
  } };
  const cuerpo = fuente.replace(/^import .*$/gm, '').replace(/^export default .*$/gm, '');
  const Clase = new Function('navigator', 'window', 'console', 'api', 'indexedDBService',
    'facturaEscrita', 'facturaConsultada', 'combinarCopiaFactura', `${cuerpo}\nreturn FacturacionService;`)(
    { onLine: true }, { addEventListener() {} }, { log() {}, warn() {}, error() {} }, api, db,
    copias.facturaEscrita, copias.facturaConsultada, copias.combinarCopiaFactura);
  return { servicio: new Clase(), cola, cache, envios, actos };
}
for (const camino of ['sincronizarFacturasPendientes', 'reintentarFacturaPendiente', 'enviarFacturaPendiente']) {
  test(`${camino}: el acuse cambia el id y conserva fotografía sin modificar cuerpo o clave`, async () => {
    const m = montar({ id: 90, numero: 'PROPIA-90', yaExistia: true });
    const original = structuredClone(m.cola);
    if (camino === 'enviarFacturaPendiente') await m.servicio[camino](4, original, fotografia);
    else await m.servicio[camino](4);
    assert.deepEqual(m.envios[0], { ruta: '/facturacion/facturas', cuerpo: original });
    assert.equal(m.cache.has('local-4'), false);
    const definitiva = m.cache.get('90');
    assert.deepEqual(definitiva.lineas, fotografia.lineas); assert.deepEqual(definitiva.cliente, fotografia.cliente);
    assert.equal(definitiva.pendienteSincronizar, false); assert.equal(m.cola.sincronizada, true);
    assert.equal(definitiva.estado, 'emitida');
    assert.deepEqual(m.actos, ['guardar', 'confirmar', 'retirar']);
  });
}
test('una respuesta sin id propio no borra la cola antigua ni su fotografía', async () => {
  const m = montar({ id: null, yaExistia: true, mensaje: 'Documento anterior todavía no copiado.' });
  await assert.rejects(m.servicio.reintentarFacturaPendiente(4), /todavía no copiado/);
  assert.equal(m.cola.sincronizada, undefined); assert.deepEqual(m.cache.get('local-4'), fotografia);
  assert.equal(m.cache.size, 1); assert.deepEqual(m.actos, []);
});
test('fallar al guardar el acuse mantiene la cola y copia para reintentar con la misma clave', async () => {
  const m = montar({ id: 90, yaExistia: true }, { fallaCache: true });
  const r = await m.servicio.sincronizarFacturasPendientes();
  assert.equal(r.fallidas, 1); assert.equal(m.cola.sincronizada, undefined);
  assert.equal(m.cola.claveIdempotencia, pendiente.claveIdempotencia);
  assert.deepEqual(m.cache.get('local-4'), fotografia); assert.deepEqual(m.actos, []);
});
test('una venta online confirmada sigue disponible aunque no abra su cache opcional', async () => {
  const fila = { id: 91, numero: 'PROPIA-91',
    cliente_id: 7, cliente_nombre: 'Cliente original', lineas: [{ producto_id: 9, cantidad: 2 }] };
  const m = montar(fila, { fallaLectura: true });
  const confirmada = await m.servicio.copiaFacturaConfirmada(fila);
  assert.equal(confirmada.id, '91'); assert.equal(confirmada.lineas[0].cantidad, 2);
});
test('un acuse conserva la copia definitiva más reciente antes que el borrador local', async () => {
  const m = montar({ id: 90, numero: 'PROPIA-90', yaExistia: true });
  m.cache.set('90', { ...fotografia, id: '90', estado: 'anulada', lineas: [{ productoId: 9, cantidad: 5 }] });
  await m.servicio.reintentarFacturaPendiente(4);
  assert.equal(m.cache.get('90').estado, 'anulada'); assert.equal(m.cache.get('90').lineas[0].cantidad, 5);
});
test('una pendiente toma el cliente de su copia; sin copia, el del maestro', async () => {
  const { enriquecerFacturasPendientes } = await import('../../frontend/src/utils/facturacionUtils.js');
  const original = structuredClone(pendiente);
  const clienteNuevo = { id: 7, name: 'Nombre nuevo' };
  assert.equal(enriquecerFacturasPendientes([pendiente], [fotografia], [clienteNuevo])[0].clienteNombre, 'Cliente original');
  assert.equal(enriquecerFacturasPendientes([pendiente], [], [clienteNuevo])[0].clienteNombre, 'Nombre nuevo');
  assert.deepEqual(pendiente, original);
});
