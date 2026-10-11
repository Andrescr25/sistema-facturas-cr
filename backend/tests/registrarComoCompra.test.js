const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Los gastos recurrentes (internet, planes móviles) dejan de crear producto
 * y contacto en Alegra: se registran como compra propia, igual que una
 * factura normal, pero sin producto —son servicios, no inventario— y sin
 * reconstruir nada por diferencia, porque `compra.total` no depende de que
 * las líneas sumen exacto.
 *
 * Lo que se cuida acá:
 *  - que no se registre dos veces la misma factura (NOT EXISTS compra);
 *  - que cada línea entre con producto_id NULL, tal cual, sin transformar;
 *  - que un gasto de un período que falla no bloquee los demás (una
 *    transacción POR FACTURA);
 *  - que sin proveedor propio se reporte con un motivo claro, sin lanzar.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'pagos-recurrentes', 'scrapers', 'facturas-recibidas.adapter.js');

const CEDULA = '3101610198';

const FACTURA_A = {
  id: 'f-ene', clave: 'c-ene', numero_consecutivo: 'ENE-1', fecha_emision: '2026-01-05T00:00:00.000Z',
  fecha_vencimiento: null, moneda: 'CRC', total_factura: '15000.00', xml_ruta: 'x/ene.xml',
  total_otros_cargos: '187.39', total_descuentos: '0', total_iva_devuelto: '0', otros_cargos: [], proveedor_cedula: CEDULA
};
const FACTURA_B = {
  id: 'f-feb', clave: 'c-feb', numero_consecutivo: 'FEB-1', fecha_emision: '2026-02-05T00:00:00.000Z',
  fecha_vencimiento: null, moneda: 'CRC', total_factura: '15200.00', xml_ruta: 'x/feb.xml',
  total_otros_cargos: '0', total_descuentos: '0', total_iva_devuelto: '0', otros_cargos: [], proveedor_cedula: CEDULA
};

const LINEA = {
  numero_linea: 1, descripcion: 'INTERNET RESIDENCIAL 50MB', codigo_proveedor: 'NET50',
  codigo_cabys: '8341200000000', cantidad: '1.0000', unidad_medida: 'Unid',
  precio_unitario: '13100.00000', descuento: '0', impuesto: '1700.00', total_linea: '14800.00'
};

function montar({ facturas = [FACTURA_A], proveedorId = 5, lineasPorFactura = { 'f-ene': [LINEA], 'f-feb': [LINEA] }, cxpPorFactura = {} } = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });

    if (texto === 'BEGIN' || texto === 'COMMIT' || texto === 'ROLLBACK') return { rows: [] };
    if (/FROM facturas_proveedores f\s+WHERE/.test(texto)) return { rows: facturas.map((f) => ({ ...f })) };
    if (/FROM proveedor WHERE identificacion/.test(texto)) return { rows: proveedorId ? [{ id: proveedorId }] : [] };
    if (/INSERT INTO compra \(/.test(texto)) {
      const facturaId = params[7]; // f.id, por orden del INSERT
      return { rows: [{ id: `compra-${facturaId}` }] };
    }
    if (/FROM productos_factura_proveedor WHERE factura_id/.test(texto)) {
      const facturaId = params[0];
      return { rows: (lineasPorFactura[facturaId] || []).map((l) => ({ ...l })) };
    }
    if (/INSERT INTO compra_linea/.test(texto)) return { rows: [], rowCount: 1 };
    if (/FROM cuentas_por_pagar WHERE factura_id = \$1 FOR UPDATE/.test(texto)) {
      const facturaId = params[0];
      return { rows: cxpPorFactura[facturaId] ? [{ ...cxpPorFactura[facturaId] }] : [] };
    }
    if (/FROM nota_credito_aplicacion/.test(texto)) return { rows: [{ total: '0' }] };
    if (/UPDATE cuentas_por_pagar/.test(texto)) return { rows: [{}] };
    return { rows: [], rowCount: 1 };
  };

  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { adaptador: require(rutaServicio), log };
}

const fila = (log, patron) => log.find((l) => patron.test(l.sql));
const todas = (log, patron) => log.filter((l) => patron.test(l.sql));

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('registrarComoCompra — camino feliz', () => {
  test('registra la compra y su línea, sin producto', async () => {
    const { adaptador, log } = montar();
    const r = await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });

    assert.equal(r.registradas, 1);
    assert.equal(r.fallidas, 0);

    const compra = fila(log, /INSERT INTO compra \(/);
    assert.ok(compra);
    const linea = fila(log, /INSERT INTO compra_linea/);
    assert.ok(linea);
    // producto_id es NULL literal en el SQL, no un parámetro — se verifica en el texto.
    assert.match(linea.sql, /VALUES \(\$1,\$2,NULL,/);
  });

  test('la búsqueda de facturas pendientes excluye las que ya tienen compra', async () => {
    const { log } = montar();
    await require(rutaServicio).registrarComoCompra({ cedulaEmisor: CEDULA });
    const consulta = fila(log, /FROM facturas_proveedores f\s+WHERE/);
    assert.match(consulta.sql, /NOT EXISTS \(SELECT 1 FROM compra c WHERE c\.factura_proveedor_id = f\.id\)/);
  });

  test('sin facturas pendientes, no toca la base más allá de esa consulta', async () => {
    const { adaptador, log } = montar({ facturas: [] });
    const r = await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });
    assert.equal(r.registradas, 0);
    assert.equal(r.fallidas, 0);
    assert.equal(todas(log, /INSERT INTO compra/).length, 0);
  });

  test('cada factura pendiente se procesa en su PROPIA transacción', async () => {
    const { adaptador, log } = montar({ facturas: [FACTURA_A, FACTURA_B] });
    const r = await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });

    assert.equal(r.registradas, 2);
    // Dos BEGIN y dos COMMIT: una transacción por factura, no una para todas.
    assert.equal(todas(log, /^BEGIN$/).length, 2);
    assert.equal(todas(log, /^COMMIT$/).length, 2);
  });

  test('con cuenta por pagar, se libera', async () => {
    const cxp = { id: 'cxp-1', monto_total: '15000.00', fecha_vencimiento: '2099-01-01' };
    const { adaptador, log } = montar({ cxpPorFactura: { 'f-ene': cxp } });
    await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });
    assert.ok(fila(log, /UPDATE cuentas_por_pagar/));
  });

  test('sin cuenta por pagar (gasto de contado), no falla', async () => {
    const { adaptador } = montar({ cxpPorFactura: {} });
    const r = await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });
    assert.equal(r.registradas, 1);
  });
});

describe('registrarComoCompra — guardas', () => {
  test('sin proveedor propio: se reportan todas como fallidas, con motivo, sin lanzar', async () => {
    const { adaptador, log } = montar({ facturas: [FACTURA_A, FACTURA_B], proveedorId: null });
    const r = await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });

    assert.equal(r.registradas, 0);
    assert.equal(r.fallidas, 2);
    assert.match(r.detalleFallos[0].error, /No hay proveedor propio/);
    // No debió siquiera intentar crear ninguna compra.
    assert.equal(todas(log, /INSERT INTO compra \(/).length, 0);
  });

  test('una factura sin ninguna línea falla ESA sola, y no tumba las demás', async () => {
    const { adaptador } = montar({
      facturas: [FACTURA_A, FACTURA_B],
      lineasPorFactura: { 'f-ene': [], 'f-feb': [LINEA] } // enero sin líneas
    });
    const r = await adaptador.registrarComoCompra({ cedulaEmisor: CEDULA });

    assert.equal(r.registradas, 1);
    assert.equal(r.fallidas, 1);
    assert.equal(r.detalleFallos[0].consecutivo, 'ENE-1');
    assert.match(r.detalleFallos[0].error, /ninguna línea/);
  });
});
