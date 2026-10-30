/**
 * Cuánto cobró cada usuario y el efectivo que entregó (F6, migración 071).
 *
 * El usuario, sobre el agente de ventas (2026-10-29): «de momento este no podrá
 * cobrar … pero igual esto desarróllalo para futuro: cuánto dinero recogió por
 * usuario y todo más acomodado a cierre de caja». Contra PostgreSQL local (con
 * la 071 aplicada), en una transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

describe('cobros por usuario y entrega de efectivo — contra PostgreSQL local', () => {
  let db, caja, facturas, seguimiento, cobradorA, cobradorB, sinCobros, admin, cliente, producto, efectivo, sinpe;
  let hoy;
  const vender = (usuario, metodoPagoId, extra = {}) => facturas.crearFactura({
    clienteId: cliente, clienteNombre: 'ZZ Cliente cobros',
    items: [{ productoId: producto, price: 100, quantity: 10, discount: 0, descuentoBase: 0 }],
    cobro: { metodoPagoId, ...extra }
  }, usuario);

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("SET TIME ZONE 'America/Costa_Rica'");
    await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'cobrosusuario') };
    caja = require('../src/modules/cuentas-por-cobrar/cierreCaja.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    seguimiento = require('../src/modules/seguimiento/seguimiento.service');
    hoy = require('../src/utils/fechaCR').hoyEnCostaRica();

    // Un día limpio: los cobros que ya tenga la copia hoy no estorban.
    await db.query(`UPDATE pago SET fecha = fecha - 3650 WHERE fecha = $1`, [hoy]);
    await db.query(`DELETE FROM cierre_caja WHERE fecha = $1`, [hoy]);
    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const usuario = async (u, nombre) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $2, 'zz', TRUE, FALSE) RETURNING id`, [u, nombre])).rows[0].id;
    cobradorA = await usuario('zz-cobrador-a', 'ZZ Cobrador A');
    cobradorB = await usuario('zz-cobrador-b', 'ZZ Cobrador B');
    sinCobros = await usuario('zz-sin-cobros', 'ZZ Sin cobros');
    cliente = (await db.query(`INSERT INTO cliente (nombre, activo) VALUES ('ZZ Cliente cobros', TRUE) RETURNING id`)).rows[0].id;
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-COBROS', 'ZZ-COBROS', 100, 79.1, $1) RETURNING id`, [impuesto.id])).rows[0].id;
    efectivo = (await db.query(`SELECT id FROM metodo_pago WHERE clave = 'efectivo'`)).rows[0].id;
    sinpe = (await db.query(`SELECT id FROM metodo_pago WHERE clave = 'sinpe_movil'`)).rows[0].id;

    // A cobra 1.130 en efectivo y 1.130 por SINPE; B, 1.130 en efectivo.
    await vender(cobradorA, efectivo);
    await vender(cobradorA, sinpe, { referencia: 'ZZ-SINPE-1' });
    await vender(cobradorB, efectivo);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('el día dice cuánto cobró cada uno: el efectivo aparte y los demás métodos de referencia', async () => {
    const d = await caja.resumenDelDia(hoy);
    const a = d.porUsuario.find(u => u.usuarioId === cobradorA);
    const b = d.porUsuario.find(u => u.usuarioId === cobradorB);
    assert.deepEqual({ nombre: a.nombre, cantidad: a.cantidad, total: a.total, efectivo: a.efectivo }, { nombre: 'ZZ Cobrador A', cantidad: 2, total: 2260, efectivo: 1130 });
    assert.deepEqual(a.otros, [{ metodo: 'SINPE Móvil', monto: 1130 }]);
    assert.deepEqual({ efectivo: b.efectivo, otros: b.otros, rendicion: b.rendicion }, { efectivo: 1130, otros: [], rendicion: null });
    assert.ok(d.cobros.every(c => ['ZZ Cobrador A', 'ZZ Cobrador B'].includes(c.registradoPor)));
    assert.equal(d.resumen.efectivoCobrado, 2260, 'el cierre de siempre no cambia');
  });

  test('recibir el efectivo congela lo cobrado y anota la diferencia, quién recibió y la bitácora', async () => {
    const r = await caja.recibirEfectivo({ fecha: hoy, usuarioId: cobradorA, efectivoEntregado: 630, observaciones: ' faltan 500 ' }, admin);
    assert.equal(Number(r.efectivo_cobrado), 1130);
    assert.equal(Number(r.diferencia), -500);
    assert.equal(r.observaciones, 'faltan 500');
    assert.deepEqual(r.otros_metodos, [{ metodo: 'SINPE Móvil', monto: 1130 }]);
    const a = (await caja.resumenDelDia(hoy)).porUsuario.find(u => u.usuarioId === cobradorA);
    assert.equal(a.rendicion.efectivoEntregado, 630);
    assert.equal(a.rendicion.diferencia, -500);
    const { rows } = await db.query(`SELECT accion, usuario_id FROM bitacora_cambio WHERE entidad = 'rendicion_efectivo' AND entidad_id = $1`, [String(r.id)]);
    assert.deepEqual(rows.map(x => [x.accion, x.usuario_id]), [['crear', admin]]);
  });

  test('anular un cobro después no cambia la diferencia firmada', async () => {
    await db.query(`UPDATE pago SET anulado = TRUE WHERE registrado_por = $1 AND metodo_pago_id = $2`, [cobradorA, efectivo]);
    const a = (await caja.resumenDelDia(hoy)).porUsuario.find(u => u.usuarioId === cobradorA);
    assert.equal(a.efectivo, 0, 'lo cobrado de hoy ya no lo cuenta');
    assert.equal(a.rendicion.efectivoCobrado, 1130, 'pero lo recibido quedó congelado');
    assert.equal(a.rendicion.diferencia, -500);
    await db.query(`UPDATE pago SET anulado = FALSE WHERE registrado_por = $1 AND metodo_pago_id = $2`, [cobradorA, efectivo]);
  });

  test('una sola vez por usuario y día; sin cobros o sin monto, no', async () => {
    await assert.rejects(caja.recibirEfectivo({ fecha: hoy, usuarioId: cobradorA, efectivoEntregado: 1130 }, admin), (e) => e.status === 409);
    await assert.rejects(caja.recibirEfectivo({ fecha: hoy, usuarioId: sinCobros, efectivoEntregado: 0 }, admin), (e) => e.status === 400);
    for (const efectivoEntregado of ['', null, -1, 'x']) {
      await assert.rejects(caja.recibirEfectivo({ fecha: hoy, usuarioId: cobradorB, efectivoEntregado }, admin), (e) => e.status === 400, String(efectivoEntregado));
    }
  });

  test('con la caja del día cerrada ya no se recibe: se reabre, como cualquier corrección', async () => {
    const d = await caja.resumenDelDia(hoy);
    await caja.cerrarCaja({ fecha: hoy, efectivoContado: d.resumen.efectivoEsperado }, admin);
    await assert.rejects(caja.recibirEfectivo({ fecha: hoy, usuarioId: cobradorB, efectivoEntregado: 1130 }, admin),
      (e) => e.status === 409 && /cerrada/.test(e.message));
  });

  test('el seguimiento del agente también dice lo que cobró', async () => {
    const d = await seguimiento.dia({ usuarioId: cobradorA });
    const cobros = d.recorrido.filter(p => p.tipo === 'cobro');
    assert.equal(cobros.length, 2);
    assert.deepEqual(cobros.map(c => c.cobro.metodo).sort(), ['Efectivo', 'SINPE Móvil']);
    assert.equal(d.resumen.cobrado, 2260);
    assert.equal(d.resumen.clientesVisitados, 1, 'un cobro no cuenta como otra visita');
  });
});

describe('la pantalla', () => {
  test('el cuadre del día muestra los cobros por usuario, con «Recibir efectivo» solo con la caja abierta', () => {
    assert.match(leer('components', 'cuentas-por-cobrar', 'CuadreCajaDia.jsx'),
      /<CobrosPorUsuario fecha=\{fecha\} porUsuario=\{resumen\.porUsuario\} cerrada=\{Boolean\(cierre\)\} onCambio=\{recargar\} \/>/);
    const c = leer('components', 'cuentas-por-cobrar', 'CobrosPorUsuario.jsx');
    assert.match(c, /\) : u\.usuarioId && !cerrada && \(/);
    assert.match(leer('services', 'cuentasPorCobrarService.js'), /api\.post\('\/cuentas-por-cobrar\/propios\/caja\/rendicion'/);
    assert.match(leer('services', 'cuentasPorCobrarService.js'), /porUsuario: d\?\.porUsuario \?\? \[\]/);
  });

  test('«Ayer» del cuadre es ayer en Costa Rica, no en UTC', () => {
    assert.match(leer('hooks', 'useCuadreCaja.js'), /setFecha\(sumarDias\(hoyEnCostaRica\(\), -1\)\)/);
    assert.doesNotMatch(leer('hooks', 'useCuadreCaja.js'), /toISOString/);
    assert.doesNotMatch(leer('components', 'cuentas-por-cobrar', 'CuadreCajaDia.jsx'), /toISOString/);
  });

  test('el recorrido muestra el cobro sin GPS (no sale de una visita)', () => {
    const r = leer('components', 'seguimiento', 'RecorridoAgente.jsx');
    assert.match(r, /const gps = cobro \? null : lecturaDelGps\(p\.gps, p\.cliente\.ubicacionMaps\)/);
    assert.match(r, /Cobró \{colones\(p\.cobro\.monto\)\}/);
  });
});
