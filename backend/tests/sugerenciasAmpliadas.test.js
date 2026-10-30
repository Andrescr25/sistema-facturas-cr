const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * "Suele faltar" más amplio (2026-10-28).
 *
 * El usuario: «los productos que salen como recomendación, "suele faltar", está
 * perfecto, pero ampliémoslo más: que me recomiende más productos que el
 * cliente lleva».
 *
 * La fila de siempre no cambia. Se suma (1) más productos por lista, (2) una
 * lista nueva con lo que el cliente compró UNA sola vez este último año, y
 * (3) un «Ver más» que los despliega. El portal del cliente NO cambia: comparte
 * el cálculo, pero no pide lo ampliado.
 */

const rutaInicio = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.inicio.service.js');
const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (...partes) => fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8');
const util = () => import('../../frontend/src/utils/sugerenciasFacturacion.js');

const producto = (id, extra = {}) => ({ id, nombre: `PRODUCTO ${id}`, veces: 2, dias: 5, ...extra });
const lista = (desde, cantidad, extra) => Array.from({ length: cantidad }, (_, i) => producto(desde + i, extra));

describe('qué va en la fila y qué en «Ver más»', () => {
  test('la fila es la de siempre: 10, con hasta 3 lugares reservados para lo que dejó de llevar', async () => {
    const { armarSugerencias } = await util();
    const { fila } = armarSugerencias({ habituales: lista(1, 20), perdidos: lista(100, 5, { dias: 90 }) }, []);

    assert.equal(fila.length, 10);
    assert.deepEqual(fila.filter(p => p.motivo === 'perdido').map(p => p.id), [100, 101, 102]);
    assert.equal(fila.filter(p => p.motivo === 'habitual').length, 7);
  });

  test('sin perdidos, los habituales se quedan con toda la fila', async () => {
    const { armarSugerencias } = await util();
    const { fila } = armarSugerencias({ habituales: lista(1, 20) }, []);

    assert.equal(fila.length, 10);
    assert.ok(fila.every(p => p.motivo === 'habitual'));
  });

  test('lo que no cupo en la fila queda en «Ver más», por motivo y sin repetirse', async () => {
    const { armarSugerencias } = await util();
    const { fila, grupos, cantidadMas } = armarSugerencias({
      habituales: lista(1, 20), perdidos: lista(100, 5, { dias: 90 }), ocasionales: lista(200, 4, { veces: 1 })
    }, []);

    assert.deepEqual(grupos.map(g => g.id), ['habitual', 'perdido', 'ocasional']);
    assert.deepEqual(grupos.map(g => g.productos.length), [13, 2, 4]);
    assert.equal(cantidadMas, 19);

    const todos = [...fila, ...grupos.flatMap(g => g.productos)].map(p => p.id);
    assert.equal(new Set(todos).size, todos.length, 'un producto no sale dos veces');
    assert.equal(todos.length, 20 + 5 + 4, 'y no se pierde ninguno');
  });

  test('los ocasionales solo entran a la fila si sobra lugar: nunca le quitan el sitio a un habitual', async () => {
    const { armarSugerencias } = await util();

    const lleno = armarSugerencias({ habituales: lista(1, 12), ocasionales: lista(200, 5, { veces: 1 }) }, []);
    assert.ok(lleno.fila.every(p => p.motivo === 'habitual'));

    const con4 = armarSugerencias({ habituales: lista(1, 4), ocasionales: lista(200, 9, { veces: 1 }) }, []);
    assert.equal(con4.fila.length, 10);
    assert.equal(con4.fila.filter(p => p.motivo === 'ocasional').length, 6);
    assert.deepEqual(con4.grupos.map(g => g.id), ['ocasional']);
    assert.equal(con4.cantidadMas, 3);
  });

  test('un cliente que solo tiene compras de una vez igual ve sugerencias', async () => {
    const { armarSugerencias } = await util();
    const { fila, cantidadMas } = armarSugerencias({ habituales: [], perdidos: [], ocasionales: lista(200, 3, { veces: 1 }) }, []);

    assert.equal(fila.length, 3);
    assert.equal(cantidadMas, 0, 'y sin nada más no se ofrece un «Ver más» vacío');
  });

  test('lo que ya está en la factura no se sugiere, ni en la fila ni en «Ver más»', async () => {
    const { armarSugerencias } = await util();
    const r = armarSugerencias(
      { habituales: lista(1, 15), ocasionales: lista(200, 3, { veces: 1 }) },
      [{ id: 1 }, { id: '2' }, { id: 201 }]
    );
    const ids = [...r.fila, ...r.grupos.flatMap(g => g.productos)].map(p => p.id);

    for (const id of [1, 2, 201]) assert.equal(ids.includes(id), false, `se sugirió el ${id}, que ya está`);
    assert.equal(ids.length, 15 + 3 - 3);
  });

  test('sin nada (o sin respuesta del servidor) no hay fila ni nada que desplegar', async () => {
    const { armarSugerencias } = await util();
    for (const s of [undefined, null, {}, { habituales: [], perdidos: [], ocasionales: [] }]) {
      const r = armarSugerencias(s, undefined);
      assert.deepEqual(r, { fila: [], grupos: [], cantidadMas: 0 });
    }
  });
});

describe('lo que se le dice al agente en cada tarjeta', () => {
  test('cada motivo lleva su dato: las veces, los días sin llevarlo o cuándo lo llevó', async () => {
    const { textoMotivo } = await util();

    assert.equal(textoMotivo({ motivo: 'habitual', veces: 22 }), 'Lo lleva 22 veces');
    assert.equal(textoMotivo({ motivo: 'habitual', veces: 1 }), 'Lo lleva 1 vez');
    assert.equal(textoMotivo({ motivo: 'perdido', dias: 199 }), 'Hace 199 días que no lo lleva');
    assert.equal(textoMotivo({ motivo: 'ocasional', veces: 1, dias: 40 }), 'Lo llevó una vez, hace 40 días');
    assert.equal(textoMotivo({ motivo: 'ocasional', veces: 1, dias: 1 }), 'Lo llevó una vez, ayer');
    assert.equal(textoMotivo({ motivo: 'ocasional', veces: 1, dias: 0 }), 'Lo llevó una vez, hoy');
  });
});

describe('«Ver más» en la pantalla', () => {
  const barra = leer('components', 'facturacion', 'BarraSugerencias.jsx');
  const tarjeta = leer('components', 'facturacion', 'TarjetaSugerencia.jsx');

  test('la fila sigue siendo de desplazamiento lateral, y el resto se despliega con su propio alto máximo', () => {
    assert.match(barra, /overflow-x-auto/);
    assert.match(barra, /aria-expanded=\{abierta\}/);
    assert.match(barra, /max-h-\[55vh\][^"]*overflow-y-auto/, 'un cliente con 90 sugerencias no manda la factura al fondo');
  });

  test('es responsive: 2 columnas en el teléfono y más a medida que hay ancho', () => {
    assert.match(barra, /grid-cols-2[^"]*sm:grid-cols-3[^"]*md:grid-cols-4[^"]*lg:grid-cols-5/);
    assert.match(barra, /h-10/, 'el botón de «Ver más» mide 40 px, como los demás botones táctiles');
    assert.doesNotMatch(barra, /innerWidth|isMobile|matchMedia/, 'el ancho lo decide CSS, no JavaScript');
  });

  test('el gancho va antes de salir sin dibujar nada (un gancho tras un return tumba la pantalla)', () => {
    assert.ok(barra.indexOf('useState(false)') < barra.indexOf('if (fila.length === 0) return null'));
  });

  test('la tarjeta es una sola, la de la fila y la de la cuadrícula, y sigue completando la ruta de la foto', () => {
    assert.match(barra, /import TarjetaSugerencia from '\.\/TarjetaSugerencia'/);
    assert.equal((barra.match(/<TarjetaSugerencia /g) || []).length, 2);
    assert.match(tarjeta, /urlArchivo\(p\.imagen\)/);
    assert.match(tarjeta, /w-36 shrink-0/, 'en la fila no se encoge');
    assert.match(tarjeta, /w-full min-w-0/, 'en la cuadrícula toma su celda');
  });

  test('la pantalla recibe la lista nueva por el mismo camino de siempre, en ids propios', async () => {
    const hook = leer('hooks', 'useFacturacion.js');
    assert.match(hook, /useState\(SIN_SUGERENCIAS\)/);
    assert.equal(/\{ habituales: \[\], perdidos: \[\] \}/.test(hook), false, 'quedó un vacío sin `ocasionales`');
    assert.match(leer('services', 'facturacionService.js'), /ocasionales: data\?\.data\?\.ocasionales \|\| \[\]/);

    const { SIN_SUGERENCIAS, sugerenciasDelCatalogo } = await import('../../frontend/src/utils/facturacionUtils.js');
    assert.deepEqual(SIN_SUGERENCIAS, { habituales: [], perdidos: [], ocasionales: [] });
    assert.ok(Object.isFrozen(SIN_SUGERENCIAS), 'es compartido: nadie puede cambiarlo');
    assert.deepEqual(sugerenciasDelCatalogo({ ocasionales: [{ id: 3 }, { id: 4 }] }, [{ id: 4 }]).ocasionales, [{ id: 4 }]);
  });
});

describe('el cálculo ampliado, contra PostgreSQL local', () => {
  let pool, conexion, inicio;
  let cliente, hab, unaVezReciente, unaVezVieja, perdido;

  const venta = async (clienteId, productoId, diasAtras) => {
    const facturaId = (await conexion.query(
      `INSERT INTO factura (cliente_id, cliente_nombre, fecha, estado)
       VALUES ($1, 'zz-venta de prueba', (now() AT TIME ZONE 'America/Costa_Rica')::date - $2::int, 'emitida') RETURNING id`,
      [clienteId, diasAtras])).rows[0].id;
    await conexion.query(
      `INSERT INTO factura_linea (factura_id, numero_linea, producto_id, nombre, cantidad, precio_unitario, total)
       VALUES ($1, 1, $2, 'zz-línea', 1, 1000, 1130)`, [facturaId, productoId]);
  };
  const nuevoProducto = async (nombre, referencia) => (await conexion.query(
    `INSERT INTO producto (nombre, referencia, alegra_id, precio_sin_iva) VALUES ($1, $2, $3, 1000) RETURNING id`,
    [nombre, referencia, `zz-alegra-${referencia}`])).rows[0].id;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'sugamp') };
    inicio = require(rutaInicio);

    cliente = (await conexion.query(`INSERT INTO cliente (nombre) VALUES ('zz-cliente de lo ampliado') RETURNING id`)).rows[0].id;
    hab = await nuevoProducto('zz-habitual', 'ZZ-AMP-H');
    unaVezReciente = await nuevoProducto('zz-una vez, reciente', 'ZZ-AMP-R');
    unaVezVieja = await nuevoProducto('zz-una vez, hace más de un año', 'ZZ-AMP-V');
    perdido = await nuevoProducto('zz-perdido', 'ZZ-AMP-P');

    for (const dias of [2, 9]) await venta(cliente, hab, dias);
    await venta(cliente, unaVezReciente, 20);
    await venta(cliente, unaVezVieja, 400);
    for (const dias of [100, 130, 160]) await venta(cliente, perdido, dias);

    // 44 habituales más, para ver el tope de cada versión (24 contra 40).
    const ids = (await conexion.query(
      `INSERT INTO producto (nombre, referencia, alegra_id, precio_sin_iva)
       SELECT 'zz-relleno ' || g, 'ZZ-AMP-F' || g, 'zz-alegra-amp-f' || g, 1000 FROM generate_series(1, 44) g
       RETURNING id`)).rows.map(r => r.id);
    for (const dias of [3, 8]) {
      const facturaId = (await conexion.query(
        `INSERT INTO factura (cliente_id, cliente_nombre, fecha, estado)
         VALUES ($1, 'zz-venta de prueba', (now() AT TIME ZONE 'America/Costa_Rica')::date - $2::int, 'emitida') RETURNING id`, [cliente, dias])).rows[0].id;
      await conexion.query(
        `INSERT INTO factura_linea (factura_id, numero_linea, producto_id, nombre, cantidad, precio_unitario, total)
         SELECT $1, n, id, 'zz-línea', 1, 1000, 1130 FROM unnest($2::int[]) WITH ORDINALITY AS t(id, n)`, [facturaId, ids]);
    }
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('ampliado: aparece lo que llevó una sola vez este último año, y lo de hace más de un año no', async () => {
    const r = await inicio.obtenerInicio(cliente, { ampliado: true });

    assert.deepEqual(r.ocasionales.map(p => p.id), [unaVezReciente]);
    assert.equal(r.ocasionales[0].veces, 1);
    assert.ok(r.ocasionales[0].dias >= 20 && r.ocasionales[0].dias <= 21);
    const todos = [...r.habituales, ...r.perdidos, ...r.ocasionales].map(p => p.id);
    assert.equal(todos.includes(unaVezVieja), false, 'una compra de hace 400 días no es lo que «lleva»');
  });

  test('un producto vive en una sola lista', async () => {
    const r = await inicio.obtenerInicio(cliente, { ampliado: true });
    const todos = [...r.habituales, ...r.perdidos, ...r.ocasionales].map(p => p.id);

    assert.equal(new Set(todos).size, todos.length);
    assert.deepEqual(r.perdidos.map(p => p.id), [perdido]);
    assert.equal(r.habituales.some(p => p.id === hab), true);
  });

  test('ampliado trae hasta 40 habituales; sin ampliar, los 24 de siempre', async () => {
    const ampliado = await inicio.obtenerInicio(cliente, { ampliado: true });
    const comun = await inicio.obtenerInicio(cliente);

    assert.equal(ampliado.habituales.length, 40);
    assert.equal(comun.habituales.length, 24);
  });

  test('sin ampliar la respuesta es la de siempre: el portal no gana una lista nueva', async () => {
    const r = await inicio.obtenerInicio(cliente);

    assert.deepEqual(Object.keys(r).sort(), ['habituales', 'ofertas', 'perdidos']);
    assert.equal(r.habituales.concat(r.perdidos).some(p => p.id === unaVezReciente), false);
  });

  test('un cliente sin compras: listas vacías, con la lista nueva solo si se pidió', async () => {
    const otro = (await conexion.query(`INSERT INTO cliente (nombre) VALUES ('zz-cliente sin compras') RETURNING id`)).rows[0].id;
    const ampliado = await inicio.obtenerInicio(otro, { ampliado: true });
    const comun = await inicio.obtenerInicio(otro);

    assert.deepEqual([ampliado.habituales, ampliado.perdidos, ampliado.ocasionales], [[], [], []]);
    assert.equal('ocasionales' in comun, false);
  });
});
