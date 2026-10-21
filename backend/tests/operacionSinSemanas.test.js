/** Contratos vigentes sin semanas. Solo clon local, con ROLLBACK por caso. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool, c, f, clientes, facturas, pedidos, agente, bodega;
const caso = (nombre, fn) => test(nombre, { skip: !activo }, async () => {
  await c.query('SAVEPOINT sin_semanas');
  try { await fn(); } finally { await c.query('ROLLBACK TO SAVEPOINT sin_semanas'); }
});
if (activo) {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  before(async () => {
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect(); await c.query('BEGIN');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(c, 'sinsem') };
    f = await sembrar(c);
    clientes = require('../src/modules/clientes/clientes.service');
    await clientes.editarCliente(f.cliente.id, { ruta_id: f.ruta.id, rotacion_dias: 22 });
    await c.query('UPDATE producto SET precio_sin_iva=1000 WHERE id=ANY($1::int[])', [f.productos]);
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    agente = require('../src/modules/catalogo-agente/pedidos-agente.service');
    pedidos = require('../src/modules/portal-clientes/portal-clientes.pedidos.service');
    bodega = require('../src/modules/warehouse/bodegaPropia');
  });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });
}
const datosFactura = () => ({ clienteId: f.cliente.id, items: [{ productoId: f.productos[0], quantity: 2, price: 1000 }] });
const datosPedido = () => ({ clienteId: f.cliente.id, lineas: [{ productoId: f.productos[0], cantidad: 2 }], claveIdempotencia: 'ZZ-' + randomUUID() });
const fila = async id => (await c.query('SELECT * FROM factura WHERE id=$1', [id])).rows[0];

caso('facturar no consulta ni crea semanas; próxima visita sigue siendo última factura + 22 días', async () => {
  await c.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE id=$1", [f.ciclo]);
  const antes = (await c.query('SELECT count(*)::int n FROM ciclo_ruta')).rows[0].n;
  const factura = await facturas.crearFactura({ ...datosFactura(), cicloId: f.ciclo });
  assert.equal((await fila(factura.id)).ciclo_ruta_cliente_id, null);
  assert.equal((await fila(factura.id)).preventa_anticipada, false);
  assert.equal((await c.query('SELECT count(*)::int n FROM ciclo_ruta')).rows[0].n, antes);
  const { rotacion } = await require('../src/modules/clientes/clientes.resumen.service').resumenDeCliente(f.cliente.id);
  const { hoyEnCostaRica, sumarDias } = require('../src/utils/fechaCR');
  assert.equal(rotacion.dias, 22); assert.equal(rotacion.proximaVisita, sumarDias(hoyEnCostaRica(), 22));
});
caso('una cola vieja conserva su clave y se reconoce aun con ciclo cerrado, sin duplicar la factura', async () => {
  const clave = randomUUID(), datos = { ...datosFactura(), cicloId: f.ciclo };
  const a = await facturas.crearFactura(datos, null, { clave });
  await c.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE id=$1", [f.ciclo]);
  const b = await facturas.crearFactura(datos, null, { clave });
  assert.equal(b.id, a.id); assert.equal(b.yaExistia, true);
  assert.equal((await fila(a.id)).ciclo_ruta_cliente_id, null);
  await assert.rejects(facturas.crearFactura({ ...datos, items: [{ ...datos.items[0], quantity: 3 }] }, null, { clave }), e => e.status === 409);
});
caso('pedido del agente ignora el campo retirado; cinco reenvíos mantienen un solo pedido', async () => {
  const datos = { ...datosPedido(), cicloId: f.ciclo };
  const a = await agente.crear(null, datos);
  for (let i = 0; i < 5; i++) {
    const b = await agente.crear(null, datos);
    assert.equal(b.pedido.id, a.pedido.id); assert.equal(b.yaExistia, true);
  }
  assert.equal(a.pedido.ciclo_ruta_cliente_id, null);
  const facturada = await pedidos.facturar(a.pedido.id);
  assert.equal((await fila(facturada.facturaId)).ciclo_ruta_cliente_id, null);
  assert.equal((await pedidos.facturar(a.pedido.id)).facturaId, facturada.facturaId);
});
caso('el portal envía el carrito sin seleccionar semana y conserva el pedido solo en su cuenta', async () => {
  const portal = require('../src/modules/portal-clientes/portal-clientes.cliente.service');
  const carrito = require('../src/modules/portal-clientes/portal-clientes.carrito.service');
  const cuenta = (await c.query("INSERT INTO cliente_portal(cliente_id,nombre,usuario,activo) VALUES($1,$2,$3,true) RETURNING id", [f.cliente.id,f.cliente.nombre,'zz-'+randomUUID()])).rows[0];
  await carrito.ponerCantidad(cuenta.id, f.productos[0], 3);
  const avisos = require('../src/modules/portal-clientes/avisoPedidoNuevo'), original = avisos.avisar;
  avisos.avisar = async () => {};
  let creado;
  try { creado = await portal.crearPedido(cuenta.id, { observaciones: 'ZZ sin semana', cicloId: f.ciclo }); }
  finally { avisos.avisar = original; }
  const guardado = (await c.query('SELECT * FROM pedido_cliente WHERE id=$1', [creado.id])).rows[0];
  assert.equal(guardado.ciclo_ruta_cliente_id, null);
  assert.equal(guardado.cliente_id, f.cliente.id);
  assert.equal((await carrito.obtenerCarrito(cuenta.id)).lineas.length, 0);
  assert.ok((await portal.misPedidos(cuenta.id)).some(p => p.id === creado.id));
  await assert.rejects(portal.detallePedido(2147483647, creado.id), e => e.status === 404);
});
caso('los pedidos se filtran por ruta actual aunque el cliente se cambie después del pedido', async () => {
  const a = await agente.crear(null, datosPedido());
  assert.ok((await pedidos.listarPedidos({ rutaId: f.ruta.id })).some(p => p.id === a.pedido.id));
  await clientes.editarCliente(f.cliente.id, { ruta_id: null });
  assert.ok(!(await pedidos.listarPedidos({ rutaId: f.ruta.id })).some(p => p.id === a.pedido.id));
  assert.ok((await pedidos.listarPedidos({ rutaId: 'sin-ruta' })).some(p => p.id === a.pedido.id));
  assert.equal((await clientes.obtenerCliente(f.cliente.id)).rotacion_dias, 22);
});
caso('Bodega incluye pendientes antiguos al elegir ruta, sin exigir ni inferir semanas', async () => {
  await c.query("UPDATE factura SET fecha='2020-01-01' WHERE id=$1", [f.facturas[0]]);
  await c.query("UPDATE factura SET fecha='2020-01-01',estado_bodega='procesado' WHERE id=$1", [f.facturas[1]]);
  const r = await bodega.listar({ rutaId: f.ruta.id, dias: 1, limit: 1 });
  assert.ok(!r.data.listas.some(x => x.factura_id === f.facturas[1]), 'el historial sigue acotado');
  assert.ok(r.data.pendientes.some(x => x.factura_id === f.facturas[0]));
  for (const factura of r.data.pendientes) assert.equal(factura.ruta_id, f.ruta.id);
  await clientes.editarCliente(f.cliente.id, { ruta_id: null });
  assert.ok(!(await bodega.listar({ rutaId: f.ruta.id })).data.pendientes.some(x => x.factura_id === f.facturas[0]));
  assert.ok((await bodega.listar({ rutaId: 'sin-ruta' })).data.pendientes.some(x => x.factura_id === f.facturas[0]));
});
caso('editar una factura histórica conserva su referencia a la semana original', async () => {
  const antes = await fila(f.facturas[0]);
  await facturas.editarFactura(antes.id, datosFactura());
  assert.equal((await fila(antes.id)).ciclo_ruta_cliente_id, antes.ciclo_ruta_cliente_id);
  const otro = await clientes.crearCliente({ nombre: 'ZZ otro ' + randomUUID() });
  await assert.rejects(facturas.editarFactura(antes.id, { ...datosFactura(), clienteId: otro.id }), e => e.status === 409);
});
caso('los triggers siguen impidiendo alterar o borrar un recorrido histórico', async () => {
  for (const sql of ['UPDATE ciclo_ruta_cliente SET cliente_nombre=\'ZZ cambiado\' WHERE ciclo_id=$1', 'DELETE FROM ciclo_ruta_cliente WHERE ciclo_id=$1']) {
    await c.query('SAVEPOINT historia');
    await assert.rejects(c.query(sql, [f.ciclo]), /recorrido/);
    await c.query('ROLLBACK TO SAVEPOINT historia');
  }
  assert.ok((await fila(f.facturas[0])).ciclo_ruta_cliente_id);
});
test('la copia local de Bodega filtra por ruta conocida, sin usar la semana vieja como ruta actual', async () => {
  const { coincideRutaBodega } = await import('../../frontend/src/utils/facturasBodegaUtils.js');
  assert.equal(coincideRutaBodega({ ruta_id: 7 }, '7'), true);
  assert.equal(coincideRutaBodega({ ruta_id: null }, 'sin-ruta'), true);
  assert.equal(coincideRutaBodega({ ciclo: { rutaId: 7 } }, '7'), false);
  assert.equal(coincideRutaBodega({}, 'sin-ruta'), false);
  assert.equal(coincideRutaBodega({}, ''), true);
});
