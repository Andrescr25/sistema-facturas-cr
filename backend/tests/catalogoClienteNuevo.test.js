/**
 * El catálogo de "Cliente nuevo" (catálogo del agente).
 *
 * PARA QUÉ EXISTE
 * Cuando el agente sale a buscar clientes no le sirve enseñar 2.000
 * productos: le enseña la oferta y lo que más se vende (rotación A, y cuando
 * se termina, la B), que es lo más fácil de vender. Lo demás lo encuentra el
 * buscador si el cliente pregunta.
 *
 * LO QUE SE CUIDA
 *  - el orden: oferta, liquidación, después A, después B — y dentro de cada
 *    una, por categoría y subcategoría, como el resto del catálogo;
 *  - que ningún producto salga dos veces (la liquidación gana: su precio es
 *    el que se cobra);
 *  - que la C no aparezca;
 *  - que la rotación no quede abierta al público: dice qué es lo que más se
 *    vende.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'catalogoAgentePersonalizacion.js'), 'utf8');

const { catalogoClienteNuevo, esClienteNuevo, CLIENTE_NUEVO, construirStats } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { catalogoClienteNuevo, esClienteNuevo, CLIENTE_NUEVO, construirStats };`
)();

const producto = (id, nombre, categoria, sub) => ({
  id: String(id), name: nombre, itemCategory: categoria ? { name: categoria } : undefined,
  ...(sub ? { subcategoria: { id: sub.length, nombre: sub } } : {})
});

const CONFIG = {
  categorias: [
    { name: 'Productos de PVC', nombreVisible: 'Productos de PVC', orden: 0 },
    { name: 'Ferretería', nombreVisible: 'Ferretería', orden: 1 },
    { name: 'Limpieza', nombreVisible: 'Limpieza', orden: 3 }
  ],
  subcategorias: [
    { categoria: 'Productos de PVC', nombre: 'PVC 1/2', orden: 0 },
    { categoria: 'Productos de PVC', nombre: 'PVC 3/4', orden: 1 }
  ]
};

const CATALOGO = [
  producto(1, 'CLORO GALON', 'Limpieza'),
  producto(2, 'UNION 3/4 PVC', 'Productos de PVC', 'PVC 3/4'),
  producto(3, 'CODO 1/2 PVC', 'Productos de PVC', 'PVC 1/2'),
  producto(4, 'TORNILLO 1"', 'Ferretería'),
  producto(5, 'SIERRA', 'Ferretería'),
  producto(6, 'DESODORANTE', 'Limpieza'),
  producto(7, 'CLAVO 3"', 'Ferretería')
];
const ROTACION = { A: ['1', '2', '3', '4'], B: ['5', '6'] }; // el 7 es C

describe('el catálogo de "Cliente nuevo"', () => {
  test('A y B por categoría en el orden de Gestión de Catálogo, y por subcategoría adentro', () => {
    const c = catalogoClienteNuevo(CATALOGO, { rotacion: ROTACION, configCatalogo: CONFIG });
    assert.deepEqual(c.A.map((b) => b.clave), ['Productos de PVC', 'Ferretería', 'Limpieza']);
    const [pvc] = c.A;
    assert.deepEqual(pvc.productos.map((p) => p.id), ['3', '2'], 'PVC 1/2 antes que PVC 3/4');
    assert.deepEqual(pvc.familias.map((f) => f.nombre), ['PVC 1/2', 'PVC 3/4']);
    assert.equal(c.A[1].familias, null, 'Ferretería no tiene subcategorías: no se parte');
    assert.deepEqual(c.B.map((b) => b.clave), ['Ferretería', 'Limpieza']);
  });

  test('la C no aparece', () => {
    const c = catalogoClienteNuevo(CATALOGO, { rotacion: ROTACION, configCatalogo: CONFIG });
    const todos = [...c.A, ...c.B].flatMap((b) => b.productos.map((p) => p.id));
    assert.ok(!todos.includes('7'));
    assert.deepEqual(c.totales, { oferta: 0, liquidacion: 0, A: 4, B: 2 });
  });

  test('lo que está en oferta no se repite en A ni en B', () => {
    const rebajados = [{ ...CATALOGO[1], precioAntes: 500 }, { ...CATALOGO[4], precioAntes: 9000 }];
    const c = catalogoClienteNuevo(CATALOGO, { rebajados, rotacion: ROTACION, configCatalogo: CONFIG });
    const enAyB = [...c.A, ...c.B].flatMap((b) => b.productos.map((p) => p.id));
    assert.ok(!enAyB.includes('2') && !enAyB.includes('5'));
    assert.deepEqual(c.oferta.map((b) => b.clave), ['Productos de PVC', 'Ferretería']);
    assert.deepEqual(c.totales, { oferta: 2, liquidacion: 0, A: 3, B: 1 });
  });

  test('la liquidación va por categoría, y lo que está ahí no sale en ninguna otra parte', () => {
    const rebajados = [{ ...CATALOGO[1], precioAntes: 500 }, { ...CATALOGO[4], precioAntes: 9000 }];
    const liquidacion = [{ ...CATALOGO[4], descuentoPorcentaje: 30 }, { ...CATALOGO[0], descuentoPorcentaje: 20 }, { ...CATALOGO[6], descuentoPorcentaje: 50 }];
    const c = catalogoClienteNuevo(CATALOGO, { rebajados, liquidacion, rotacion: ROTACION, configCatalogo: CONFIG });
    assert.deepEqual(c.liquidacion.map((b) => b.clave), ['Ferretería', 'Limpieza'], 'por categoría, no por porcentaje');
    const ids = (bloques) => bloques.flatMap((b) => b.productos.map((p) => p.id));
    assert.deepEqual(ids(c.oferta), ['2'], 'la sierra también bajó de precio, pero se cobra con el descuento de liquidación');
    assert.ok(!ids(c.A).includes('1') && !ids(c.B).includes('5'));
    const todos = [...ids(c.oferta), ...ids(c.liquidacion), ...ids(c.A), ...ids(c.B)];
    assert.equal(new Set(todos).size, todos.length, 'ningún producto dos veces');
    assert.deepEqual(c.totales, { oferta: 1, liquidacion: 3, A: 2, B: 1 });
  });

  test('sin rotación descargada, queda solo la oferta', () => {
    const c = catalogoClienteNuevo(CATALOGO, { rebajados: [CATALOGO[0]], rotacion: null, configCatalogo: CONFIG });
    assert.deepEqual(c.totales, { oferta: 1, liquidacion: 0, A: 0, B: 0 });
  });

  test('"Cliente nuevo" no tiene compras: no arma "lo que más compra"', () => {
    assert.equal(esClienteNuevo(CLIENTE_NUEVO), true);
    assert.equal(esClienteNuevo({ id: 55, n: 'SUPER X' }), false);
    assert.equal(construirStats(CLIENTE_NUEVO).size, 0);
  });
});

describe('GET /catalogo-agente/rotacion', () => {
  const rutaDb = require.resolve('../config/database');
  const rutaServicio = require.resolve('../src/modules/catalogo-agente/catalogo-agente.service');
  beforeEach(() => { delete require.cache[rutaDb]; delete require.cache[rutaServicio]; });

  test('devuelve solo los ids de A y B, sin la facturación', async () => {
    let consulta = '';
    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true,
      exports: {
        query: async (sql) => {
          consulta = String(sql);
          return { rows: [
            { alegra_item_id: '10', clase: 'A', calculado_en: new Date('2026-08-10T15:12:26Z') },
            { alegra_item_id: '11', clase: 'B', calculado_en: new Date('2026-08-10T15:12:27Z') }
          ] };
        }
      }
    };
    const servicio = require(rutaServicio);
    const r = await servicio.obtenerRotacion();
    assert.deepEqual({ A: r.A, B: r.B }, { A: ['10'], B: ['11'] });
    assert.match(consulta, /clase IN \('A', 'B'\)/);
    assert.doesNotMatch(consulta, /facturacion/);
  });

  test('pide sesión: no está en las rutas públicas', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'auth', 'auth.middleware.js'), 'utf8');
    assert.doesNotMatch(fuente, /'\/catalogo-agente\/rotacion'/);
    assert.doesNotMatch(fuente, /'\/catalogo-agente'\s*[,\]]/, 'un prefijo entero público abriría también la rotación');
  });
});
