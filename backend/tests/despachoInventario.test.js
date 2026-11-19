/**
 * Facturas en Bodega corrige el inventario (2026-11-19). El usuario:
 * «Producto A sistema 4, físico 0. Cliente A pide 6 → −6; aparece cliente B
 * con 3 → −9; y si llega el domingo y nunca ingresó por Revisión de Precios,
 * estaba agotado: vuelve a 0».
 *
 * Reglas puras sin base; el resto contra la base LOCAL, en una transacción que
 * se deshace (las de los módulos se vuelven SAVEPOINT). Necesita la 080.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

describe('Bodega corrige el inventario — reglas puras', () => {
  const { existenciaFinal, marcaDe, cambiosDe } = require('../src/modules/warehouse/despachoInventario');

  test('Faltó todo o Parcial: el estante quedó vacío, queda en menos lo que se debe', () => {
    assert.equal(existenciaFinal({ marca: 'total', existenciaSistema: -2, deuda: 6 }), -6);
    assert.equal(existenciaFinal({ marca: 'parcial', existenciaSistema: 15, deuda: 4 }), -4);
    assert.equal(existenciaFinal({ marca: 'total', existenciaSistema: 3, deuda: 0 }), 0);
  });

  test('Completo: un positivo no se toca; un negativo de más sube hasta lo que se debe', () => {
    assert.equal(existenciaFinal({ marca: 'completo', existenciaSistema: 2, deuda: 0 }), 2);
    assert.equal(existenciaFinal({ marca: 'completo', existenciaSistema: -8, deuda: 6 }), -6);
    assert.equal(existenciaFinal({ marca: 'completo', existenciaSistema: -9, deuda: 9 }), -9);
  });

  test('la marca sale de las unidades: sin faltantes es Completo', () => {
    assert.deepEqual([marcaDe('completo', 0), marcaDe('parcial', 0), marcaDe('total', 6), marcaDe('parcial', 2)],
      ['completo', 'completo', 'total', 'parcial']);
  });

  test('solo cuenta lo que es nuevo o cambió', () => {
    const d = (extra) => ({ productoId: 1, existia: true, tipoAnterior: 'total', cantidadAnterior: 6, tipo: 'total', cantidadFaltante: 6, ...extra });
    assert.deepEqual(cambiosDe([d()]), [], 'la misma marca otra vez');
    assert.equal(cambiosDe([d({ cantidadFaltante: 4, tipo: 'parcial' })]).length, 1);
    assert.equal(cambiosDe([d({ existia: false, tipoAnterior: null, cantidadAnterior: 0 })]).length, 1, 'primera vez');
    assert.deepEqual(cambiosDe([d({ tipoAnterior: 'completo', cantidadAnterior: 0, tipo: 'completo', cantidadFaltante: 0 })]), []);
  });
});

describe('Bodega corrige el inventario — contra la base local', { skip: process.env.PROBAR_BASE_LOCAL !== '1' }, () => {
  let pool, db, facturas, bodega, ajustes, cola, impresion, inv, usuarioId, ficha, impuesto;
  const rutaDb = require.resolve('../config/database');

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1 });
    db = await pool.connect();
    const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');
    for (const r of Object.keys(require.cache)) if (r.includes('/src/')) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'despacho_zz') };
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    bodega = require('../src/modules/warehouse/bodegaPropia');
    ajustes = require('../src/modules/missing-items/missing-items.service');
    cola = require('../src/modules/reprinting/colaImpresion');
    impresion = require('../src/modules/reprinting/procesarImpresion');
    inv = require('../src/modules/inventario/inventario.service');
    usuarioId = (await db.query('SELECT min(id) AS id FROM usuario WHERE es_admin AND activo')).rows[0].id;
    ficha = (await db.query(`SELECT c.id FROM cliente c WHERE c.activo AND COALESCE(c.descuento_global, 0) = 0
      AND NOT EXISTS (SELECT 1 FROM ciclo_ruta_cliente x WHERE x.cliente_id = c.id) ORDER BY c.id LIMIT 1`)).rows[0];
    impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 AND activo LIMIT 1')).rows[0];
    assert.ok(usuarioId && ficha && impuesto, 'a la base local le falta un usuario, un cliente o el IVA al 13 %');
  });
  beforeEach(async () => { await db.query('BEGIN'); });
  afterEach(async () => { await db.query('ROLLBACK'); });
  after(async () => { db?.release(); await pool?.end().catch(() => {}); });

  /** Un producto ZZ nuevo, con `stock` en el kardex. */
  async function producto(stock = 4) {
    const tag = randomUUID().slice(0, 8);
    const { rows: [p] } = await db.query(`INSERT INTO producto (nombre, referencia, cabys, unidad, precio_sin_iva, costo_con_iva, impuesto_id, inventariable)
      VALUES ($1, $1, '4294401030100', 'Unid', 1000, 500, $2, TRUE) RETURNING *`, [`ZZ BODEGA ${tag}`, impuesto.id]);
    if (stock) await inv.registrarEn(db, { productoId: p.id, tipo: 'compra', cantidad: String(stock), costoUnitario: '500',
      origenTipo: 'compra', origenId: 999999, clave: `zz-despacho-${tag}` });
    return p;
  }
  const facturar = (p, cantidad) => facturas.crearFactura({ clienteId: ficha.id,
    items: [{ productoId: p.id, reference: p.referencia, name: p.nombre, quantity: cantidad, price: 1000 }] }, usuarioId);
  const marcar = (f, p, tipo, cantidadFaltante) => bodega.registrarFaltantes(f.id,
    [{ producto_id: p.id, cantidad_faltante: cantidadFaltante, tipo_faltante: tipo }], 'Bodega', usuarioId);
  const existencia = async (p) => Number((await inv.saldo(db, p.id)).existencia);
  const deBodega = async (p) => (await db.query(
    "SELECT cantidad::float, usuario_id, observaciones FROM movimiento_inventario WHERE producto_id = $1 AND tipo = 'ajuste_bodega' ORDER BY id", [p.id])).rows;

  test('el ejemplo del usuario: 4 en sistema, faltó todo 6 → −6, faltó todo 3 → −9; lo que no llegó vuelve a 0', async () => {
    const p = await producto(4);
    const a = await facturar(p, 6);
    assert.equal(await existencia(p), -2, 'hoy la factura sola deja −2');
    await marcar(a, p, 'total', 6);
    assert.equal(await existencia(p), -6);
    const b = await facturar(p, 3);
    await marcar(b, p, 'total', 3);
    assert.equal(await existencia(p), -9);
    assert.deepEqual((await deBodega(p)).map(m => m.cantidad), [-4], 'el cliente B no movió nada: ya cuadraba');

    // El domingo no ingresó: en Reporte Clientes «No llegó» y en Impresión se rebajan las dos.
    for (const f of [a, b]) {
      const { rows: [falt] } = await db.query('SELECT id FROM faltantes WHERE factura_propia_id = $1 AND producto_propio_id = $2', [f.id, p.id]);
      await ajustes.saveAdjustment({ faltanteId: falt.id, cantidadEntregada: 0, estado: 'no_llego', revisado: true }, usuarioId);
      await cola.encolarDesdeReporte(f.id);
      await assert.rejects(impresion.procesar(f.id, {}, { id: usuarioId }), (e) => /sin productos/.test(e.message),
        'una factura de un solo producto que no llegó se anula en Facturación');
      await facturas.anularFactura(f.id, { motivo: 'zz no llegó nada' }, usuarioId);
    }
    assert.equal(await existencia(p), 0, 'estaba agotado: vuelve a 0');
  });

  test('lo que no llegó vuelve en Impresión cuando la factura lleva otros productos', async () => {
    const p = await producto(4);
    const otro = await producto(10);
    const a = await facturas.crearFactura({ clienteId: ficha.id, items: [
      { productoId: p.id, reference: p.referencia, name: p.nombre, quantity: 6, price: 1000 },
      { productoId: otro.id, reference: otro.referencia, name: otro.nombre, quantity: 1, price: 1000 }] }, usuarioId);
    await bodega.registrarFaltantes(a.id, [
      { producto_id: p.id, cantidad_faltante: 6, tipo_faltante: 'total' },
      { producto_id: otro.id, cantidad_faltante: 0, tipo_faltante: 'completo' }], 'Bodega', usuarioId);
    assert.equal(await existencia(p), -6);
    assert.equal(await existencia(otro), 9, 'Completo con positivo no se toca');
    const { rows: [falt] } = await db.query('SELECT id FROM faltantes WHERE factura_propia_id = $1 AND producto_propio_id = $2', [a.id, p.id]);
    await ajustes.saveAdjustment({ faltanteId: falt.id, cantidadEntregada: 0, estado: 'no_llego', revisado: true }, usuarioId);
    await cola.encolarDesdeReporte(a.id);
    await impresion.procesar(a.id, {}, { id: usuarioId });
    assert.equal(await existencia(p), 0, 'estaba agotado: vuelve a 0');
  });

  test('Parcial: con 4 en sistema salieron 2 de 6 → −4', async () => {
    const p = await producto(4);
    const f = await facturar(p, 6);
    await marcar(f, p, 'parcial', 4);
    assert.equal(await existencia(p), -4);
  });

  test('Completo con un negativo de más lo sube hasta lo que se debe', async () => {
    const p = await producto(0);
    const a = await facturar(p, 6);
    await marcar(a, p, 'total', 6);
    assert.equal(await existencia(p), -6);
    const c = await facturar(p, 2);
    assert.equal(await existencia(p), -8);
    await marcar(c, p, 'completo', 0);
    assert.equal(await existencia(p), -6, 'si salieron 2, había: se sigue debiendo solo lo del cliente A');
  });

  test('Completo con positivo no deja fila ni movimiento', async () => {
    const p = await producto(4);
    const f = await facturar(p, 2);
    await marcar(f, p, 'completo', 0);
    assert.equal(await existencia(p), 2);
    assert.deepEqual(await deBodega(p), []);
    assert.equal((await db.query('SELECT count(*)::int n FROM despacho_bodega_inventario WHERE producto_id = $1', [p.id])).rows[0].n, 0);
  });

  test('volver a guardar sin cambiar la marca no repite el ajuste, aunque después entró una compra', async () => {
    const p = await producto(4);
    const f = await facturar(p, 6);
    await marcar(f, p, 'total', 6);
    await inv.registrarEn(db, { productoId: p.id, tipo: 'compra', cantidad: '9', costoUnitario: '500',
      origenTipo: 'compra', origenId: 999998, clave: `zz-despacho-compra-${p.id}` });
    assert.equal(await existencia(p), 3);
    await marcar(f, p, 'total', 6);
    assert.equal(await existencia(p), 3, 'la compra no se borra');
    assert.equal((await deBodega(p)).length, 1);
  });

  test('cambiar la marca rehace el ajuste: de Faltó todo a Completo', async () => {
    const p = await producto(4);
    const f = await facturar(p, 6);
    await marcar(f, p, 'total', 6);
    assert.equal(await existencia(p), -6);
    await marcar(f, p, 'completo', 0);
    assert.equal(await existencia(p), 0, 'salieron las 6: había por lo menos 6');
    assert.deepEqual((await deBodega(p)).map(m => m.cantidad), [-4, 6]);
    const { rows: [r] } = await db.query('SELECT marca, version, ajuste::float FROM despacho_bodega_inventario WHERE factura_id = $1 AND producto_id = $2', [f.id, p.id]);
    assert.deepEqual(r, { marca: 'completo', version: 2, ajuste: 2 });
  });

  test('queda anotado quién marcó y qué decía el sistema; el kardex dice la factura', async () => {
    const p = await producto(4);
    const f = await facturar(p, 6);
    await marcar(f, p, 'total', 6);
    const { rows: [r] } = await db.query(`SELECT marca, cantidad_pedida::float, cantidad_faltante::float, existencia_sistema::float,
      deuda_clientes::float, existencia_final::float, ajuste::float, usuario_id FROM despacho_bodega_inventario WHERE factura_id = $1`, [f.id]);
    assert.deepEqual(r, { marca: 'total', cantidad_pedida: 6, cantidad_faltante: 6, existencia_sistema: -2,
      deuda_clientes: 6, existencia_final: -6, ajuste: -4, usuario_id: usuarioId });
    const [m] = await deBodega(p);
    assert.equal(m.usuario_id, usuarioId);
    assert.match(m.observaciones, new RegExp(`factura ${f.numero}: Faltó todo`));
  });

  test('un producto que no lleva inventario no se toca', async () => {
    const p = await producto(4);
    await db.query('UPDATE producto SET inventariable = FALSE WHERE id = $1', [p.id]);
    const f = await facturar(p, 6);
    await marcar(f, p, 'total', 6);
    assert.deepEqual(await deBodega(p), []);
  });
});
