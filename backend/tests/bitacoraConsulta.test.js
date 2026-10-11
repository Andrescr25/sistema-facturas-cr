const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Consultar la bitácora (sección 14 del checklist).
 *
 * La bitácora se escribía desde el primer día de la migración y nadie podía
 * leerla sin SQL. Acá se prueba la lectura: los filtros, que el nombre de cada
 * registro salga aunque ya no exista, lo que cambió campo por campo, y que
 * siga siendo de solo lectura y solo para administradores.
 */

const RAIZ = path.join(__dirname, '..');
const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/usuarios/bitacora.service');

describe('lo que cambió, campo por campo', () => {
  const { cambiosDe } = require('../src/modules/usuarios/bitacora.service');

  test('una edición trae el antes y el después de cada campo tocado', () => {
    assert.deepEqual(cambiosDe({ cambios: { precio_sin_iva: [1000, 1200], oculto: [false, true] } }), [
      { campo: 'precio_sin_iva', antes: '1000', despues: '1200' },
      { campo: 'oculto', antes: 'false', despues: 'true' }
    ]);
  });

  test('lo creado es todo "después"; lo borrado, todo "antes"', () => {
    assert.deepEqual(cambiosDe({ cambios: null, antes: null, despues: { nombre: 'zz', activo: true } }), [
      { campo: 'nombre', antes: null, despues: 'zz' },
      { campo: 'activo', antes: null, despues: 'true' }
    ]);
    assert.deepEqual(cambiosDe({ cambios: null, antes: { nombre: 'zz' }, despues: null }), [
      { campo: 'nombre', antes: 'zz', despues: null }
    ]);
  });

  test('al anular, de las dos fotos solo sale lo que difiere', () => {
    const r = cambiosDe({
      cambios: null,
      antes: { numero: '001000014869', estado: 'emitida', total: '19955.18' },
      despues: { numero: '001000014869', estado: 'anulada', total: '19955.18' }
    });
    assert.deepEqual(r, [{ campo: 'estado', antes: 'emitida', despues: 'anulada' }]);
  });

  test('vacío y nulo son lo mismo, y un objeto se muestra entero', () => {
    assert.deepEqual(cambiosDe({ cambios: { telefono: ['', null] } }), [{ campo: 'telefono', antes: null, despues: null }]);
    assert.deepEqual(cambiosDe({ cambios: { lineas: [null, [{ producto_id: 1 }]] } }),
      [{ campo: 'lineas', antes: null, despues: '[{"producto_id":1}]' }]);
  });
});

describe('consultar la bitácora — contra PostgreSQL local', () => {
  let pool, conexion, servicio, producto, usuario;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const query = (sql, params) => conexion.query(sql, params);
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query } } };
    delete require.cache[rutaServicio];
    servicio = require(rutaServicio);
    // El que ESCRIBE la bitácora es el de siempre: se prueba la lectura de lo
    // que de verdad queda guardado, no de filas armadas a mano.
    const { registrarCambio } = require('../src/utils/bitacora');

    usuario = (await conexion.query('SELECT id, nombre FROM usuario ORDER BY id LIMIT 1')).rows[0];
    producto = (await conexion.query(`INSERT INTO producto (nombre) VALUES ('zz-tubo de la bitácora') RETURNING id`)).rows[0].id;

    const anotar = async (datos, cuando) => {
      const id = await registrarCambio(conexion, datos);
      await conexion.query('UPDATE bitacora_cambio SET creado_en = $1 WHERE id = $2', [cuando, id]);
      return id;
    };
    // Marzo de 2031 no tiene nada en la bitácora: lo que aparezca es de acá.
    await anotar({ entidad: 'producto', entidadId: producto, accion: 'crear',
      despues: { id: producto, nombre: 'zz-tubo de la bitácora', precio_sin_iva: 1000 }, usuarioId: usuario.id }, '2031-03-10 09:15:00');
    await anotar({ entidad: 'producto', entidadId: producto, accion: 'editar',
      antes: { precio_sin_iva: 1000, oculto: false }, despues: { precio_sin_iva: 1200, oculto: true }, usuarioId: usuario.id }, '2031-03-10 23:40:00');
    await anotar({ entidad: 'factura', entidadId: 99999991, accion: 'anular',
      antes: { numero: 'zz-001000099999', estado: 'emitida' }, despues: { numero: 'zz-001000099999', estado: 'anulada' },
      usuarioId: usuario.id, motivo: 'zz-el cliente se arrepintió' }, '2031-03-11 10:00:00');
    await anotar({ entidad: 'cliente', entidadId: 99999992, accion: 'crear',
      despues: { nombre: 'zz-cliente cargado por el sistema' } }, '2031-03-12 08:00:00');
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  const marzo = (extra = {}) => servicio.listar({ desde: '2031-03-01', hasta: '2031-03-31', ...extra });

  test('lo más nuevo primero, con quién, qué hizo y sobre qué', async () => {
    const { data, paginacion } = await marzo();
    assert.equal(paginacion.total, 4);
    assert.deepEqual(data.map(l => [l.usuarioNombre, l.accionVerbo, l.entidadNombre, l.titulo, l.cuando]), [
      ['El sistema', 'creó', 'Cliente', 'zz-cliente cargado por el sistema', '2031-03-12 08:00:00'],
      [usuario.nombre, 'anuló', 'Factura', 'zz-001000099999', '2031-03-11 10:00:00'],
      [usuario.nombre, 'editó', 'Producto', 'zz-tubo de la bitácora', '2031-03-10 23:40:00'],
      [usuario.nombre, 'creó', 'Producto', 'zz-tubo de la bitácora', '2031-03-10 09:15:00']
    ]);
    assert.equal(data[2].camposCambiados, 2);
    assert.equal(data[1].motivo, 'zz-el cliente se arrepintió');
  });

  test('una edición guarda solo lo que cambió: el nombre se busca en la ficha', async () => {
    // La foto de la edición no trae `nombre`; sin esto la línea diría
    // "Producto 2695" y nadie sabría cuál es.
    const { data } = await marzo({ accion: 'editar' });
    assert.equal(data[0].titulo, 'zz-tubo de la bitácora');
  });

  test('un registro que ya no existe sigue diciendo qué era, por su foto', async () => {
    // La factura 99999991 no existe en `factura`: el número sale de la foto.
    const { data } = await marzo({ entidad: 'factura' });
    assert.deepEqual([data.length, data[0].titulo], [1, 'zz-001000099999']);
  });

  test('los filtros: qué, acción, quién (también "el sistema") y fechas', async () => {
    assert.equal((await marzo({ entidad: 'producto' })).paginacion.total, 2);
    assert.equal((await marzo({ accion: 'crear' })).paginacion.total, 2);
    assert.equal((await marzo({ usuarioId: usuario.id })).paginacion.total, 3);
    assert.equal((await marzo({ usuarioId: 'sistema' })).paginacion.total, 1);
    assert.equal((await marzo({ entidad: 'producto', accion: 'editar' })).paginacion.total, 1);
    // "Hasta" incluye el día entero: la edición de las 23:40 del 10 entra.
    assert.equal((await servicio.listar({ desde: '2031-03-10', hasta: '2031-03-10' })).paginacion.total, 2);
    assert.equal((await servicio.listar({ desde: '2031-03-11', hasta: '2031-03-11' })).paginacion.total, 1);
  });

  test('se busca por el nombre, por el motivo o por el número del registro', async () => {
    assert.equal((await marzo({ buscar: 'TUBO DE LA' })).paginacion.total, 1, 'por el nombre de la foto (el de la creación)');
    assert.equal((await marzo({ buscar: 'arrepintió' })).paginacion.total, 1);
    assert.equal((await marzo({ buscar: String(producto) })).paginacion.total, 2);
    assert.equal((await marzo({ buscar: 'zz-no existe' })).paginacion.total, 0);
  });

  test('de a páginas, con tope', async () => {
    const uno = await marzo({ limite: 1, pagina: 2 });
    assert.deepEqual([uno.data.length, uno.paginacion.paginas, uno.data[0].accion], [1, 4, 'anular']);
    assert.equal((await marzo({ limite: 5000 })).paginacion.limite, 100);
    assert.equal((await marzo({ limite: 'x', pagina: 'y' })).paginacion.pagina, 1);
  });

  test('una fecha o un usuario mal escritos se rechazan, no se ignoran', async () => {
    await assert.rejects(() => servicio.listar({ desde: '10/03/2031' }), e => e.status === 400);
    await assert.rejects(() => servicio.listar({ hasta: 'ayer' }), e => e.status === 400);
    await assert.rejects(() => servicio.listar({ usuarioId: 'abc' }), e => e.status === 400);
  });

  test('abrir una línea: lo que cambió, campo por campo', async () => {
    const { data } = await marzo({ accion: 'editar' });
    const linea = await servicio.obtener(data[0].id);
    assert.equal(linea.titulo, 'zz-tubo de la bitácora');
    assert.deepEqual(linea.cambios.sort((a, b) => a.campo.localeCompare(b.campo)), [
      { campo: 'oculto', antes: 'false', despues: 'true' },
      { campo: 'precio_sin_iva', antes: '1000', despues: '1200' }
    ]);
    await assert.rejects(() => servicio.obtener(999999999), e => e.status === 404);
    await assert.rejects(() => servicio.obtener('abc'), e => e.status === 400);
  });

  test('los filtros ofrecen solo lo que hay, con el nombre que entiende una persona', async () => {
    const f = await servicio.filtros();
    assert.ok(f.entidades.some(e => e.valor === 'factura' && e.nombre === 'Factura' && e.lineas >= 1));
    assert.ok(f.acciones.some(a => a.valor === 'anular' && a.nombre === 'anuló'));
    assert.ok(f.usuarios.some(u => u.valor === 'sistema' && u.nombre === 'El sistema'));
    assert.ok(f.usuarios.some(u => u.valor === String(usuario.id) && u.nombre === usuario.nombre));
  });
});

describe('la bitácora se consulta, no se toca', () => {
  const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');

  test('solo administradores: cuelga de /usuarios', () => {
    const { esRutaAdmin } = require('../src/modules/usuarios/modulos');
    for (const ruta of ['/usuarios/bitacora', '/usuarios/bitacora/filtros', '/usuarios/bitacora/106']) {
      assert.equal(esRutaAdmin(ruta), true, `${ruta} no exige administrador`);
    }
  });

  test('sus rutas son todas de lectura, y van antes de /:id', () => {
    const rutas = leer('src', 'modules', 'usuarios', 'usuarios.routes.js');
    const declaradas = [...rutas.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map(m => [m[1], m[2]]);
    const deBitacora = declaradas.filter(([, ruta]) => ruta.includes('bitacora'));
    assert.deepEqual(deBitacora, [['get', '/bitacora'], ['get', '/bitacora/filtros'], ['get', '/bitacora/:id']]);
    const posicion = (ruta) => declaradas.findIndex(([m, r]) => m === 'get' && r === ruta);
    assert.ok(posicion('/bitacora') < posicion('/:id'), '"bitacora" se leería como el id de un usuario');
    assert.ok(posicion('/bitacora/filtros') < posicion('/bitacora/:id'), '"filtros" se leería como el id de una línea');
  });

  test('ninguna ruta del sistema escribe en la bitácora, y el servicio de consulta tampoco', () => {
    const servicio = leer('src', 'modules', 'usuarios', 'bitacora.service.js');
    assert.doesNotMatch(servicio, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i, 'el servicio de consulta escribe');

    const modulos = path.join(RAIZ, 'src', 'modules');
    for (const modulo of fs.readdirSync(modulos)) {
      const carpeta = path.join(modulos, modulo);
      if (!fs.statSync(carpeta).isDirectory()) continue;
      for (const archivo of fs.readdirSync(carpeta).filter(f => f.endsWith('.js'))) {
        const fuente = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
        assert.doesNotMatch(fuente, /(UPDATE|DELETE FROM|TRUNCATE)\s+bitacora_cambio/i, `${modulo}/${archivo} modifica la bitácora`);
      }
    }
  });
});
