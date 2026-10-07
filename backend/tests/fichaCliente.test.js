const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * La ficha completa de un cliente.
 *
 * Junta en una pantalla lo que estaba repartido en tres. Lo que se cuida es
 * que cada número diga lo que parece decir: un promedio que incluya facturas
 * anuladas, un saldo que cuente cobros revertidos o un "crédito disponible"
 * inventado cuando no hay límite puesto son peores que no mostrar nada,
 * porque alguien va a decidir con eso.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'clientes', 'clientes.resumen.service.js');

const FICHA = {
  id: 111, nombre: 'KEPESCA', identificacion: '100000000', alegra_id: '90',
  limite_credito: null, correos_adicionales: null, activo: true, plazo: 'De contado'
};

/** Monta el servicio con una base falsa y anota cada consulta. */
function montar({ ficha = FICHA, saldo = {}, compras = {}, filas = {} } = {}) {
  const log = [];
  const ejecutar = async (sql, params) => {
    log.push({ sql, params });
    if (/FROM cliente c LEFT JOIN plazo_credito/.test(sql)) return { rows: ficha ? [ficha] : [] };
    if (/WITH pendiente AS/.test(sql)) {
      return { rows: [{ facturas: 0, total: 0, vencidas: 0, vencido: 0, vence_primero: null, ...saldo }] };
    }
    if (/COUNT\(\*\)::int facturas, COALESCE\(SUM\(total\), 0\) total/.test(sql)) {
      return { rows: [{ facturas: 0, total: 0, ultima: null, primera: null, ...compras }] };
    }
    if (/FROM factura f[\s\S]*WHERE f\.cliente_id/.test(sql)) return { rows: filas.facturas || [] };
    if (/FROM pago p LEFT JOIN metodo_pago/.test(sql)) return { rows: filas.abonos || [] };
    if (/FROM factura_linea l/.test(sql)) return { rows: filas.productos || [] };
    if (/FROM pedido_cliente/.test(sql)) return { rows: filas.pedidos || [] };
    return { rows: [] };
  };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

const consulta = (log, re) => log.find(l => re.test(l.sql));

describe('de dónde salen los números', () => {
  test('el saldo se calcula, no se lee de una columna', async () => {
    const { servicio, log } = montar();
    await servicio.resumenDeCliente(111);
    const q = consulta(log, /WITH pendiente AS/);

    assert.match(q.sql, /p\.anulado = FALSE/, 'un cobro anulado no puede contar como pagado');
    assert.match(q.sql, /nc\.estado <> 'anulada'/);
    assert.doesNotMatch(q.sql, /cuentas_por_cobrar/, 'el espejo de Alegra ya no existe');
  });

  test('el día de corte es el de Costa Rica', async () => {
    const { servicio, log } = montar();
    await servicio.resumenDeCliente(111);
    const q = consulta(log, /WITH pendiente AS/);

    assert.doesNotMatch(q.sql, /CURRENT_DATE/, 'en Render el servidor corre en UTC');
    assert.match(String(q.params[1]), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('el promedio no incluye facturas anuladas', async () => {
    // Una anulada no es una venta: bajaría el promedio sin que nadie entienda.
    const { servicio, log } = montar();
    await servicio.resumenDeCliente(111);
    assert.match(consulta(log, /COALESCE\(SUM\(total\), 0\) total/).sql, /estado = 'emitida'/);
  });

  test('el método del abono sale del catálogo, no de la palabra de Alegra', async () => {
    // `metodo_pago_texto` guarda "cash" y "TRANSFER" tal cual: mostrarlo le
    // deja al cajero un inglés que no significa nada.
    const { servicio, log } = montar();
    await servicio.resumenDeCliente(111);
    assert.match(consulta(log, /FROM pago p LEFT JOIN metodo_pago/).sql, /COALESCE\(mp\.nombre/);
  });

  test('lo que compra se agrupa por producto, no por el texto de la línea', async () => {
    // La misma plomada salía dos veces con la mitad del monto cada una,
    // porque en unas facturas la línea trae referencia y en otras no.
    const { servicio, log } = montar();
    await servicio.resumenDeCliente(111);
    const q = consulta(log, /FROM factura_linea l/);

    assert.match(q.sql, /GROUP BY clave/);
    assert.match(q.sql, /COALESCE\(l\.producto_id::text/);
  });
});

describe('el crédito disponible', () => {
  test('sin límite puesto no se inventa un número', async () => {
    // Decir "₡0 disponible" haría creer que no tiene crédito, y lo que pasa
    // es que nadie se lo escribió.
    const { servicio } = montar({ saldo: { total: '50000' } });
    const r = await servicio.resumenDeCliente(111);

    assert.strictEqual(r.saldo.limite, null);
    assert.strictEqual(r.saldo.disponible, null);
  });

  test('con límite, se resta lo que debe', async () => {
    const { servicio } = montar({
      ficha: { ...FICHA, limite_credito: '250000.00' },
      saldo: { total: '60000' }
    });
    const r = await servicio.resumenDeCliente(111);
    assert.strictEqual(r.saldo.disponible, 190000);
  });

  test('sobregirado da negativo, no cero', async () => {
    // Taparlo en cero escondería justo el caso que hay que ver.
    const { servicio } = montar({
      ficha: { ...FICHA, limite_credito: '100000.00' },
      saldo: { total: '150000' }
    });
    const r = await servicio.resumenDeCliente(111);
    assert.strictEqual(r.saldo.disponible, -50000);
  });
});

describe('lo que se devuelve', () => {
  test('un cliente sin movimiento no rompe la pantalla', async () => {
    const { servicio } = montar();
    const r = await servicio.resumenDeCliente(111);

    assert.deepStrictEqual(r.facturas, []);
    assert.deepStrictEqual(r.abonos, []);
    assert.strictEqual(r.compras.promedio, 0, 'dividir entre cero daría NaN en la pantalla');
    assert.strictEqual(r.saldo.total, 0);
  });

  test('el saldo de una factura nunca sale negativo', async () => {
    const { servicio } = montar({
      filas: { facturas: [{ id: 1, numero: 'A', total: '1000', saldo: '-50', estado: 'emitida' }] }
    });
    const r = await servicio.resumenDeCliente(111);
    assert.strictEqual(r.facturas[0].saldo, 0, 'cobrar de más no es una deuda en contra');
  });

  test('los abonos anulados van, marcados', async () => {
    // Esconderlos haría que el cliente pregunte por un pago que sí existió y
    // nadie encuentre el rastro.
    const { servicio } = montar({
      filas: { abonos: [{ id: 1, numero: '5', monto: '1000', anulado: true, metodo: 'Efectivo' }] }
    });
    const r = await servicio.resumenDeCliente(111);

    assert.strictEqual(r.abonos.length, 1);
    assert.strictEqual(r.abonos[0].anulado, true);
  });

  test('un cliente que no existe se dice, no se devuelve vacío', async () => {
    const { servicio } = montar({ ficha: null });
    await assert.rejects(servicio.resumenDeCliente(999), (e) => e.status === 404);
  });

  test('los pedidos se buscan por id propio, incluidos los del agente sin cuenta del portal', async () => {
    const { servicio, log } = montar();
    await servicio.resumenDeCliente(111);
    const q = consulta(log, /FROM pedido_cliente/);
    assert.deepStrictEqual(q.params, [111]);
    assert.match(q.sql, /pc.cliente_id = \$1/);
    assert.doesNotMatch(q.sql, /JOIN cliente_portal|alegra_contact_id/);
  });
});
