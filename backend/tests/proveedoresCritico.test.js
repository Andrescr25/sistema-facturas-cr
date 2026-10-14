/** Reporte de compras: una decisión final del cliente no vuelve a pedir
 * productos. PostgreSQL local, fixtures propios y BEGIN/ROLLBACK; nunca
 * ejecuta limpieza ni envía documentos o mensajes.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo = process.env.PROBAR_BASE_LOCAL === '1';

describe('Reporte Proveedores: compras pendientes e identidad de cada factura', { skip: !activo }, () => {
  let pool, c, f, reporte, bodega, ajustes, cola, notas, clientes;
  const guardar = (lineas, facturaId = f.facturas[0]) => bodega.registrarFaltantes(facturaId,
    lineas.map(([i, cantidad]) => ({ producto_id: f.productos[i], cantidad_faltante: cantidad, tipo_faltante: 'parcial' })));
  const faltanteId = async (i = 0, facturaId = f.facturas[0]) =>
    (await c.query('SELECT id FROM faltantes WHERE factura_propia_id=$1 AND producto_propio_id=$2', [facturaId, f.productos[i]])).rows[0].id;
  const revisar = async (estado, cantidadEntregada, revisado = true, i = 0) =>
    ajustes.saveAdjustment({ faltanteId: await faltanteId(i), estado, cantidadEntregada, revisado });
  const proveedor = async () => {
    const r = await reporte.getMissingItemsBySupplier(null, { incluirEnviadas: false });
    assert.equal(r.success, true, r.error);
    return r.data.find(p => p.cedula === f.p.identificacion);
  };
  const huella = async () => (await c.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM faltantes x WHERE factura_propia_id=ANY($1::int[])) faltantes,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM orden_compra_ciclo x WHERE proveedor_id=$2) ordenes,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM orden_compra_ciclo_linea x
      WHERE orden_id IN (SELECT id FROM orden_compra_ciclo WHERE proveedor_id=$2)) lineas,
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM orden_compra_ciclo_origen x
      WHERE linea_id IN (SELECT l.id FROM orden_compra_ciclo_linea l JOIN orden_compra_ciclo o ON o.id=l.orden_id WHERE o.proveedor_id=$2)) origenes`,
  [f.facturas, f.p.id])).rows[0];

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect(); await c.query('BEGIN');
    const db = baseEnTransaccion(c, 'critico'), ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    reporte = new (require('../src/modules/reports/report.service'))();
    bodega = require('../src/modules/warehouse/bodegaPropia');
    ajustes = require('../src/modules/missing-items/missing-items.service');
    cola = require('../src/modules/reprinting/colaImpresion');
    notas = require('../src/modules/reports/notasDeFaltantes');
    clientes = require('../src/modules/reports/reporteClientes.service');
  });
  beforeEach(async () => { await c.query('SAVEPOINT caso_critico'); f = await sembrar(c); });
  afterEach(async () => { await c.query('ROLLBACK TO SAVEPOINT caso_critico'); });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release(); } await pool?.end(); });

  test('pendientes conservan cantidad y procedencia exacta, sin modificar compras al consultar', async () => {
    await guardar([[0, 6], [1, 4]]);
    const antes = await huella(), p = await proveedor();
    assert.equal(p.total_cantidad, 10);
    assert.deepEqual(new Map(p.productos_faltantes.map(x => [x.producto_id, x.cantidad_faltante])),
      new Map([[f.productos[0], 6], [f.productos[1], 4]]));
    for (const x of p.productos_faltantes) {
      assert.equal(x.origenes.length, 1);
      assert.equal(x.origenes[0].facturaId, f.facturas[0]);
      assert.equal(x.origenes[0].clienteId, f.cliente.id);
      assert.equal(x.origenes[0].cliente, f.cliente.nombre);
    }
    await proveedor();
    assert.deepEqual(await huella(), antes, 'leer no cambia faltantes, asignaciones ni órdenes');
  });

  test('consultar un faltante sin asignación no elige proveedor ni crea una orden', async () => {
    await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante)
      VALUES($1,$2,6,'parcial')`, [f.facturas[0], f.productos[0]]);
    const antes = await huella(), r = await reporte.getMissingItemsBySupplier(null, { incluirEnviadas: false });
    assert.equal(r.success, true, r.error);
    const p = r.data.find(x => x.productos_faltantes.some(x => x.producto_id === f.productos[0]));
    assert.equal(p.cedula, null);
    assert.equal(p.productos_faltantes.find(x => x.producto_id === f.productos[0]).cantidad_faltante, 6);
    assert.deepEqual(await huella(), antes);
    assert.equal(antes.ordenes, null);
  });

  for (const [estado, cantidad] of [['no_llego', 0], ['parcial', 2], ['completo', 6]]) {
    test(`respuesta ${estado} revisada retira solo esa línea de la compra`, async () => {
      await guardar([[0, 6], [1, 4]]); await revisar(estado, cantidad);
      const p = await proveedor();
      assert.deepEqual(p.productos_faltantes.map(x => x.producto_id), [f.productos[1]]);
      assert.equal(p.total_cantidad, 4);
      const cliente = (await clientes.getMissingItemsByClient()).data.find(x => x.id === f.cliente.id);
      const factura = cliente.facturas_con_faltantes.find(x => x.factura_id === f.facturas[0]);
      assert.deepEqual(new Set(factura.productos_faltantes.map(x => x.producto_id)), new Set([f.productos[0], f.productos[1]]));
      assert.equal(factura.productos_faltantes.find(x => x.producto_id === f.productos[0]).ajuste_revisado, true,
        'la decisión se conserva en el reporte del cliente');
    });
  }

  test('respuesta parcial sin revisión descuenta lo entregado; reabrir permite revisar el remanente', async () => {
    await guardar([[0, 6]]); await revisar('parcial', 2, false);
    assert.equal((await proveedor()).productos_faltantes[0].cantidad_faltante, 4);
    await revisar('parcial', 2, true); assert.equal(await proveedor(), undefined);
    await revisar('parcial', 2, false);
    assert.equal((await proveedor()).productos_faltantes[0].cantidad_faltante, 4);
  });

  test('faltantes procesados son historia y no se vuelven a comprar', async () => {
    await guardar([[0, 6], [1, 4]]);
    await c.query("UPDATE faltantes SET estado='procesado' WHERE id=$1", [await faltanteId()]);
    const p = await proveedor();
    assert.deepEqual(p.productos_faltantes.map(x => x.producto_id), [f.productos[1]]);
    assert.equal((await c.query('SELECT estado FROM faltantes WHERE id=$1', [await faltanteId()])).rows[0].estado, 'procesado');
  });

  test('cola pendiente excluye toda la factura; al retirarla vuelve la necesidad no revisada', async () => {
    await guardar([[0, 6]]);
    await cola.encolarSinPendientes(f.facturas[0], { query: (sql, p) => c.query(sql, p) });
    assert.equal(await proveedor(), undefined);
    await cola.devolverAlReporte(f.facturas[0]);
    assert.equal((await proveedor()).total_cantidad, 6);
  });

  test('recuperar una factura procesada conserva su cola histórica y permite reabrir la revisión', async () => {
    await guardar([[0, 6]]); await revisar('no_llego', 0);
    await c.query("UPDATE faltantes SET estado='procesado' WHERE id=$1", [await faltanteId()]);
    await c.query(`INSERT INTO facturas_reimpresion(factura_propia_id,estado,ajustes_realizados,categoria,total_ajustes,fecha_creacion)
      VALUES($1,'procesada','[]'::jsonb,'requiere_cambios',1,NOW())`, [f.facturas[0]]);
    assert.equal(await proveedor(), undefined);
    await cola.devolverAlReporte(f.facturas[0]);
    assert.equal(await proveedor(), undefined, 'recuperar conserva la decisión hasta reabrirla');
    await revisar('no_llego', 0, false);
    assert.equal((await proveedor()).total_cantidad, 6);
    assert.equal((await c.query('SELECT estado FROM facturas_reimpresion WHERE factura_propia_id=$1', [f.facturas[0]])).rows[0].estado, 'procesada');
  });

  test('una nota parcial mantiene la compra, una completa la retira y anularla la restaura', async () => {
    await guardar([[0, 6]]);
    const nota = (await c.query("INSERT INTO nota_credito(fecha,cliente_nombre,total) VALUES('2026-10-14',$1,100) RETURNING id", [f.cliente.nombre])).rows[0].id;
    await c.query('INSERT INTO nota_credito_factura(nota_credito_id,factura_id,monto) VALUES($1,$2,20)', [nota, f.facturas[0]]);
    assert.equal((await proveedor()).total_cantidad, 6);
    await c.query('UPDATE nota_credito_factura SET monto=99.5 WHERE nota_credito_id=$1', [nota]);
    assert.equal(await proveedor(), undefined, 'aplica la misma tolerancia fiscal de medio colón');
    await c.query("UPDATE nota_credito SET estado='anulada' WHERE id=$1", [nota]);
    assert.equal((await proveedor()).total_cantidad, 6);
  });

  test('un producto histórico ajeno a la factura queda fuera del reporte y sus notas', async () => {
    await guardar([[0, 6]]);
    await c.query('DELETE FROM factura_linea WHERE factura_id=$1 AND producto_id=$2', [f.facturas[0], f.productos[0]]);
    assert.equal(await proveedor(), undefined);
    assert.equal((await notas.notasPorProducto()).porProducto[String(f.productos[0])], undefined);
    assert.equal((await c.query('SELECT count(*)::int n FROM faltantes WHERE id=$1', [await faltanteId()])).rows[0].n, 1,
      'se conserva el registro histórico, sin atribuirlo al cliente');
  });

  test('registrar un producto ajeno rechaza y revierte el cambio previo de la misma lista', async () => {
    await guardar([[1, 4]]);
    await c.query('DELETE FROM factura_linea WHERE factura_id=$1 AND producto_id=$2', [f.facturas[0], f.productos[0]]);
    const antes = await huella();
    await assert.rejects(guardar([[1, 5], [0, 6]]), e => e.status === 409);
    assert.deepEqual(await huella(), antes);
  });

  test('un faltante mayor que lo facturado rechaza y revierte faltantes y compras de la lista', async () => {
    await guardar([[1, 4]]); const antes = await huella();
    await assert.rejects(guardar([[1, 5], [0, 21]]), e => e.status === 409);
    assert.deepEqual(await huella(), antes);
  });

  test('dos clientes homónimos quedan ligados a su factura y cantidad exactas', async () => {
    await guardar([[0, 6]]);
    const otro = (await c.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING id', [f.cliente.nombre])).rows[0].id;
    const factura = (await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,total)
      VALUES($1,'emitida','2026-10-14',$2,$3,100) RETURNING id`, [`ZZ identidad ${randomUUID().slice(0, 12)}`, otro, 'ZZ nombre antiguo'])).rows[0].id;
    await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
      VALUES($1,1,$2,'ZZ compartido',20,1,20)`, [factura, f.productos[0]]);
    await guardar([[0, 3]], factura);
    const x = (await proveedor()).productos_faltantes[0];
    assert.equal(x.cantidad_faltante, 9);
    assert.deepEqual(new Map(x.origenes.map(o => [o.facturaId, [o.clienteId, Number(o.cantidad)]])),
      new Map([[f.facturas[0], [f.cliente.id, 6]], [factura, [otro, 3]]]));
    assert.ok(x.origenes.every(o => o.cliente === f.cliente.nombre), 'nombres vigentes sin adivinar fichas homónimas');
  });

  test('las notas proceden solo de líneas operativas y conservan la identidad de su factura', async () => {
    await guardar([[0, 6], [1, 4]]);
    await c.query('UPDATE factura_linea SET descripcion=$3 WHERE factura_id=$1 AND producto_id=$2', [f.facturas[0], f.productos[0], 'ZZ azul']);
    await c.query('UPDATE factura_linea SET descripcion=$3 WHERE factura_id=$1 AND producto_id=$2', [f.facturas[0], f.productos[1], 'ZZ negra']);
    let n = await notas.notasPorProducto();
    assert.deepEqual(n.porProducto[String(f.productos[0])][0].clientes, [f.cliente.nombre]);
    await revisar('no_llego', 0); n = await notas.notasPorProducto();
    assert.equal(n.porProducto[String(f.productos[0])], undefined);
    assert.equal(n.porProducto[String(f.productos[1])][0].nota, 'ZZ negra');
  });
});
