const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * "Enviar a Alegra" pasa a ser "Registrar compra".
 *
 * Lo que se cuida acá, que es plata y catálogo:
 *  - que no se registre dos veces la misma factura del buzón;
 *  - que el costo de CADA producto con línea propia se actualice, y el
 *    precio solo cuando se ajustó a mano;
 *  - que una línea sin producto propio no tumbe la compra, solo se cuente;
 *  - que la cuenta por pagar se libere y quede colgada de la compra —y que
 *    una compra de CONTADO, sin cuenta, no sea un error;
 *  - que un fallo a mitad de camino haga ROLLBACK: nada a medias.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'compras', 'compras.service.js');

const FACTURA_ID = 'a1b2c3d4-1111-2222-3333-444455556666';

const FACTURA_BUZON = {
  id: FACTURA_ID,
  clave: '5'.repeat(50),
  numero_consecutivo: '00100001010000123456',
  proveedor_cedula: '3101129878',
  proveedor_nombre: 'F Y G FERRETEROS SOCIEDAD ANONIMA',
  fecha_emision: '2026-09-01T00:00:00.000Z',
  fecha_vencimiento: null,
  moneda: 'CRC',
  total_factura: '10000.00',
  xml_ruta: 'compras-proveedor/xml-1.xml',
  total_otros_cargos: '0',
  total_descuentos: '0',
  total_iva_devuelto: '0',
  otros_cargos: [],
  estado: 'RELACIONADA'
};

const PROVEEDOR = { id: 42 };

const LINEA_CON_PRODUCTO = {
  id: 'linea-1', factura_id: FACTURA_ID, numero_linea: 1, producto_id: 7, factor_conversion: 1,
  descripcion: 'TORNILLO GOLOSO', codigo_proveedor: 'TOR02', codigo_cabys: '4294401030100',
  cantidad: '10.0000', unidad_medida: 'Unid', precio_unitario: '900.00000',
  descuento: '0', impuesto: '1170.00', total_linea: '10170.00'
};
const LINEA_SIN_PRODUCTO = {
  id: 'linea-2', factura_id: FACTURA_ID, numero_linea: 2, producto_id: null, factor_conversion: null,
  descripcion: 'PRODUCTO SIN MAPEAR', codigo_proveedor: 'XX', codigo_cabys: null,
  cantidad: '1.0000', unidad_medida: 'Unid', precio_unitario: '100.00000',
  descuento: '0', impuesto: '13.00', total_linea: '113.00'
};

const PRODUCTO = { id: 7, nombre: 'Tornillo goloso', precio_sin_iva: '150.00000', costo_con_iva: '100.00000', alegra_id: null };
const CXP = { id: 'cxp-1', factura_id: FACTURA_ID, monto_total: '10170.00', saldo_pendiente: '10170.00', fecha_vencimiento: '2026-10-01' };

function montar({ factura = FACTURA_BUZON, proveedor = PROVEEDOR, lineas = [LINEA_CON_PRODUCTO], producto = PRODUCTO, compraExistente = null, cxp = null } = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });

    if (texto === 'BEGIN' || texto === 'COMMIT' || texto === 'ROLLBACK') return { rows: [] };
    if (/FROM facturas_proveedores WHERE id = \$1 FOR UPDATE/.test(texto)) {
      return { rows: factura ? [{ ...factura }] : [] };
    }
    if (/SELECT id FROM compra WHERE factura_proveedor_id/.test(texto)) {
      return { rows: compraExistente ? [{ id: compraExistente }] : [] };
    }
    if (/FROM proveedor WHERE identificacion/.test(texto)) {
      return { rows: proveedor ? [{ ...proveedor }] : [] };
    }
    if (/INSERT INTO compra \(/.test(texto)) {
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      return { rows: [{ id: 501, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/SELECT l\.\*, m\.producto_id/.test(texto)) {
      return { rows: lineas.map((l) => ({ ...l })) };
    }
    if (/INSERT INTO compra_linea/.test(texto)) return { rows: [], rowCount: 1 };
    if (/FROM producto WHERE id = \$1 FOR UPDATE/.test(texto)) {
      return { rows: producto ? [{ ...producto }] : [] };
    }
    if (/UPDATE producto SET costo_con_iva/.test(texto)) {
      return { rows: [{ ...producto, costo_con_iva: params[0], precio_sin_iva: params[1] || producto.precio_sin_iva }] };
    }
    if (/INSERT INTO precio_historico/.test(texto)) return { rows: [{ id: 1 }] };
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    if (/INSERT INTO cuentas_por_pagar/.test(texto)) return { rows: [{ id: 'cxp-contado', de_contado: true }] };
    if (/UPDATE cuentas_por_pagar/.test(texto)) {
      return { rows: cxp ? [{ ...cxp, liberada: true, compra_id: params[1] }] : [] };
    }
    if (/UPDATE facturas_proveedores SET estado/.test(texto)) return { rows: [], rowCount: 1 };
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

const fila = (log, patron) => log.find((l) => patron.test(l.sql));
const todas = (log, patron) => log.filter((l) => patron.test(l.sql));

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('registrarCompra — camino feliz', () => {
  test('crea la compra, la línea, actualiza el costo, libera la CxP y marca la factura', async () => {
    const { servicio, log } = montar({ cxp: CXP });
    const r = await servicio.registrarCompra(FACTURA_ID, {});

    assert.equal(r.lineas, 1);
    assert.equal(r.costosActualizados, 1);
    assert.equal(r.preciosActualizados, 0);
    assert.equal(r.sinProductoPropio, 0);
    assert.equal(r.cuentaLiberada, true);

    assert.ok(fila(log, /INSERT INTO compra \(/));
    assert.ok(fila(log, /INSERT INTO compra_linea/));
    assert.ok(fila(log, /UPDATE producto SET costo_con_iva/));
    assert.ok(fila(log, /UPDATE cuentas_por_pagar/));
    assert.ok(fila(log, /UPDATE facturas_proveedores SET estado = 'ENVIADA'/));
    assert.ok(log.some((l) => l.sql === 'COMMIT'));
  });

  test('el total de la compra es el de la factura, no una suma recalculada', async () => {
    const { servicio, log } = montar();
    await servicio.registrarCompra(FACTURA_ID, {});
    const insert = fila(log, /INSERT INTO compra \(/);
    // 7º parámetro por orden de columnas del INSERT: ...fecha_vencimiento, moneda, total...
    assert.equal(insert.params[6], FACTURA_BUZON.total_factura);
  });

  test('sin cuenta por pagar (compra de contado), no es un error', async () => {
    const { servicio } = montar({ cxp: null });
    const r = await servicio.registrarCompra(FACTURA_ID, {});
    assert.equal(r.cuentaLiberada, false);
  });

  test('de contado: nace su cuenta por pagar PENDIENTE, sin ningún pago', async () => {
    // Decisión del usuario: no sale pagada de una vez; una persona anota
    // "se pagó vía efectivo" en Pagos a Proveedores y recién ahí sale de Caja General.
    const { servicio, log } = montar({ cxp: null });
    const r = await servicio.registrarCompra(FACTURA_ID, {});
    assert.equal(r.cuentaDeContado, true);
    const insert = fila(log, /INSERT INTO cuentas_por_pagar/);
    assert.match(insert.sql, /'PENDIENTE', TRUE, \$7, \$8, TRUE\)/, 'pendiente, liberada, de contado');
    assert.match(insert.sql, /ON CONFLICT \(factura_id\) DO NOTHING/);
    assert.equal(insert.params[0], FACTURA_ID);
    assert.equal(insert.params[5], FACTURA_BUZON.total_factura, 'el monto es el total de la factura');
    assert.equal(insert.params[6], 501, 'colgada de la compra');
    assert.equal(log.some((l) => /INSERT INTO pago_proveedor/.test(l.sql)), false, 'no se paga sola');
  });

  test('a crédito: se libera la que ya tenía y no se crea otra', async () => {
    const { servicio, log } = montar({ cxp: CXP });
    const r = await servicio.registrarCompra(FACTURA_ID, {});
    assert.equal(r.cuentaLiberada, true);
    assert.equal(r.cuentaDeContado, false);
    assert.equal(fila(log, /INSERT INTO cuentas_por_pagar/), undefined);
  });

  test('una línea sin producto propio se cuenta aparte y no toca producto ni bitácora de producto', async () => {
    const { servicio, log } = montar({ lineas: [LINEA_CON_PRODUCTO, LINEA_SIN_PRODUCTO] });
    const r = await servicio.registrarCompra(FACTURA_ID, {});

    assert.equal(r.lineas, 2);
    assert.equal(r.costosActualizados, 1);
    assert.equal(r.sinProductoPropio, 1);
    // Solo UNA vez se busca el producto con FOR UPDATE — la línea sin
    // producto_id nunca dispara esa consulta.
    assert.equal(todas(log, /FROM producto WHERE id = \$1 FOR UPDATE/).length, 1);
  });

  test('con precio ajustado, escribe precio_historico con producto_id y origen "compra"', async () => {
    const { servicio, log } = montar();
    await servicio.registrarCompra(FACTURA_ID, { [LINEA_CON_PRODUCTO.id]: 175 });

    const historico = fila(log, /INSERT INTO precio_historico/);
    assert.ok(historico, 'debió escribir precio_historico');
    assert.match(historico.sql, /producto_id/);
    assert.match(historico.sql, /'compra'/);
    assert.equal(historico.params[0], LINEA_CON_PRODUCTO.producto_id);
    assert.equal(historico.params[2], 175);
  });

  test('sin precio ajustado, NO escribe precio_historico', async () => {
    const { servicio, log } = montar();
    await servicio.registrarCompra(FACTURA_ID, {});
    assert.equal(fila(log, /INSERT INTO precio_historico/), undefined);
  });
});

describe('registrarCompra — la regalía no pisa el costo', () => {
  // "10 pagados + 1 de regalía" del mismo producto: la regalía viene con 100 %
  // de descuento y su costo sale 0. Escribirlo dejaba el producto en ₡0.
  const REGALIA = {
    ...LINEA_CON_PRODUCTO, id: 'linea-3', numero_linea: 3,
    cantidad: '1.0000', precio_unitario: '900.00000', descuento: '900', impuesto: '0', total_linea: '0'
  };

  test('una línea pagada y su regalía: el costo que queda es el de la pagada', async () => {
    const { servicio, log } = montar({ lineas: [LINEA_CON_PRODUCTO, REGALIA] });
    const r = await servicio.registrarCompra(FACTURA_ID, {});

    const updates = todas(log, /UPDATE producto SET costo_con_iva/);
    assert.equal(updates.length, 1, 'la regalía no debió actualizar el producto');
    assert.ok(updates[0].params[0] > 0, 'el costo escrito es el de la línea pagada');
    assert.equal(r.costosActualizados, 1);
  });

  test('una regalía con precio ajustado cambia el precio y deja el costo como estaba', async () => {
    const { servicio, log } = montar({ lineas: [REGALIA] });
    await servicio.registrarCompra(FACTURA_ID, { [REGALIA.id]: 180 });

    const update = fila(log, /UPDATE producto SET costo_con_iva/);
    assert.equal(update.params[0], null, 'costo null = COALESCE conserva el que tenía');
    assert.equal(update.params[1], 180);
  });
});

describe('registrarCompra — guardas', () => {
  test('un id que no es UUID se rechaza con 400, sin tocar la base', async () => {
    const { servicio, log } = montar();
    await assert.rejects(() => servicio.registrarCompra('no-es-un-uuid', {}), (e) => e.status === 400);
    assert.equal(log.length, 0);
  });

  test('factura no encontrada: 404', async () => {
    const { servicio } = montar({ factura: null });
    await assert.rejects(() => servicio.registrarCompra(FACTURA_ID, {}), (e) => e.status === 404);
  });

  test('gasto recurrente: 409, con su propio mensaje', async () => {
    const { servicio } = montar({ factura: { ...FACTURA_BUZON, estado: 'GASTO_RECURRENTE' } });
    await assert.rejects(() => servicio.registrarCompra(FACTURA_ID, {}),
      (e) => e.status === 409 && /gasto recurrente/.test(e.message));
  });

  test('ya existe una compra para esta factura: 409, y no se llega a insertar nada', async () => {
    const { servicio, log } = montar({ compraExistente: 999 });
    await assert.rejects(() => servicio.registrarCompra(FACTURA_ID, {}), (e) => e.status === 409 && /999/.test(e.message));
    assert.equal(fila(log, /INSERT INTO compra \(/), undefined);
    assert.ok(log.some((l) => l.sql === 'ROLLBACK'));
  });

  test('sin proveedor propio con esa cédula: 422', async () => {
    const { servicio } = montar({ proveedor: null });
    await assert.rejects(() => servicio.registrarCompra(FACTURA_ID, {}), (e) => e.status === 422);
  });

  test('sin ninguna línea: 422, y hace ROLLBACK', async () => {
    const { servicio, log } = montar({ lineas: [] });
    await assert.rejects(() => servicio.registrarCompra(FACTURA_ID, {}), (e) => e.status === 422);
    assert.ok(log.some((l) => l.sql === 'ROLLBACK'));
    assert.equal(fila(log, /UPDATE facturas_proveedores SET estado/), undefined, 'no debió marcar la factura');
  });
});

describe('registrarCompra — todo o nada', () => {
  test('si falla a mitad de camino, hace ROLLBACK y no marca la factura', async () => {
    const { servicio, log } = montar({ producto: null }); // el producto se borró entre medio
    // El producto no existe: actualizarProductoDeLinea no lanza (por diseño,
    // ver el comentario en el servicio), así que esto SÍ debe completar bien.
    // Se prueba acá el caso contrario: forzar una excepción real.
    const clienteRoto = require(rutaDb).pool;
    const original = clienteRoto.connect;
    clienteRoto.connect = async () => ({
      query: async (sql) => {
        const texto = String(sql).trim();
        if (texto === 'BEGIN') return { rows: [] };
        if (/FROM facturas_proveedores WHERE id = \$1 FOR UPDATE/.test(texto)) return { rows: [{ ...FACTURA_BUZON }] };
        if (texto === 'ROLLBACK') { log.push({ sql: 'ROLLBACK' }); return { rows: [] }; }
        throw new Error('la base explotó a mitad de camino');
      },
      release: () => {}
    });

    await assert.rejects(() => servicio.registrarCompra(FACTURA_ID, {}), /la base explotó/);
    assert.ok(log.some((l) => l.sql === 'ROLLBACK'));
    clienteRoto.connect = original;
  });
});
