const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Buscar y ver facturas en la base propia.
 *
 * LO QUE CUIDA ESTA PRUEBA, que no se ve mirando la pantalla:
 *  - que el saldo NO cuente los cobros anulados. Hay uno así entre los 1.350
 *    copiados (₡84.127,90): contarlo mostraría esa factura como pagada;
 *  - que buscar "4868" encuentre la factura, porque nadie teclea el número
 *    completo de veinte dígitos;
 *  - que los cobros anulados se devuelvan MARCADOS y no escondidos: el
 *    cliente va a preguntar por ese cobro y tiene que haber rastro;
 *  - que nadie pueda pedirse el histórico entero de un golpe.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaConsulta.service.js');

const FACTURA = {
  id: 500, numero: '001000014868', serie: '00100001', consecutivo: '4868', tipo_documento: 'factura',
  electronica: false, estado: 'emitida', fecha: '2026-09-10', fecha_vencimiento: '2026-09-10',
  cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA', cliente_identificacion: '3101123456',
  condicion_venta: 'contado', plazo_texto: 'De contado',
  subtotal: '2700.00', descuento: '300.00', impuesto: '351.00', total: '3051.00',
  cobrado: '0', acreditado: '0', lineas: 2, motivo_anulacion: null, observaciones: null,
  total_filas: '1'
};

function montar({ factura = FACTURA, lineas = [], cobros = [], notas = [] } = {}) {
  const consultas = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    consultas.push({ sql: texto, params });
    // Se discrimina por el COMIENZO de la sentencia, no por lo que aparezca en
    // cualquier parte: "FROM pago_factura pf JOIN pago" también está DENTRO de
    // la subconsulta del saldo del listado, y buscarlo suelto hacía que la
    // consulta principal se contestara con la lista de cobros.
    if (/^SELECT numero_linea/.test(texto)) return { rows: lineas };
    if (/^SELECT p\.id, p\.numero/.test(texto)) return { rows: cobros };
    if (/^SELECT nc\.id, nc\.numero/.test(texto)) return { rows: notas };
    return { rows: factura ? [{ ...factura }] : [] };
  };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { query: ejecutar, connect: async () => ({ query: ejecutar, release: () => {} }) }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), consultas };
}

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('el saldo', () => {
  test('no cuenta los cobros anulados', async () => {
    // El caso real: la factura 00100001010000002164 tiene un cobro anulado de
    // ₡84.127,90 y Alegra la reporta con 0 pagado. Contarlo la mostraría
    // cobrada.
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({});
    assert.match(consultas[0].sql, /JOIN pago p ON p\.id = pf\.pago_id WHERE pf\.factura_id = f\.id AND p\.anulado = FALSE/);
  });

  test('tampoco cuenta las notas de crédito anuladas', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({});
    assert.match(consultas[0].sql, /nc\.estado <> 'anulada'/);
  });

  test('se calcula: total menos cobrado menos acreditado', async () => {
    const { servicio } = montar({ factura: { ...FACTURA, cobrado: '1000.00', acreditado: '51.00' } });
    const { data } = await servicio.listarFacturas({});
    assert.equal(data[0].total, 3051);
    assert.equal(data[0].cobrado, 1000);
    assert.equal(data[0].acreditado, 51);
    assert.equal(data[0].saldo, 2000);
  });

  test('nunca queda negativo: un excedente no es una deuda en contra', async () => {
    const { servicio } = montar({ factura: { ...FACTURA, cobrado: '5000.00' } });
    const { data } = await servicio.listarFacturas({});
    assert.equal(data[0].saldo, 0);
  });
});

describe('la búsqueda', () => {
  test('encuentra por la terminación del número: nadie teclea los veinte dígitos', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ buscar: '4868' });
    assert.match(consultas[0].sql, /f\.numero LIKE \$1/);
    assert.equal(consultas[0].params[0], '%4868');
  });

  test('también por nombre o cédula del cliente, sin acentos', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ buscar: 'Pulpería' });
    // Sin espacios en el patrón: entre las dos columnas el SQL trae
    // "|| ' ' || COALESCE(f.", y exigir un espacio antes de la segunda es una
    // falla de la prueba, no del código.
    assert.match(consultas[0].sql, /cliente_nombre.*cliente_identificacion/);
    assert.equal(consultas[0].params.includes('%pulperia%'), true);
  });

  test('buscar un nombre NO se compara contra el número', async () => {
    // Verificado contra la copia local: buscar "SUPER" devolvía las 5.398
    // facturas. Al quitarle las letras no queda ningún dígito, el patrón
    // terminaba en '%' y `numero LIKE '%'` calza con todo.
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ buscar: 'SUPER' });
    assert.equal(/f\.numero LIKE/.test(consultas[0].sql), false, 'no debe comparar el número');
    assert.equal(consultas[0].params.includes('%'), false, 'un patrón "%" traería todas');
  });

  test('una cédula con guiones busca por número y por cliente', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ buscar: '3-101-123456' });
    assert.match(consultas[0].sql, /f\.numero LIKE/);
    assert.equal(consultas[0].params[0], '%3101123456');
    assert.equal(consultas[0].params[1], '%3-101-123456%');
  });

  test('filtra por rango de fechas y por cliente', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ desde: '2026-09-01', hasta: '2026-09-30', clienteId: 7 });
    assert.match(consultas[0].sql, /f\.fecha >= \$1::date/);
    assert.match(consultas[0].sql, /f\.fecha <= \$2::date/);
    assert.match(consultas[0].sql, /f\.cliente_id = \$3/);
    assert.deepEqual(consultas[0].params.slice(0, 3), ['2026-09-01', '2026-09-30', 7]);
  });

  test('"con_saldo" trae solo las que de verdad se le pueden cobrar a alguien', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ estado: 'con_saldo' });
    assert.match(consultas[0].sql, /f\.total - .* > 1/);
  });

  test('un estado que no existe se rechaza antes de consultar', async () => {
    const { servicio, consultas } = montar();
    await assert.rejects(servicio.listarFacturas({ estado: 'pagadas' }), e => e.status === 400);
    assert.equal(consultas.length, 0);
  });

  test('nadie se pide el histórico entero de un golpe', async () => {
    const { servicio, consultas } = montar();
    await servicio.listarFacturas({ limite: 10000 });
    assert.equal(consultas[0].params.includes(100), true);
  });
});

describe('abrir una factura', () => {
  test('trae sus líneas, sus cobros y sus notas de crédito', async () => {
    const { servicio } = montar({
      lineas: [{
        numero_linea: 1, producto_id: 12, nombre: 'TORNILLO', referencia: 'TOR02', descripcion: null,
        cabys: '4294401030100', unidad: 'Unid', cantidad: '3.0000', precio_unitario: '1000.00000',
        descuento_porcentaje: '10.000', descuento_monto: '300.00', tarifa: '13.000',
        impuesto_monto: '351.00', total: '3051.00'
      }],
      cobros: [{ id: 9, numero: '720', fecha: '2026-09-11', metodo_pago_texto: 'cash', referencia: null, anulado: true, monto: '3051.00' }],
      notas: [{ id: 3, numero: '00100001030000000081', fecha: '2026-09-11', motivo: 'error', motivo_texto: 'error ', estado: 'emitida', monto: '500.00' }]
    });

    const f = await servicio.obtenerFactura(500);
    assert.equal(f.numero, '001000014868');
    assert.equal(f.lineas.length, 1);
    assert.equal(f.lineas[0].tarifa, 13, 'los NUMERIC de pg llegan como texto y salen como número');
    assert.equal(f.lineas[0].cantidad, 3);
    assert.equal(f.cobros[0].anulado, true, 'el anulado se devuelve MARCADO, no escondido');
    assert.equal(f.cobros[0].monto, 3051);
    assert.equal(f.notasCredito[0].motivo, 'error');
  });

  test('una factura que no existe da 404 y no busca sus líneas', async () => {
    const { servicio, consultas } = montar({ factura: null });
    await assert.rejects(servicio.obtenerFactura(999), e => e.status === 404);
    // La consulta principal menciona factura_linea para contar las líneas; lo
    // que no debe haber corrido es la consulta de DETALLE.
    assert.equal(consultas.some(c => /^SELECT numero_linea/.test(c.sql)), false);
  });

  test('un id inválido se rechaza', async () => {
    const { servicio } = montar();
    for (const id of ['abc', 0, -3]) {
      await assert.rejects(servicio.obtenerFactura(id), e => e.status === 400);
    }
  });
});
