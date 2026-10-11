/** PostgreSQL real en una transacción que termina en ROLLBACK; solo base desechable. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const habilitadas = process.env.PROBAR_BASE_LOCAL === '1';
let db, rutas, clientes, ciclos, portal, carrito, agente, pedidos, facturas, consulta;
let ruta, cliente, ajeno, cuenta, otraCuenta, producto, actual, proximo;
const nombre = s => `ZZ ${s} ${randomUUID().slice(0,8)}`;
const caso = (n, fn) => test(n, { skip: !habilitadas }, fn);
if (habilitadas) {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  const { Pool } = require('pg');
  const poolReal = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let conexion, nivel = 0;
  const ejecutar = (sql, params) => conexion.query(sql, params);
  db = { query: ejecutar, pool: { query: ejecutar, connect: async () => {
    const savepoint = `documentos_ciclo_${++nivel}`;
    return { query: (sql, params) => {
      if (sql === 'BEGIN') return ejecutar(`SAVEPOINT ${savepoint}`);
      if (sql === 'COMMIT') return ejecutar(`RELEASE SAVEPOINT ${savepoint}`);
      if (sql === 'ROLLBACK') return ejecutar(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      return ejecutar(sql, params);
    }, release() {} };
  } } };
  const moduloDb = require.resolve('../config/database');
  require.cache[moduloDb] = { id: moduloDb, filename: moduloDb, loaded: true, exports: db };
  after(async () => { if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); } await poolReal.end(); });
  rutas = require('../src/modules/rutas/rutas.service');
  clientes = require('../src/modules/clientes/clientes.service');
  ciclos = require('../src/modules/rutas/documentosCiclo.service');
  portal = require('../src/modules/portal-clientes/portal-clientes.cliente.service');
  carrito = require('../src/modules/portal-clientes/portal-clientes.carrito.service');
  agente = require('../src/modules/catalogo-agente/pedidos-agente.service');
  pedidos = require('../src/modules/portal-clientes/portal-clientes.pedidos.service');
  facturas = require('../src/modules/facturacion/facturaPropia.service');
  consulta = require('../src/modules/facturacion/facturaConsulta.service');
  before(async () => {
    conexion = await poolReal.connect(); await conexion.query('BEGIN');
    ruta = await rutas.crearRuta({ nombre: nombre('Ruta documentos') });
    cliente = await clientes.crearCliente({ nombre: nombre('Cliente documentos'), ruta_id: ruta.id });
    ajeno = await clientes.crearCliente({ nombre: nombre('Ajeno documentos') });
    cuenta = (await db.query('INSERT INTO cliente_portal(cliente_id,nombre) VALUES($1,$2) RETURNING id', [cliente.id, cliente.nombre])).rows[0].id;
    otraCuenta = (await db.query('INSERT INTO cliente_portal(cliente_id,nombre) VALUES($1,$2) RETURNING id', [ajeno.id, ajeno.nombre])).rows[0].id;
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1')).rows[0].id;
    producto = (await db.query('INSERT INTO producto(nombre,precio_sin_iva,impuesto_id) VALUES($1,1000,$2) RETURNING id', [nombre('Producto documentos'), impuesto])).rows[0].id;
    actual = await rutas.crearCiclo(ruta.id, { semana: '2026-10-12' });
    proximo = await rutas.crearCiclo(ruta.id, { semana: '2026-10-19' });
  });
}
async function sqlRechazado(sql, valores) {
  await db.query('SAVEPOINT restriccion_esperada');
  try { return await db.query(sql, valores); }
  finally { await db.query('ROLLBACK TO SAVEPOINT restriccion_esperada'); }
}
const enviarPortal = async cicloId => {
  await carrito.ponerCantidad(cuenta, producto, 2);
  return portal.crearPedido(cuenta, { cicloId });
};
const enviarAgente = (cicloId, claveIdempotencia = randomUUID(), clienteId = cliente.id) =>
  agente.crear(null, { clienteId, cicloId, claveIdempotencia, lineas: [{ productoId: producto, cantidad: 1 }] });

caso('la cuenta solo ve sus ciclos y la respuesta no expone otras paradas, Maps o saldos', async () => {
  const disponibles = await ciclos.paraCuenta(cuenta);
  assert.deepEqual(disponibles.map(c => c.id), [actual.id, proximo.id]);
  assert.deepEqual(Object.keys(disponibles[0]).sort(), ['estado','id','orden','rutaId','rutaNombre','semana'].sort());
  assert.deepEqual(await ciclos.paraCuenta(otraCuenta), []);
});
caso('ciclo ajeno se rechaza sin consumir el carrito ni confiar en clienteId del navegador', async () => {
  await carrito.ponerCantidad(otraCuenta, producto, 3);
  await assert.rejects(portal.crearPedido(otraCuenta, { cicloId: actual.id, clienteId: cliente.id }), e => e.status === 400);
  assert.equal((await carrito.obtenerCarrito(otraCuenta)).lineas[0].cantidad, 3);
  await assert.rejects(enviarAgente(actual.id, randomUUID(), ajeno.id), e => e.status === 400);
});
caso('portal conserva ambas semanas y la preventa anticipada; Sin ciclo sigue disponible', async () => {
  const a = await enviarPortal(actual.id), b = await enviarPortal(proximo.id), viejo = await enviarPortal(undefined);
  assert.equal(a.ciclo.semana, '2026-10-12'); assert.equal(b.ciclo.semana, '2026-10-19');
  assert.equal(a.anticipado, true); assert.equal(viejo.ciclo, null); assert.equal(viejo.anticipado, false);
  const historial = await portal.misPedidos(cuenta);
  assert.equal(historial.find(p => p.id === b.id).ciclo.id, proximo.id);
  assert.equal((await portal.detallePedido(cuenta, a.id)).ciclo.id, actual.id);
  await assert.rejects(portal.detallePedido(otraCuenta, a.id), e => e.status === 404);
});
caso('pedido adicional del agente no reemplaza los anticipados del cliente', async () => {
  const previo = await enviarPortal(proximo.id), adicional = await enviarAgente(proximo.id);
  const anteriores = await pedidos.detalle(previo.id);
  assert.equal(anteriores.estado, 'pendiente'); assert.equal(anteriores.lineas[0].cantidad, 2);
  assert.equal((await pedidos.detalle(adicional.pedido.id)).ciclo.id, proximo.id);
  assert.notEqual(previo.id, adicional.pedido.id);
});
caso('cinco reenvíos de una clave conservan un solo pedido con todas sus líneas', async () => {
  const clave = randomUUID();
  const resultados = [];
  for (let i = 0; i < 5; i++) resultados.push(await enviarAgente(actual.id, clave));
  assert.equal(new Set(resultados.map(r => r.pedido.id)).size, 1);
  assert.equal(resultados.filter(r => !r.yaExistia).length, 1);
  const detalle = await pedidos.detalle(resultados[0].pedido.id);
  assert.equal(detalle.ciclo.id, actual.id); assert.equal(detalle.lineas.length, 1);
});
caso('una cola antigua sin ciclo y su clave se reconocen sin asignar la semana actual', async () => {
  const clave = randomUUID(), original = await enviarAgente(undefined, clave);
  const reintento = await enviarAgente(proximo.id, clave);
  assert.equal(original.pedido.ciclo_ruta_cliente_id, null);
  assert.equal(reintento.pedido.id, original.pedido.id); assert.equal(reintento.pedido.ciclo_ruta_cliente_id, null);
  assert.equal(reintento.yaExistia, true);
});
caso('filtros de semana, ruta y origen se aplican antes del límite y no leen la ruta actual', async () => {
  const propio = await enviarPortal(proximo.id);
  await db.query(`INSERT INTO pedido_cliente(cliente_id,cliente_nombre,origen,creado_en)
    SELECT $1,$2,'agente',NOW() FROM generate_series(1,205)`, [ajeno.id, ajeno.nombre]);
  const filtrados = await pedidos.listarPedidos({ estado: 'todos', cicloId: proximo.id, origen: 'portal' });
  assert.ok(filtrados.some(p => p.id === propio.id));
  assert.ok(filtrados.every(p => p.ciclo.id === proximo.id && p.origen === 'portal'));
  assert.ok((await pedidos.listarPedidos({ rutaId: ruta.id })).every(p => p.ciclo.rutaId === ruta.id));
  assert.ok((await pedidos.listarPedidos({ cicloId: 'sin-ciclo' })).every(p => p.ciclo === null));
  assert.deepEqual(await pedidos.listarPedidos({ rutaId: ruta.id, cicloId: 'sin-ciclo' }), []);
  await assert.rejects(pedidos.listarPedidos({ cicloId: '1 OR 1=1' }), e => e.status === 400);
});
caso('cambiar la ficha y el nombre de ruta no reclasifica pedidos ni la factura que generan', async () => {
  const pedido = await enviarPortal(actual.id);
  await clientes.editarCliente(cliente.id, { ruta_id: null });
  await rutas.editarRuta(ruta.id, { nombre: nombre('Ruta renombrada') });
  const original = await pedidos.detalle(pedido.id);
  assert.equal(original.ciclo.rutaNombre, ruta.nombre); assert.equal(original.ciclo.orden, 1);
  const facturada = await pedidos.facturar(pedido.id, null);
  const factura = await consulta.obtenerFactura(facturada.facturaId);
  assert.deepEqual(factura.ciclo, pedido.ciclo); assert.equal(factura.anticipado, true);
  const reintento = await pedidos.facturar(pedido.id, null);
  assert.equal(reintento.facturaId, factura.id);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM factura WHERE id=$1', [factura.id])).rows[0].n, 1);
});
caso('SQL impide mover el contexto o facturar al cliente ajeno incluso fuera de la API', async () => {
  const p = await enviarPortal(actual.id), f = await pedidos.facturar(p.id, null);
  await assert.rejects(sqlRechazado('UPDATE pedido_cliente SET ciclo_ruta_cliente_id=NULL WHERE id=$1', [p.id]), /no se reclasifica/);
  await assert.rejects(sqlRechazado('UPDATE factura SET preventa_anticipada=FALSE WHERE id=$1', [f.facturaId]), /no se reclasifica/);
  await assert.rejects(sqlRechazado('UPDATE factura SET cliente_id=$1 WHERE id=$2', [ajeno.id, f.facturaId]), /recorrido fijo/);
  await assert.rejects(sqlRechazado('DELETE FROM pedido_cliente WHERE id=$1', [p.id]), /conserva su historial/);
});
caso('facturación presencial admite el ciclo del recorrido aunque cambió la ficha', async () => {
  const f = await facturas.crearFactura({ clienteId: cliente.id, cicloId: proximo.id,
    items: [{ productoId: producto, quantity: 1, price: 1000 }] }, null);
  assert.equal(f.ciclo.id, proximo.id); assert.equal(f.preventa_anticipada, false);
  const vista = await consulta.obtenerFactura(f.id);
  assert.equal(vista.ciclo.semana, '2026-10-19');
  await assert.rejects(facturas.editarFactura(f.id, { clienteId: ajeno.id, items: [{ productoId: producto, quantity: 1, price: 1000 }] }, null), e => e.status === 409);
  await assert.rejects(facturas.editarFactura(f.id, { cicloId: actual.id, items: [{ productoId: producto, quantity: 1, price: 1000 }] }, null), e => e.status === 409);
});
caso('editar una factura anticipada devuelve su contexto aun a una tablet sin copia previa', async () => {
  const pedido = await enviarPortal(actual.id), emitida = await pedidos.facturar(pedido.id, null);
  const editada = await facturas.editarFactura(emitida.facturaId, {
    items: [{ productoId: producto, quantity: 3, price: 1000 }], observaciones: 'Edición conservada'
  }, null);
  const { facturaEscrita } = await import('../../frontend/src/utils/facturasLocales.js');
  const copiaNueva = facturaEscrita(editada), consultada = await consulta.obtenerFactura(emitida.facturaId);
  assert.deepEqual(copiaNueva.ciclo, pedido.ciclo);
  assert.deepEqual(copiaNueva.ciclo, consultada.ciclo);
  assert.equal(copiaNueva.anticipado, true); assert.equal(copiaNueva.lineas[0].cantidad, 3);
  assert.equal(copiaNueva.observaciones, 'Edición conservada');
});
caso('reintentar una factura después del cierre devuelve la semana guardada y no vuelve a emitir', async () => {
  await db.query('SAVEPOINT reintento_cerrado');
  try {
    const clave = randomUUID(), datos = { clienteId: cliente.id, cicloId: actual.id,
      items: [{ productoId: producto, quantity: 1, price: 1000 }] };
    const f = await facturas.crearFactura(datos, null, { clave });
    await rutas.cambiarEstadoCiclo(actual.id, { estado: 'cancelado', estadoAnterior: 'preventa' });
    const antes = (await db.query('SELECT COUNT(*)::int n FROM factura')).rows[0].n;
    const r = await facturas.crearFactura(datos, null, { clave });
    assert.equal(r.id, f.id); assert.equal(r.yaExistia, true);
    assert.deepEqual(r.ciclo, f.ciclo); assert.equal(r.preventa_anticipada, false);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM factura')).rows[0].n, antes);
    await assert.rejects(facturas.crearFactura(datos, null), e => e.status === 409);
  } finally { await db.query('ROLLBACK TO SAVEPOINT reintento_cerrado'); }
});
caso('editar y reenviar una factura sin ciclo nunca le asigna la ruta actual', async () => {
  const clave = randomUUID(), datos = { clienteId: cliente.id,
    items: [{ productoId: producto, quantity: 1, price: 1000 }] };
  const f = await facturas.crearFactura(datos, null, { clave });
  const e = await facturas.editarFactura(f.id, datos, null);
  const r = await facturas.crearFactura(datos, null, { clave });
  for (const respuesta of [f, e, r]) {
    assert.equal(respuesta.ciclo, null); assert.equal(respuesta.preventa_anticipada, false);
  }
  assert.equal((await consulta.obtenerFactura(f.id)).ciclo, null);
});
caso('ciclo cerrado rechaza ventas nuevas, conserva el carrito y reconoce pedidos ya confirmados', async () => {
  const clave = randomUUID(), guardado = await enviarAgente(proximo.id, clave);
  const pendiente = await enviarPortal(proximo.id);
  await rutas.cambiarEstadoCiclo(proximo.id, { estado: 'cancelado', estadoAnterior: 'preventa' });
  await assert.rejects(enviarPortal(proximo.id), e => e.status === 409);
  assert.equal((await carrito.obtenerCarrito(cuenta)).lineas.length, 1);
  await assert.rejects(enviarAgente(proximo.id), e => e.status === 409);
  const reconocido = await enviarAgente(proximo.id, clave);
  assert.equal(reconocido.pedido.id, guardado.pedido.id);
  // Una venta recibida antes del cierre sigue facturable con su contexto original.
  const f = await pedidos.facturar(pendiente.id, null);
  assert.equal((await consulta.obtenerFactura(f.facturaId)).ciclo.id, proximo.id);
});
