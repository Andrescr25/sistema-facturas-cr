const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

/**
 * Las dos tablas propias de la taxonomía (`categoria_config` y
 * `subcategoria`), ya sin la Gestión de Catálogo vieja (2026-10-04).
 *
 * Lo que cambió al mudarlas de `catalogo/` a `productos/taxonomiaTablas.js`:
 *  · las categorías ya no se le preguntan a Alegra: salen de
 *    `categoria_producto`. De ahí baja el orden a la tablet;
 *  · el conteo de cada subcategoría mira `producto`, no la caché de Alegra.
 *
 * Contra PostgreSQL local, en una transacción que se deshace.
 */

const rutaDb = require.resolve('../config/database');
const RUTAS = [
  '../src/modules/productos/taxonomiaTablas',
  '../src/modules/productos/taxonomia.service',
  '../src/modules/productos/productos.service',
  '../src/modules/catalogo-agente/catalogo-agente.service'
].map(r => require.resolve(r));

describe('categorías y subcategorías del catálogo — contra PostgreSQL local', () => {
  let pool, conexion, tablas, taxonomia, agente;
  let catA, catB, catInactivaConProductos, catInactivaVacia;

  const categoria = (nombre, activo = true) => conexion.query(
    'INSERT INTO categoria_producto (nombre, activo) VALUES ($1, $2) RETURNING id', [nombre, activo]).then(r => r.rows[0].id);
  const producto = (nombre, categoriaId, { subId = null, activo = true, oculto = false } = {}) => conexion.query(
    `INSERT INTO producto (nombre, categoria_id, subcategoria_id, activo, oculto, precio_sin_iva) VALUES ($1, $2, $3, $4, $5, 100) RETURNING id`,
    [nombre, categoriaId, subId, activo, oculto]).then(r => r.rows[0].id);
  const soloZz = (lista) => lista.filter(c => c.name.startsWith('zz-'));
  /**
   * Un rechazo que viene de la base (nombre repetido) aborta la transacción en
   * la que corre toda la prueba. En la aplicación cada consulta va sola y no
   * pasa; acá se deshace hasta un punto de guardado para poder seguir.
   */
  const rechazaLaBase = async (promesa, esperado) => {
    await conexion.query('SAVEPOINT rechazo');
    try { await assert.rejects(promesa(), esperado); } finally { await conexion.query('ROLLBACK TO SAVEPOINT rechazo'); }
  };

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'tax') };
    for (const r of RUTAS) delete require.cache[r];
    tablas = require(RUTAS[0]);
    taxonomia = require(RUTAS[1]);
    agente = require(RUTAS[3]);

    catA = await categoria('zz-Ángeles');          // alfabéticamente antes que "zz-Bolsas"
    catB = await categoria('zz-Bolsas');
    catInactivaConProductos = await categoria('zz-Cerrada con productos', false);
    catInactivaVacia = await categoria('zz-Desactivada vacía', false);
    await producto('zz-uno', catInactivaConProductos);
  });

  beforeEach(async () => { await conexion.query('SAVEPOINT caso'); });
  afterEach(async () => { await conexion.query('ROLLBACK TO SAVEPOINT caso'); });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  describe('el orden de las categorías', () => {
    test('salen del maestro propio: las activas, y la desactivada que todavía tiene productos a la vista', async () => {
      const nombres = soloZz(await tablas.categoriasEnOrden()).map(c => c.name);
      assert.deepEqual(nombres, ['zz-Ángeles', 'zz-Bolsas', 'zz-Cerrada con productos']);
      assert.ok(!nombres.includes('zz-Desactivada vacía'));
      // El id es el de `categoria_producto`, no uno de Alegra.
      assert.equal(soloZz(await tablas.categoriasEnOrden())[0].id, catA);
    });

    test('sin configurar van después de las ordenadas, alfabéticas entre ellas', async () => {
      const lista = await tablas.categoriasEnOrden();
      const sin = lista.filter(c => c.orden >= 100000).map(c => c.name);
      assert.deepEqual(sin, [...sin].sort((a, b) => a.localeCompare(b, 'es')));
      const ultimaOrdenada = lista.map(c => c.orden < 100000).lastIndexOf(true);
      const primeraSinOrden = lista.findIndex(c => c.orden >= 100000);
      assert.ok(primeraSinOrden === -1 || ultimaOrdenada < primeraSinOrden, 'una sin orden quedó entre las ordenadas');
    });

    test('reordenar les da su posición, en un solo upsert, y la configurada se antepone', async () => {
      const r = await tablas.reordenarCategorias(['zz-Bolsas', ' zz-Ángeles ']);
      assert.deepEqual(r, [
        { name: 'zz-Bolsas', nombreVisible: 'zz-Bolsas', orden: 0 },
        { name: 'zz-Ángeles', nombreVisible: 'zz-Ángeles', orden: 1 }
      ]);
      const zz = soloZz(await tablas.categoriasEnOrden());
      assert.deepEqual(zz.map(c => [c.name, c.orden < 100000]), [
        ['zz-Bolsas', true], ['zz-Ángeles', true], ['zz-Cerrada con productos', false]
      ]);
      await assert.rejects(tablas.reordenarCategorias([]), { status: 400 });
      await assert.rejects(tablas.reordenarCategorias(['  ', null]), { status: 400 });
    });

    test('el nombre visible no reemplaza el nombre real, y renombrar sin haber ordenado no la manda al principio', async () => {
      assert.deepEqual(await tablas.renombrarCategoria('zz-Bolsas', '  Bolsas y más  '), { categoria: 'zz-Bolsas', nombreVisible: 'Bolsas y más' });
      const bolsas = (await tablas.categoriasEnOrden()).find(c => c.name === 'zz-Bolsas');
      assert.deepEqual([bolsas.name, bolsas.nombreVisible, bolsas.orden >= 100000], ['zz-Bolsas', 'Bolsas y más', true]);
      // Vacío lo devuelve al nombre real.
      assert.equal((await tablas.renombrarCategoria('zz-Bolsas', '')).nombreVisible, 'zz-Bolsas');
      await assert.rejects(tablas.renombrarCategoria('', 'x'), { status: 400 });
    });

    test('Gestión de Catálogo y la tablet reciben EL MISMO orden: sale de un solo lugar', async () => {
      await tablas.reordenarCategorias(['zz-Bolsas', 'zz-Ángeles']);
      const delArbol = (await taxonomia.arbol()).map(c => c.name);
      const deLaTablet = (await agente.obtenerConfigCatalogo()).categorias.map(c => c.name);
      assert.deepEqual(deLaTablet, delArbol);
      assert.ok(deLaTablet.indexOf('zz-Bolsas') < deLaTablet.indexOf('zz-Ángeles'));
    });
  });

  describe('las subcategorías', () => {
    test('crear guarda el nombre limpio, y una repetida se dice con nombre y apellido', async () => {
      const s = await tablas.crearSubcategoria({ categoria: ' zz-Bolsas ', nombre: '  Bolsas   de  basura ' });
      assert.deepEqual({ categoria: s.categoria, nombre: s.nombre, activo: s.activo, productos: s.productos },
        { categoria: 'zz-Bolsas', nombre: 'Bolsas de basura', activo: true, productos: 0 });
      // Sin importar mayúsculas: dos iguales no se distinguirían en el desplegable.
      await rechazaLaBase(() => tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'BOLSAS DE BASURA' }),
        { status: 409, message: '"BOLSAS DE BASURA" ya existe en zz-Bolsas.' });
      // El mismo nombre en OTRA categoría sí.
      assert.equal((await tablas.crearSubcategoria({ categoria: 'zz-Ángeles', nombre: 'Bolsas de basura' })).categoria, 'zz-Ángeles');
    });

    test('sin nombre, sin categoría o con un nombre de más de 80 letras no se crea', async () => {
      await assert.rejects(tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: '   ' }), { status: 400 });
      await assert.rejects(tablas.crearSubcategoria({ categoria: '', nombre: 'zz' }), { status: 400 });
      await assert.rejects(tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'z'.repeat(81) }), { status: 400 });
    });

    test('el conteo mira el maestro propio, con el mismo "a la vista" que la lista', async () => {
      const sub = await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-contadas' });
      await producto('zz-a la vista', catB, { subId: sub.id });
      await producto('zz-otro a la vista', catB, { subId: sub.id });
      await producto('zz-oculto', catB, { subId: sub.id, oculto: true });
      await producto('zz-dado de baja', catB, { subId: sub.id, activo: false });

      const [fila] = await tablas.listarSubcategorias({ categoria: 'zz-Bolsas' });
      assert.deepEqual([fila.nombre, fila.productos], ['zz-contadas', 2]);
      // Y es el mismo número que muestra la tarjeta de Gestión de Catálogo.
      const tarjeta = (await taxonomia.arbol()).find(c => c.name === 'zz-Bolsas');
      assert.equal(tarjeta.subcategorias.find(s => s.id === sub.id).productos, 2);
    });

    test('por defecto no trae las desactivadas, y se pueden pedir las de una sola categoría', async () => {
      const activa = await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-activa' });
      const apagada = await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-apagada' });
      await tablas.crearSubcategoria({ categoria: 'zz-Ángeles', nombre: 'zz-de otra' });
      await conexion.query('UPDATE subcategoria SET activo = FALSE WHERE id = $1', [apagada.id]);

      assert.deepEqual((await tablas.listarSubcategorias({ categoria: 'zz-Bolsas' })).map(s => s.id), [activa.id]);
      assert.equal((await tablas.listarSubcategorias({ categoria: 'zz-Bolsas', incluirInactivas: true })).length, 2);
      const todas = (await tablas.listarSubcategorias()).filter(s => s.categoria.startsWith('zz-'));
      assert.deepEqual(todas.map(s => s.nombre), ['zz-de otra', 'zz-activa']);   // por categoría, después orden y nombre
    });

    test('renombrar: la que no existe y la repetida se dicen', async () => {
      const a = await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-primera' });
      await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-segunda' });
      assert.equal((await tablas.renombrarSubcategoria(a.id, { nombre: ' zz-primera  bis ' })).nombre, 'zz-primera bis');
      await rechazaLaBase(() => tablas.renombrarSubcategoria(a.id, { nombre: 'ZZ-SEGUNDA' }), { status: 409 });
      await assert.rejects(tablas.renombrarSubcategoria(2000000000, { nombre: 'zz' }), { status: 404 });
      await assert.rejects(tablas.renombrarSubcategoria(a.id, {}), { status: 400 });
    });

    test('reordenar les da su posición, y NO deja mover el orden de una de otra categoría', async () => {
      const a = await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-a' });
      const b = await tablas.crearSubcategoria({ categoria: 'zz-Bolsas', nombre: 'zz-b' });
      const ajena = await tablas.crearSubcategoria({ categoria: 'zz-Ángeles', nombre: 'zz-ajena' });

      const r = await tablas.reordenarSubcategorias('zz-Bolsas', [b.id, a.id]);
      assert.deepEqual(r.map(s => [s.nombre, s.orden]), [['zz-b', 0], ['zz-a', 1]]);

      await assert.rejects(tablas.reordenarSubcategorias('zz-Bolsas', [a.id, ajena.id]),
        { status: 400, message: `La subcategoría ${ajena.id} no es de zz-Bolsas.` });
      await assert.rejects(tablas.reordenarSubcategorias('zz-Bolsas', [a.id, 2000000000]), { status: 404 });
      await assert.rejects(tablas.reordenarSubcategorias('zz-Bolsas', []), { status: 400 });
      // El rechazo no movió nada.
      assert.deepEqual((await tablas.listarSubcategorias({ categoria: 'zz-Bolsas' })).map(s => s.nombre), ['zz-b', 'zz-a']);
    });
  });
});

describe('la Gestión de Catálogo vieja ya no está', () => {
  const backend = path.join(__dirname, '..');
  const leer = (...partes) => fs.readFileSync(path.join(backend, ...partes), 'utf8');
  const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('el módulo se borró y nadie lo monta', () => {
    // El router adaptador que lo montaba (`routes/alegra.js`) también se fue.
    assert.equal(fs.existsSync(path.join(backend, 'src', 'modules', 'catalogo')), false);
    assert.doesNotMatch(sinComentarios(leer('server.js')), /modules\/catalogo'\)|\/catalog'/);
  });

  test('quienes usaban sus servicios leen las tablas propias, sin Alegra ni su caché', () => {
    for (const archivo of [['productos', 'taxonomiaTablas.js'], ['productos', 'taxonomia.service.js'], ['catalogo-agente', 'catalogo-agente.service.js']]) {
      const fuente = sinComentarios(leer('src', 'modules', ...archivo));
      assert.doesNotMatch(fuente, /integrations\/alegra|alegra_products_cache|getItemCategories|\.\.\/catalogo\//, `${archivo[1]} todavía depende de lo viejo`);
    }
  });
});
