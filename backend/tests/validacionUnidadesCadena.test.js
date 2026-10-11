/** Unidades propias del pedido/físico frente a cajas del proveedor y su costo. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const tx = require('./fixtures/transaccionCadena')();
const fixture = require('./fixtures/contextoCadena');
const saldo = async d => Number((await tx.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1', [d.producto])).rows[0].existencia);
const necesidad = async (d, cy = d.actual.id) => (await d.s.necesidades.listar({ cicloId: cy, q: 'P-' + d.producto })).productos.find(p => p.productoId === d.producto);
const inmutables = ['factura','factura_linea','pedido_cliente','faltantes','orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_factura','orden_compra_ciclo_factura_pdf','compra','compra_linea'];

tx.caso('cajas de seis: 10 requeridas compran 12, excedente no cubre la próxima ruta', async d => {
  const o = d.ordenes[0], l = o.lineas[0], n = await necesidad(d), proximo = await necesidad(d, d.proximo.id);
  assert.equal(l.cantidad_proveedor, 2); assert.equal(l.factor_conversion, 6); assert.equal(l.cantidad_propia, 12);
  assert.equal(l.origenes.reduce((sum, x) => sum + Number(x.cantidad), 0), 10);
  assert.equal(Number(n.cantidades.solicitado), 12); assert.equal(Number(n.cantidades.recibido), 4); assert.equal(Number(n.cantidades.pendienteRecibir), 8);
  assert.equal(Number(proximo.cantidades.solicitado), 6); assert.equal(Number(proximo.cantidades.recibido), 1); assert.equal(Number(proximo.cantidades.cubierta), 4);
  const antes = await saldo(d), fotos = await tx.huellas(inmutables);
  const final = await fixture.recibir(d, 0, 8, true);
  assert.equal(final.comparacion[0].recibido, 12); assert.equal(await saldo(d), antes + 8);
  const { stock: stockAnterior, ...semanaAnterior } = proximo;
  const { stock: stockActual, ...semanaActual } = await necesidad(d, d.proximo.id);
  // El saldo físico es general; lo que no se traslada son demanda/cobertura
  // y recepciones de la semana, aun cuando el stock general sí aumenta.
  assert.deepEqual(semanaActual, semanaAnterior); assert.deepEqual(await tx.huellas(inmutables), fotos);
  assert.equal(Number((await tx.query('SELECT SUM(cobertura) q FROM orden_compra_ciclo_cobertura WHERE orden_id=$1', [o.id])).rows[0].q), 10);
}, { factor: 6 });
tx.caso('factor 0,02: 500 proveedor son 10 propias, recepción no multiplica dos veces', async d => {
  const l = d.ordenes[0].lineas[0]; assert.equal(l.cantidad_proveedor, 500); assert.equal(l.cantidad_propia, 10);
  const compra = (await tx.query('SELECT cantidad,factor_conversion,cantidad_propia FROM compra_linea WHERE compra_id=(SELECT id FROM compra WHERE factura_proveedor_id=$1)', [d.vinculos[0].id])).rows[0];
  assert.equal(Number(compra.cantidad), 500); assert.equal(Number(compra.factor_conversion), 0.02); assert.equal(Number(compra.cantidad_propia), 10);
  const costo = (await tx.query("SELECT costo_unitario FROM movimiento_inventario WHERE origen_tipo='compra' AND origen_id=(SELECT id FROM compra WHERE factura_proveedor_id=$1)", [d.vinculos[0].id])).rows[0];
  assert.equal(Number(costo.costo_unitario), 500);
  const antes = await saldo(d); await fixture.recibir(d, 0, 6, true); assert.equal(await saldo(d), antes + 6);
  assert.equal(Number((await necesidad(d)).cantidades.recibido), 10);
}, { factor: 0.02 });
tx.caso('conversión guardada sobrevive a cambiar mapping/producto y completar la recepción', async d => {
  const foto = await tx.huellas(inmutables), antes = await saldo(d);
  await tx.query('UPDATE supplier_product_mapping SET factor_conversion=100 WHERE id=$1', [d.mapping]);
  await tx.query("UPDATE producto SET nombre='ZZ nombre posterior',precio_sin_iva=999 WHERE id=$1", [d.producto]);
  const r = await fixture.recibir(d, 0, 8, true); assert.equal(r.lineas[0].factor_conversion, '6.000000');
  assert.equal(r.comparacion[0].recibido, 12); assert.equal(await saldo(d), antes + 8);
  assert.deepEqual(await tx.huellas(inmutables), foto);
  assert.equal((await d.s.ordenes.obtener(d.ordenes[0].id)).lineas[0].factor_conversion, 6);
}, { factor: 6 });
tx.caso('recepciones 0,1 + 0,2 y carga/entrega fraccionaria conservan cantidades sin residuos', async d => {
  const antes = await saldo(d); await fixture.recibir(d, 0, '0.1'); await fixture.recibir(d, 0, '0.2');
  assert.equal(await saldo(d), Number((antes + 0.3).toFixed(4)));
  assert.equal(Number((await necesidad(d)).cantidades.recibido), 4.3);
  const stock = await saldo(d); await fixture.evento(d, 1, 'carga', '0.3'); await fixture.evento(d, 1, 'entrega', '0.1');
  const r = await fixture.evento(d, 1, 'descarga', '0.2', 'ZZ fracción restante devuelta');
  assert.equal(r.lineas[0].enCamion, 0); assert.equal(r.lineas[0].entregada, 0.1);
  assert.equal(await saldo(d), stock); assert.equal(Number((await necesidad(d)).cantidades.comprometido), 8.9);
});
tx.caso('línea de otra orden, booleanos, precisión y excesos se rechazan sin compras/eventos', async d => {
  const antes = await tx.huellas([...inmutables, 'orden_compra_ciclo','orden_compra_ciclo_recepcion','entrega_evento','inventario_saldo','movimiento_inventario']);
  const p = await d.s.recepcion.consultar(d.ordenes[0].id), otra = await d.s.recepcion.consultar(d.ordenes[1].id);
  const base = { version: p.version, revision: p.revision, confirmar: true, final: false, motivos: [] };
  for (const [lineaId, cantidad, status] of [[otra.lineas[0].id,1,409],[p.lineas[0].id,true,400],[p.lineas[0].id,'0.00001',400],[p.lineas[0].id,7,409]]) {
    await assert.rejects(d.s.recepcion.registrar(d.ordenes[0].id, { ...base, clave: randomUUID(), lineas: [{ lineaId, cantidad }] }, d.actor), e => e.status === status);
  }
  const b = await fixture.solicitudFisica(d, 0, 'carga', 1);
  for (const cantidad of [true,'0.00001',-1,4]) await assert.rejects(d.s.fisico.registrar(d.facturas[0], { ...b, clave: randomUUID(), lineas: [{ numeroLinea: 1, cantidad }] }, d.actor), e => e.status === 400);
  assert.deepEqual(await tx.huellas([...inmutables, 'orden_compra_ciclo','orden_compra_ciclo_recepcion','entrega_evento','inventario_saldo','movimiento_inventario']), antes);
});
tx.caso('cierre con cajas conserva recibido propio y libera saldo del origen, sin stock extra', async d => {
  const n = await necesidad(d, d.proximo.id), stock = await saldo(d), p = await d.s.cierre.consultar(d.ordenes[0].id);
  const r = await d.s.cierre.cerrar(d.ordenes[0].id, { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, motivo: 'ZZ proveedor confirmó no completar esta compra' }, d.actor);
  assert.equal(r.orden.lineas[0].cantidad_proveedor, 2); assert.equal(r.orden.lineas[0].cantidad_propia, 12);
  const actual = await necesidad(d); assert.equal(Number(actual.cantidades.recibido), 4); assert.equal(Number(actual.cantidades.sinCobertura), 6); assert.equal(Number(actual.cantidades.pendienteRecibir), 0);
  assert.equal(await saldo(d), stock); assert.deepEqual(await necesidad(d, d.proximo.id), n);
}, { factor: 6 });
