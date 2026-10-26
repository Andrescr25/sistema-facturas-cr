/**
 * Faltantes y cola de impresión con los ids PROPIOS (sección 11 del
 * checklist, pasos 2 y 3; migración independencia/032), de punta a punta
 * contra la base local de la rama.
 *
 * POR QUÉ CONTRA LA BASE. Todo lo que cambió acá es SQL: columnas nuevas,
 * renombradas, otras tablas en los JOIN. Un doble acepta cualquier texto como
 * SQL; solo Postgres dice si una columna existe y si los tipos calzan (ver
 * sqlBodegaEstado.test.js).
 *
 * CÓMO NO DEJA RASTRO. Todo corre en UNA conexión dentro de BEGIN, y al final
 * ROLLBACK. Las transacciones propias de los módulos se vuelven SAVEPOINT
 * (si no, su COMMIT confirmaría lo de la prueba). Solo con la base LOCAL:
 * config/aislado.js se niega a conectar a otra.
 *
 * LA LIMPIEZA SEMANAL NO SE EJECUTA, ni acá: su SQL solo se analiza con
 * PREPARE, que no toca una fila.
 *
 * LO QUE SE CUIDA
 *  - Bodega registra el faltante sobre factura.id y producto.id, sin tocar
 *    las columnas viejas, y registrar de nuevo actualiza en vez de duplicar.
 *  - Los dos reportes, las notas y la cola leen esas columnas.
 *  - Una factura anulada sale de los reportes.
 *  - Despachar sin faltantes deja UNA fila en la cola, aunque se repita.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { compraIngresada } = require('./dobles/compraIngresada');

require('dotenv').config();

const hayBase = Boolean(process.env.DATABASE_URL);
const SRC = path.join(__dirname, '..', 'src');

let pool; let cliente;

/** config/database sustituido: todo por la conexión de la prueba. */
function baseDePrueba() {
  const query = (sql, params) => cliente.query(sql, params);
  let nivel = 0;
  return {
    query,
    pool: {
      query,
      connect: async () => ({
        query: async (sql, params) => {
          const t = String(sql).trim();
          if (t === 'BEGIN') return cliente.query(`SAVEPOINT prueba_${++nivel}`);
          if (t === 'COMMIT') return cliente.query(`RELEASE SAVEPOINT prueba_${nivel--}`);
          if (t === 'ROLLBACK') return cliente.query(`ROLLBACK TO SAVEPOINT prueba_${nivel--}`);
          return cliente.query(sql, params);
        },
        release() {}
      })
    }
  };
}

/** El texto de la plantilla SQL de `archivo` que contiene `marcador`. */
function sqlDe(archivo, marcador) {
  const fuente = fs.readFileSync(path.join(SRC, '..', archivo), 'utf8');
  const i = fuente.indexOf(marcador);
  assert.ok(i >= 0, `no está "${marcador}" en ${archivo}`);
  const desde = fuente.lastIndexOf('`', i) + 1;
  const hasta = fuente.indexOf('`', i);
  const sql = fuente.slice(desde, hasta);
  assert.doesNotMatch(sql, /\$\{/, 'la plantilla tiene interpolaciones: no se puede analizar tal cual');
  return sql;
}

let preparadas = 0;
async function errorAlAnalizar(sql) {
  const nombre = `verificacion_032_${process.pid}_${++preparadas}`;
  await cliente.query(`SAVEPOINT analisis`);
  try {
    await cliente.query(`PREPARE ${nombre} AS ${sql}`);
    await cliente.query(`DEALLOCATE ${nombre}`);
    return null;
  } catch (e) {
    return e;
  } finally {
    await cliente.query(`ROLLBACK TO SAVEPOINT analisis`).catch(() => {});
  }
}

describe('faltantes y cola con ids propios — contra la base local', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let m = {};
  let A; let B; let lineasA;

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    cliente = await pool.connect();
    await cliente.query('BEGIN');

    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseDePrueba() };
    // Prisma (el último precio de cada proveedor, para asignar el faltante)
    // va por su propia conexión y se cierra en un `beforeExit` que escribe en
    // la salida DESPUÉS de que terminó la prueba: el runner de Node a veces no
    // lo puede leer ("Unable to deserialize cloned data") y da la prueba por
    // caída. Acá no se prueba ese precio: sin él, la asignación sigue.
    const rutaPrisma = require.resolve('../lib/prisma');
    require.cache[rutaPrisma] = {
      id: rutaPrisma, filename: rutaPrisma, loaded: true,
      exports: { productoFactura: { findFirst: async () => null } }
    };

    m = {
      bodega: require('../src/modules/warehouse/bodegaPropia'),
      cola: require('../src/modules/reprinting/colaImpresion'),
      notas: require('../src/modules/reports/notasDeFaltantes'),
      reportes: new (require('../src/modules/reports/report.service'))(),
      impresion: require('../src/modules/reprinting/procesarImpresion'),
      portal: require('../src/modules/portal-clientes/portal-clientes.cliente.service'),
      tablero: require('../src/modules/dashboard/dashboard.service')
    };

    // Fichas propias de la prueba: no tomar una factura real cuya cantidad
    // puede ser menor que los tres faltantes de este recorrido.
    const fixture = await require('./dobles/ordenesAutomaticas').sembrar(cliente);
    [A, B] = fixture.facturas;
    lineasA = fixture.productos.slice(0, 2);
  });

  after(async () => {
    await cliente?.query('ROLLBACK').catch(() => {});
    cliente?.release();
    await pool?.end().catch(() => {});
  });

  test('Bodega registra sobre factura.id y producto.id, sin tocar las columnas viejas', async () => {
    const r = await m.bodega.registrarFaltantes(A, [
      { producto_id: lineasA[0], cantidad_faltante: 2, tipo_faltante: 'parcial', observaciones: 'zz prueba' },
      { producto_id: lineasA[1], cantidad_faltante: 0, tipo_faltante: 'completo' }
    ], 'zz-prueba');
    assert.equal(r.faltantes_registrados, 2);

    const { rows } = await cliente.query(`
      SELECT producto_propio_id, cantidad_faltante, tipo_faltante, factura_vieja_id, producto_viejo_id
        FROM faltantes WHERE factura_propia_id = $1 ORDER BY producto_propio_id
    `, [A]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((f) => f.factura_vieja_id === null && f.producto_viejo_id === null), 'escribió en una columna vieja');
  });

  test('registrar de nuevo la misma factura actualiza, no duplica', async () => {
    await m.bodega.registrarFaltantes(A, [{ producto_id: lineasA[0], cantidad_faltante: 3, tipo_faltante: 'parcial' }], 'zz-prueba');
    const { rows } = await cliente.query(
      `SELECT cantidad_faltante FROM faltantes WHERE factura_propia_id = $1 AND producto_propio_id = $2`, [A, lineasA[0]]);
    assert.deepEqual(rows.map((r) => r.cantidad_faltante), [3]);
  });

  test('lo registrado vuelve con el id propio del producto', async () => {
    const estados = await m.bodega.estados(A);
    const e = estados.find((x) => x.productoId === lineasA[0]);
    assert.equal(e.tipoFaltante, 'parcial');
    assert.equal(e.cantidadFaltante, 3);
  });

  test('el Reporte de Clientes trae la factura con su id propio y el producto con el suyo', async () => {
    const r = await m.reportes.getMissingItemsByClient();
    assert.equal(r.success, true, r.error);
    const factura = r.data.flatMap((c) => c.facturas_con_faltantes).find((f) => f.factura_id === A);
    assert.ok(factura, 'la factura no salió en el reporte');
    assert.deepEqual(factura.productos_faltantes.map((p) => p.producto_id), [lineasA[0]], 'el completo no es un faltante');
    assert.equal(factura.productos_faltantes[0].cantidad_faltante, 3);
    assert.equal(factura.estado_procesamiento, 'pendiente');
  });

  test('el Reporte de Proveedores trae el producto con su id propio', async () => {
    const r = await m.reportes.getMissingItemsBySupplier();
    assert.equal(r.success, true, r.error);
    const producto = r.data.flatMap((p) => p.productos_faltantes).find((p) => p.producto_id === lineasA[0]);
    assert.ok(producto, 'el producto no salió en el reporte');
    assert.ok(producto.cantidad_faltante >= 3);
  });

  test('la nota de la línea sale por el id propio, y la descripción del producto no cuenta como nota', async () => {
    await cliente.query(`UPDATE factura_linea SET descripcion = 'ZZ AZUL' WHERE factura_id = $1 AND producto_id = $2`, [A, lineasA[0]]);
    let r = await m.notas.notasPorProducto();
    assert.deepEqual(r.porProducto[String(lineasA[0])].map((n) => n.nota), ['ZZ AZUL']);

    await cliente.query(`
      UPDATE factura_linea l SET descripcion = p.descripcion
        FROM producto p WHERE p.id = l.producto_id AND l.factura_id = $1 AND l.producto_id = $2
    `, [A, lineasA[0]]);
    await cliente.query(`UPDATE producto SET descripcion = 'ZZ DESCRIPCION DEL PRODUCTO' WHERE id = $1`, [lineasA[0]]);
    await cliente.query(`UPDATE factura_linea SET descripcion = 'ZZ DESCRIPCION DEL PRODUCTO' WHERE factura_id = $1 AND producto_id = $2`, [A, lineasA[0]]);
    r = await m.notas.notasPorProducto();
    assert.equal(r.porProducto[String(lineasA[0])], undefined);
  });

  test('despachar sin faltantes deja UNA fila en la cola, aunque se repita', async () => {
    await m.bodega.actualizarEstado(B, { estado: 'procesado', enviarAImpresion: true });
    await m.bodega.actualizarEstado(B, { estado: 'procesado', enviarAImpresion: true });
    const { rows } = await cliente.query(`SELECT categoria, estado FROM facturas_reimpresion WHERE factura_propia_id = $1`, [B]);
    assert.deepEqual(rows, [{ categoria: 'sin_pendientes', estado: 'pendiente' }]);

    const pendientes = await m.cola.listarPendientes();
    const enCola = [...pendientes.data.sin_cambios, ...pendientes.data.requiere_cambios].find((f) => f.factura_id === B);
    assert.ok(enCola, 'no aparece en Impresión');
    assert.equal(enCola.categoria, 'sin_pendientes');
  });

  test('las procesadas se listan, de a una página, sin nada para recuperar', async () => {
    const r = await m.cola.listarProcesadas();
    assert.equal(r.success, true);
    assert.equal(r.paginacion.pagina, 1);
    assert.equal(r.data.some((f) => 'puede_recuperar' in f), false);
  });

  test('Reporte de Clientes → Impresión: los ajustes salen de lo guardado, por el id propio', async () => {
    const { rows: [f] } = await cliente.query(
      `SELECT id FROM faltantes WHERE factura_propia_id = $1 AND producto_propio_id = $2`, [A, lineasA[0]]);
    // Lo que la pantalla guarda al tocar "Parte": llegó 1 de 3, que ingresó por una compra.
    await compraIngresada(cliente, lineasA[0], 1);
    await require('../src/modules/missing-items/missing-items.service').saveAdjustment({
      faltanteId: f.id, cantidadEntregada: 1, estado: 'parcial', requiereActualizacion: true, revisado: true
    });

    const r = await m.cola.encolarDesdeReporte(A);
    assert.equal(r.requiere_cambios, true);
    const { rows } = await cliente.query(`SELECT estado, categoria, ajustes_realizados FROM facturas_reimpresion WHERE factura_propia_id = $1`, [A]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].categoria, 'requiere_cambios');
    assert.deepEqual(rows[0].ajustes_realizados.map((aj) => [aj.faltante_id, aj.producto_id, aj.cantidad_faltante, aj.cantidad_entregada, aj.estado]),
      [[f.id, lineasA[0], 3, 1, 'parcial']], 'el completo no entra; el parcial lleva lo que llegó');

    const reporte = await m.reportes.getMissingItemsByClient();
    const enReporte = reporte.data.flatMap((c) => c.facturas_con_faltantes).find((x) => x.factura_id === A);
    assert.equal(enReporte.en_cola_impresion, true);
  });

  test('recuperar una factura que no se imprimió la saca de la cola (antes volvía bloqueada al recargar)', async () => {
    const r = await m.cola.devolverAlReporte(A);
    assert.equal(r.sacada_de_la_cola, true);
    const { rows } = await cliente.query(`SELECT 1 FROM facturas_reimpresion WHERE factura_propia_id = $1`, [A]);
    assert.equal(rows.length, 0);
    const reporte = await m.reportes.getMissingItemsByClient();
    const enReporte = reporte.data.flatMap((c) => c.facturas_con_faltantes).find((x) => x.factura_id === A);
    assert.equal(enReporte.en_cola_impresion, false);
    assert.equal(enReporte.estado_procesamiento, 'pendiente');
  });

  test('recuperar una ya procesada reabre sus faltantes y deja la fila como historial de Impresión', async () => {
    await m.cola.encolarDesdeReporte(A);
    // Lo que hará Impresión al procesarla (parte 3).
    await cliente.query(`UPDATE faltantes SET estado = 'procesado' WHERE factura_propia_id = $1`, [A]);
    await cliente.query(`UPDATE facturas_reimpresion SET estado = 'procesada', fecha_procesamiento = NOW() WHERE factura_propia_id = $1`, [A]);
    let reporte = await m.reportes.getMissingItemsByClient();
    assert.equal(reporte.data.flatMap((c) => c.facturas_con_faltantes).find((x) => x.factura_id === A).estado_procesamiento, 'procesado');

    const r = await m.cola.devolverAlReporte(A);
    assert.equal(r.sacada_de_la_cola, false);
    assert.ok(r.faltantes_reabiertos >= 1);
    reporte = await m.reportes.getMissingItemsByClient();
    const enReporte = reporte.data.flatMap((c) => c.facturas_con_faltantes).find((x) => x.factura_id === A);
    assert.equal(enReporte.estado_procesamiento, 'pendiente');
    const { rows } = await cliente.query(`SELECT estado FROM facturas_reimpresion WHERE factura_propia_id = $1`, [A]);
    assert.deepEqual(rows, [{ estado: 'procesada' }]);
  });

  test('sin faltantes pendientes no se manda a Impresión', async () => {
    await assert.rejects(() => m.cola.encolarDesdeReporte(B), (e) => e.status === 409 && /no tiene faltantes/.test(e.message));
    await assert.rejects(() => m.cola.encolarDesdeReporte('abc'), (e) => e.status === 400);
  });

  // ─── Impresión (parte 3) ───
  const cantidadEnFactura = async (productoId) => Number((await cliente.query(
    `SELECT COALESCE(SUM(cantidad), 0) AS n FROM factura_linea WHERE factura_id = $1 AND producto_id = $2`, [A, productoId])).rows[0].n);
  const faltanteDeA = async () => (await cliente.query(
    `SELECT id, estado, cantidad_rebajada FROM faltantes WHERE factura_propia_id = $1 AND producto_propio_id = $2`, [A, lineasA[0]])).rows[0];
  const yo = { id: null, nombre: 'zz-prueba' };
  let antes;

  test('Impresión procesa: rebaja lo que no llegó, edita la factura propia y la marca impresa', async () => {
    // Llegó 1 de 3 (parcial, del Reporte de Clientes): se rebajan 2.
    await cliente.query(`UPDATE factura_linea SET cantidad = 10 WHERE factura_id = $1 AND producto_id = $2`, [A, lineasA[0]]);
    antes = await cantidadEnFactura(lineasA[0]);
    await m.cola.encolarDesdeReporte(A);

    const detalle = await m.impresion.detalle(A);
    const propuesta = detalle.lineas.filter((l) => l.productoId === lineasA[0]).reduce((s, l) => s + l.cantidad, 0);
    assert.equal(propuesta, antes - 2, 'la pantalla de edición propone la rebaja');

    const procesamientos = Number((await cliente.query('SELECT COUNT(*) AS n FROM procesamientos')).rows[0].n);
    const r = await m.impresion.procesar(A, {}, yo);
    assert.equal(r.editada, true);
    assert.equal(await cantidadEnFactura(lineasA[0]), antes - 2);
    assert.deepEqual(await faltanteDeA(), { id: (await faltanteDeA()).id, estado: 'procesado', cantidad_rebajada: '2' });
    const { rows: cola } = await cliente.query(`SELECT estado FROM facturas_reimpresion WHERE factura_propia_id = $1`, [A]);
    assert.deepEqual(cola, [{ estado: 'procesada' }]);
    assert.equal(Number((await cliente.query('SELECT COUNT(*) AS n FROM procesamientos')).rows[0].n), procesamientos + 1);
    const { rows: [bitacora] } = await cliente.query(
      `SELECT accion FROM bitacora_cambio WHERE entidad = 'factura' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`, [A]);
    assert.equal(bitacora.accion, 'editar', 'la edición queda en la bitácora como cualquier otra');
  });

  test('recuperada (desde Reporte Clientes) y vuelta a procesar: NO se rebaja dos veces', async () => {
    // Impresión ya no recupera (2026-10-24); el camino que queda es el del reporte.
    assert.equal(m.impresion.recuperarProcesada, undefined);
    const rec = await m.cola.devolverAlReporte(A);
    assert.ok(rec.faltantes_reabiertos >= 1);
    await m.cola.encolarDesdeReporte(A);
    const r = await m.impresion.procesar(A, {}, yo);
    assert.equal(r.editada, false, 'no había nada nuevo que aplicar');
    assert.equal(await cantidadEnFactura(lineasA[0]), antes - 2);
  });

  test('si después llegó todo, al volver a procesar se le devuelve a la factura', async () => {
    await m.cola.devolverAlReporte(A);
    const { id } = await faltanteDeA();
    await compraIngresada(cliente, lineasA[0], 2); // el resto, en otra compra
    await require('../src/modules/missing-items/missing-items.service').saveAdjustment({
      faltanteId: id, cantidadEntregada: 3, estado: 'completo', requiereActualizacion: false, revisado: true
    });
    await m.cola.encolarDesdeReporte(A);
    await m.impresion.procesar(A, {}, yo);
    assert.equal(await cantidadEnFactura(lineasA[0]), antes);
    assert.equal((await faltanteDeA()).cantidad_rebajada, '0');
  });

  test('desde la pantalla de edición se guarda lo que dejó la persona', async () => {
    await m.cola.devolverAlReporte(A);
    await m.cola.encolarDesdeReporte(A);
    const { lineas } = await m.impresion.detalle(A);
    const editadas = lineas.map((l) => ({ ...l, cantidad: l.productoId === lineasA[0] ? 1 : l.cantidad }));
    const r = await m.impresion.procesar(A, { lineas: editadas }, yo);
    assert.equal(r.editada, true);
    assert.equal(await cantidadEnFactura(lineasA[0]), 1);
    const { rows: [f] } = await cliente.query('SELECT total FROM factura WHERE id = $1', [A]);
    assert.equal(Number(f.total), r.total);
  });

  test('una que no está en la cola no se procesa', async () => {
    await assert.rejects(() => m.impresion.procesar(A, {}, yo), (e) => e.status === 409 && /no está en la cola/.test(e.message));
  });

  test('una que Bodega despachó completa solo se marca impresa: la factura no se toca', async () => {
    const totalAntes = (await cliente.query('SELECT total FROM factura WHERE id = $1', [B])).rows[0].total;
    const r = await m.impresion.procesar(B, {}, yo);
    assert.equal(r.editada, false);
    assert.equal((await cliente.query('SELECT total FROM factura WHERE id = $1', [B])).rows[0].total, totalAntes);
    const { rows } = await cliente.query(`SELECT estado FROM facturas_reimpresion WHERE factura_propia_id = $1`, [B]);
    assert.deepEqual(rows, [{ estado: 'procesada' }]);
  });

  test('el PDF de Impresión es el de la factura propia', async () => {
    const { archivo, numero } = await m.impresion.pdf(A);
    assert.ok(Buffer.isBuffer(archivo));
    assert.equal(archivo.subarray(0, 4).toString(), '%PDF');
    assert.ok(numero);
  });

  test('el buscador de productos encuentra por referencia, con el id propio', async () => {
    const { rows: [prod] } = await cliente.query(`SELECT id, referencia FROM producto WHERE activo AND referencia IS NOT NULL AND length(referencia) >= 3 ORDER BY id LIMIT 1`);
    const r = await m.impresion.buscarProductos(prod.referencia);
    assert.ok(r.some((x) => x.productoId === prod.id && x.reference === prod.referencia));
  });

  test('el tablero cuenta lo que Bodega tiene por alistar, de `factura`', async () => {
    const antes = (await m.tablero.resumen()).bodega;
    await cliente.query(`UPDATE factura SET estado_bodega = 'pendiente', fecha = (now() AT TIME ZONE 'America/Costa_Rica')::date WHERE id = $1`, [B]);
    const despues = (await m.tablero.resumen()).bodega;
    assert.equal(typeof despues, 'number');
    assert.ok(despues >= antes, 'una emitida de hoy sin despachar cuenta');
  });

  test('el portal lee el alistado de `factura`: despachada = lista para envío, anulada = no procesado', async () => {
    const { rows: [cp] } = await cliente.query(`SELECT id, cliente_id FROM cliente_portal WHERE cliente_id IS NOT NULL LIMIT 1`);
    if (!cp) return; // la copia local no tiene clientes del portal
    await cliente.query(`UPDATE factura SET estado_bodega = 'procesado' WHERE id = $1`, [B]);
    const { rows: [pedido] } = await cliente.query(`
      INSERT INTO pedido_cliente (cliente_portal_id, cliente_id, estado, total, factura_id, numero_factura, origen)
      VALUES ($1, $2, 'facturado', 1, $3, 'ZZ', 'portal') RETURNING id
    `, [cp.id, cp.cliente_id, B]);
    let r = await m.portal.detallePedido(cp.id, pedido.id);
    assert.equal(r.etapa, 'listo_para_envio');
    await cliente.query(`UPDATE factura SET estado = 'anulada' WHERE id = $1`, [B]);
    r = await m.portal.detallePedido(cp.id, pedido.id);
    assert.equal(r.etapa, 'no_procesado');
  });

  test('una factura anulada sale del Reporte de Clientes y de las notas', async () => {
    await cliente.query(`UPDATE factura SET estado = 'anulada' WHERE id = $1`, [A]);
    const r = await m.reportes.getMissingItemsByClient();
    assert.ok(!r.data.flatMap((c) => c.facturas_con_faltantes).some((f) => f.factura_id === A));
    await assert.rejects(() => m.bodega.registrarFaltantes(A, []), (e) => e.status === 409);
    await assert.rejects(() => m.cola.encolarDesdeReporte(A), (e) => e.status === 409 && /anulada/.test(e.message));
  });

  test('el rechazo de la API retirada conserva faltantes, ajustes y observaciones', async () => {
    const huella = async () => (await cliente.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM faltantes f) faltantes,
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM faltantes_ajustes a) ajustes,
      (SELECT jsonb_agg(jsonb_build_array(id,bodega_observaciones) ORDER BY id) FROM factura) notas`)).rows[0];
    const antes=await huella(),r=await m.reportes.clearProcessedSupplierMissingItems();
    assert.equal(r.status,410);assert.equal(r.success,false);assert.deepEqual(await huella(),antes);
  });

  test('la verificación sirve: una columna renombrada SÍ es rechazada', async () => {
    const error = await errorAlAnalizar('SELECT factura_id FROM faltantes');
    assert.equal(error?.code, '42703', 'faltantes.factura_id todavía existe');
  });
});

describe('nada lee las columnas renombradas', () => {
  // Barrido de todo el SQL del servidor: una consulta sobre `faltantes` o
  // `facturas_reimpresion` que nombre `<alias>.factura_id` o `.producto_id`
  // lee una columna que ya no existe (ahora son `factura_vieja_id` y
  // `producto_viejo_id`). Dos así se escaparon al primer barrido, en una ruta
  // que ninguna pantalla llama: habrían fallado recién en producción.
  test('ni con alias ni sin él', () => {
    const hallazgos = [];
    const recorrer = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { recorrer(p); continue; }
        if (!e.name.endsWith('.js')) continue;
        const fuente = fs.readFileSync(p, 'utf8');
        for (const [, sql] of fuente.matchAll(/`([^`]*)`/gs)) {
          if (!/\b(faltantes|facturas_reimpresion)\b(?!_)/.test(sql)) continue;
          for (const t of sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+(faltantes|facturas_reimpresion)\b(?:\s+(?:AS\s+)?([a-z][a-z0-9_]*))?/gi)) {
            const alias = t[2] && !/^(SET|WHERE|ON|JOIN|LEFT|INNER|ORDER|GROUP|VALUES|USING|RETURNING)$/i.test(t[2]) ? t[2] : t[1];
            for (const c of sql.matchAll(new RegExp(`\\b${alias}\\.(factura_id|producto_id)\\b`, 'g'))) {
              hallazgos.push(`${path.relative(path.join(__dirname, '..'), p)}: ${alias}.${c[1]}`);
            }
          }
          if (/(INSERT INTO|UPDATE)\s+(faltantes|facturas_reimpresion)\b[^;]*\b(factura_id|producto_id)\b/.test(sql) &&
              !/factura_propia_id|producto_propio_id/.test(sql)) {
            hallazgos.push(`${path.relative(path.join(__dirname, '..'), p)}: escribe una columna vieja`);
          }
        }
      }
    };
    // `backend/routes` (el adaptador de /api/alegra) se borró el 2026-10-04.
    for (const dir of ['src', 'services']) recorrer(path.join(__dirname, '..', dir));
    assert.deepEqual(hallazgos, []);
  });
});

describe('la migración 032', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '032_faltantes_con_ids_propios.sql'), 'utf8');

  test('renombra las columnas viejas en vez de reusar su nombre para el id propio', () => {
    assert.match(sql, /RENAME COLUMN factura_id TO factura_vieja_id/);
    assert.match(sql, /RENAME COLUMN producto_id TO producto_viejo_id/);
    assert.doesNotMatch(sql, /ADD COLUMN IF NOT EXISTS (factura_id|producto_id)\b/);
  });

  test('enlaza el producto por el id de Alegra y, por referencia, solo si calza con uno', () => {
    assert.match(sql, /JOIN producto pr ON pr\.alegra_id = p\.alegra_id::text/);
    assert.match(sql, /WHERE pr\.referencia = p\.codigo\) = 1/);
  });

  // 2026-10-10. En el ensayo con datos de producción los 286 faltantes y las
  // 1.571 filas de la cola quedaron sin factura propia: la migración corre
  // antes de que existan las facturas y, ya renombradas las columnas, no
  // volvía a enlazar nunca.
  test('vuelve a enlazar cada vez que corre, con los nombres ya cambiados', () => {
    const fuera = sql.slice(sql.lastIndexOf('END $$;'));
    assert.match(fuera, /UPDATE faltantes f\s+SET factura_propia_id = fa\.factura_propia_id\s+FROM facturas fa\s+WHERE fa\.id = f\.factura_vieja_id/);
    assert.match(fuera, /WHERE p\.id = f\.producto_viejo_id/);
    assert.match(fuera, /UPDATE facturas_reimpresion r\s+SET factura_propia_id = fa\.factura_propia_id\s+FROM facturas fa\s+WHERE fa\.id = r\.factura_vieja_id/);
    // Solo llena lo vacío: nunca pisa un enlace ya hecho.
    assert.equal((fuera.match(/_propi[ao]_id IS NULL/g) || []).length, 4);
  });

  test('es repetible: lo que cambia va detrás de una revisión de la columna', () => {
    assert.equal((sql.match(/IF EXISTS \(SELECT 1 FROM information_schema\.columns/g) || []).length, 2);
  });
});
