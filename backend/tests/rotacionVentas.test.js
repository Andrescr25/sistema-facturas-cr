/**
 * La rotación en tiempo real, sobre las ventas propias.
 *
 * LO QUE SE CUIDA
 *  - La rotación es por UNIDADES, de los últimos 3 meses, con el día de
 *    Costa Rica; el motor de precios conserva su ventana de 12 meses.
 *  - Las ventas salen de `venta_linea` (las facturas propias EMITIDAS,
 *    migración independencia/034) y se agrupan por `producto.id`. Hasta el
 *    2026-10-03 salían de `venta_historico`, que se sincronizaba de Alegra.
 *  - Nadie vuelve a leer ni a llenar ese historial viejo, ni la foto de
 *    `producto_rotacion`.
 *
 * Que un borrador o una anulada no cuenten como venta se prueba contra la
 * base en ventaLinea.test.js: ahora lo cumple la vista, no una sincronización.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaRotacion = require.resolve('../src/modules/ventas/rotacion');

function dobleDeBase(query) {
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query } } };
}

const archivosJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return archivosJs(p);
  return p.endsWith('.js') ? [p] : [];
});
const RAIZ = path.join(__dirname, '..');
const relativo = (p) => path.relative(RAIZ, p);

describe('la rotación', () => {
  const cargar = () => { dobleDeBase(async () => ({ rows: [] })); return require(rutaRotacion); };
  const { sqlRotacion, SQL_ROTACION, SQL_ROTACION_PRECIOS, VENTANA_MESES } = cargar();

  test('es por UNIDADES de los últimos 3 meses, con el día de Costa Rica', () => {
    assert.equal(VENTANA_MESES, 3);
    assert.match(SQL_ROTACION, /INTERVAL '3 months'/);
    assert.match(SQL_ROTACION, /America\/Costa_Rica/);
    assert.match(SQL_ROTACION, /ORDER BY SUM\(cantidad\) DESC/, 'el Pareto acumula unidades, no plata');
  });

  test('A hasta el 80 %, B hasta el 95 %; el que cruza el corte queda arriba', () => {
    assert.match(SQL_ROTACION, /\(v\.acumulado - v\.unidades\) < 0\.8 \* v\.total THEN 'A'/);
    assert.match(SQL_ROTACION, /\(v\.acumulado - v\.unidades\) < 0\.95 \* v\.total THEN 'B'/);
  });

  test('el motor de precios conserva su ventana de 12 meses', () => {
    assert.match(SQL_ROTACION_PRECIOS, /INTERVAL '12 months'/);
  });

  test('una ventana rara no arma SQL', () => {
    assert.throws(() => sqlRotacion('3; DROP TABLE x'));
    assert.throws(() => sqlRotacion(0));
  });

  test('sale de las ventas propias, por producto.id, y trae además el id de Alegra del producto', () => {
    assert.match(SQL_ROTACION, /FROM venta_linea/);
    assert.match(SQL_ROTACION, /GROUP BY producto_id/);
    assert.match(SQL_ROTACION, /SELECT v\.producto_id,\s+pr\.alegra_id AS alegra_item_id/);
    assert.match(SQL_ROTACION, /SUM\(importe\) AS ventas/, 'lo vendido lleva el descuento restado');
  });

  test('el mapa va por producto.id; A y B para la tablet, por el id de Alegra y sin los que no lo tienen', async () => {
    const filas = [
      { producto_id: 5, alegra_item_id: '900', clase: 'A', unidades: '10', ventas: '1000', unidades_mes: '3.33', unidades_semana: '0.8', facturas: '4', clientes_distintos: '2', ultima_venta: '2026-09-30' },
      { producto_id: 6, alegra_item_id: null, clase: 'B', unidades: '2', ventas: '50', unidades_mes: '0.67', unidades_semana: '0.2', facturas: '1', clientes_distintos: '1', ultima_venta: '2026-09-01' }
    ];
    const consultas = [];
    dobleDeBase(async (sql) => { consultas.push(String(sql)); return { rows: /clase IN/.test(sql) ? filas.filter((f) => f.alegra_item_id) : filas }; });
    delete require.cache[rutaRotacion];
    const r = require(rutaRotacion);
    const mapa = await r.rotacionPorProducto();
    assert.deepEqual([...mapa.keys()], [5, 6]);
    assert.equal(mapa.get(6).alegraItemId, null, 'un producto creado acá no tiene id de Alegra');
    assert.deepEqual(await r.clasesAB(), { A: ['900'], B: [] });
    assert.match(consultas.at(-1), /alegra_item_id IS NOT NULL/);
  });
});

describe('el historial viejo ya no se usa', () => {
  const fuentes = [...archivosJs(path.join(RAIZ, 'src')), ...archivosJs(path.join(RAIZ, 'services')), ...archivosJs(path.join(RAIZ, 'scripts')), path.join(RAIZ, 'server.js')];
  const sinComentarios = (p) => fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

  test('nadie lee ni escribe venta_historico', () => {
    const culpables = fuentes.filter((p) => /\b(FROM|JOIN|INTO|UPDATE)\s+venta_historico\b/.test(sinComentarios(p))).map(relativo);
    assert.deepEqual(culpables, []);
  });

  test('no queda nada de la sincronización contra Alegra', () => {
    const culpables = fuentes.filter((p) => /sincronizarHistorialCompras|registrarFacturaEnHistorico|ENABLE_HISTORIAL_SYNC/.test(sinComentarios(p))).map(relativo);
    assert.deepEqual(culpables, []);
  });

  test('nadie lee ya la foto vieja de producto_rotacion', () => {
    const culpables = fuentes.filter((p) => /(FROM|JOIN)\s+producto_rotacion\b/.test(fs.readFileSync(p, 'utf8'))).map(relativo);
    assert.deepEqual(culpables, []);
  });
});
