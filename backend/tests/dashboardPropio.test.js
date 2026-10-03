/**
 * Inicio debe contar trabajo de las tablas propias, también sin Alegra.
 * PostgreSQL local, una conexión y SAVEPOINT por caso; ROLLBACK al terminar.
 * No se arranca el servidor, no se envían mensajes ni se ejecuta limpieza.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
require('../config/aislado').asegurarBaseLocal();
let pool, db, tablero, consultaFactura, hoy, hoyReal, clienteId, fechaCR;
let consultas = [];

describe('Dashboard desde tablas propias — PostgreSQL local', () => {
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    db = await pool.connect();
    await db.query('BEGIN');
    hoyReal = (await db.query("SELECT (now() AT TIME ZONE 'America/Costa_Rica')::date::text hoy")).rows[0].hoy;
    const query = (sql, params) => {
      // No basta con que Alegra esté caída: los espejos viejos también se
      // quedan obsoletos. La lectura tampoco puede crear datos al abrir Inicio.
      assert.doesNotMatch(String(sql), /\b(cuentas_por_cobrar|alegra_products_cache)\b|\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
      consultas.push({ sql:String(sql), params });
      return db.query(sql, params);
    };
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id:rutaDb, filename:rutaDb, loaded:true, exports:{query,pool:{query}} };
    const rutaFecha = require.resolve('../src/utils/fechaCR');
    fechaCR = require(rutaFecha).hoyEnCostaRica;
    require.cache[rutaFecha] = { id:rutaFecha, filename:rutaFecha, loaded:true, exports:{hoyEnCostaRica:()=>hoy} };
    tablero = require('../src/modules/dashboard/dashboard.service');
    consultaFactura = require('../src/modules/facturacion/facturaConsulta.service');
    clienteId = (await db.query("INSERT INTO cliente (nombre) VALUES ('zz-dashboard propio') RETURNING id")).rows[0].id;
  });
  beforeEach(async () => { hoy=hoyReal; consultas=[]; await db.query('SAVEPOINT caso_dashboard'); });
  afterEach(async () => { await db.query('ROLLBACK TO SAVEPOINT caso_dashboard'); });
  after(async () => {
    if (db) { await db.query('ROLLBACK'); db.release(); }
    if (pool) await pool.end();
  });
  const factura = async ({total=1000,estado='emitida',dias=0,vencimiento=hoy,bodega='pendiente'}={}) =>
    (await db.query(`INSERT INTO factura (cliente_id,cliente_nombre,total,estado,fecha,fecha_vencimiento,estado_bodega,saldo,total_pagado)
      VALUES ($1,'zz-dashboard propio',$2,$3,$4::date+$5::integer,$6::date,$7,999999,999999) RETURNING id`,
    [clienteId,total,estado,hoy,dias,vencimiento,bodega])).rows[0].id;
  const pago = async (facturaId,monto) => {
    const p=(await db.query("INSERT INTO pago (cliente_id,cliente_nombre,fecha,monto) VALUES ($1,'zz-dashboard propio',$2,$3) RETURNING id",[clienteId,hoy,monto])).rows[0].id;
    await db.query('INSERT INTO pago_factura (pago_id,factura_id,monto) VALUES ($1,$2,$3)',[p,facturaId,monto]);
    return p;
  };
  const credito = async (facturaId,monto) => {
    const n=(await db.query("INSERT INTO nota_credito (cliente_id,cliente_nombre,fecha,total) VALUES ($1,'zz-dashboard propio',$2,$3) RETURNING id",[clienteId,hoy,monto])).rows[0].id;
    await db.query('INSERT INTO nota_credito_factura (nota_credito_id,factura_id,monto) VALUES ($1,$2,$3)',[n,facturaId,monto]);
    return n;
  };
  test('cobra saldo vivo de una factura sin Alegra; revertir cobro o nota devuelve la deuda', async () => {
    const antes=(await tablero.resumen()).cuentasPorCobrar;
    const ayer=(await db.query('SELECT ($1::date-1)::text dia',[hoy])).rows[0].dia;
    const f=await factura({vencimiento:ayer});
    let r=(await tablero.resumen()).cuentasPorCobrar;
    assert.equal(r.facturas,antes.facturas+1);
    assert.equal(r.vencidas,antes.vencidas+1);
    assert.equal(r.total,antes.total+1000);
    assert.equal(r.vencido,antes.vencido+1000);
    const p=await pago(f,600), n=await credito(f,200);
    r=(await tablero.resumen()).cuentasPorCobrar;
    assert.equal(r.total,antes.total+200);
    assert.equal(r.vencido,antes.vencido+200);
    await db.query('UPDATE pago SET anulado=TRUE WHERE id=$1',[p]);
    assert.equal((await tablero.resumen()).cuentasPorCobrar.total,antes.total+800);
    await db.query("UPDATE nota_credito SET estado='anulada' WHERE id=$1",[n]);
    assert.equal((await tablero.resumen()).cuentasPorCobrar.total,antes.total+1000);
    await db.query("UPDATE factura SET estado='anulada' WHERE id=$1",[f]);
    assert.deepEqual((await tablero.resumen()).cuentasPorCobrar,antes);
  });
  test('vence después del día local; proformas, anuladas y saldo de un colón o menos no cuentan', async () => {
    const antes=(await tablero.resumen()).cuentasPorCobrar;
    await factura({estado:'borrador',total:5000});
    await factura({estado:'anulada',total:6000});
    const saldada=await factura(); await pago(saldada,1000);
    const redondeo=await factura(); await pago(redondeo,999);
    await factura({vencimiento:hoy});
    await factura({vencimiento:null});
    const r=(await tablero.resumen()).cuentasPorCobrar;
    assert.equal(r.facturas,antes.facturas+2);
    assert.equal(r.total,antes.total+2000);
    assert.equal(r.vencidas,antes.vencidas);
    assert.equal(r.vencido,antes.vencido);
    // La tarjeta y la lista de cobranza usan la misma deuda y el mismo umbral.
    const lista=await consultaFactura.listarFacturas({estado:'con_saldo',limite:100});
    assert.equal(lista.paginacion.total,r.facturas);
  });
  test('Bodega incluye el límite de 30 días y excluye antiguas, despachadas, borradores y anuladas', async () => {
    const antes=await tablero.resumen();
    const visible=await factura({dias:-30});
    await factura({dias:-31});
    await factura({bodega:'procesado'});
    await factura({estado:'borrador'});
    await factura({estado:'anulada'});
    const r=await tablero.resumen();
    assert.equal(r.bodega,antes.bodega+1);
    assert.equal(r.diasBodega,30);
    await db.query("UPDATE factura SET estado_bodega='procesado' WHERE id=$1",[visible]);
    assert.equal((await tablero.resumen()).bodega,antes.bodega);
  });
  test('mes local incluye mensual, ambas quincenas y varios recibos; excluye pagados y otro mes', async () => {
    // En UTC ya puede ser octubre, pero en CR todavía 30 de septiembre.
    hoy=fechaCR(new Date('2026-10-01T02:30:00Z'));
    assert.equal(hoy,'2026-09-30');
    const antes=await tablero.resumen();
    const g=(await db.query("INSERT INTO gasto_recurrente (nombre,frecuencia) VALUES ('zz-dashboard gasto','quincenal') RETURNING id")).rows[0].id;
    for(const [periodo,estado,documento] of [
      ['2026-09','pendiente','ZZ-1'],['2026-09','pendiente','ZZ-2'],
      ['2026-09-Q1','pendiente',null],['2026-09-Q2','pendiente',null],
      ['2026-09','pagado','ZZ-3'],['2026-10','pendiente',null]
    ]) await db.query('INSERT INTO pago_recurrente (gasto_id,periodo,estado,documento_externo) VALUES ($1,$2,$3,$4)',[g,periodo,estado,documento]);
    assert.equal((await tablero.resumen()).pagosRecurrentes,antes.pagosRecurrentes+4);
    hoy=fechaCR(new Date('2027-01-01T02:30:00Z'));
    assert.equal(hoy,'2026-12-31');
    const diciembre=await tablero.resumen();
    await db.query("INSERT INTO pago_recurrente (gasto_id,periodo) VALUES ($1,'2027-01')",[g]);
    assert.equal((await tablero.resumen()).pagosRecurrentes,diciembre.pagosRecurrentes);
  });
  test('pedidos sin portal y colas internas locales entran; sus estados terminados salen', async () => {
    const antes=await tablero.resumen();
    const p=(await db.query("INSERT INTO pedido_cliente (cliente_id,cliente_nombre,origen) VALUES ($1,'zz-dashboard propio','agente') RETURNING id",[clienteId])).rows[0].id;
    const d=(await db.query("INSERT INTO duplicado_electronica (duplicado_alegra_id,electronica_alegra_id) VALUES ('zz-dash-dup','zz-dash-elec') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO facturas_proveedores (clave,numero_consecutivo,fecha_emision,proveedor_nombre,proveedor_cedula,total_productos,total_factura,estado,archivo_xml) VALUES ('zz-dashboard-clave','ZZ-DASHBOARD',$1,'zz-dashboard proveedor','ZZ',0,0,'PROCESADA','zz-dashboard.xml')",[hoy]);
    for(const [tipo,estado] of [['exceso','en_progreso'],['stock','en_progreso'],['exceso','completada']])
      await db.query('INSERT INTO inventario_auditorias (nombre,tipo,estado) VALUES ($1,$2,$3)',['zz-dashboard auditoria',tipo,estado]);
    const r=await tablero.resumen();
    assert.equal(r.pedidosPortal,antes.pedidosPortal+1);
    assert.equal(r.duplicados,antes.duplicados+1);
    assert.equal(r.revisionPrecios,antes.revisionPrecios+1);
    assert.equal(r.excesos,antes.excesos+1);
    assert.equal(r.auditorias,antes.auditorias+1);
    await db.query("UPDATE pedido_cliente SET estado='facturado' WHERE id=$1",[p]);
    await db.query("UPDATE duplicado_electronica SET estado='anulado' WHERE id=$1",[d]);
    const despues=await tablero.resumen();
    assert.equal(despues.pedidosPortal,antes.pedidosPortal);
    assert.equal(despues.duplicados,antes.duplicados);
  });
  test('abrir Inicio hace siete lecturas, sin crear períodos ni usar los espejos de Alegra', async () => {
    consultas=[];
    await tablero.resumen();
    assert.equal(consultas.length,7);
    const fechas=consultas.filter(c=>c.params?.includes(hoy));
    assert.equal(fechas.length,2,'cobranza y bodega comparten el día capturado');
    assert.ok(consultas.some(c=>c.params?.includes(hoy.slice(0,7))));
  });
});
