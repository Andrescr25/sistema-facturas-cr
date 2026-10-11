/** PostgreSQL real en una transacción que termina en ROLLBACK; solo base desechable. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const habilitadas = process.env.PROBAR_BASE_LOCAL === '1';
let db, rutas, clientes, ciclos, portal, carrito, agente, pedidos, facturas, consulta, preventa;
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
    const savepoint = `preventa_enlaces_${++nivel}`;
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
  preventa = require('../src/modules/portal-clientes/preventa.service');
  carrito = require('../src/modules/portal-clientes/portal-clientes.carrito.service');
  agente = require('../src/modules/catalogo-agente/pedidos-agente.service');
  pedidos = require('../src/modules/portal-clientes/portal-clientes.pedidos.service');
  facturas = require('../src/modules/facturacion/facturaPropia.service');
  consulta = require('../src/modules/facturacion/facturaConsulta.service');
  before(async () => {
    conexion = await poolReal.connect(); await conexion.query('BEGIN');
    ruta = await rutas.crearRuta({ nombre: nombre('Ruta documentos') });
    cliente = await clientes.crearCliente({ nombre: nombre('Cliente documentos'), ruta_id: ruta.id });
    ajeno = await clientes.crearCliente({ nombre: nombre('Ajeno enlaces'), ruta_id: ruta.id });
    cuenta = (await db.query('INSERT INTO cliente_portal(cliente_id,nombre) VALUES($1,$2) RETURNING id', [cliente.id, cliente.nombre])).rows[0].id;
    otraCuenta = (await db.query('INSERT INTO cliente_portal(cliente_id,nombre) VALUES($1,$2) RETURNING id', [ajeno.id, ajeno.nombre])).rows[0].id;
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1')).rows[0].id;
    producto = (await db.query('INSERT INTO producto(nombre,precio_sin_iva,impuesto_id) VALUES($1,1000,$2) RETURNING id', [nombre('Producto documentos'), impuesto])).rows[0].id;
    actual = await rutas.crearCiclo(ruta.id, { semana: '2026-10-12' });
    await db.query("UPDATE cliente_portal SET usuario=$1 WHERE id=$2", [nombre('Usuario'), cuenta]);
    proximo = await rutas.crearCiclo(ruta.id, { semana: '2026-10-19' });
  });
}
caso('enlaces estables por cliente y semana no funcionan como sesión del portal', async () => {
  const a = await preventa.preparar(cliente.id, proximo.id);
  const b = await preventa.preparar(cliente.id, proximo.id);
  assert.equal(a.token, b.token);
  assert.notEqual(a.token, (await preventa.preparar(cliente.id, actual.id)).token);
  assert.notEqual(a.token, (await preventa.preparar(ajeno.id, proximo.id)).token);
  assert.equal(require('../src/modules/portal-clientes/portal-clientes.auth').verificarTokenCliente(a.token), null);
  assert.equal(a.requiereInvitacion, false);
});
caso('resolver devuelve solo el ciclo de la cuenta autenticada, sin datos de otras paradas', async () => {
  const token = preventa.crearToken(cliente.id, proximo.id);
  const c = await preventa.resolver(cuenta, token);
  assert.equal(c.id, proximo.id);
  assert.deepEqual(Object.keys(c).sort(), ['estado','id','orden','rutaId','rutaNombre','semana'].sort());
  // Ambos clientes pertenecen a la misma ruta y semana; el enlace sigue personal.
  await assert.rejects(preventa.resolver(otraCuenta, token), e => e.status === 404);
});
caso('alterar cliente, semana, firma o formato no abre el enlace', async () => {
  const t = preventa.crearToken(cliente.id, proximo.id);
  for (const falso of [t.replace(`.${cliente.id}.`, `.${ajeno.id}.`), t.replace(`.${proximo.id}.`, `.${actual.id}.`), t.slice(0,-1) + (t.endsWith('a') ? 'b' : 'a'), '', null, 'x'.repeat(1000)]) {
    await assert.rejects(preventa.resolver(cuenta, falso), e => e.status === 404);
  }
});
caso('una ficha movida de ruta no cambia el contexto del enlace', async () => {
  const a = await preventa.preparar(cliente.id, proximo.id);
  await clientes.editarCliente(cliente.id, { ruta_id: null });
  await rutas.editarRuta(ruta.id, { nombre: nombre('Nuevo nombre') });
  const b = await preventa.resolver(cuenta, a.token);
  assert.equal(b.rutaNombre, a.ciclo.rutaNombre); assert.equal(b.semana, a.ciclo.semana);
});
caso('invitación explícita conserva el enlace personal y no modifica una cuenta ya habilitada', async () => {
  const a = await preventa.preparar(ajeno.id, proximo.id);
  assert.equal(a.requiereInvitacion, true);
  const i = await preventa.invitar(ajeno.id, { cicloId: proximo.id }, null);
  assert.equal(i.clienteId, ajeno.id);
  assert.equal((await preventa.preparar(ajeno.id, proximo.id)).token, a.token);
  await assert.rejects(preventa.invitar(cliente.id, { cicloId: proximo.id }, null), e => e.status === 409);
});
caso('revocar acceso impide resolver, preparar, invitar y enviar sin reactivar la cuenta', async () => {
  const t = preventa.crearToken(ajeno.id, proximo.id);
  await db.query('UPDATE cliente_portal SET activo=FALSE WHERE id=$1', [otraCuenta]);
  await assert.rejects(preventa.resolver(otraCuenta, t), e => e.status === 403);
  await assert.rejects(preventa.preparar(ajeno.id, proximo.id), e => e.status === 409);
  await assert.rejects(preventa.invitar(ajeno.id, { cicloId: proximo.id }, null), e => e.status === 409);
  await assert.rejects(preventa.enviar(ajeno.id, { cicloId: proximo.id, token: t }, null), e => e.status === 409);
  assert.equal((await db.query('SELECT activo FROM cliente_portal WHERE id=$1', [otraCuenta])).rows[0].activo, false);
  await db.query('UPDATE cliente_portal SET activo=TRUE WHERE id=$1', [otraCuenta]);
});
caso('un enlace ajeno o una semana diferente se rechazan antes de consumir el carrito', async () => {
  const t = preventa.crearToken(cliente.id, proximo.id);
  await carrito.ponerCantidad(cuenta, producto, 2);
  await assert.rejects(portal.crearPedido(cuenta, { cicloId: actual.id, preventaToken: t }), e => e.status === 400);
  await assert.rejects(portal.crearPedido(cuenta, { cicloId: null, preventaToken: t }), e => e.status === 400);
  assert.equal((await carrito.obtenerCarrito(cuenta)).lineas[0].cantidad, 2);
  await carrito.ponerCantidad(otraCuenta, producto, 3);
  await assert.rejects(portal.crearPedido(otraCuenta, { cicloId: proximo.id, preventaToken: t, clienteId: cliente.id }), e => e.status === 404);
  assert.equal((await carrito.obtenerCarrito(otraCuenta)).lineas[0].cantidad, 3);
});
caso('pedido desde el enlace conserva su ciclo y solo es visible en su cuenta', async () => {
  const t = preventa.crearToken(cliente.id, proximo.id);
  const p = await portal.crearPedido(cuenta, { cicloId: proximo.id, preventaToken: t });
  assert.equal(p.ciclo.id, proximo.id); assert.equal(p.anticipado, true);
  assert.equal((await portal.detallePedido(cuenta, p.id)).ciclo.id, proximo.id);
  await assert.rejects(portal.detallePedido(otraCuenta, p.id), e => e.status === 404);
});
caso('envío valida el cliente, ciclo, enlace e invitación antes de tocar WhatsApp', async () => {
  const t = preventa.crearToken(cliente.id, proximo.id);
  await assert.rejects(preventa.enviar(ajeno.id, { cicloId: proximo.id, token: t }, null), e => e.status === 400);
  await assert.rejects(preventa.enviar(cliente.id, { cicloId: proximo.id, token: t, mensaje: 'Sin enlace' }, null), e => e.status === 400);
  const a = preventa.crearToken(ajeno.id, proximo.id);
  await assert.rejects(preventa.enviar(ajeno.id, { cicloId: proximo.id, token: a, invitacionToken: 'falso' }, null), e => e.status === 409);
});
caso('el envío local queda bloqueado y registra un fallo, nunca un éxito ficticio', async () => {
  const t = preventa.crearToken(cliente.id, proximo.id);
  // Las pruebas unitarias usan NODE_TEST_CONTEXT para sus dobles. Este
  // caso comprueba la guarda REAL: quitarlo solo aquí fuerza el bloqueo.
  const documento = await require('../src/modules/portal-clientes/preventaPdf.service').preparar(cliente.id, { cicloId: proximo.id, alcance: 'seleccion' });
  const contexto = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    assert.equal(require('../config/aislado').salidasBloqueadas(), true);
    await assert.rejects(preventa.enviar(cliente.id, { cicloId: proximo.id, token: t, pdfId: documento.id, telefono: '88888888', mensaje: `http://localhost/catalogo?preventa=${t}` }, null), e => e.code === 'SALIDA_BLOQUEADA' || /bloquead/i.test(e.message));
  } finally { if (contexto !== undefined) process.env.NODE_TEST_CONTEXT = contexto; }
  const r = await require('../src/modules/envios-whatsapp/envios.service').historial({ tipo: 'preventa', referencia: `${proximo.id}:${cliente.id}` });
  assert.equal(r.length, 1); assert.equal(r[0].exito, false);
});
caso('promover el ciclo conserva el enlace, cerrar lo inutiliza y deja intacto el carrito', async () => {
  const t = preventa.crearToken(cliente.id, proximo.id);
  // La copia histórica puede traer otro ciclo actual. Se libera solo dentro del ROLLBACK.
  await db.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE estado IN ('preparacion','entrega')");
  await rutas.cambiarEstadoCiclo(proximo.id, { estado: 'preparacion', estadoAnterior: 'preventa' });
  assert.equal((await preventa.resolver(cuenta, t)).estado, 'preparacion');
  await assert.rejects(preventa.preparar(cliente.id, proximo.id), e => e.status === 409);
  await carrito.ponerCantidad(cuenta, producto, 1);
  const p = await portal.crearPedido(cuenta, { preventaToken: t });
  assert.equal(p.ciclo.id, proximo.id); assert.equal(p.anticipado, false);
  await rutas.cambiarEstadoCiclo(proximo.id, { estado: 'entrega', estadoAnterior: 'preparacion' });
  await rutas.cambiarEstadoCiclo(proximo.id, { estado: 'cerrado', estadoAnterior: 'entrega' });
  await assert.rejects(preventa.resolver(cuenta, t), e => e.status === 409);
  await carrito.ponerCantidad(cuenta, producto, 1);
  await assert.rejects(portal.crearPedido(cuenta, { cicloId: proximo.id, preventaToken: t }), e => e.status === 409);
  assert.equal((await carrito.obtenerCarrito(cuenta)).lineas[0].cantidad, 1);
  assert.equal((await portal.detallePedido(cuenta, p.id)).ciclo.id, proximo.id);
});
caso('cancelar el ciclo invalida el enlace aunque la cuenta continúe activa', async () => {
  const t = preventa.crearToken(cliente.id, actual.id);
  await rutas.cambiarEstadoCiclo(actual.id, { estado: 'cancelado', estadoAnterior: 'preventa' });
  await assert.rejects(preventa.resolver(cuenta, t), e => e.status === 409);
});
