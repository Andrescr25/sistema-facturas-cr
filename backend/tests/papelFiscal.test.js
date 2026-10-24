/**
 * El papel de una factura electrónica muestra lo que dice su XML firmado
 * (2026-10-24). Hacienda: la representación gráfica «deberá mostrar el
 * contenido de los comprobantes electrónicos, de forma legible»
 * (MH-DGT-RES-0027-2024, art. 5). La factura de venta no cambia.
 *
 * El XML se arma con el mismo `generarVenta` que se le manda a Hacienda: si
 * el emisor cambia un nombre de nodo, esta prueba lo nota.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generarVenta } = require('../src/integrations/hacienda/xml/v4.4');
const { contenidoDelXml, conNombres } = require('../src/integrations/hacienda/lectura.service');
const p = require('../src/modules/facturacion/papelFiscal.pdf');
const { papelDeFactura, generarPdfFactura } = require('../src/modules/facturacion/factura.pdf');
const { venta } = require('./helpers/hacienda');

/** Dos líneas, dos tarifas, un descuento y crédito a 30 días. */
function ventaRica() {
  const d = venta('01');
  d.documento = {
    ...d.documento, condicion_venta: 'credito', plazo_dias: '30', codigo_medio_pago_hacienda: '04',
    total: '253.90', descuento: '20', impuesto: '23.90'
  };
  d.lineas = [
    { ...d.lineas[0], cantidad: '2', precio_unitario: '100', descuento_monto: '20', impuesto_monto: '23.40', total: '203.40' },
    { ...d.lineas[0], numero_linea: 2, nombre: 'ZZ otro', cantidad: '1', precio_unitario: '50', descuento_monto: '0',
      impuesto_monto: '0.50', total: '50.50', codigo_tarifa_hacienda: '02', tarifa: '1' }
  ];
  d.opciones = { lineas: [{ numeroLinea: 1, codigoDescuento: '07', naturalezaDescuento: 'Descuento comercial' }] };
  d.fecha = '2026-10-23T14:05:11-06:00';
  return d;
}
const fiscal = () => ({ clave: '5'.repeat(50), consecutivo: '00100001010000000001', tipo: '01', ...contenidoDelXml(generarVenta(ventaRica())) });

describe('lo que se lee del XML firmado', () => {
  test('cabecera: fecha, proveedor de sistemas, condición y plazo', () => {
    const f = fiscal();
    assert.equal(f.fecha, '2026-10-23T14:05:11-06:00');
    assert.equal(f.proveedorSistemas, '123456789');
    assert.equal(f.condicionVenta, '02');
    assert.equal(f.plazoCredito, '30');
    assert.equal(f.empresa.provincia, '1', 'la ubicación firmada viene en códigos');
  });
  test('cada línea con su unidad, subtotal, total con IVA y motivo del descuento', () => {
    const [a, b] = fiscal().lineas;
    assert.deepEqual(a, { numeroLinea: 1, unidad: 'Unid', codigoDescuento: '07', naturalezaDescuento: 'Descuento comercial',
      subTotal: 180, codigoTarifa: '08', tarifa: 13, montoTotalLinea: 203.4 });
    assert.equal(b.codigoDescuento, null);
    assert.equal(b.montoTotalLinea, 50.5);
  });
  test('el resumen cuadra: venta − descuentos = neta; neta + impuesto = comprobante', () => {
    const r = fiscal().resumen;
    assert.equal(r.venta, 250); assert.equal(r.descuentos, 20); assert.equal(r.ventaNeta, 230);
    assert.equal(r.impuesto, 23.9); assert.equal(r.comprobante, 253.9);
    assert.equal(Math.round((r.venta - r.descuentos) * 100), Math.round(r.ventaNeta * 100));
    assert.equal(Math.round((r.ventaNeta + r.impuesto) * 100), Math.round(r.comprobante * 100));
    assert.deepEqual(r.desglose.map(d => d.codigoTarifa).sort(), ['02', '08']);
    assert.deepEqual(r.mediosPago, [{ tipo: '04', monto: 253.9 }]);
  });
});

describe('cómo lo escribe el papel', () => {
  test('la fecha fiscal se lee, con la hora que se firmó', () => {
    assert.equal(p.fechaFiscalLegible('2026-10-23T14:05:11-06:00'), '23 de octubre de 2026, 2:05 p. m.');
    assert.equal(p.fechaFiscalLegible('2026-10-05T10:00:00-06:00'), '5 de octubre de 2026, 10:00 a. m.');
    assert.equal(p.fechaFiscalLegible('2026-10-05T00:30:00-06:00'), '5 de octubre de 2026, 12:30 a. m.');
    assert.equal(p.fechaFiscalLegible(''), '');
  });
  test('encabezado: fecha legible, estado y proveedor de sistemas', () => {
    assert.deepEqual(p.datosFiscalesEncabezado(fiscal()).map(([e]) => e),
      ['Fecha de emisión:', 'Estado:', 'Proveedor de sistemas:']);
  });
  test('condición con días y medio de pago con su código', () => {
    const f = fiscal();
    assert.equal(p.condicionFiscal(f, '30 días'), 'Crédito a 30 días');
    assert.equal(p.condicionFiscal({ condicionVenta: '01' }, 'x'), 'Contado');
    assert.equal(p.medioFiscal(f, 'Transferencia'), 'Transferencia (04)');
    assert.equal(p.medioFiscal({ resumen: { mediosPago: [] } }, 'Efectivo'), 'Efectivo');
  });
  test('la línea dice unidad, subtotal, total con IVA y de qué es el descuento', () => {
    const t = p.textoLineaFiscal(p.lineaFiscalDe(fiscal(), 1));
    assert.match(t, /^Unid {2}· {2}Subtotal ₡180,00 {2}· {2}Total con IVA ₡203,40 {2}· {2}Descuento: Descuento comercial \(07\)$/);
    assert.equal(p.textoLineaFiscal(null), null);
  });
  test('el resumen trae lo que siempre va y omite lo que da cero', () => {
    const r = Object.fromEntries(p.renglonesResumenFiscal(fiscal()));
    for (const k of ['Total gravado', 'Total exento', 'Total venta', 'Total descuentos', 'Total venta neta', 'Total impuesto', 'Total comprobante']) {
      assert.ok(k in r, `falta ${k}`);
    }
    assert.match(r['Total venta neta'], /₡230,00/);
    assert.match(r['IVA 13 % (código 08)'], /₡23,40/);
    assert.match(r['IVA 1 % (código 02)'], /₡0,50/);
    assert.ok('Mercancías gravadas' in r);
    assert.equal('Servicios gravados' in r, false, 'cero no se imprime');
    assert.deepEqual(p.renglonesResumenFiscal(null), []);
  });
});

describe('la ubicación firmada se escribe con nombres solo si son los mismos códigos', () => {
  const db = (datos) => ({
    query: async (sql) => ({ rows: /hacienda_configuracion/.test(sql) ? [{ datos }]
      : [{ provincia: 'San José', canton: 'Central', distrito: 'Carmen', actividad_economica: '123456',
        actividad_economica_nombre: 'ZZ actividad', telefono: '2222-2222', terminos_pago: 'SINPE ZZ' }] })
  });
  test('coinciden: nombres, actividad con nombre, teléfono y cuentas de Configuración', async () => {
    const e = await conNombres(db({ provincia_codigo: '1', canton_codigo: '01', distrito_codigo: '01' }), fiscal().empresa);
    assert.deepEqual([e.provincia, e.canton, e.distrito, e.actividad_economica_nombre, e.telefono, e.terminos_pago],
      ['San José', 'Central', 'Carmen', 'ZZ actividad', '2222-2222', 'SINPE ZZ']);
    assert.equal(e.nombre, 'ZZ emisor', 'lo demás sigue siendo lo firmado');
  });
  test('no coinciden: quedan los códigos firmados', async () => {
    const e = await conNombres(db({ provincia_codigo: '2', canton_codigo: '07', distrito_codigo: '02' }), fiscal().empresa);
    assert.deepEqual([e.provincia, e.canton, e.distrito], ['1', '01', '01']);
  });
});

describe('el papel', () => {
  const factura = (extra = {}) => ({
    numero: '001000015100', fecha: '2026-10-23', estado: 'emitida', condicionVenta: 'credito', plazo: '30 días',
    metodoPago: 'transfer', moneda: 'CRC', subtotal: 230, descuento: 20, impuesto: 23.9, total: 253.9,
    cliente: { nombre: 'ZZ receptor', identificacion: '123456789' },
    lineas: [
      { numeroLinea: 1, nombre: 'ZZ producto', cabys: '1234567890123', cantidad: 2, precioUnitario: 100,
        descuentoMonto: 20, descuentoPorcentaje: 10, tarifa: 13, impuestoMonto: 23.4, total: 203.4 },
      { numeroLinea: 2, nombre: 'ZZ otro', cabys: '1234567890123', cantidad: 1, precioUnitario: 50, tarifa: 1, impuestoMonto: 0.5, total: 50.5 }
    ],
    ...extra
  });
  test('la factura de venta no cambia: mismas condiciones y sin nada fiscal', () => {
    const papel = papelDeFactura(factura());
    assert.equal(papel.fiscal, null);
    assert.equal(papel.titulo, 'FACTURA DE VENTA');
    assert.deepEqual(papel.condiciones, [['Condición:', '30 días'], ['Moneda:', 'CRC'], ['Medio de pago:', 'Transferencia']]);
  });
  test('la electrónica aceptada usa lo firmado', () => {
    const papel = papelDeFactura(factura({ electronica: true, haciendaEstado: 'aceptada', fiscal: fiscal() }));
    assert.equal(papel.titulo, 'FACTURA ELECTRÓNICA');
    assert.deepEqual(papel.condiciones, [['Condición:', 'Crédito a 30 días'], ['Moneda:', 'CRC'], ['Medio de pago:', 'Transferencia (04)']]);
  });
  test('los dos se arman como PDF, y el electrónico trae más', async () => {
    const deVenta = await generarPdfFactura(factura());
    const electronica = await generarPdfFactura(factura({ electronica: true, haciendaEstado: 'aceptada', fiscal: fiscal() }));
    for (const b of [deVenta, electronica]) assert.equal(b.subarray(0, 4).toString(), '%PDF');
    assert.ok(electronica.length > deVenta.length);
  });
});
