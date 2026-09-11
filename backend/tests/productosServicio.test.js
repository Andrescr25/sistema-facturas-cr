const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Maestro de productos propio: validación, precio con IVA, historial de
 * precios, estados y filtros. La base es un doble.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'productos', 'productos.service.js');

function montar(responder = () => null) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    const r = await responder(texto, params);
    return r || { rows: [], rowCount: 0 };
  };
  const cliente = { query: ejecutar, release: () => log.push({ sql: 'RELEASE', params: [] }) };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => cliente, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

beforeEach(() => { delete require.cache[rutaDb]; delete require.cache[rutaServicio]; });

const hubo = (log, re) => log.some(l => re.test(l.sql));
const sqls = (log) => log.map(l => l.sql);

// Filas como las devuelve pg: los NUMERIC vienen como texto.
const TORNILLO = {
  id: 7, nombre: 'TORNILLO FRIJOLILLO 3/4', referencia: 'TOR02', cabys: '4294401030100', impuesto_id: 1,
  unidad: 'Unid', categoria_id: 3, precio_sin_iva: '800.00000', costo_con_iva: '900.00000',
  inventariable: true, es_medicamento: false, forma_farmaceutica: null, registro_sanitario: null,
  imagen_url: null, activo: true, oculto: false, alegra_id: '1183', actualizado_en: '2026-09-11'
};

const VALIDO = { nombre: 'TORNILLO NUEVO', referencia: 'TOR99', cabys: '4294401030100', impuesto_id: 1, precio_sin_iva: 800, costo_con_iva: 900 };

/** Un responder de base que conoce impuestos, categorías y un producto. */
function base({ producto = TORNILLO, impuestoActivo = true, referenciaUsada = null, tarifa = '13.00' } = {}) {
  let actual = { ...producto };
  return (sql, params) => {
    if (/FROM impuesto WHERE id = \$1/.test(sql) && /activo/.test(sql)) return { rows: [{ id: params[0], tarifa, activo: impuestoActivo }] };
    if (/SELECT tarifa FROM impuesto/.test(sql)) return { rows: [{ tarifa }] };
    if (/FROM categoria_producto WHERE id = \$1/.test(sql) && !/FOR UPDATE/.test(sql)) return { rows: [{ id: params[0], activo: true }] };
    if (/lower\(referencia\) = lower\(\$1\)/.test(sql)) return { rows: referenciaUsada ? [{ id: 99, nombre: referenciaUsada }] : [] };
    if (/INSERT INTO producto/.test(sql)) { actual = { ...producto, id: 50, ...Object.fromEntries(sql.match(/\(([^)]+)\) VALUES/)[1].split(', ').map((c, i) => [c, params[i]])) }; return { rows: [{ ...actual }] }; }
    // Siempre copias: pg devuelve filas nuevas en cada consulta. Devolver el
    // mismo objeto hacía que el UPDATE cambiara también el "antes" y el
    // servicio no veía ningún cambio de precio.
    if (/FROM producto WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [{ ...actual }] };
    if (/^UPDATE producto SET/.test(sql)) {
      const cols = sql.match(/SET (.+?), actualizado_en/)[1].split(', ').map(x => x.split(' = ')[0]);
      actual = { ...actual };
      cols.forEach((c, i) => { actual[c] = typeof params[i] === 'number' ? params[i].toFixed(5) : params[i]; });
      return { rows: [{ ...actual }] };
    }
    if (/INSERT INTO bitacora_cambio/.test(sql)) return { rows: [{ id: '1' }] };
    if (/WHERE p\.id = \$1/.test(sql)) return { rows: [{ ...actual, categoria: 'Ferretería', impuesto: 'IVA 13 %', tarifa }] };
    return null;
  };
}

describe('crear producto', () => {
  test('sin CABYS o con un CABYS que no tiene 13 dígitos, no llega a la base', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.crearProducto({ ...VALIDO, cabys: undefined }, 4), e => e.status === 400 && /CABYS/.test(e.message));
    await assert.rejects(servicio.crearProducto({ ...VALIDO, cabys: '429440103010' }, 4), e => e.status === 400 && /13 dígitos/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('un medicamento sin registro sanitario se rechaza antes de tocar la base', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.crearProducto({ ...VALIDO, es_medicamento: true, forma_farmaceutica: '12' }, 4),
      e => e.status === 400 && /forma farmacéutica y registro sanitario/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('con un impuesto inactivo no se crea', async () => {
    const { servicio, log } = montar(base({ impuestoActivo: false }));
    await assert.rejects(servicio.crearProducto(VALIDO, 4), e => e.status === 400 && /Impuesto/.test(e.message));
    assert.equal(hubo(log, /INSERT INTO producto/), false);
    assert.ok(sqls(log).includes('ROLLBACK'));
  });

  test('una referencia que ya usa otro producto activo es 409 y dice cuál', async () => {
    const { servicio, log } = montar(base({ referenciaUsada: 'TORNILLO VIEJO' }));
    await assert.rejects(servicio.crearProducto(VALIDO, 4), e => e.status === 409 && /TORNILLO VIEJO/.test(e.message));
    assert.equal(hubo(log, /INSERT INTO producto/), false);
  });

  test('crea con las columnas de la lista blanca, unidad por defecto y precio con IVA calculado', async () => {
    const { servicio, log } = montar(base());
    const r = await servicio.crearProducto({ ...VALIDO, alegra_id: '999', activo: false, oculto: true }, '4');
    const insert = log.find(l => /INSERT INTO producto/.test(l.sql));
    const columnas = insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    assert.equal(columnas.includes('alegra_id'), false, 'alegra_id no se puede poner desde la pantalla');
    assert.equal(columnas.includes('activo'), false);
    assert.ok(columnas.includes('unidad'));
    assert.equal(insert.params[columnas.indexOf('unidad')], 'Unid');

    assert.strictEqual(r.precio_sin_iva, 800, 'los NUMERIC salen como número');
    assert.strictEqual(r.precio_con_iva, 904);
    const iBit = log.findIndex(l => /bitacora_cambio/.test(l.sql));
    assert.ok(iBit > -1 && iBit < sqls(log).indexOf('COMMIT'));
    assert.equal(log[iBit].params[2], 'crear');
  });
});

describe('editar producto', () => {
  test('cambiar el precio deja el historial igual que Revisión de Precios', async () => {
    const { servicio, log } = montar(base());
    await servicio.editarProducto(7, { precio_sin_iva: 950 }, 4);
    const h = log.find(l => /INSERT INTO precio_historico/.test(l.sql));
    assert.ok(h, 'no se registró el cambio de precio');
    assert.match(h.sql, /'gestion_catalogo'/);
    const [productoId, alegraId, anterior, nuevo, costoSinIva, margen] = h.params;
    assert.deepEqual([productoId, alegraId, anterior, nuevo], [7, '1183', 800, 950]);
    // Costo SIN IVA: 900 / 1,13. Margen sobre el precio sin IVA.
    assert.equal(costoSinIva, 796.4602);
    assert.equal(margen, Math.round(((950 - 900 / 1.13) / 950) * 10000) / 100);
  });

  test('sin cambio de precio no se toca el historial', async () => {
    const { servicio, log } = montar(base());
    await servicio.editarProducto(7, { nombre: 'TORNILLO FRIJOLILLO 3/4 PTA BROCA' }, 4);
    assert.equal(hubo(log, /precio_historico/), false);
    assert.ok(hubo(log, /bitacora_cambio/));
  });

  test('editar el precio de un medicamento viejo incompleto no se bloquea', async () => {
    const incompleto = { ...TORNILLO, es_medicamento: true, forma_farmaceutica: null, registro_sanitario: null };
    const { servicio } = montar(base({ producto: incompleto }));
    const r = await servicio.editarProducto(7, { precio_sin_iva: 900 }, 4);
    assert.equal(r.precio_sin_iva, 900);
  });

  test('marcarlo como medicamento sin completar sus datos sí se rechaza', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.editarProducto(7, { es_medicamento: true }, 4), e => e.status === 400);
    assert.equal(hubo(log, /UPDATE producto/), false);
  });

  test('la unidad no puede quedar vacía y sin datos no hay edición', async () => {
    const { servicio } = montar(base());
    await assert.rejects(servicio.editarProducto(7, { unidad: '' }, 4), /Unidad: es obligatoria/);
    await assert.rejects(servicio.editarProducto(7, { inventado: 1 }, 4), /No vino ningún dato/);
  });
});

describe('estado', () => {
  test('ocultar queda en la bitácora como "ocultar"', async () => {
    const { servicio, log } = montar(base());
    const r = await servicio.cambiarEstadoProducto(7, { oculto: true }, 4);
    assert.equal(r.oculto, true);
    assert.equal(log.find(l => /bitacora_cambio/.test(l.sql)).params[2], 'ocultar');
  });

  test('sin cambio real no escribe; "true" como texto o nada se rechazan', async () => {
    const { servicio, log } = montar(base());
    await servicio.cambiarEstadoProducto(7, { activo: true }, 4);
    assert.equal(hubo(log, /UPDATE producto/), false);
    await assert.rejects(servicio.cambiarEstadoProducto(7, { activo: 'false' }, 4), e => e.status === 400);
    await assert.rejects(servicio.cambiarEstadoProducto(7, {}, 4), /activo u oculto/);
  });
});

describe('listar', () => {
  const vacio = () => ({ rows: [] });

  test('la búsqueda ignora acentos y mayúsculas, palabra por palabra, siempre como parámetro', async () => {
    const { servicio, log } = montar(vacio);
    await servicio.listarProductos({ buscar: "  Anzuelo MÚSTAD '; DROP TABLE producto;-- " });
    const q = log[0];
    assert.match(q.sql, /translate\(lower\(/);
    assert.ok(q.params.includes('%anzuelo%'));
    assert.ok(q.params.includes('%mustad%'));
    assert.doesNotMatch(q.sql, /DROP TABLE/, 'el texto buscado nunca se pega en el SQL');
  });

  test('por omisión trae activos y visibles; el límite no pasa de 100', async () => {
    const { servicio, log } = montar(vacio);
    await servicio.listarProductos({ limite: 5000 });
    assert.match(log[0].sql, /p\.activo = TRUE AND p\.oculto = FALSE/);
    assert.ok(log[0].params.includes(100));
    await assert.rejects(servicio.listarProductos({ estado: 'borrados' }), e => e.status === 400);
  });

  test('filtro por proveedor por cédula, y "sin proveedor"', async () => {
    const { servicio, log } = montar(vacio);
    await servicio.listarProductos({ proveedor: '3101013155' });
    await servicio.listarProductos({ proveedor: 'sin-proveedor' });
    assert.match(log[0].sql, /EXISTS \(SELECT 1 FROM supplier_product_mapping m WHERE m\.alegra_item_id = p\.alegra_id AND m\.supplier_cedula = \$1\)/);
    assert.ok(log[0].params.includes('3101013155'));
    assert.match(log[1].sql, /NOT EXISTS/);
  });

  test('para vender no se expone el costo', async () => {
    const { servicio } = montar(() => ({ rows: [{ ...TORNILLO, total: '1', categoria: 'Ferretería', tarifa: '13.00' }] }));
    const r = await servicio.productosParaOperar({});
    assert.equal(r.paginacion.total, 1);
    assert.equal('costo_con_iva' in r.data[0], false);
    assert.equal(r.data[0].precio_con_iva, 904);
  });
});

describe('proveedores para el filtro', () => {
  test('trae los proveedores y cuántos productos no tienen ninguno', async () => {
    const { servicio } = montar((sql) => /NOT EXISTS/.test(sql)
      ? { rows: [{ productos: 695 }] }
      : { rows: [{ cedula: '3101013155', nombre: 'CADENA COMERCIAL RAMONENSE S.A.', productos: 513 }] });
    const r = await servicio.proveedoresConProductos();
    assert.equal(r.proveedores[0].productos, 513);
    assert.deepEqual(r.sinProveedor, { valor: 'sin-proveedor', productos: 695 });
  });
});

describe('categorías', () => {
  test('sin nombre no se crea; repetida es 409', async () => {
    const { servicio, log } = montar((sql) => {
      if (/INSERT INTO categoria_producto/.test(sql)) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
      return null;
    });
    await assert.rejects(servicio.crearCategoria({}, 4), e => e.status === 400);
    assert.equal(log.length, 0);
    await assert.rejects(servicio.crearCategoria({ nombre: 'Ferretería' }, 4), e => e.status === 409 && /Ya existe una categoría/.test(e.message));
  });

  test('editar una que no existe es 404', async () => {
    const { servicio } = montar(() => ({ rows: [] }));
    await assert.rejects(servicio.editarCategoria(999, { nombre: 'X' }, 4), e => e.status === 404);
  });
});

describe('contra la base local', { skip: !process.env.PROBAR_BASE_LOCAL }, () => {
  test('un producto sin id de Alegra puede tener historial de precio', async () => {
    // La prueba en vivo encontró que precio_historico.alegra_item_id era NOT
    // NULL: cambiarle el precio a un producto creado sin Alegra daba 500.
    delete require.cache[rutaDb];
    const { pool } = require('../config/database');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query(
        `INSERT INTO producto (nombre, cabys, precio_sin_iva) VALUES ('zz prueba historial', '4294401030100', 100) RETURNING id`);
      await cliente.query(
        `INSERT INTO precio_historico (producto_id, alegra_item_id, precio_anterior, precio_nuevo, origen)
         VALUES ($1, NULL, 100, 120, 'gestion_catalogo')`, [rows[0].id]);
      const { rows: h } = await cliente.query('SELECT COUNT(*)::int AS n FROM precio_historico WHERE producto_id = $1', [rows[0].id]);
      assert.equal(h[0].n, 1);
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });
});
