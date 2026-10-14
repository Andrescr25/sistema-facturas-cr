const { test } = require('node:test');
const assert = require('node:assert/strict');
const { montar, proveedor, producto } = require('./dobles/envioProveedorGancho');
const destino = { telefono: '50688888888', mensaje: 'Buenas tardes.\nAdjuntamos la orden OC-25.\nGracias.' };
const preparado = { data: { success: true, data: { orden: { id: 25 }, destino, envioEstado: 'preparado' } } };
const confirmado = { data: { success: true, data: { orden: { id: 25 }, envioEstado: 'confirmado' } } };

test('abrir revisa el número/mensaje exactos del servidor sin enviar ni guardar una llave activa; cancelar no transporta', async () => {
  const llamadas = [], m = montar({ post: async (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); return preparado; } });
  await m.render().enviar();
  assert.equal(llamadas.length, 1); assert.equal(llamadas[0].ruta, '/orden-compra/proveedor/revisar-envio');
  assert.deepEqual(m.render().modal.destino, destino); assert.equal(m.almacen.size, 0);
  m.render().cerrarModal(); assert.equal(m.render().modal, null); assert.equal(m.almacen.size, 0);
  await m.render().confirmarEnvio(); assert.equal(llamadas.length, 1);
  await m.render().enviar(); assert.equal(llamadas.length, 2);
  assert.notEqual(llamadas[1].cuerpo.clave, llamadas[0].cuerpo.clave);
});

test('confirmar conserva antes del POST la solicitud revisada e inmutable, aunque la fuente del modal cambie', async () => {
  const llamadas = [], productos = [{ ...producto }]; let m;
  m = montar({ post: async (ruta, cuerpo) => {
    llamadas.push({ ruta, cuerpo: structuredClone(cuerpo) });
    if (ruta.endsWith('revisar-envio')) return preparado;
    const guardado = JSON.parse([...m.almacen.values()][0]);
    assert.deepEqual(guardado.cuerpo, llamadas[0].cuerpo);
    return confirmado;
  } });
  await m.render({ productos }).enviar();
  productos[0].cantidadOriginal = 50; productos[0].cantidad = 25;
  await m.render({ productos }).confirmarEnvio();
  assert.equal(llamadas.length, 2); assert.deepEqual(llamadas[1].cuerpo, llamadas[0].cuerpo);
  assert.equal(m.render().modal, null); assert.equal(m.render().estado, 'confirmado'); assert.equal(m.almacen.size, 0);
});

test('cambios de proveedor, revisión, filtro o vista invalidan el modal sin envío', async () => {
  for (const cambio of [
    { proveedor: { ...proveedor, proveedor_id: 2 } },
    { proveedor: { ...proveedor, revisionReporte: 'revision-2' } },
    { proveedor: { ...proveedor, fechaInicio: '2026-10-14' } },
    { activo: false }, { proveedor: null }
  ]) {
    const llamadas = [], m = montar({ post: async ruta => { llamadas.push(ruta); return preparado; } });
    await m.render().enviar();
    const anterior = m.render(); m.render(cambio);
    await anterior.confirmarEnvio();
    assert.equal(m.render(cambio).modal, null); assert.equal(llamadas.length, 1); assert.equal(m.almacen.size, 0);
  }
});

test('cancelar durante la preparación y una respuesta tardía no reabren el modal ni permiten enviar', async () => {
  let resolver; const llamadas = [];
  const m = montar({ post: (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); return new Promise(r => { resolver = r; }); } });
  const pendiente = m.render().enviar();
  assert.equal(m.render().modal.cargando, true);
  await m.render().enviar(); assert.equal(llamadas.length, 1);
  m.render().cerrarModal(); resolver(preparado); await pendiente;
  assert.equal(m.render().modal, null); await m.render().confirmarEnvio(); assert.equal(llamadas.length, 1);
});

test('una respuesta tardía de otro proveedor no reemplaza el destino de la revisión actual', async () => {
  const pendientes = [];
  const m = montar({ post: (ruta, cuerpo) => new Promise(resolver => pendientes.push({ cuerpo, resolver })) });
  const vieja = m.render().enviar();
  const siguiente = { proveedor: { ...proveedor, proveedor_id: 2, nombre: 'zz-Otro proveedor' } };
  m.render(siguiente); const nueva = m.render(siguiente).enviar();
  pendientes[1].resolver({ data: { success: true, data: { destino: { telefono: '50689999999', mensaje: 'OC-26' } } } });
  await nueva; pendientes[0].resolver(preparado); await vieja;
  assert.equal(m.render(siguiente).modal.destino.telefono, '50689999999');
  assert.equal(m.almacen.size, 0);
});

test('preparación 503 permite reintentar la misma revisión sin crear un intento de transporte', async () => {
  const llamadas = [], m = montar({ post: async (ruta, cuerpo) => {
    llamadas.push({ ruta, cuerpo });
    if (llamadas.length === 1) throw { response: { status: 503, data: { message: 'Servidor no disponible' } } };
    return preparado;
  } });
  await m.render().enviar(); assert.equal(m.render().modal.error, 'Servidor no disponible');
  assert.equal(m.render().estado, 'pendiente'); assert.equal(m.almacen.size, 0);
  await m.render().reintentarRevision();
  assert.equal(llamadas.length, 2); assert.deepEqual(llamadas[1].cuerpo, llamadas[0].cuerpo);
  assert.deepEqual(m.render().modal.destino, destino); assert.equal(m.almacen.size, 0);
});

test('409 de preparación informa el motivo y no confirma una copia rechazada', async () => {
  let llamadas = 0;
  const m = montar({ post: async () => { llamadas++; throw { response: { status: 409, data: { message: 'El reporte cambió' } } }; } });
  await m.render().enviar(); assert.equal(m.render().modal.error, 'El reporte cambió');
  await m.render().confirmarEnvio(); assert.equal(llamadas, 1); assert.equal(m.almacen.size, 0);
});

test('confirmar dos veces inicia un único transporte y no permite cancelar el envío ya iniciado', async () => {
  let resolver; const rutas = [], m = montar({ post: (ruta, cuerpo) => {
    rutas.push(ruta);
    if (ruta.endsWith('revisar-envio')) return Promise.resolve(preparado);
    return new Promise(r => { resolver = r; });
  } });
  await m.render().enviar(); const primero = m.render().confirmarEnvio();
  await m.render().confirmarEnvio(); m.render().cerrarModal();
  assert.equal(m.render().enviando, true); assert.ok(m.render().modal); assert.equal(m.almacen.size, 1);
  assert.deepEqual(rutas, ['/orden-compra/proveedor/revisar-envio', '/orden-compra/proveedor/enviar']);
  resolver(confirmado); await primero; assert.equal(m.render().modal, null);
});

test('respuesta perdida después de confirmar recarga verificando el cuerpo/UUID originales, sin preparar un modal nuevo', async () => {
  const llamadas = [];
  const m = montar({ post: async (ruta, cuerpo) => {
    llamadas.push({ ruta, cuerpo: structuredClone(cuerpo) });
    if (ruta.endsWith('revisar-envio')) return preparado;
    throw { response: { status: 503, data: { message: 'Respuesta perdida' } } };
  } });
  await m.render().enviar(); await m.render().confirmarEnvio();
  assert.equal(m.render().estado, 'por_verificar'); assert.equal(m.render().modal, null);
  const recarga = montar({ post: async (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo: structuredClone(cuerpo) }); return confirmado; } }, m.almacen);
  const nueva = { proveedor: { ...proveedor, revisionReporte: 'otra' }, productos: [{ ...producto, cantidad: 100 }] };
  recarga.render(nueva); await recarga.render(nueva).enviar();
  assert.equal(llamadas.length, 3); assert.equal(llamadas[2].ruta, '/orden-compra/proveedor/enviar');
  assert.deepEqual(llamadas[2].cuerpo, llamadas[1].cuerpo); assert.equal(recarga.render(nueva).modal, null);
});

test('sin número/mensaje verificables no habilita confirmar ni guarda llave de envío', async () => {
  for (const incorrecto of [{ telefono: '', mensaje: 'OC-25' }, { telefono: '50688888888', mensaje: '  ' }, null]) {
    let llamadas = 0;
    const m = montar({ post: async () => { llamadas++; return { data: { success: true, data: { destino: incorrecto } } }; } });
    await m.render().enviar(); assert.match(m.render().modal.error, /número y el mensaje/);
    await m.render().confirmarEnvio(); assert.equal(llamadas, 1); assert.equal(m.almacen.size, 0);
  }
});

test('un fallo local al conservar la consulta no descarta una llave que pudo haber transportado, incluso si trae una marca legada', async () => {
  const cuerpo = { clave: 'zz-intento-anterior', revisionReporte: 'revision-1', productos: [producto] };
  const anterior = JSON.stringify({ cuerpo, estado: 'por_verificar', nuevo: true });
  const almacen = new Map([['orden-proveedor:50:1', anterior]]);
  almacen.set = () => { throw new Error('Sin espacio'); };
  let llamadas = 0;
  const m = montar({ post: async () => { llamadas++; } }, almacen);
  m.render(); await m.render().enviar();
  assert.equal(m.render().estado, 'por_verificar'); assert.equal(m.render().error, 'Sin espacio');
  assert.equal(almacen.get('orden-proveedor:50:1'), anterior); assert.equal(llamadas, 0);
});

test('doble clic al reintentar una preparación fallida genera una sola consulta con su cuerpo original', async () => {
  let resolver; const llamadas = [];
  const m = montar({ post: (ruta, cuerpo) => {
    llamadas.push({ ruta, cuerpo });
    if (llamadas.length === 1) return Promise.reject({ response: { status: 503, data: { message: 'Servidor no disponible' } } });
    return new Promise(r => { resolver = r; });
  } });
  await m.render().enviar(); const actual = m.render();
  const primero = actual.reintentarRevision(); await actual.reintentarRevision();
  assert.equal(llamadas.length, 2); assert.deepEqual(llamadas[1].cuerpo, llamadas[0].cuerpo);
  resolver(preparado); await primero; assert.deepEqual(m.render().modal.destino, destino);
});
