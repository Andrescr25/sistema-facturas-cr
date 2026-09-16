const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Las notas que se escribieron al facturar, para leerlas al comprar.
 *
 * Son cortas y dicen qué variante quería el cliente: "AZUL", "OJO NEGRA",
 * "Solo 75w". Bodega ya las mostraba; quien compra no las veía, y muchas
 * describen variantes que todavía no están en el catálogo.
 *
 * LO QUE SE CUIDA:
 *   · que no se lea de más —cada página de Alegra tarda unos 5 segundos—;
 *   · que la misma nota repetida no llene la pantalla y tape la que importa;
 *   · que un fallo de Alegra no se lleve puesto el reporte.
 */

const rutaDb = require.resolve('../config/database');
const rutaCliente = require.resolve('../src/integrations/alegra');
const rutaServicio = require.resolve('../src/modules/reports/notasDeFaltantes');

/** Una factura como la devuelve la lista de Alegra. */
const factura = (id, fecha, cliente, items) => ({
  id, date: fecha,
  client: { name: cliente },
  numberTemplate: { fullNumber: `00100001${id}` },
  items
});

const linea = (id, description) => ({ id, name: `ITEM ${id}`, description });

/**
 * @param facturasLocales  filas de la consulta a la base (alegra_id + fecha)
 * @param paginas          lo que devuelve Alegra, página por página
 */
function montar(facturasLocales, paginas = []) {
  for (const r of [rutaDb, rutaCliente, rutaServicio]) delete require.cache[r];

  const registro = { consultas: 0, paginasPedidas: 0 };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async () => { registro.consultas++; return { rows: facturasLocales }; }
    }
  };

  require.cache[rutaCliente] = {
    id: rutaCliente, filename: rutaCliente, loaded: true,
    exports: {
      getClient: () => ({
        request: async (metodo, ruta, params) => {
          registro.paginasPedidas++;
          const pagina = Math.floor((params.start || 0) / params.limit);
          return paginas[pagina] || [];
        }
      })
    }
  };

  const servicio = require(rutaServicio);
  servicio.olvidarCache();
  return { servicio, registro };
}

const LOCAL = [
  { alegra_id: '5414', fecha_emision: '2026-09-14' },
  { alegra_id: '5420', fecha_emision: '2026-09-15' }
];

describe('qué notas se devuelven', () => {
  test('van indexadas por el id del producto en Alegra', async () => {
    // Es el mismo `alegra_item_id` que trae cada línea del reporte: si no
    // calzaran, las notas no aparecerían en ningún producto.
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', 'Solo 75w')]),
      factura('5420', '2026-09-15', 'KEPESCA', [linea('370', 'AZUL')])
    ]]);

    const r = await servicio.notasPorProducto();

    assert.equal(r.porProducto['29'][0].nota, 'Solo 75w');
    assert.equal(r.porProducto['370'][0].nota, 'AZUL');
  });

  test('una línea sin nota no aparece', async () => {
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', ''), linea('30', '   '), linea('31', null)]),
      factura('5420', '2026-09-15', 'KEPESCA', [])
    ]]);

    const r = await servicio.notasPorProducto();
    assert.deepEqual(r.porProducto, {});
  });

  test('las facturas que no tienen faltantes pendientes se saltan', async () => {
    // El reporte es de lo que hay que comprar: una factura ya alistada no
    // tiene por qué meter notas en la lista.
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', 'Solo 75w')]),
      factura('9999', '2026-09-15', 'OTRO', [linea('77', 'ESTA NO VA')]),
      factura('5420', '2026-09-15', 'KEPESCA', [])
    ]]);

    const r = await servicio.notasPorProducto();
    assert.ok(!r.porProducto['77'], 'se coló una nota de una factura que no está en el reporte');
  });
});

describe('la misma nota repetida', () => {
  test('se junta en una sola, contando las veces', async () => {
    // Un "Entregado" escrito cinco veces llenaría la pantalla y taparía la
    // que sí dice qué variante comprar.
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', 'OJO NEGRA')]),
      factura('5420', '2026-09-15', 'DELICHINO', [linea('29', 'ojo negra')])
    ]]);

    const r = await servicio.notasPorProducto();

    assert.equal(r.porProducto['29'].length, 1, 'se repitió la misma nota');
    assert.equal(r.porProducto['29'][0].veces, 2);
  });

  test('junta los clientes que la escribieron', async () => {
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', 'AZUL')]),
      factura('5420', '2026-09-15', 'KEPESCA', [linea('29', 'AZUL')])
    ]]);

    const r = await servicio.notasPorProducto();
    assert.deepEqual(r.porProducto['29'][0].clientes.sort(), ['AB GINA', 'KEPESCA']);
  });

  test('se queda con la factura más reciente de las repetidas', async () => {
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', 'AZUL')]),
      factura('5420', '2026-09-15', 'KEPESCA', [linea('29', 'AZUL')])
    ]]);

    const r = await servicio.notasPorProducto();
    assert.equal(r.porProducto['29'][0].fecha, '2026-09-15');
  });

  test('notas distintas del mismo producto van de la más nueva a la más vieja', async () => {
    // La más reciente describe lo que se está pidiendo ahora.
    const { servicio } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'AB GINA', [linea('29', 'LA VIEJA')]),
      factura('5420', '2026-09-15', 'KEPESCA', [linea('29', 'LA NUEVA')])
    ]]);

    const r = await servicio.notasPorProducto();
    assert.deepEqual(r.porProducto['29'].map(n => n.nota), ['LA NUEVA', 'LA VIEJA']);
  });
});

describe('cuánto se le pide a Alegra', () => {
  test('sin faltantes pendientes NO se le pide nada', async () => {
    // Cada página tarda unos 5 segundos: no se paga por nada.
    const { servicio, registro } = montar([], [[factura('1', '2026-09-15', 'X', [])]]);

    const r = await servicio.notasPorProducto();

    assert.equal(registro.paginasPedidas, 0);
    assert.deepEqual(r, { porProducto: {}, facturas: 0, desde: null });
  });

  test('se deja de pedir apenas aparecieron todas las facturas', async () => {
    const { servicio, registro } = montar(LOCAL, [
      [factura('5414', '2026-09-14', 'A', [linea('1', 'UNA')]),
       factura('5420', '2026-09-15', 'B', [linea('2', 'OTRA')])],
      [factura('9998', '2026-09-10', 'C', [linea('3', 'NO SE DEBERÍA LEER')])]
    ]);

    const r = await servicio.notasPorProducto();

    assert.equal(registro.paginasPedidas, 1, 'siguió pidiendo páginas sin necesidad');
    assert.ok(!r.porProducto['3']);
  });

  test('la segunda consulta seguida sale de la caché', async () => {
    const { servicio, registro } = montar(LOCAL, [[
      factura('5414', '2026-09-14', 'A', [linea('1', 'UNA')]),
      factura('5420', '2026-09-15', 'B', [])
    ]]);

    await servicio.notasPorProducto();
    const pedidas = registro.paginasPedidas;
    await servicio.notasPorProducto();

    assert.equal(registro.paginasPedidas, pedidas, 'volvió a pagar los segundos de Alegra');
  });
});
