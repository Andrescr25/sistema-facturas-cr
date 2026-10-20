/**
 * Reporte → propuesta del formulario → factura e inventario propios.
 * Solo se habilita en una copia tachi_codex_* de PostgreSQL local. Cada
 * caso usa productos/facturas ZZ nuevos y BEGIN/ROLLBACK; los COMMIT de los
 * módulos se convierten en SAVEPOINT para que no persistan datos de prueba.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool, c, impresion, cola, inventario, utils;
let fallarHistorial = false;

describe('impresión exacta con factura e inventario propios — PostgreSQL local', { skip: !activo }, () => {
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/,
      'usar una copia desechable, nunca la base de trabajo');
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    c = await pool.connect();
    const db = baseEnTransaccion({ query: (sql, params) => {
      if (fallarHistorial && sql.includes('INSERT INTO procesamientos')) throw new Error('ZZ fallo al guardar historial');
      return c.query(sql, params);
    } }, 'impresion_zz');
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: db };
    impresion = require('../src/modules/reprinting/procesarImpresion');
    cola = require('../src/modules/reprinting/colaImpresion');
    inventario = require('../src/modules/inventario/inventario.service');
    utils = await import('../../frontend/src/utils/impresionUtils.js');
  });
  beforeEach(async () => { fallarHistorial = false; await c.query('BEGIN'); });
  afterEach(async () => { fallarHistorial = false; await c.query('ROLLBACK'); });
  after(async () => { c?.release(); await pool?.end(); });

  async function fixture({ cantidad = 6, faltante = 3 } = {}) {
    const nombre = `ZZ-IMP-${randomUUID().slice(0, 8)}`;
    const { rows: [iva] } = await c.query('SELECT id FROM impuesto WHERE tarifa=13 LIMIT 1');
    assert.ok(iva, 'la copia necesita el maestro de IVA 13');
    const { rows: [producto] } = await c.query(`INSERT INTO producto(nombre,referencia,precio_sin_iva,impuesto_id)
      VALUES($1,$1,1200,$2) RETURNING id`, [nombre, iva.id]);
    const total = cantidad * 1000 * 0.9 * 1.13;
    const { rows: [factura] } = await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_nombre,total)
      VALUES($1,'emitida','2026-10-08',$1,$2) RETURNING id`, [nombre, total]);
    await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,referencia,cantidad,
      precio_unitario,descuento_porcentaje,tarifa,total,descripcion)
      VALUES($1,1,$2,$3,$3,$4,1000,10,13,$5,'ZZ nota del cliente')`,
      [factura.id, producto.id, nombre, cantidad, total]);
    const { rows: [f] } = await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,
      cantidad_faltante,tipo_faltante,proveedor_asignado) VALUES($1,$2,$3,'parcial',$4) RETURNING id`,
      [factura.id, producto.id, faltante, nombre]);
    await c.query(`INSERT INTO faltantes_ajustes(faltante_id,cantidad_entregada,estado,requiere_actualizacion,revisado)
      VALUES($1,0,'no_llego',true,true)`, [f.id]);
    await inventario.reconciliarDocumentoEn(c, 'factura', factura.id);
    await cola.encolarDesdeReporte(factura.id);
    return { facturaId: factura.id, productoId: producto.id, faltanteId: f.id };
  }

  async function pantalla(facturaId) {
    const propuesta = await impresion.detalle(facturaId);
    return propuesta.lineas.map(utils.aItemDeEdicion);
  }

  async function estado({ facturaId, productoId, faltanteId }) {
    const { rows: [r] } = await c.query(`SELECT f.total,l.cantidad,l.precio_unitario,l.descripcion,
      aj.estado AS estado_faltante,aj.cantidad_rebajada,fr.estado AS estado_cola,
      (SELECT SUM(cantidad) FROM movimiento_inventario WHERE origen_tipo='factura' AND origen_id=f.id
        AND producto_id=$2) AS inventario
      FROM factura f JOIN factura_linea l ON l.factura_id=f.id
      JOIN faltantes aj ON aj.id=$3 JOIN facturas_reimpresion fr ON fr.factura_propia_id=f.id
      WHERE f.id=$1`, [facturaId, productoId, faltanteId]);
    return r;
  }

  test('6 menos 3 queda en 3; refresca precio al guardar y recuperar no repite la rebaja ni el inventario', async () => {
    const datos = await fixture();
    const items = await pantalla(datos.facturaId);
    assert.equal(items[0].quantity, 3);
    assert.equal(items[0].price, 1200);
    await c.query('UPDATE producto SET precio_sin_iva=1500 WHERE id=$1', [datos.productoId]);
    const r = await impresion.procesar(datos.facturaId, { lineas: utils.lineasParaProcesar(items) });
    assert.equal(r.total, 4576.5, 'IVA de la línea y descuento incluidos');
    const guardada = await estado(datos);
    assert.equal(Number(guardada.cantidad), 3);
    assert.equal(Number(guardada.precio_unitario), 1500);
    assert.equal(Number(guardada.inventario), -3);
    assert.equal(Number(guardada.cantidad_rebajada), 3);
    assert.equal(guardada.descripcion, 'ZZ nota del cliente');
    await assert.rejects(impresion.procesar(datos.facturaId), e => e.status === 409);
    await impresion.recuperarProcesada(datos.facturaId);
    await impresion.procesar(datos.facturaId);
    assert.deepEqual(await estado(datos), guardada);
  });

  test('el precio manual se conserva aunque cambie el catálogo', async () => {
    const datos = await fixture();
    const items = await pantalla(datos.facturaId);
    items[0].price = 250;
    items[0].precioEditado = true;
    await c.query('UPDATE producto SET precio_sin_iva=1500 WHERE id=$1', [datos.productoId]);
    const r = await impresion.procesar(datos.facturaId, { lineas: utils.lineasParaProcesar(items) });
    assert.equal(r.total, 762.75);
    assert.equal(Number((await estado(datos)).precio_unitario), 250);
  });

  test('un fallo al finalizar revierte factura, faltante, cola e inventario y permite reintentar', async () => {
    const datos = await fixture();
    const antes = await estado(datos);
    fallarHistorial = true;
    await assert.rejects(impresion.procesar(datos.facturaId), /ZZ fallo al guardar historial/);
    assert.deepEqual(await estado(datos), antes);
    fallarHistorial = false;
    await impresion.procesar(datos.facturaId);
    assert.equal(Number((await estado(datos)).cantidad), 3);
  });

  test('si faltó todo no imprime una factura vacía y deja la cola pendiente', async () => {
    const datos = await fixture({ cantidad: 3, faltante: 3 });
    const antes = await estado(datos);
    await assert.rejects(impresion.procesar(datos.facturaId), e => e.status === 409 && /sin productos/.test(e.message));
    await assert.rejects(impresion.procesar(datos.facturaId, { lineas: [] }), e => e.status === 409);
    assert.deepEqual(await estado(datos), antes);
  });

  // 2026-10-20, el usuario, de las facturas electrónicas trabadas en Bodega:
  // «solo quiero que esas facturas las pases a impresión» y, para su faltante,
  // «imprimir tal cual». La protección sigue (no se edita); lo que cambió es
  // que se marca impresa en vez de quedar trabada en la cola.
  test('una electrónica se marca impresa sin editarla y su faltante queda pendiente', async () => {
    const datos = await fixture();
    // Estado fiscal sintético, únicamente dentro de esta copia y su ROLLBACK.
    await c.query("UPDATE factura SET electronica=true,hacienda_estado='aceptada' WHERE id=$1", [datos.facturaId]);
    await imprimeTalCual(datos);
  });

  test('con un comprobante de producción vigente pasa lo mismo, aunque Hacienda no haya contestado', async () => {
    const datos = await fixture();
    const digitos = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
    await c.query(`INSERT INTO hacienda_comprobante(ambiente,origen,origen_id,tipo,clave,consecutivo,fecha,xml_ruta,xml_sha256,sobre,estado)
      VALUES('produccion','factura',$1,'01',$2,$3,now(),'zz.xml',repeat('0',64),'{}'::jsonb,'recibida')`,
      [datos.facturaId, digitos(50), digitos(20)]);
    await imprimeTalCual(datos);
  });

  async function imprimeTalCual(datos) {
    const antes = await estado(datos);
    const propuesta = await impresion.detalle(datos.facturaId);
    assert.equal(propuesta.factura.ante_hacienda, true);
    assert.equal(Number(propuesta.lineas[0].cantidad), 6, 'sin propuesta de rebaja');
    // Editarla a mano tampoco: lo que falte va con nota de crédito.
    await assert.rejects(impresion.procesar(datos.facturaId, { lineas: utils.lineasParaProcesar(await pantalla(datos.facturaId)) }),
      e => e.status === 409 && /ya está ante Hacienda/.test(e.message));
    const r = await impresion.procesar(datos.facturaId, {}, { nombre: 'ZZ' });
    assert.equal(r.editada, false);
    const despues = await estado(datos);
    assert.deepEqual([despues.total, despues.cantidad, despues.precio_unitario, despues.inventario], [antes.total, antes.cantidad, antes.precio_unitario, antes.inventario]);
    assert.equal(despues.estado_cola, 'procesada');
    assert.equal(despues.estado_faltante, 'pendiente', 'el faltante sigue para entregarlo o hacer la nota de crédito');
    assert.equal(Number(despues.cantidad_rebajada || 0), 0);
  }

  test('sin_pendientes conserva los precios de la factura al marcarla impresa', async () => {
    const datos = await fixture();
    await c.query('DELETE FROM faltantes_ajustes WHERE faltante_id=$1', [datos.faltanteId]);
    await c.query('DELETE FROM faltantes WHERE id=$1', [datos.faltanteId]);
    await cola.encolarSinPendientes(datos.facturaId);
    const items = await pantalla(datos.facturaId);
    assert.equal(items[0].price, 1000);
    await c.query('UPDATE producto SET precio_sin_iva=1500 WHERE id=$1', [datos.productoId]);
    const r = await impresion.procesar(datos.facturaId, { lineas: utils.lineasParaProcesar(items) });
    assert.equal(r.editada, false);
    const { rows: [l] } = await c.query('SELECT precio_unitario,cantidad FROM factura_linea WHERE factura_id=$1', [datos.facturaId]);
    assert.equal(Number(l.precio_unitario), 1000);
    assert.equal(Number(l.cantidad), 6);
  });
});
