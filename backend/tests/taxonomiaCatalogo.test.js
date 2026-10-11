const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Gestión de Catálogo sobre el maestro propio (taxonomia.service.js): el
 * rediseño de `main`, con la subcategoría en `producto` (migración 030).
 *
 * Lo que se cuida:
 *  - que las tarjetas cuenten con el MISMO criterio de "visible" que la lista
 *    de adentro (activo y no oculto): si no, dicen 37 y adentro hay 35;
 *  - que el orden sea el del agente (categoria_config.orden), y las que no
 *    tienen orden vayan al final;
 *  - que un producto no pueda quedar en una subcategoría de OTRA categoría;
 *  - que cambiar de categoría suelte la subcategoría en el mismo UPDATE.
 *
 * Las sentencias de verdad se prueban contra la base local con
 * PROBAR_BASE_LOCAL=1: mover una subcategoría falló la primera vez por un
 * tipo que Postgres no pudo deducir, y un doble no lo hubiera visto nunca.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'productos', 'taxonomia.service.js');
// El helper nuevo conserva la conexión al importarse. Hay que retirarlo de
// la caché también: si queda el doble de la prueba anterior, la verificación
// con PostgreSQL "crea" una subcategoría sin id en vez de ejecutar su INSERT.
const CADENA = [rutaDb, rutaServicio,
  path.join(__dirname, '..', 'src', 'modules', 'productos', 'productos.service.js'),
  path.join(__dirname, '..', 'src', 'modules', 'productos', 'taxonomiaTablas.js')];

function montar(responder) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    return responder(texto, params) || { rows: [], rowCount: 0 };
  };
  const cliente = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => cliente, query: ejecutar }, query: ejecutar }
  };
  return { servicio: require(rutaServicio), log };
}

beforeEach(() => { for (const r of CADENA) delete require.cache[r]; });

describe('el árbol', () => {
  const responder = (sql) => {
    if (/FROM categoria_producto c LEFT JOIN categoria_config/.test(sql)) {
      return { rows: [
        { id: 5, nombre: 'Ferretería', nombre_visible: null, orden: 1 },
        { id: 14, nombre: 'Productos de PVC', nombre_visible: null, orden: 0 },
        { id: 17, nombre: 'r.Venenos', nombre_visible: 'Venenos', orden: null },
        { id: 2, nombre: 'Cocina', nombre_visible: null, orden: null }
      ] };
    }
    if (/FROM subcategoria s WHERE s.activo/.test(sql)) {
      return { rows: [{ id: 9, categoria: 'Productos de PVC', nombre: 'PVC 1/2', orden: 0, activo: true, productos: 16 }] };
    }
    if (/GROUP BY p.categoria_id, p.subcategoria_id/.test(sql)) {
      return { rows: [
        { categoria_id: 14, subcategoria_id: 9, n: 16, sin_imagen: 0 },
        { categoria_id: 14, subcategoria_id: null, n: 1, sin_imagen: 1 }
      ] };
    }
    return null;
  };

  test('las tres consultas cuentan con el mismo criterio de visible', async () => {
    const { servicio, log } = montar(responder);
    await servicio.arbol();
    const conProductos = log.filter((l) => /FROM producto p/.test(l.sql));
    assert.equal(conProductos.length, 3);
    for (const { sql } of conProductos) assert.match(sql, /p\.activo = TRUE AND p\.oculto = FALSE/);
  });

  test('el orden es el del agente, y las sin orden van al final, alfabéticas', async () => {
    const { servicio } = montar(responder);
    const arbol = await servicio.arbol();
    assert.deepEqual(arbol.map((c) => c.name), ['Productos de PVC', 'Ferretería', 'Cocina', 'r.Venenos']);
  });

  test('conteos, sin clasificar, sin foto y el nombre visible', async () => {
    const { servicio } = montar(responder);
    const [pvc] = await servicio.arbol();
    assert.deepEqual(
      { id: pvc.id, total: pvc.total, sinClasificar: pvc.sinClasificar, sinImagen: pvc.sinImagen, subs: pvc.subcategorias.length },
      { id: 14, total: 17, sinClasificar: 1, sinImagen: 1, subs: 1 }
    );
    const venenos = (await servicio.arbol()).find((c) => c.id === 17);
    assert.equal(venenos.nombreVisible, 'Venenos');
  });
});

describe('acciones en lote', () => {
  const productos = [
    { id: 1, nombre: 'CODO 1/2', subcategoria_id: null, categoria: 'Productos de PVC', categoria_id: 14 },
    { id: 2, nombre: 'BOMBILLO LED', subcategoria_id: null, categoria: 'Línea Eléctrica', categoria_id: 8 }
  ];
  const responder = (sql, params) => {
    if (/FROM producto p LEFT JOIN categoria_producto c/.test(sql)) {
      return { rows: productos.filter((p) => params[0].includes(p.id)) };
    }
    if (/FROM subcategoria WHERE id = \$1$/.test(sql)) return { rows: [{ id: 9, categoria: 'Productos de PVC', nombre: 'PVC 1/2', activo: true }] };
    if (/FROM categoria_producto WHERE id = \$1/.test(sql)) return { rows: [{ id: 5, nombre: 'Ferretería', activo: true }] };
    if (/SELECT id, categoria_id, subcategoria_id FROM producto/.test(sql)) {
      return { rows: productos.filter((p) => params[0].includes(p.id)) };
    }
    if (/^UPDATE producto/.test(sql)) return { rows: [], rowCount: params[0].length };
    if (/INSERT INTO bitacora_cambio/.test(sql)) return { rows: [{ id: '1' }] };
    return null;
  };

  test('un producto de otra categoría no entra a la subcategoría, y no se escribe nada', async () => {
    const { servicio, log } = montar(responder);
    await assert.rejects(
      () => servicio.asignarSubcategoria({ productoIds: [1, 2], subcategoriaId: 9 }, 4),
      (e) => e.status === 400 && /BOMBILLO LED/.test(e.message) && /Productos de PVC/.test(e.message)
    );
    assert.ok(!log.some((l) => /^UPDATE producto/.test(l.sql)));
  });

  test('clasificar es UN solo UPDATE, con los productos tomados con bloqueo', async () => {
    const { servicio, log } = montar(responder);
    const r = await servicio.asignarSubcategoria({ productoIds: [1, 1], subcategoriaId: 9 }, 4);
    assert.equal(r.actualizados, 1);
    assert.match(log.find((l) => /FROM producto p LEFT JOIN/.test(l.sql)).sql, /FOR UPDATE OF p/);
    const updates = log.filter((l) => /^UPDATE producto/.test(l.sql));
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].params, [[1], 9], 'los repetidos se juntan');
  });

  test('cambiar de categoría suelta la subcategoría en el mismo UPDATE', async () => {
    const { servicio, log } = montar(responder);
    await servicio.cambiarCategoria({ productoIds: [1], categoriaId: 5 }, 4);
    const u = log.find((l) => /^UPDATE producto/.test(l.sql));
    assert.match(u.sql, /categoria_id = \$2, subcategoria_id = NULL/);
  });

  test('sin productos o con ids raros es 400', async () => {
    const { servicio } = montar(responder);
    await assert.rejects(() => servicio.asignarSubcategoria({ productoIds: [] }, 4), (e) => e.status === 400);
    await assert.rejects(() => servicio.cambiarCategoria({ productoIds: ['x'], categoriaId: 5 }, 4), (e) => e.status === 400);
  });
});

describe('contra la base local', { skip: !process.env.PROBAR_BASE_LOCAL }, () => {
  /**
   * Los servicios abren su propia transacción. Acá su BEGIN y su COMMIT se
   * vuelven savepoints dentro de una transacción de afuera que al final se
   * revierte: se ejercitan las sentencias reales sin dejar nada escrito.
   */
  async function conBaseRevertida(trabajo) {
    delete require.cache[rutaDb];
    const real = require(rutaDb);
    const conexion = await real.pool.connect();
    const envuelta = {
      query: (sql, params) => {
        const s = String(sql).trim();
        if (s === 'BEGIN') return conexion.query('SAVEPOINT prueba');
        if (s === 'COMMIT') return conexion.query('RELEASE SAVEPOINT prueba');
        if (s === 'ROLLBACK') return conexion.query('ROLLBACK TO SAVEPOINT prueba');
        return conexion.query(sql, params);
      },
      release: () => {}
    };
    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true,
      exports: { ...real, pool: { connect: async () => envuelta, query: envuelta.query }, query: envuelta.query }
    };
    for (const r of CADENA.slice(1)) delete require.cache[r];
    try {
      await conexion.query('BEGIN');
      return await trabajo(require(rutaServicio), envuelta);
    } finally {
      await conexion.query('ROLLBACK');
      conexion.release();
      delete require.cache[rutaDb];
    }
  }

  test('mover una subcategoría lleva sus productos a la otra categoría', async () => {
    await conBaseRevertida(async (servicio, db) => {
      const [{ rows: [origen] }, { rows: [destino] }] = await Promise.all([
        db.query("SELECT id, nombre FROM categoria_producto WHERE activo ORDER BY id LIMIT 1"),
        db.query("SELECT id, nombre FROM categoria_producto WHERE activo ORDER BY id DESC LIMIT 1")
      ]);
      const { rows: [prod] } = await db.query(
        "INSERT INTO producto (nombre, cabys, precio_sin_iva, categoria_id) VALUES ('zz prueba taxonomía', '4294401030100', 100, $1) RETURNING id",
        [origen.id]);
      const sub = await servicio.crearSubcategoria({ categoriaId: origen.id, nombre: 'ZZ prueba' });
      await servicio.asignarSubcategoria({ productoIds: [prod.id], subcategoriaId: sub.id }, null);

      const r = await servicio.moverSubcategoria(sub.id, { categoriaId: destino.id }, null);
      assert.equal(r.movidos, 1);
      const { rows: [despues] } = await db.query(
        'SELECT p.categoria_id, p.subcategoria_id, s.categoria FROM producto p JOIN subcategoria s ON s.id = p.subcategoria_id WHERE p.id = $1',
        [prod.id]);
      assert.deepEqual(despues, { categoria_id: destino.id, subcategoria_id: sub.id, categoria: destino.nombre });

      await assert.rejects(() => servicio.eliminarSubcategoria(sub.id), (e) => e.status === 409);
      await servicio.cambiarCategoria({ productoIds: [prod.id], categoriaId: origen.id }, null);
      const { rows: [suelto] } = await db.query('SELECT subcategoria_id FROM producto WHERE id = $1', [prod.id]);
      assert.equal(suelto.subcategoria_id, null, 'cambiar de categoría suelta la subcategoría');
      assert.deepEqual(await servicio.eliminarSubcategoria(sub.id), { borrada: true, id: sub.id });
    });
  });

  test('el árbol cuenta lo mismo que la lista de cada categoría', async () => {
    await conBaseRevertida(async (servicio) => {
      const arbol = await servicio.arbol();
      const conProductos = arbol.filter((c) => c.total > 0).slice(0, 3);
      for (const c of conProductos) {
        const filas = await servicio.productosDeCategoria(c.id);
        assert.equal(filas.length, c.total, `${c.name}: la tarjeta dice ${c.total} y adentro hay ${filas.length}`);
        assert.equal(filas.filter((f) => !f.subcategoria).length, c.sinClasificar);
      }
    });
  });
});
