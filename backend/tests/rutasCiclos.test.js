const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ubicacionMaps, semanaValida } = require('../src/modules/rutas/rutas.validacion');
const { moduloDeRuta, esCompartida } = require('../src/modules/usuarios/modulos');
const habilitadas = process.env.PROBAR_BASE_LOCAL === '1';
let db, rutas, clientes, resumen;
if (habilitadas) {
  require('../config/aislado').asegurarBaseLocal();
  // Estas operaciones confirman transacciones del servicio: solo una base
  // desechable propia, nunca la copia del usuario aunque sea localhost.
  const u = new URL(process.env.DATABASE_URL);
  assert.match(u.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  db = require('../config/database');
  rutas = require('../src/modules/rutas/rutas.service');
  clientes = require('../src/modules/clientes/clientes.service');
  resumen = require('../src/modules/clientes/clientes.resumen.service');
  after(() => db.pool.end());
}
const nombre = s => `ZZ ${s} ${randomUUID().slice(0, 8)}`;
const prueba = (n, trabajo) => test(n, { skip: !habilitadas }, trabajo);
async function preparar(n = 3) {
  const ruta = await rutas.crearRuta({ nombre: nombre('Ruta') });
  const lista = [];
  for (let i = 0; i < n; i++) lista.push(await clientes.crearCliente({ nombre: nombre('Cliente'), ruta_id: ruta.id,
    ubicacion_maps: 'https://maps.app.goo.gl/Prueba', dia_visita: 1, dia_entrega: 4 }));
  return { ruta: await rutas.obtenerRuta(ruta.id), lista };
}

test('Maps acepta enlaces reales sin permitir URLs ejecutables o hosts imitadores', () => {
  for (const u of ['https://maps.app.goo.gl/a', 'https://goo.gl/maps/a', 'https://www.google.com/maps?q=9,-84', 'https://maps.google.com/?q=9,-84']) assert.equal(ubicacionMaps(u), new URL(u).href);
  assert.equal(ubicacionMaps(''), null);
  for (const u of ['javascript:alert(1)', 'https://google.com.ejemplo.com/maps', 'https://google.com/search', 'https://maps.app.goo.gl@ejemplo.com', 'http://maps.google.com/', 'https://usuario@maps.app.goo.gl/a']) assert.throws(() => ubicacionMaps(u), e => e.status === 400);
});
test('semanas son lunes de calendario válidos, no fechas aproximadas por UTC', () => {
  assert.equal(semanaValida('2026-10-12'), '2026-10-12');
  for (const v of ['2026-10-13', '2026-02-30', '2026-13-12', '12/10/2026', null]) assert.throws(() => semanaValida(v), e => e.status === 400);
});
test('lecturas Maps y escrituras de rutas/ciclos pertenecen a Clientes', () => {
  for (const p of ['/clientes/rutas', '/clientes/rutas/1/orden', '/clientes/rutas/ciclos/1/estado']) {
    assert.equal(moduloDeRuta(p), 'clientes'); assert.equal(esCompartida(p), false);
  }
});
prueba('asignar e insertar por posición compacta ambos recorridos sin tocar otras fichas', async () => {
  const { ruta, lista } = await preparar();
  const destino = await rutas.crearRuta({ nombre: nombre('Destino') });
  await clientes.editarCliente(lista[2].id, { orden_ruta: 1 });
  assert.deepEqual((await rutas.obtenerRuta(ruta.id)).clientes.map(c => c.id), [lista[2].id, lista[0].id, lista[1].id]);
  await clientes.editarCliente(lista[0].id, { ruta_id: destino.id, orden_ruta: null });
  assert.deepEqual((await rutas.obtenerRuta(ruta.id)).clientes.map(c => c.orden_ruta), [1, 2]);
  assert.equal((await rutas.obtenerRuta(destino.id)).clientes[0].id, lista[0].id);
  await clientes.editarCliente(lista[2].id, { ruta_id: null });
  assert.equal((await clientes.obtenerCliente(lista[2].id)).orden_ruta, null);
});
prueba('nombre obligatorio y duplicado se rechazan antes de crear otra ruta', async () => {
  for (const datos of [undefined, {}, { nombre: ' ' }, { nombre: 42 }, { nombre: {} }]) {
    await assert.rejects(rutas.crearRuta(datos), e => e.status === 400);
  }
  const n = nombre('Duplicado');
  await rutas.crearRuta({ nombre: n });
  await assert.rejects(rutas.crearRuta({ nombre: n.toUpperCase() }), e => e.status === 409);
});
prueba('orden incompleto, duplicado, cliente ajeno y versión obsoleta no cambian la ruta', async () => {
  const { ruta, lista } = await preparar();
  const ids = lista.map(c => c.id);
  await assert.rejects(rutas.reordenarRuta(ruta.id, { clienteIds: ids.slice(1), version: ruta.version }), e => e.status === 409);
  await assert.rejects(rutas.reordenarRuta(ruta.id, { clienteIds: [ids[0], ids[0]], version: ruta.version }), e => e.status === 400);
  await assert.rejects(rutas.reordenarRuta(ruta.id, { clienteIds: [99999999, ...ids.slice(1)], version: ruta.version }), e => e.status === 409);
  await assert.rejects(rutas.reordenarRuta(ruta.id, { clienteIds: ids, version: ruta.version - 1 }), e => e.status === 409);
  assert.deepEqual((await rutas.obtenerRuta(ruta.id)).clientes.map(c => c.id), ids);
});
prueba('dos reordenamientos concurrentes: uno gana y el otro debe recargar', async () => {
  const { ruta, lista } = await preparar();
  const ids = lista.map(c => c.id);
  const r = await Promise.allSettled([
    rutas.reordenarRuta(ruta.id, { clienteIds: [...ids].reverse(), version: ruta.version }),
    rutas.reordenarRuta(ruta.id, { clienteIds: [ids[1], ids[0], ids[2]], version: ruta.version })
  ]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.find(x => x.status === 'rejected').reason.status, 409);
  assert.equal((await rutas.obtenerRuta(ruta.id)).version, ruta.version + 1);
});
prueba('asignaciones concurrentes al final conservan todos los clientes y puestos únicos', async () => {
  const { ruta } = await preparar(1);
  await Promise.all([1, 2].map(() => clientes.crearCliente({ nombre: nombre('Concurrente'), ruta_id: ruta.id })));
  assert.deepEqual((await rutas.obtenerRuta(ruta.id)).clientes.map(c => c.orden_ruta), [1, 2, 3]);
});
prueba('ciclos de una misma ruta conservan su semana y recorrido aunque el cliente cambie', async () => {
  const { ruta, lista } = await preparar();
  const anterior = await rutas.crearCiclo(ruta.id, { semana: '2026-10-12' });
  await clientes.editarCliente(lista[0].id, { nombre: nombre('Renombrado'), ubicacion_maps: null, ruta_id: null });
  await rutas.editarRuta(ruta.id, { nombre: nombre('Ruta nueva') });
  const siguiente = await rutas.crearCiclo(ruta.id, { semana: '2026-10-19' });
  const recuperado = await rutas.obtenerCiclo(anterior.id);
  assert.equal(recuperado.ruta_nombre, ruta.nombre);
  assert.equal(recuperado.clientes[0].cliente_nombre, lista[0].nombre);
  assert.equal(recuperado.clientes[0].ubicacion_maps, lista[0].ubicacion_maps);
  assert.equal(recuperado.semana, '2026-10-12');
  assert.equal(siguiente.semana, '2026-10-19'); assert.equal(siguiente.clientes.length, 2);
  await assert.rejects(rutas.crearCiclo(ruta.id, { semana: '2026-10-19' }), e => e.status === 409);
});
prueba('base impide borrar/editar/agregar a un recorrido fijado o cambiar su semana', async () => {
  const { ruta } = await preparar(1), c = await rutas.crearCiclo(ruta.id, { semana: '2026-10-12' });
  await assert.rejects(db.pool.query('UPDATE ciclo_ruta_cliente SET cliente_nombre=$1 WHERE ciclo_id=$2', ['ZZ Cambio', c.id]), /recorrido/);
  await assert.rejects(db.pool.query('DELETE FROM ciclo_ruta_cliente WHERE ciclo_id=$1', [c.id]), /recorrido/);
  await assert.rejects(db.pool.query("UPDATE ciclo_ruta SET semana='2026-10-19' WHERE id=$1", [c.id]), /contexto/);
  await assert.rejects(db.pool.query(`INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,2,'ZZ Extra')`, [c.id, c.clientes[0].cliente_id]), /recorrido/);
  assert.equal((await rutas.obtenerCiclo(c.id)).clientes.length, 1);
});
prueba('actual y próxima conviven; promoción controlada no cierra el ciclo actual automáticamente', async () => {
  const { ruta } = await preparar(1);
  const a = await rutas.crearCiclo(ruta.id, { semana: '2026-10-12' }), b = await rutas.crearCiclo(ruta.id, { semana: '2026-10-19' });
  await rutas.cambiarEstadoCiclo(a.id, { estado: 'preparacion', estadoAnterior: 'preventa' });
  await assert.rejects(rutas.cambiarEstadoCiclo(b.id, { estado: 'preparacion', estadoAnterior: 'preventa' }), e => e.status === 409);
  assert.equal((await rutas.obtenerCiclo(b.id)).estado, 'preventa');
  await assert.rejects(rutas.cambiarEstadoCiclo(a.id, { estado: 'cerrado', estadoAnterior: 'preparacion' }), e => e.status === 400);
  await rutas.cambiarEstadoCiclo(a.id, { estado: 'entrega', estadoAnterior: 'preparacion' });
  await rutas.cambiarEstadoCiclo(a.id, { estado: 'cerrado', estadoAnterior: 'entrega' });
  await rutas.cambiarEstadoCiclo(b.id, { estado: 'preparacion', estadoAnterior: 'preventa' });
  await rutas.cambiarEstadoCiclo(b.id, { estado: 'cancelado', estadoAnterior: 'preparacion' });
});
prueba('validación fallida conserva ruta/orden; inactiva no acepta nuevas asignaciones', async () => {
  const { ruta, lista } = await preparar();
  await assert.rejects(clientes.editarCliente(lista[1].id, { orden_ruta: 20 }), e => e.status === 400);
  assert.deepEqual((await rutas.obtenerRuta(ruta.id)).clientes.map(c => c.id), lista.map(c => c.id));
  await rutas.editarRuta(ruta.id, { activo: false });
  await assert.rejects(clientes.crearCliente({ nombre: nombre('No asignado'), ruta_id: ruta.id }), e => e.status === 400);
  await assert.rejects(rutas.crearCiclo(ruta.id, { semana: '2026-10-12' }), e => e.status === 400);
});
prueba('filtro de ruta ocurre antes de paginar y conserva orden de visita', async () => {
  const { ruta, lista } = await preparar();
  const r = await clientes.listarClientes({ rutaId: ruta.id, limite: 2 });
  assert.equal(r.paginacion.total, 3); assert.deepEqual(r.data.map(c => c.id), lista.slice(0, 2).map(c => c.id));
});
prueba('ficha propia muestra pedidos del agente sin Alegra y deuda anterior a las últimas diez facturas', async () => {
  const c = await clientes.crearCliente({ nombre: nombre('Ficha propia') });
  for (let i = 0; i < 12; i++) await db.pool.query(`INSERT INTO factura(cliente_id,cliente_nombre,fecha,estado,total)
    VALUES($1,$2,DATE '2026-10-01' - $3::int,'emitida',100)`, [c.id, c.nombre, i]);
  await db.pool.query("INSERT INTO pedido_cliente(cliente_id,origen,total) VALUES($1,'agente',100)", [c.id]);
  const r = await resumen.resumenDeCliente(c.id);
  assert.equal(r.facturas.length, 10); assert.equal(r.facturasPendientes.length, 12);
  assert.equal(r.saldo.total, 1200); assert.equal(r.pedidos[0].origen, 'agente');
  assert.equal(r.cliente.alegra_id, null);
});
