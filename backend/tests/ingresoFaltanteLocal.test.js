/**
 * Reporte Clientes solo marca que llegó lo que ingresó por Revisión de
 * precios, y lo que ingresó se reparte (2026-10-25, migración 067).
 *
 * El usuario: «no dejar al usuario marcar algo como que sí llegó desde
 * Reporte Clientes si el sistema no ha detectado que el producto ingresara a
 * través de revisión de precios»; para lo que llega sin factura electrónica,
 * «meter una factura de compra a mano», y repartir lo que ingresó.
 *
 * PostgreSQL real, solo en una copia tachi_codex_*: cada caso corre en
 * BEGIN/ROLLBACK y los COMMIT de los módulos se vuelven SAVEPOINT.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool, c, ajustes, cola, ingreso, manual;

describe('lo que ingresó respalda lo que se entrega — PostgreSQL local', { skip: !activo }, () => {
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/,
      'usar una copia desechable, nunca la base de trabajo');
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect();
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(c, 'ingreso_zz') };
    ajustes = require('../src/modules/missing-items/missing-items.service');
    cola = require('../src/modules/reprinting/colaImpresion');
    ingreso = require('../src/modules/missing-items/ingresoFaltante');
    manual = require('../src/modules/compras/compraManual.service');
  });
  beforeEach(async () => { await c.query('BEGIN'); });
  afterEach(async () => { await c.query('ROLLBACK'); });
  after(async () => { c?.release(); await pool?.end(); });

  const AHORA = "(now() AT TIME ZONE 'America/Costa_Rica')";

  async function producto() {
    const nombre = `ZZ-ING-${randomUUID().slice(0, 8)}`;
    const { rows: [iva] } = await c.query('SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1');
    const { rows: [p] } = await c.query(`INSERT INTO producto(nombre,referencia,precio_sin_iva,costo_con_iva,impuesto_id,inventariable)
      VALUES($1,$1,1000,500,$2,false) RETURNING id, nombre`, [nombre, iva.id]);
    const { rows: [prov] } = await c.query(`INSERT INTO proveedor(nombre,identificacion) VALUES($1,$2) RETURNING id`,
      [nombre, `ZZ${randomUUID().slice(0, 10)}`]);
    return { id: p.id, nombre: p.nombre, proveedorId: prov.id };
  }

  /** Una factura con un faltante de `cantidad`, anotado `haceHoras` atrás. */
  async function faltante(prod, { cantidad = 3, haceHoras = 2 } = {}) {
    const numero = `ZZ-${randomUUID().slice(0, 10)}`;
    const { rows: [f] } = await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_nombre,total)
      VALUES($1,'emitida','2026-10-25',$1,1000) RETURNING id`, [numero]);
    const { rows: [fal] } = await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,
      tipo_faltante,proveedor_asignado,estado,created_at) VALUES($1,$2,$3,'parcial','ZZ','pendiente',${AHORA} - $4 * interval '1 hour')
      RETURNING id`, [f.id, prod.id, cantidad, haceHoras]);
    return { facturaId: f.id, faltanteId: fal.id };
  }

  /** Una compra registrada (como la deja Revisión de precios), hace `haceHoras`. */
  async function compra(prod, { cantidad, factor = 1, haceHoras = 0, estado = 'registrada' }) {
    const { rows: [co] } = await c.query(`INSERT INTO compra(proveedor_id,numero_consecutivo,fecha_emision,total,estado,creado_en)
      VALUES($1,$2,'2026-10-25',100,$3,${AHORA} - $4 * interval '1 hour') RETURNING id`,
      [prod.proveedorId, `ZZ-${randomUUID().slice(0, 8)}`, estado, haceHoras]);
    const { rows: [l] } = await c.query(`INSERT INTO compra_linea(compra_id,numero_linea,producto_id,descripcion,cantidad,
      factor_conversion,precio_unitario,total_linea) VALUES($1,1,$2,'ZZ',$3,$4,10,10) RETURNING id`,
      [co.id, prod.id, cantidad, factor]);
    return { compraId: co.id, lineaId: l.id };
  }

  const marcar = (fal, cantidad, estado = cantidad === 3 ? 'completo' : cantidad === 0 ? 'no_llego' : 'parcial') =>
    ajustes.saveAdjustment({ faltanteId: fal.faltanteId, cantidadEntregada: cantidad, estado, revisado: true });
  const asignado = async (fal) => Number((await c.query(
    'SELECT COALESCE(SUM(cantidad),0) s FROM faltante_ingreso WHERE faltante_id=$1', [fal.faltanteId])).rows[0].s);
  const disponible = async (fal) => Number((await c.query(
    `SELECT ${ingreso.ingresoDisponibleSql('f')} AS d FROM faltantes f WHERE f.id=$1`, [fal.faltanteId])).rows[0].d);

  test('sin compra no se marca que llegó; «No llegó» sí', async () => {
    const prod = await producto();
    const a = await faltante(prod);
    assert.equal(await disponible(a), 0);
    await assert.rejects(marcar(a, 3), (e) => e.status === 409 && /todavía no ingresa por Revisión de precios/.test(e.message));
    await assert.rejects(marcar(a, 1), (e) => e.status === 409);
    assert.equal((await c.query('SELECT 1 FROM faltantes_ajustes WHERE faltante_id=$1', [a.faltanteId])).rowCount, 0,
      'el rechazo no deja la respuesta guardada');
    await marcar(a, 0);
    assert.equal(await asignado(a), 0);
  });

  test('lo que ingresó se reparte: lo de un cliente no sirve para otro', async () => {
    const prod = await producto();
    const a = await faltante(prod);
    const b = await faltante(prod);
    await compra(prod, { cantidad: 5 });
    assert.equal(await disponible(a), 5);
    await marcar(a, 3);
    assert.equal(await asignado(a), 3);
    assert.equal(await disponible(b), 2, 'al segundo cliente le quedan 2');
    await assert.rejects(marcar(b, 3), (e) => e.status === 409 && /Solo ingresaron 2/.test(e.message));
    await marcar(b, 2);
    assert.equal(await asignado(b), 2);
    // Volver a guardar lo mismo (confirmar la revisión) reparte otra vez sin chocar consigo mismo.
    await marcar(a, 3);
    assert.equal(await asignado(a), 3);
  });

  test('«No llegó» y quitar la respuesta sueltan lo asignado', async () => {
    const prod = await producto();
    const a = await faltante(prod);
    const b = await faltante(prod);
    await compra(prod, { cantidad: 3 });
    await marcar(a, 3);
    assert.equal(await disponible(b), 0);
    await marcar(a, 0);
    assert.equal(await disponible(b), 3);
    await marcar(a, 3);
    await ajustes.deleteAdjustment(a.faltanteId);
    assert.equal(await asignado(a), 0);
    await marcar(b, 3);
  });

  test('se toma de la compra más vieja, y el factor del proveedor cuenta', async () => {
    const prod = await producto();
    const a = await faltante(prod, { cantidad: 14, haceHoras: 5 });
    const vieja = await compra(prod, { cantidad: 2, haceHoras: 3 });
    const nueva = await compra(prod, { cantidad: 1, factor: 12, haceHoras: 1 }); // una caja de 12
    assert.equal(await disponible(a), 14);
    await ajustes.saveAdjustment({ faltanteId: a.faltanteId, cantidadEntregada: 14, estado: 'completo', revisado: true });
    const { rows } = await c.query('SELECT compra_linea_id, cantidad FROM faltante_ingreso WHERE faltante_id=$1 ORDER BY id', [a.faltanteId]);
    assert.deepEqual(rows.map((r) => [r.compra_linea_id, Number(r.cantidad)]), [[vieja.lineaId, 2], [nueva.lineaId, 12]]);
  });

  test('una compra de antes de la venta no cuenta, salvo la de unas horas antes', async () => {
    const prod = await producto();
    const a = await faltante(prod, { haceHoras: 2 });
    await compra(prod, { cantidad: 3, haceHoras: 2 + 13 });
    assert.equal(await disponible(a), 0, 'trece horas antes del faltante es otro pedido');
    await compra(prod, { cantidad: 1, haceHoras: 2 + 11 });
    assert.equal(await disponible(a), 1, 'once horas antes todavía cuenta');
  });

  test('una compra anulada no respalda, y el envío a Impresión lo vuelve a revisar', async () => {
    const prod = await producto();
    const a = await faltante(prod);
    await compra(prod, { cantidad: 3, estado: 'anulada' });
    assert.equal(await disponible(a), 0);
    const buena = await compra(prod, { cantidad: 3 });
    await marcar(a, 3);
    await c.query("UPDATE compra SET estado='anulada' WHERE id=$1", [buena.compraId]);
    await assert.rejects(cola.encolarDesdeReporte(a.facturaId), (e) => e.status === 409 && /ya no está registrada/.test(e.message));
    await c.query("UPDATE compra SET estado='registrada' WHERE id=$1", [buena.compraId]);
    const r = await cola.encolarDesdeReporte(a.facturaId);
    assert.equal(r.requiere_cambios, false);
  });

  test('lo entregado en una factura anulada vuelve a quedar libre', async () => {
    const prod = await producto();
    const a = await faltante(prod);
    const b = await faltante(prod);
    await compra(prod, { cantidad: 3 });
    await marcar(a, 3);
    assert.equal(await disponible(b), 0);
    await c.query("UPDATE factura SET estado='anulada' WHERE id=$1", [a.facturaId]);
    assert.equal(await disponible(b), 3);
  });

  test('la factura cargada a mano hace ingresar el producto', async () => {
    const prod = await producto();
    const a = await faltante(prod);
    const datos = {
      proveedorId: prod.proveedorId, numero: ' zz-0042 ', fecha: '2026-10-24', condicion: 'credito', plazoDias: 30,
      lineas: [{ productoId: prod.id, cantidad: 4, costoConIva: 565 }]
    };
    const r = await manual.registrarCompraManual(datos, null);
    assert.equal(r.lineas, 1);
    const { rows: [co] } = await c.query('SELECT * FROM compra WHERE id=$1', [r.compra.id]);
    assert.equal(co.factura_proveedor_id, null);
    assert.equal(co.clave, null);
    assert.equal(co.estado, 'registrada');
    assert.equal(Number(co.total), 2260);
    const { rows: [l] } = await c.query('SELECT * FROM compra_linea WHERE compra_id=$1', [co.id]);
    assert.equal(Number(l.impuesto), 260, 'el IVA sale de la tarifa del producto (13 %)');
    assert.equal(Number(l.precio_unitario), 500);
    const { rows: [p] } = await c.query('SELECT costo_con_iva FROM producto WHERE id=$1', [prod.id]);
    assert.equal(Number(p.costo_con_iva), 565);
    const { rows: [cuenta] } = await c.query('SELECT * FROM cuentas_por_pagar WHERE compra_id=$1', [co.id]);
    assert.equal(cuenta.condicion_venta, '02');
    assert.equal(cuenta.de_contado, false);
    assert.equal(Number(cuenta.monto_total), 2260);
    assert.equal(cuenta.factura_id, null);

    assert.equal(await disponible(a), 4);
    await marcar(a, 3);

    await assert.rejects(manual.registrarCompraManual({ ...datos, numero: 'ZZ-0042' }, null),
      (e) => e.status === 409 && /ya está cargada/.test(e.message), 'el mismo papel no entra dos veces');
  });

  test('de contado, la cuenta nace pendiente y vence el día de la factura', async () => {
    const prod = await producto();
    const r = await manual.registrarCompraManual({
      proveedorId: prod.proveedorId, numero: 'ZZ-7', fecha: '2026-10-24', condicion: 'contado',
      lineas: [{ productoId: prod.id, cantidad: 2, costoConIva: 113 }]
    }, null);
    const { rows: [cuenta] } = await c.query(
      "SELECT condicion_venta, de_contado, estado, fecha_vencimiento::date::text AS vence FROM cuentas_por_pagar WHERE compra_id=$1", [r.compra.id]);
    assert.deepEqual({ ...cuenta }, { condicion_venta: '01', de_contado: true, estado: 'PENDIENTE', vence: '2026-10-24' });
  });
});
