const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

/**
 * Las notas que se escribieron al facturar, para leerlas al comprar.
 *
 * Son cortas y dicen qué variante quería el cliente: "AZUL", "OJO NEGRA",
 * "Solo 75w". Bodega ya las mostraba; quien compra no las veía, y muchas
 * describen variantes que todavía no están en el catálogo.
 *
 * Desde la migración independencia/032 salen de la línea de la factura PROPIA
 * (`factura_linea.descripcion`) con una consulta; antes se recorría la lista
 * de facturas de Alegra, ~5 segundos por página.
 *
 * LO QUE SE CUIDA:
 *   · que vayan indexadas por el id PROPIO del producto (el `producto_id` de
 *     cada línea del reporte), nunca por el de Alegra;
 *   · que la descripción del producto no pase por nota;
 *   · que la misma nota repetida no llene la pantalla y tape la que importa.
 */

const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/reports/notasDeFaltantes');

let consultas;

/** `filas`: lo que devuelve la consulta, ya en el orden de la base (lo más nuevo primero). */
function montar(filas) {
  for (const r of [rutaDb, rutaServicio]) delete require.cache[r];
  consultas = [];
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params = []) => {
        consultas.push({ t: String(sql).replace(/\s+/g, ' ').trim(), params });
        return { rows: filas };
      }
    }
  };
  return require(rutaServicio);
}

let n = 0;
const linea = (productoId, nota, { factura = 1, cliente = 'KEPESCA', fecha = '2026-09-15', numero } = {}) => ({
  linea_id: ++n, producto_id: productoId, nota, factura_id: factura,
  numero: numero || `0010000149${factura}`, cliente_nombre: cliente, fecha
});

beforeEach(() => { n = 0; });

describe('qué notas se devuelven', () => {
  test('van indexadas por el id PROPIO del producto', async () => {
    const s = montar([linea(1709, 'Solo 75w'), linea(42, 'AZUL')]);
    const r = await s.notasPorProducto();
    assert.equal(r.porProducto['1709'][0].nota, 'Solo 75w');
    assert.equal(r.porProducto['42'][0].nota, 'AZUL');
  });

  test('la consulta cruza el faltante con SU línea: misma factura propia, mismo producto propio', async () => {
    const s = montar([]);
    await s.notasPorProducto();
    const { t } = consultas[0];
    assert.match(t, /JOIN factura fa ON fa\.id = f\.factura_propia_id/);
    assert.match(t, /JOIN factura_linea l ON l\.factura_id = fa\.id AND l\.producto_id = f\.producto_propio_id/);
    assert.match(t, /fa\.estado <> 'anulada'/, 'una anulada no se compra');
    assert.match(t, /f\.tipo_faltante <> 'completo'/);
  });

  test('la descripción del producto no es una nota, y una línea vacía tampoco', async () => {
    const s = montar([]);
    await s.notasPorProducto();
    const { t } = consultas[0];
    assert.match(t, /btrim\(COALESCE\(l\.descripcion, ''\)\) <> ''/);
    assert.match(t, /btrim\(l\.descripcion\) IS DISTINCT FROM btrim\(COALESCE\(p\.descripcion, ''\)\)/);
  });

  test('con fecha de inicio, filtra por la fecha de la factura propia', async () => {
    const s = montar([]);
    await s.notasPorProducto('2026-09-14');
    assert.match(consultas[0].t, /fa\.fecha >= \$1::date/);
    assert.deepEqual(consultas[0].params, ['2026-09-14']);
  });

  test('sin faltantes no hay notas', async () => {
    const s = montar([]);
    assert.deepEqual(await s.notasPorProducto(), { porProducto: {}, facturas: 0, desde: null });
  });
});

describe('la misma nota repetida', () => {
  test('se junta en una sola, contando las veces y los clientes', async () => {
    const s = montar([
      linea(29, 'Solo 75w', { factura: 2, cliente: 'AB GINA' }),
      linea(29, 'solo 75W', { factura: 1, cliente: 'KEPESCA' })
    ]);
    const [nota] = (await s.notasPorProducto()).porProducto['29'];
    assert.equal(nota.veces, 2);
    assert.deepEqual(nota.clientes.sort(), ['AB GINA', 'KEPESCA']);
  });

  test('se queda con la factura más reciente (la primera, porque vienen de la más nueva)', async () => {
    const s = montar([
      linea(29, 'AZUL', { factura: 2, fecha: '2026-09-15', numero: 'NUEVA' }),
      linea(29, 'AZUL', { factura: 1, fecha: '2026-09-14', numero: 'VIEJA' })
    ]);
    const [nota] = (await s.notasPorProducto()).porProducto['29'];
    assert.equal(nota.numeroFactura, 'NUEVA');
    assert.equal(nota.fecha, '2026-09-15');
  });

  test('notas distintas del mismo producto quedan de la más nueva a la más vieja', async () => {
    const s = montar([
      linea(29, 'LA NUEVA', { factura: 2, fecha: '2026-09-15' }),
      linea(29, 'LA VIEJA', { factura: 1, fecha: '2026-09-10' })
    ]);
    const r = await s.notasPorProducto();
    assert.deepEqual(r.porProducto['29'].map((x) => x.nota), ['LA NUEVA', 'LA VIEJA']);
    assert.equal(r.facturas, 2);
    assert.equal(r.desde, '2026-09-10');
  });
});

describe('lo que no se puede romper', () => {
  test('ya no le pregunta nada a Alegra', () => {
    const fuente = fs.readFileSync(rutaServicio, 'utf8');
    assert.doesNotMatch(fuente, /integrations\/alegra|getClient/);
  });

  test('la pantalla busca las notas por el producto_id de cada línea del reporte', () => {
    const raiz = require('path').join(__dirname, '..', '..', 'frontend', 'src', 'components', 'reporte-proveedores');
    for (const archivo of ['PanelNotasProveedor.jsx', 'ProveedorDetalle.jsx']) {
      const fuente = fs.readFileSync(require('path').join(raiz, archivo), 'utf8');
      assert.match(fuente, /notasPorProducto\?\.\[String\((p|producto)\.producto_id\)\]/, archivo);
      assert.doesNotMatch(fuente, /notasPorProducto\?\.\[String\([a-z]+\.alegra_item_id\)\]/, archivo);
    }
  });
});
