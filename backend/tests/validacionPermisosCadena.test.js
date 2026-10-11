/** ACL por HTTP real: datos propios, tokens en memoria y rutas sin dobles. */
const { before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const tx = require('./fixtures/transaccionCadena')();
const fixture = require('./fixtures/contextoCadena');
let server, base;
const modulos = ['clientes', 'facturacion', 'facturas-bodega', 'reporte-clientes', 'reporte-proveedores', 'revision-precios', 'entregas', 'configuracion'];
const tablas = ['cliente','ruta_cliente','ciclo_ruta','ciclo_ruta_cliente','pedido_cliente','factura','factura_linea','faltantes','orden_compra_ciclo','orden_compra_ciclo_envio','orden_compra_ciclo_recepcion','orden_compra_ciclo_cierre','compra','compra_linea','inventario_saldo','movimiento_inventario','entrega_evento','bitacora_cambio'];
if (tx.activo) {
  before(async () => {
    const app = require('express')();
    app.use(require('express').json());
    app.use('/api', require('../src/modules/auth/auth.middleware').requireAuth);
    app.use('/api', require('../src/modules/usuarios/permisos.middleware').requirePermiso);
    const portal = require('../src/modules/portal-clientes/portal-clientes.routes');
    for (const [ruta, router] of [
      ['/clientes', require('../src/modules/clientes/clientes.routes').routes],
      ['/portal-clientes', portal.rutasPersonal], ['/portal', portal.rutasCliente],
      ['/facturacion', require('../src/modules/facturacion/facturacion.routes')],
      ['/bodega', require('../src/modules/warehouse/warehouse.routes')],
      ['/reportes', require('../src/modules/reports/report.routes')],
      ['/orden-compra', require('../src/modules/orders-whatsapp/orders-whatsapp.routes')],
      ['/compras', require('../src/modules/compras/compras.routes')],
      ['/entregas', require('../src/modules/entregas/entregas.routes')]
    ]) app.use('/api' + ruta, router);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = 'http://127.0.0.1:' + server.address().port + '/api';
  });
  after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
}
const token = id => require('jsonwebtoken').sign({ sub: String(id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
async function usuarios(d) {
  const u = { admin: { id: d.actor, token: token(d.actor) } };
  for (const modulo of [...modulos, 'ninguno']) {
    const id = (await tx.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ permiso cadena','ZZ no login') RETURNING id", ['zz-' + randomUUID()])).rows[0].id;
    if (modulo !== 'ninguno') await tx.query('INSERT INTO usuario_modulo(usuario_id,modulo,otorgado_por) VALUES($1,$2,$3)', [id, modulo, d.actor]);
    u[modulo] = { id, token: token(id) };
  }
  return u;
}
async function pedir(path, credencial, metodo = 'GET', body) {
  const r = await fetch(base + path, { method: metodo, headers: {
    ...(credencial ? { Authorization: 'Bearer ' + credencial } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const bytes = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, json: r.headers.get('content-type')?.includes('json') ? JSON.parse(bytes) : null, bytes };
}
function lecturas(d) {
  const cy = '?cicloId=' + d.actual.id, o = '/orden-compra/por-ciclo/' + d.ordenes[0].id, v = d.vinculos[0];
  return [
    ['clientes', '/clientes/rutas'], ['clientes', '/clientes/rutas/ciclos/' + d.actual.id],
    ['clientes', '/clientes/' + d.a.id + '/resumen'], ['clientes', '/portal-clientes/pedidos/' + d.pedidos[0]],
    ['facturacion', '/facturacion/facturas/' + d.facturas[0]], ['facturacion', '/facturacion/facturas/' + d.facturas[0] + '/pdf'],
    ['facturas-bodega', '/bodega/ciclos'], ['facturas-bodega', '/bodega/facturas-propias' + cy],
    ['facturas-bodega', '/bodega/facturas-propias/' + d.facturas[0] + '/estados'],
    ['reporte-clientes', '/reportes/faltantes/cliente/ciclos'], ['reporte-clientes', '/reportes/faltantes/cliente' + cy],
    ['reporte-clientes', '/reportes/faltantes/cliente/exportar' + cy],
    ['reporte-proveedores', '/reportes/faltantes/proveedor/ciclos'],
    ['reporte-proveedores', '/reportes/faltantes/proveedor/necesidades' + cy],
    ['reporte-proveedores', '/reportes/faltantes/proveedor/necesidades/exportar' + cy],
    ['reporte-proveedores', '/orden-compra/por-ciclo' + cy], ['reporte-proveedores', o],
    ['reporte-proveedores', o + '/recepciones'], ['reporte-proveedores', o + '/cierre'],
    ['reporte-proveedores', o + '/facturas'], ['reporte-proveedores', o + '/exportar'],
    ['reporte-proveedores', o + '/envios/' + d.ordenes[0].envios[0].id + '/pdf'],
    ['reporte-proveedores', o + '/facturas/' + v.vinculo + '/pdf/' + v.pdfId],
    ['entregas', '/entregas/ciclos'], ['entregas', '/entregas/plan' + cy],
    ['entregas', '/entregas/paradas/rc-' + d.actual.clientes[0].id + cy],
    ['entregas', '/entregas/facturas/' + d.facturas[0] + '/registro'], ['entregas', '/entregas/exportar' + cy]
  ];
}
tx.caso('matriz de lecturas: ocho módulos, admin y sin módulo; PDF/Excel/Maps no se prestan', async d => {
  const u = await usuarios(d), antes = await tx.huellas(tablas);
  for (const [dueno, ruta] of lecturas(d)) {
    assert.equal((await pedir(ruta)).status, 401, ruta);
    for (const [rol, persona] of Object.entries(u)) {
      assert.equal((await pedir(ruta, persona.token)).status, ['admin', dueno].includes(rol) ? 200 : 403, rol + ' ' + ruta);
    }
    // Express ignora el caso del nombre de ruta, pero la clave tipada de una
    // parada sigue siendo dato del negocio y conserva su formato rc-.
    const variante = ruta.split('?')[0].toUpperCase().replace('/RC-', '/rc-') + '/' + (ruta.includes('?') ? '?' + ruta.split('?')[1] : '');
    assert.equal((await pedir(variante, u.ninguno.token)).status, 403, variante);
    assert.equal((await pedir(variante, u[dueno].token)).status, 200, variante);
  }
  assert.deepEqual(await tx.huellas(tablas), antes);
  assert.equal(d.transportes.length, 3);
});
tx.caso('escrituras rechazan permisos ajenos antes de validar o mutar; tampoco por mayúsculas', async d => {
  const u = await usuarios(d), o = '/orden-compra/por-ciclo/' + d.ordenes[0].id;
  const fisico = await fixture.solicitudFisica(d, 0, 'carga', 1);
  const p = await d.s.recepcion.consultar(d.ordenes[0].id);
  const rcp = { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, final: false, motivos: [], lineas: [{ lineaId: p.lineas[0].id, cantidad: 2 }] };
  const escrituras = [
    ['clientes','PUT','/clientes/' + d.a.id,{ nombre: 'ZZ cambio prohibido' }],
    ['clientes','PUT','/clientes/rutas/' + d.ruta.id + '/orden',{}],
    ['clientes','PATCH','/clientes/rutas/ciclos/' + d.actual.id + '/estado',{ estado: 'cerrado', estadoAnterior: 'entrega' }],
    ['clientes','POST','/portal-clientes/pedidos/' + d.pedidos[0] + '/facturar',{}],
    ['facturacion','PUT','/facturacion/facturas/' + d.facturas[0],{}],
    ['facturas-bodega','POST','/bodega/facturas-propias/' + d.facturas[0] + '/estado',{ estado: 'procesado' }],
    ['facturas-bodega','POST','/bodega/facturas-propias/' + d.facturas[0] + '/faltantes',{ items: [] }],
    ['reporte-clientes','POST','/reportes/faltantes/cliente/facturas/' + d.facturas[0] + '/impresion',{}],
    ['reporte-proveedores','POST','/orden-compra/por-ciclo',{}], ['reporte-proveedores','PUT',o,{}],
    ['reporte-proveedores','PATCH',o + '/estado',{}], ['reporte-proveedores','POST',o + '/envios',{}],
    ['reporte-proveedores','POST',o + '/envios/' + d.ordenes[0].envios[0].id + '/enviar',{ confirmar: true }],
    ['reporte-proveedores','POST',o + '/facturas',{}],
    ['reporte-proveedores','POST',o + '/facturas/' + d.vinculos[0].vinculo + '/pdf',{ tipo: 'representacion_buzon' }],
    ['reporte-proveedores','POST',o + '/recepciones',rcp], ['reporte-proveedores','POST',o + '/cierre',{}],
    ['revision-precios','POST','/compras/registrar',{ facturaId: d.vinculos[0].id }],
    ['entregas','POST','/entregas/facturas/' + d.facturas[0] + '/eventos',fisico]
  ];
  const antes = await tx.huellas(tablas);
  for (const [dueno, metodo, ruta, body] of escrituras) {
    assert.equal((await pedir(ruta, null, metodo, body)).status, 401, ruta);
    for (const [rol, persona] of Object.entries(u)) if (!['admin', dueno].includes(rol)) {
      assert.equal((await pedir(ruta, persona.token, metodo, body)).status, 403, rol + ' ' + ruta);
    }
    assert.equal((await pedir(ruta.toUpperCase() + '/', u.ninguno.token, metodo, body)).status, 403, ruta);
  }
  assert.deepEqual(await tx.huellas(tablas), antes); assert.equal(d.transportes.length, 3);
});
tx.caso('chofer registra con su actor; revocar módulo o desactivar impide incluso reintentos', async d => {
  const u = await usuarios(d), path = '/entregas/facturas/' + d.facturas[0] + '/eventos';
  const body = { ...await fixture.solicitudFisica(d, 0, 'carga', 1), usuarioId: d.actor, fecha: '2000-01-01' };
  let r = await pedir(path, u.entregas.token, 'POST', body); assert.equal(r.status, 200);
  assert.equal(r.json.data.historial.at(-1).usuarioId, u.entregas.id);
  assert.equal((await pedir(path, u.entregas.token, 'POST', body)).json.data.version, r.json.data.version);
  const antes = await tx.huellas(tablas);
  await tx.query('DELETE FROM usuario_modulo WHERE usuario_id=$1', [u.entregas.id]);
  assert.equal((await pedir(path, u.entregas.token, 'POST', body)).status, 403);
  await tx.query('UPDATE usuario SET activo=FALSE WHERE id=$1', [u.entregas.id]);
  assert.equal((await pedir(path, u.entregas.token, 'POST', body)).status, 401);
  assert.deepEqual(await tx.huellas(tablas), antes);
});
tx.caso('corrección física requiere admin aun con Entregas; /eventos no admite revisión', async d => {
  const u = await usuarios(d), p = await d.s.fisico.consultar(d.facturas[0]);
  const body = { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, accion: 'revision', motivo: 'ZZ supervisor comprobó carga real', lineas: [{ numeroLinea: 1, cargada: 2, entregada: 1, descargada: 0 }] };
  const path = '/entregas/facturas/' + d.facturas[0] + '/revision';
  assert.equal((await pedir(path, u.entregas.token, 'POST', body)).status, 403);
  assert.equal((await pedir(path.toUpperCase() + '/', u.entregas.token, 'POST', body)).status, 403);
  assert.equal((await pedir(path.replace('/revision', '/eventos'), u.admin.token, 'POST', body)).status, 400);
  const r = await pedir(path, u.admin.token, 'POST', body); assert.equal(r.status, 200);
  assert.equal(r.json.data.lineas[0].enCamion, 1); assert.equal(r.json.data.historial.at(-1).usuarioId, d.actor);
});
tx.caso('recepción autorizada acredita delta propio y conserva actor; no abre compra ni Clientes', async d => {
  const u = await usuarios(d), p = await d.s.recepcion.consultar(d.ordenes[0].id);
  const saldo = Number((await tx.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1', [d.producto])).rows[0].existencia);
  const body = { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, final: false, motivos: [], usuarioId: d.actor, lineas: [{ lineaId: p.lineas[0].id, cantidad: 2 }] };
  const path = '/orden-compra/por-ciclo/' + d.ordenes[0].id + '/recepciones';
  assert.equal((await pedir(path, u['revision-precios'].token, 'POST', body)).status, 403);
  const r = await pedir(path, u['reporte-proveedores'].token, 'POST', body); assert.equal(r.status, 201); assert.equal(r.json.data.comparacion[0].recibido, 6);
  assert.equal(Number((await tx.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1', [d.producto])).rows[0].existencia), saldo + 2);
  assert.equal((await tx.query('SELECT usuario_id FROM orden_compra_ciclo_recepcion WHERE id=$1', [body.clave])).rows[0].usuario_id, u['reporte-proveedores'].id);
  assert.equal((await pedir('/compras/registrar', u['reporte-proveedores'].token, 'POST', { facturaId: d.vinculos[0].id })).status, 403);
  assert.equal((await pedir('/clientes/' + d.a.id + '/resumen', u['reporte-proveedores'].token)).status, 403);
});
tx.caso('tokens vencidos/inactivos/clientes no abren operaciones internas; portal conserva frontera', async d => {
  const u = await usuarios(d), jwt = require('jsonwebtoken');
  const vencido = jwt.sign({ sub: String(d.actor), exp: 1 }, process.env.JWT_SECRET);
  const cliente = require('../src/modules/portal-clientes/portal-clientes.auth').firmarToken({ id: d.cuenta, cliente_id: d.a.id, nombre: d.a.nombre });
  const rutas = ['/clientes/' + d.a.id + '/resumen','/facturacion/facturas/' + d.facturas[0],
    '/orden-compra/por-ciclo/' + d.ordenes[0].id + '/envios/' + d.ordenes[0].envios[0].id + '/pdf',
    '/entregas/facturas/' + d.facturas[0] + '/registro'];
  await tx.query('UPDATE usuario SET activo=FALSE WHERE id=$1', [d.actor]); const antes = await tx.huellas(tablas);
  for (const ruta of rutas) for (const t of [vencido, cliente, u.admin.token]) assert.equal((await pedir(ruta, t)).status, 401);
  assert.equal((await pedir('/portal/pedidos', u.entregas.token)).status, 401);
  assert.equal((await pedir('/portal/pedidos/' + d.pedidos[0], cliente)).status, 200);
  assert.equal((await pedir('/portal/pedidos/' + d.pedidos[1], cliente)).status, 404);
  assert.deepEqual(await tx.huellas(tablas), antes);
});
