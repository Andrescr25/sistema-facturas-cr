/**
 * Las decisiones de Reporte de Clientes deben quedar confirmadas antes de
 * imprimir y no cambiar mientras Impresión las usa. PostgreSQL real, con
 * conexiones distintas para reproducir el cruce; solo copia tachi_codex_*.
 * Fixtures ZZ propios que se retiran al finalizar cada caso.
 */
const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const habilitadas = process.env.PROBAR_BASE_LOCAL === '1';
let pool, ajustes, cola, impresion, datos;

describe('Reporte de Clientes e Impresión: decisiones persistidas y bloqueo de factura', { skip: !habilitadas }, () => {
  before(async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname));
    assert.match(url.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 6 });
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: { pool, query: (sql, p) => pool.query(sql, p) } };
    ajustes = require('../src/modules/missing-items/missing-items.service');
    cola = require('../src/modules/reprinting/colaImpresion');
    impresion = require('../src/modules/reprinting/procesarImpresion');
  });
  beforeEach(async () => {
    const nombre = `ZZ-AUD-IMP-${randomUUID().slice(0, 12)}`;
    // Aquí se prueban bloqueos con COMMIT en conexiones separadas. El kardex
    // inmutable se verifica con BEGIN/ROLLBACK en impresionPropiaLocal.test.js.
    const { rows: [p] } = await pool.query('INSERT INTO producto(nombre,referencia,precio_sin_iva,inventariable) VALUES($1,$1,100,false) RETURNING id', [nombre]);
    const { rows: [f] } = await pool.query(`INSERT INTO factura(numero,estado,fecha,cliente_nombre,total)
      VALUES($1,'emitida','2026-10-11',$1,600) RETURNING id`, [nombre]);
    datos = { facturaId: f.id, productoId: p.id };
    await pool.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
      VALUES($1,1,$2,$3,6,100,600)`, [f.id, p.id, nombre]);
    const { rows: [faltante] } = await pool.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,
      cantidad_faltante,tipo_faltante,proveedor_asignado) VALUES($1,$2,3,'parcial',$3) RETURNING id`, [f.id, p.id, nombre]);
    datos.faltanteId = faltante.id;
  });
  afterEach(async () => {
    await pool.query('DELETE FROM faltantes_ajustes WHERE faltante_id=$1', [datos.faltanteId]);
    await pool.query('DELETE FROM facturas_reimpresion WHERE factura_propia_id=$1', [datos.facturaId]);
    await pool.query('DELETE FROM faltantes WHERE id=$1', [datos.faltanteId]);
    await pool.query('DELETE FROM procesamientos WHERE detalles::jsonb->\'factura_procesada\'->>\'factura_id\'=$1', [String(datos.facturaId)]);
    await pool.query('DELETE FROM bitacora_cambio WHERE entidad=\'factura\' AND entidad_id=$1', [datos.facturaId]);
    await pool.query('DELETE FROM factura_linea WHERE factura_id=$1', [datos.facturaId]);
    await pool.query('DELETE FROM factura WHERE id=$1', [datos.facturaId]);
    await pool.query('DELETE FROM producto WHERE id=$1', [datos.productoId]);
  });
  after(async () => { await pool?.end(); });

  const guardar = (extra = {}) => ajustes.saveAdjustment({ faltanteId: datos.faltanteId,
    cantidadEntregada: 0, estado: 'no_llego', requiereActualizacion: true, revisado: true, ...extra });

  for (const cambio of [
    { cantidadEntregada: -1 }, { cantidadEntregada: 4 }, { cantidadEntregada: 1, estado: 'no_llego' },
    { cantidadEntregada: 2, estado: 'completo' }, { cantidadEntregada: 3, estado: 'parcial' },
    { estado: 'inventado' }, { revisado: 'true' }
  ]) test(`rechaza una entrega incoherente ${JSON.stringify(cambio)}`, async () => {
    await assert.rejects(guardar(cambio), e => e.status === 400);
    assert.equal((await pool.query('SELECT id FROM faltantes_ajustes WHERE faltante_id=$1', [datos.faltanteId])).rowCount, 0);
  });

  test('enviar a Impresión exige respuesta y revisión confirmadas en la base', async () => {
    await assert.rejects(cola.encolarDesdeReporte(datos.facturaId), e => e.status === 409);
    await guardar({ revisado: false });
    await assert.rejects(cola.encolarDesdeReporte(datos.facturaId), e => e.status === 409);
    assert.equal((await pool.query('SELECT id FROM facturas_reimpresion WHERE factura_propia_id=$1', [datos.facturaId])).rowCount, 0);
    await guardar();
    await cola.encolarDesdeReporte(datos.facturaId);
  });

  test('recalcula requiere_actualizacion y no confía en una bandera contradictoria', async () => {
    await guardar({ requiereActualizacion: false });
    const { rows: [r] } = await pool.query('SELECT requiere_actualizacion FROM faltantes_ajustes WHERE faltante_id=$1', [datos.faltanteId]);
    assert.equal(r.requiere_actualizacion, true);
  });

  test('cambiar una entrega sin bandera de revisión invalida la confirmación anterior', async () => {
    await guardar();
    await guardar({ revisado: undefined });
    const leer = async () => (await pool.query('SELECT revisado FROM faltantes_ajustes WHERE faltante_id=$1', [datos.faltanteId])).rows[0].revisado;
    assert.equal(await leer(), true, 'repetir la misma entrega conserva su revisión');
    await guardar({ cantidadEntregada: 1, estado: 'parcial', revisado: undefined });
    assert.equal(await leer(), false, 'una cantidad distinta debe revisarse otra vez');
    await assert.rejects(cola.encolarDesdeReporte(datos.facturaId), e => e.status === 409);
  });

  test('el envío detecta entregas históricas incoherentes y deriva la categoría de la cantidad real', async () => {
    await guardar();
    await pool.query('UPDATE faltantes_ajustes SET cantidad_entregada=4 WHERE faltante_id=$1', [datos.faltanteId]);
    await assert.rejects(cola.encolarDesdeReporte(datos.facturaId), e => e.status === 409);
    assert.equal((await pool.query('SELECT id FROM facturas_reimpresion WHERE factura_propia_id=$1', [datos.facturaId])).rowCount, 0);
    await pool.query('UPDATE faltantes_ajustes SET cantidad_entregada=0,requiere_actualizacion=false WHERE faltante_id=$1', [datos.faltanteId]);
    const r=await cola.encolarDesdeReporte(datos.facturaId);
    assert.equal(r.requiere_cambios,true);
    const { rows: [fila] }=await pool.query('SELECT categoria,ajustes_realizados FROM facturas_reimpresion WHERE factura_propia_id=$1',[datos.facturaId]);
    assert.equal(fila.categoria,'requiere_cambios');
    assert.equal(fila.ajustes_realizados[0].requiere_actualizacion,true);
  });

  test('la API distingue una respuesta inválida, un faltante inexistente y una factura bloqueada', async () => {
    const controlador=require('../src/modules/missing-items/missing-items.controller');
    const respuesta=()=>({ codigo:200, status(codigo){this.codigo=codigo;return this;}, json(cuerpo){this.cuerpo=cuerpo;} });
    let res=respuesta();
    await controlador.saveAdjustment({body:{faltante_id:datos.faltanteId,cantidad_entregada:-1,estado:'no_llego'}},res);
    assert.equal(res.codigo,400);
    res=respuesta();
    await controlador.deleteAdjustment({params:{faltanteId:2147483647}},res);
    assert.equal(res.codigo,404);
    await guardar();await cola.encolarDesdeReporte(datos.facturaId);
    res=respuesta();
    await controlador.deleteAdjustment({params:{faltanteId:datos.faltanteId}},res);
    assert.equal(res.codigo,409);
    assert.equal(res.cuerpo.success,false);
  });

  test('una factura en cola no admite cambiar ni borrar su respuesta hasta recuperarla', async () => {
    await guardar();
    await cola.encolarDesdeReporte(datos.facturaId);
    await assert.rejects(guardar({ estado: 'completo', cantidadEntregada: 3 }), e => e.status === 409);
    await assert.rejects(ajustes.deleteAdjustment(datos.faltanteId), e => e.status === 409);
    await cola.devolverAlReporte(datos.facturaId);
    await guardar({ estado: 'completo', cantidadEntregada: 3 });
  });

  test('una decisión tardía espera a encolar y después se rechaza; no cambia lo que se imprime', async () => {
    await guardar();
    const c = await pool.connect();
    let terminar;
    let terminada = false;
    try {
      await c.query('BEGIN');
      await c.query('SELECT id FROM factura WHERE id=$1 FOR UPDATE', [datos.facturaId]);
      await c.query(`INSERT INTO facturas_reimpresion(factura_propia_id,estado,categoria,ajustes_realizados)
        VALUES($1,'pendiente','requiere_cambios','[]'::jsonb)`, [datos.facturaId]);
      terminar = guardar({ estado: 'completo', cantidadEntregada: 3 }).then(
        () => { terminada = true; return null; }, e => { terminada = true; return e; });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(terminada, false, 'el guardado se cruzó con el envío a Impresión');
      await c.query('COMMIT');
      assert.equal((await terminar)?.status, 409);
      const { rows: [r] } = await pool.query('SELECT cantidad_entregada,estado FROM faltantes_ajustes WHERE faltante_id=$1', [datos.faltanteId]);
      assert.equal(r.cantidad_entregada, 0);
      assert.equal(r.estado, 'no_llego');
    } finally {
      await c.query('ROLLBACK');
      c.release();
      await terminar;
    }
  });

  test('no altera facturas anuladas o faltantes ya procesados', async () => {
    await pool.query("UPDATE factura SET estado='anulada' WHERE id=$1", [datos.facturaId]);
    await assert.rejects(guardar(), e => e.status === 409);
    await pool.query("UPDATE factura SET estado='emitida' WHERE id=$1", [datos.facturaId]);
    await pool.query("UPDATE faltantes SET estado='procesado' WHERE id=$1", [datos.faltanteId]);
    await assert.rejects(guardar(), e => e.status === 409);
    await assert.rejects(ajustes.deleteAdjustment(datos.faltanteId), e => e.status === 409);
  });

  test('6 menos 3 sigue dejando 3; recuperar y confirmar que llegó todo restaura 6 una vez', async () => {
    await guardar();
    await cola.encolarDesdeReporte(datos.facturaId);
    await impresion.procesar(datos.facturaId);
    const cantidad = async () => Number((await pool.query('SELECT cantidad FROM factura_linea WHERE factura_id=$1', [datos.facturaId])).rows[0].cantidad);
    assert.equal(await cantidad(), 3);
    await assert.rejects(guardar(), e => e.status === 409);
    await cola.devolverAlReporte(datos.facturaId);
    await guardar({ estado: 'completo', cantidadEntregada: 3 });
    await cola.encolarDesdeReporte(datos.facturaId);
    await impresion.procesar(datos.facturaId);
    assert.equal(await cantidad(), 6);
    // Reprocesarla (desde Reporte Clientes: Impresión ya no recupera) no la vuelve a tocar.
    await cola.devolverAlReporte(datos.facturaId);
    await cola.encolarDesdeReporte(datos.facturaId);
    await impresion.procesar(datos.facturaId);
    assert.equal(await cantidad(), 6);
  });
});
