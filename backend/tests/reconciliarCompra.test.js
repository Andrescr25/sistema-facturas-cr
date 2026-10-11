const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  diferenciaDe, cuadra, reconciliarUna, reconciliarCompras, copiarXmlDeBuzonACompra
} = require('../src/modules/compras/reconciliarCompra');

/**
 * Recalcular si una compra cuadra, con el XML ya recuperado.
 *
 * De las 862 originales, 18 no cuadraban por ₡65 a ₡16.941,92, algunas
 * NEGATIVAS —las líneas sumaban MÁS que el total—. `otros_cargos` explica
 * los descuadres positivos (las líneas suman de menos) y `IVA devuelto` los
 * negativos.
 */

describe('diferenciaDe / cuadra', () => {
  test('sin ajustes, el total y la suma de líneas coinciden', () => {
    assert.equal(diferenciaDe({ total: 10000, sumaLineas: 10000 }), 0);
    assert.equal(cuadra(0), true);
  });

  test('un cargo de flete explica que las líneas sumen de menos', () => {
    // El caso de CADENA COMERCIAL RAMONENSE: +₡16.941,92.
    const d = diferenciaDe({ total: 592658.40, sumaLineas: 575716.48, otrosCargos: 16941.92 });
    assert.equal(cuadra(d), true);
  });

  test('un IVA devuelto explica que las líneas sumen de más', () => {
    // El caso de PROGRAMATICA Y TECNOLOGIA: -₡6.835,31.
    const d = diferenciaDe({ total: 189893.88, sumaLineas: 196729.19, ivaDevuelto: 6835.31 });
    assert.equal(cuadra(d), true);
  });

  test('₡1 de diferencia es redondeo, no un descuadre', () => {
    assert.equal(cuadra(diferenciaDe({ total: 10000, sumaLineas: 9999.4 })), true);
  });

  test('una diferencia real de verdad no cuadra', () => {
    assert.equal(cuadra(diferenciaDe({ total: 10000, sumaLineas: 8000 })), false);
  });
});

describe('reconciliarUna', () => {
  const XML = Buffer.from('<FacturaElectronica/>');

  function xmlParserFalso(totales, otrosCargos = []) {
    return { parseFacturaXML: async () => ({ resumen: { totales }, otrosCargos }) };
  }

  test('sin xml_ruta, no intenta leer nada', async () => {
    const r = await reconciliarUna({ id: 1, xml_ruta: null }, {
      leerArchivo: async () => { throw new Error('no debería llamarse'); },
      xmlParser: xmlParserFalso({})
    });
    assert.equal(r.estado, 'sin_xml');
  });

  test('el archivo ya no está en disco', async () => {
    const r = await reconciliarUna({ id: 1, xml_ruta: 'compras-proveedor/x.xml' }, {
      leerArchivo: async () => null,
      xmlParser: xmlParserFalso({})
    });
    assert.equal(r.estado, 'archivo_no_encontrado');
  });

  test('con otros cargos, ahora sí cuadra', async () => {
    const r = await reconciliarUna(
      { id: 1, xml_ruta: 'x.xml', total: 592658.40, suma_lineas: 575716.48 },
      { leerArchivo: async () => XML, xmlParser: xmlParserFalso({ otrosCargos: 16941.92 }, [{ tipo: '04', detalle: 'Flete', monto: 16941.92 }]) }
    );

    assert.equal(r.estado, 'cuadra');
    assert.equal(r.totalOtrosCargos, 16941.92);
    assert.equal(r.otrosCargos.length, 1);
  });

  test('sigue sin cuadrar aunque se recupere el XML: se reporta, no se inventa', async () => {
    const r = await reconciliarUna(
      { id: 1, xml_ruta: 'x.xml', total: 10000, suma_lineas: 8000 },
      { leerArchivo: async () => XML, xmlParser: xmlParserFalso({}) }
    );
    assert.equal(r.estado, 'no_cuadra');
    assert.equal(r.diferencia, 2000);
  });

  test('un XML que no se puede volver a parsear se reporta como tal', async () => {
    const r = await reconciliarUna({ id: 1, xml_ruta: 'x.xml' }, {
      leerArchivo: async () => XML,
      xmlParser: { parseFacturaXML: async () => { throw new Error('XML corrupto'); } }
    });
    assert.equal(r.estado, 'xml_invalido');
  });
});

describe('reconciliarCompras (con un pool doble)', () => {
  function montarPool(filas) {
    const consultas = [];
    return {
      consultas,
      query: async (sql, params) => {
        consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
        if (/^\s*SELECT/i.test(sql)) return { rows: filas };
        return { rows: [], rowCount: 0 };
      }
    };
  }

  test('solo pide compras con xml_ruta ya puesta', async () => {
    const pool = montarPool([]);
    await reconciliarCompras({ pool, almacenamiento: {}, xmlParser: {} });
    assert.match(pool.consultas[0].sql, /WHERE c\.xml_ruta IS NOT NULL/);
  });

  test('la que cuadra actualiza los totales SIN escribir observaciones', async () => {
    const pool = montarPool([{ id: 'c1', total: 10000, xml_ruta: 'x.xml', suma_lineas: 10000 }]);
    await reconciliarCompras({
      pool,
      almacenamiento: { leerArchivoPrivado: async () => Buffer.from('x') },
      xmlParser: { parseFacturaXML: async () => ({ resumen: { totales: {} }, otrosCargos: [] }) }
    });

    const update = pool.consultas.find((c) => /UPDATE compra/.test(c.sql));
    assert.ok(update);
    assert.equal(update.params[4], null, 'sin diferencia, la observación tiene que ser null');
  });

  test('la que no cuadra deja anotada la diferencia en observaciones', async () => {
    const pool = montarPool([{ id: 'c1', total: 10000, xml_ruta: 'x.xml', suma_lineas: 8000 }]);
    await reconciliarCompras({
      pool,
      almacenamiento: { leerArchivoPrivado: async () => Buffer.from('x') },
      xmlParser: { parseFacturaXML: async () => ({ resumen: { totales: {} }, otrosCargos: [] }) }
    });

    const update = pool.consultas.find((c) => /UPDATE compra/.test(c.sql));
    assert.match(update.params[4], /No se pudo explicar del todo/);
  });

  test('cuenta lo que no tiene XML y lo que ya no está en disco', async () => {
    const pool = montarPool([
      { id: 'c1', total: 100, xml_ruta: 'x.xml', suma_lineas: 100 },
      { id: 'c2', total: 100, xml_ruta: 'y.xml', suma_lineas: 100 }
    ]);
    const r = await reconciliarCompras({
      pool,
      almacenamiento: { leerArchivoPrivado: async (ruta) => (ruta === 'x.xml' ? Buffer.from('x') : null) },
      xmlParser: { parseFacturaXML: async () => ({ resumen: { totales: {} }, otrosCargos: [] }) }
    });

    assert.equal(r.cuadra, 1);
    assert.equal(r.archivo_no_encontrado, 1);
  });
});

describe('copiarXmlDeBuzonACompra', () => {
  test('el UPDATE solo toca lo que le falta la ruta', async () => {
    const consultas = [];
    const pool = { query: async (sql, params) => { consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); return { rowCount: 7 }; } };

    const n = await copiarXmlDeBuzonACompra(pool);

    assert.equal(n, 7);
    assert.match(consultas[0].sql, /UPDATE compra c/);
    assert.match(consultas[0].sql, /c\.xml_ruta IS NULL/);
    assert.match(consultas[0].sql, /f\.xml_ruta IS NOT NULL/);
  });
});
