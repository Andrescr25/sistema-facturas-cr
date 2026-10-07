/** Transacciones/conexiones reales; fixtures COMMIT exclusivamente en el clon. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('./fixtures/contextoCadena');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
let db;
if (activo) {
  require('../config/aislado').asegurarBaseLocal();
  assert.ok(process.env.NODE_TEST_CONTEXT);
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  db = require('../config/database');
  after(() => db.pool.end());
}
const caso = (nombre, fn) => test(nombre, { skip: !activo }, async () => {
  let d;
  try { d = await fixture.crear(db, { prepararFisico: false }); await fn(d); }
  finally { d?.liberar(); }
});
const saldo = async d => Number((await db.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1', [d.producto])).rows[0].existencia);
const necesidad = async (d, cicloId) => {
  const n = (await d.s.necesidades.listar({ cicloId, q: 'P-' + d.producto })).productos.find(p => p.productoId === d.producto);
  // Stock general cambia al recibir; demanda/cobertura/físico de otra semana
  // permanecen iguales. No convertir ese saldo general en una reserva.
  const { stock, ...semana } = n; return semana;
};
async function recepcion(d, cantidad = 2) {
  const p = await d.s.recepcion.consultar(d.ordenes[0].id);
  return { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, final: false, motivos: [], lineas: [{ lineaId: p.lineas[0].id, cantidad }] };
}
async function cierre(d) {
  const p = await d.s.cierre.consultar(d.ordenes[0].id);
  return { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, motivo: 'ZZ proveedor confirmó cierre de este saldo' };
}
async function ganador(operaciones) {
  const rs = await Promise.allSettled(operaciones);
  assert.equal(rs.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(rs.find(x => x.status === 'rejected').reason.status, 409);
  return rs.findIndex(x => x.status === 'fulfilled');
}
caso('misma recepción concurrente en cadena completa: un evento y una sola entrada de dos', async d => {
  const otro = (await db.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ segundo receptor','ZZ no login') RETURNING id", ['zz-' + randomUUID()])).rows[0].id;
  await db.query('INSERT INTO usuario_modulo(usuario_id,modulo,otorgado_por) VALUES($1,$2,$3)', [otro, 'reporte-proveedores', d.actor]);
  const b = await recepcion(d), antes = await saldo(d), siguiente = await necesidad(d, d.proximo.id);
  const rs = await Promise.all([d.s.recepcion.registrar(d.ordenes[0].id, b, d.actor), d.s.recepcion.registrar(d.ordenes[0].id, b, otro)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(await saldo(d), antes + 2);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_recepcion WHERE id=$1', [b.clave])).rows[0].n, 1);
  assert.ok([d.actor, otro].includes((await db.query('SELECT usuario_id FROM orden_compra_ciclo_recepcion WHERE id=$1', [b.clave])).rows[0].usuario_id));
  assert.equal(rs[0].comparacion[0].recibido, 6); assert.deepEqual(await necesidad(d, d.proximo.id), siguiente);
  await assert.rejects(d.s.recepcion.registrar(d.ordenes[0].id, { ...b, lineas: [{ ...b.lineas[0], cantidad: 3 }] }, d.actor), e => e.status === 409);
});
caso('dos recepciones distintas observan la misma versión: una gana sin tocar próxima semana', async d => {
  const b = await recepcion(d), antes = await saldo(d), siguiente = await necesidad(d, d.proximo.id);
  await ganador([d.s.recepcion.registrar(d.ordenes[0].id, b, d.actor), d.s.recepcion.registrar(d.ordenes[0].id, { ...b, clave: randomUUID() }, d.actor)]);
  assert.equal(await saldo(d), antes + 2); assert.equal((await d.s.recepcion.consultar(d.ordenes[0].id)).historial.length, 2);
  assert.deepEqual(await necesidad(d, d.proximo.id), siguiente);
});
caso('recepción y cierre compiten con compras previas: conserva exclusivamente el ganador', async d => {
  const c = await cierre(d), r = await recepcion(d), antes = await saldo(d), siguiente = await necesidad(d, d.proximo.id);
  const quien = await ganador([d.s.cierre.cerrar(d.ordenes[0].id, c, d.actor), d.s.recepcion.registrar(d.ordenes[0].id, r, d.actor)]);
  assert.equal(await saldo(d), antes + (quien === 1 ? 2 : 0));
  const n = await necesidad(d, d.actual.id); assert.equal(Number(n.cantidades.recibido), quien === 1 ? 6 : 4);
  assert.equal(Number(n.cantidades.sinCobertura), quien === 1 ? 0 : 6);
  assert.deepEqual(await necesidad(d, d.proximo.id), siguiente);
});
caso('mismo cierre concurrente libera una vez sin perder recepción, PDF o el otro ciclo', async d => {
  const b = await cierre(d), antes = await saldo(d), siguiente = await necesidad(d, d.proximo.id);
  const pdf = (await d.s.envio.descargar(d.ordenes[0].id, d.ordenes[0].envios[0].id)).pdf;
  const rs = await Promise.all([d.s.cierre.cerrar(d.ordenes[0].id, b, d.actor), d.s.cierre.cerrar(d.ordenes[0].id, b, d.actor)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(await saldo(d), antes);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_cierre WHERE orden_id=$1', [d.ordenes[0].id])).rows[0].n, 1);
  assert.equal(Number((await necesidad(d, d.actual.id)).cantidades.sinCobertura), 6);
  assert.deepEqual((await d.s.envio.descargar(d.ordenes[0].id, d.ordenes[0].envios[0].id)).pdf, pdf);
  assert.deepEqual(await necesidad(d, d.proximo.id), siguiente);
});
caso('cargas anticipadas con misma clave, o claves distintas de igual versión, no se suman dos veces', async d => {
  const b = await fixture.solicitudFisica(d, 0, 'carga', '0.3'), antes = await saldo(d);
  const rs = await Promise.all([d.s.fisico.registrar(d.facturas[0], b, d.actor), d.s.fisico.registrar(d.facturas[0], b, d.actor)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(rs[0].lineas[0].enCamion, 0.3);
  const otra = await fixture.solicitudFisica(d, 0, 'carga', 1);
  await ganador([d.s.fisico.registrar(d.facturas[0], otra, d.actor), d.s.fisico.registrar(d.facturas[0], { ...otra, clave: randomUUID() }, d.actor)]);
  const p = await d.s.fisico.consultar(d.facturas[0]); assert.equal(p.lineas[0].enCamion, 1.3); assert.equal(p.historial.length, 2); assert.equal(await saldo(d), antes);
  assert.equal((await d.s.fisico.consultar(d.facturas[2])).version, 0);
});
caso('respuesta física perdida tras cambio de maestro reconoce original; dato diferente409', async d => {
  const b = await fixture.solicitudFisica(d, 0, 'carga', 1), antes = await saldo(d);
  await d.s.fisico.registrar(d.facturas[0], b, d.actor); await fixture.mover(d, { promover: false });
  const rs = await Promise.all([d.s.fisico.registrar(d.facturas[0], b, d.actor), d.s.fisico.registrar(d.facturas[0], b, d.actor)]);
  assert.deepEqual(rs[0], rs[1]); assert.equal(rs[0].historial.length, 1); assert.equal(rs[0].ciclo.id, d.actual.id);
  await assert.rejects(d.s.fisico.registrar(d.facturas[0], { ...b, lineas: [{ numeroLinea: 1, cantidad: 2 }] }, d.actor), e => e.status === 409);
  assert.equal(await saldo(d), antes); assert.equal(d.transportes.length, 3);
});
async function nuevaCopia(d) {
  const pedido = (await d.s.agente.crear(d.actor, { clienteId: d.a.id, cicloId: d.actual.id, claveIdempotencia: randomUUID(), lineas: [{ productoId: d.producto, cantidad: 3 }] })).pedido;
  const id = (await d.s.pedidos.facturar(pedido.id, d.actor)).facturaId;
  await d.s.bodega.registrarFaltantes(id, [{ producto_id: d.producto, cantidad_faltante: 3, tipo_faltante: 'parcial' }], 'ZZ nueva necesidad');
  await db.query('UPDATE faltantes SET proveedor_asignado=$2,proveedor_cedula=$3 WHERE factura_propia_id=$1', [id, d.proveedor.nombre, d.proveedor.identificacion]);
  let o = await d.s.ordenes.crear({ proveedorId: d.proveedor.id, cicloId: d.actual.id, clave: randomUUID(), lineas: [{ productoId: d.producto, cantidadProveedor: 3 }] }, d.actor);
  o = await d.s.ordenes.cambiarEstado(o.id, { version: o.version, estado: 'pendiente_enviar' }, d.actor);
  return d.s.envio.preparar(o.id, { version: o.version, clave: randomUUID(), telefono: '88888888', mensaje: 'ZZ adicional ' + o.referencia }, d.actor);
}
caso('envío concurrente adicional: intento visible antes del transporte y copia enviada una sola vez', async d => {
  const o = await nuevaCopia(d), copia = o.envios[0], original = await d.s.ordenes.obtener(d.ordenes[0].id);
  let entrar, soltar; const entro = new Promise(r => { entrar = r; }), pausa = new Promise(r => { soltar = r; });
  require('../src/integrations/whatsapp').enviarDocumento = async doc => {
    d.transportes.push(doc); entrar(); await pausa; return { enviado: true, numero: doc.telefono, via: 'interno' };
  };
  const primero = d.s.envio.enviar(o.id, copia.id, { confirmar: true }, d.actor);
  await Promise.race([entro, primero.then(() => { throw Error('El envío no llegó al transporte simulado.'); })]);
  try {
    assert.equal((await db.query('SELECT estado FROM orden_compra_ciclo_envio WHERE id=$1', [copia.id])).rows[0].estado, 'enviando');
    assert.equal((await d.s.envio.enviar(o.id, copia.id, { confirmar: true }, d.actor)).envios[0].estado, 'enviando');
    assert.equal(d.transportes.length, 4);
  } finally { soltar(); }
  assert.equal((await primero).estado, 'enviada'); assert.equal(d.transportes.length, 4);
  assert.deepEqual(await d.s.ordenes.obtener(d.ordenes[0].id), original);
});
caso('consulta de cadena usa realmente READ ONLY/REPEATABLE READ sobre conexiones separadas', async d => {
  const connect = db.pool.connect.bind(db.pool), observados = [];
  db.pool.connect = async () => {
    const c = await connect(), q = c.query.bind(c), release = c.release.bind(c);
    c.query = async (sql, p) => { const r = await q(sql, p);
      if (sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY') observados.push([
        (await q('SHOW transaction_read_only')).rows[0].transaction_read_only,
        (await q('SHOW transaction_isolation')).rows[0].transaction_isolation]); return r; };
    c.release = () => { c.query = q; c.release = release; release(); }; return c;
  };
  try { await d.s.fisico.consultar(d.facturas[0]); await necesidad(d, d.proximo.id); }
  finally { db.pool.connect = connect; }
  assert.deepEqual(observados, [['on','repeatable read'], ['on','repeatable read']]);
});
