const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Notas de crédito propias.
 *
 * Lo que se cuida acá:
 *  - que se acredite lo que se COBRÓ, no lo que el producto vale hoy;
 *  - que no se pueda devolver más de lo facturado, ni en monto ni por línea,
 *    contando lo que ya devolvieron otras notas;
 *  - que el motivo escrito sea obligatorio: de las 27 notas viejas hay 4 sin
 *    ninguno y hoy nadie sabe por qué se hicieron;
 *  - que no se acredite una factura anulada ni un borrador.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'notaCredito.service.js');

// Línea real: 3 × ₡1.000 con 10 % de descuento → base ₡2.700, IVA 13 % ₡351.
const LINEA = {
  id: 10, factura_id: 500, numero_linea: 1, producto_id: 12,
  nombre: 'TORNILLO GOLOSO', referencia: 'TOR02', descripcion: null,
  cabys: '4294401030100', unidad: 'Unid',
  cantidad: '3.0000', precio_unitario: '1000.00000',
  descuento_porcentaje: '10.000', descuento_monto: '300.00',
  impuesto_id: 3, tarifa: '13.000', impuesto_monto: '351.00', total: '3051.00',
  alegra_item_id: '888', ya_devuelto: '0'
};

const FACTURA = {
  id: 500, numero: '001000014868', estado: 'emitida',
  cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA', cliente_identificacion: '3101123456',
  total: '3051.00', ya_acreditado: '0'
};

function montar({ factura = FACTURA, lineas = [LINEA], serie = null } = {}) {
  const log = [];
  const serieActiva = serie || {
    id: 3, serie: '00100003', siguiente: '1', ancho_consecutivo: 4, electronica: false, activo: true
  };

  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });

    if (/FROM factura f WHERE f\.id/.test(texto)) return { rows: factura ? [{ ...factura }] : [] };
    if (/FROM factura_linea l WHERE l\.factura_id/.test(texto)) return { rows: lineas.map(l => ({ ...l })) };
    if (/FROM serie_consecutivo/.test(texto)) return { rows: [{ ...serieActiva }] };
    if (/FROM nota_credito WHERE id/.test(texto)) return { rows: [{ id: 9, estado: 'emitida', numero: '001000030001' }] };
    if (/INSERT INTO nota_credito \(/.test(texto)) {
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      return { rows: [{ id: 9, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/UPDATE nota_credito/.test(texto)) return { rows: [{ id: 9, estado: 'anulada' }] };
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
  };

  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

const filaDe = (log, patron) => log.find(l => patron.test(l.sql));

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('lo que se acredita', () => {
  test('sale de la factura, no del precio de hoy', () => {
    const { servicio } = montar();
    const { lineas, subtotal, impuesto, total } = servicio.armarLineas([LINEA], [{ numeroLinea: 1, cantidad: 3 }]);
    assert.equal(lineas[0].precio_unitario, 1000);
    assert.equal(lineas[0].tarifa, 13);
    assert.equal(lineas[0].descuento_monto, 300, 'el descuento acordado también se devuelve');
    assert.equal(subtotal, 2700);
    assert.equal(impuesto, 351);
    assert.equal(total, 3051);
  });

  test('una devolución parcial acredita solo esa parte', () => {
    const { servicio } = montar();
    // 1 de 3: base 1.000 − 10 % = 900, IVA 117.
    const r = servicio.armarLineas([LINEA], [{ numeroLinea: 1, cantidad: 1 }]);
    assert.equal(r.subtotal, 900);
    assert.equal(r.impuesto, 117);
    assert.equal(r.total, 1017);
  });

  test('sin decir líneas se devuelve todo lo que quede', () => {
    const { servicio } = montar();
    const r = servicio.armarLineas([{ ...LINEA, ya_devuelto: '1' }], []);
    assert.equal(r.lineas[0].cantidad, 2, 'quedaban 2 por devolver');
  });
});

describe('lo que no se puede devolver', () => {
  test('más de lo que se facturó', () => {
    const { servicio } = montar();
    assert.throws(() => servicio.armarLineas([LINEA], [{ numeroLinea: 1, cantidad: 4 }]),
      e => e.status === 409 && /se facturaron 3/.test(e.message));
  });

  test('más de lo que queda después de otra nota', () => {
    // Dos devoluciones parciales no pueden sumar más que la venta.
    const { servicio } = montar();
    assert.throws(() => servicio.armarLineas([{ ...LINEA, ya_devuelto: '2' }], [{ numeroLinea: 1, cantidad: 2 }]),
      e => e.status === 409);
  });

  test('una cantidad de cero o negativa', () => {
    const { servicio } = montar();
    for (const cantidad of [0, -1]) {
      assert.throws(() => servicio.armarLineas([LINEA], [{ numeroLinea: 1, cantidad }]), e => e.status === 400);
    }
  });

  test('una línea que la factura no tiene', () => {
    const { servicio } = montar();
    assert.throws(() => servicio.armarLineas([LINEA], [{ numeroLinea: 7, cantidad: 1 }]), e => e.status === 400);
  });

  test('nada, cuando ya se devolvió entera', () => {
    const { servicio } = montar();
    assert.throws(() => servicio.armarLineas([{ ...LINEA, ya_devuelto: '3' }], []),
      e => e.status === 409 && /No queda nada/.test(e.message));
  });
});

describe('crear la nota', () => {
  const BASE = { facturaId: 500, motivo: 'devolucion', motivoTexto: 'Devolvió 3 tornillos' };

  test('toma su número de la serie propia, no de la electrónica', async () => {
    const { servicio, log } = montar();
    const nota = await servicio.crearNotaCredito(BASE);
    const consulta = filaDe(log, /FROM serie_consecutivo/);
    assert.deepEqual(consulta.params, ['nota_credito', false], 'pidió la serie NO electrónica');
    assert.equal(nota.numero, '001000030001');
  });

  test('se aplica a la factura que la origina', async () => {
    const { servicio, log } = montar();
    await servicio.crearNotaCredito(BASE);
    const enlace = filaDe(log, /INSERT INTO nota_credito_factura/);
    assert.equal(enlace.params[1], 500);
    assert.equal(enlace.params[2], '001000014868');
    assert.equal(enlace.params[3], 3051);
  });

  test('el motivo escrito es obligatorio', async () => {
    const { servicio, log } = montar();
    // De las 27 notas viejas, 4 no dicen por qué se hicieron.
    await assert.rejects(servicio.crearNotaCredito({ ...BASE, motivoTexto: '  ' }),
      e => e.status === 400 && /por qué/.test(e.message));
    assert.equal(filaDe(log, /INSERT INTO nota_credito/), undefined, 'no debió escribir nada');
  });

  test('un motivo inventado se rechaza', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.crearNotaCredito({ ...BASE, motivo: 'porque si' }), e => e.status === 400);
  });

  test('no se acredita una factura anulada', async () => {
    const { servicio } = montar({ factura: { ...FACTURA, estado: 'anulada' } });
    await assert.rejects(servicio.crearNotaCredito(BASE),
      e => e.status === 409 && /anulada/.test(e.message));
  });

  test('ni un borrador', async () => {
    const { servicio } = montar({ factura: { ...FACTURA, estado: 'borrador' } });
    await assert.rejects(servicio.crearNotaCredito(BASE), e => e.status === 409 && /borrador/.test(e.message));
  });

  test('ni más de lo que queda por acreditar', async () => {
    // La factura es de 3.051 y ya tiene 3.000 acreditados: no caben 3.051 más.
    const { servicio } = montar({ factura: { ...FACTURA, ya_acreditado: '3000.00' } });
    await assert.rejects(servicio.crearNotaCredito(BASE), e => e.status === 409 && /ya tiene/.test(e.message));
  });

  test('la factura se lee con bloqueo: dos devoluciones a la vez no se cuelan', async () => {
    const { servicio, log } = montar();
    await servicio.crearNotaCredito(BASE);
    assert.match(filaDe(log, /FROM factura f WHERE f\.id/).sql, /FOR UPDATE/);
  });

  test('queda en la bitácora con su factura y su motivo', async () => {
    const { servicio, log } = montar();
    await servicio.crearNotaCredito(BASE);
    const bitacora = filaDe(log, /INSERT INTO bitacora_cambio/);
    assert.ok(bitacora, 'no registró el cambio');
    assert.match(JSON.stringify(bitacora.params), /001000014868/);
  });
});

describe('anular una nota', () => {
  test('pide el motivo', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.anularNotaCredito(9, {}), e => e.status === 400);
  });

  test('no borra: la deja anulada con su número', async () => {
    const { servicio, log } = montar();
    const nota = await servicio.anularNotaCredito(9, { motivo: 'se hizo por error' });
    assert.equal(nota.estado, 'anulada');
    assert.equal(filaDe(log, /DELETE FROM/), undefined, 'no debe borrar nada');
  });

  test('anular lo ya anulado no es un error', async () => {
    const rutaDbLocal = rutaDb;
    const ejecutar = async (sql) => {
      if (/FROM nota_credito WHERE id/.test(String(sql))) return { rows: [{ id: 9, estado: 'anulada' }] };
      return { rows: [], rowCount: 1 };
    };
    require.cache[rutaDbLocal] = {
      id: rutaDbLocal, filename: rutaDbLocal, loaded: true,
      exports: { pool: { connect: async () => ({ query: ejecutar, release: () => {} }), query: ejecutar }, query: ejecutar }
    };
    delete require.cache[rutaServicio];
    const servicio = require(rutaServicio);
    const nota = await servicio.anularNotaCredito(9, { motivo: 'otra vez' });
    assert.equal(nota.estado, 'anulada');
  });
});
