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
const { papelDeFactura, generarPdfFactura, datosDelCliente } = require('../src/modules/facturacion/factura.pdf');
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
  test('no se lee el detalle por línea: el papel deja cada línea como la de venta', () => {
    // «Unid · Subtotal · Total con IVA» se quitó por ruido (2026-10-24).
    assert.equal(fiscal().lineas, undefined);
  });
  test('el medio de pago firmado, con su código y monto', () => {
    assert.deepEqual(fiscal().mediosPago, [{ tipo: '04', monto: 253.9 }]);
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
    assert.equal(p.medioFiscal({ mediosPago: [] }, 'Efectivo'), 'Efectivo');
  });
  test('ya no hay texto fiscal por línea', () => {
    assert.deepEqual(Object.keys(p).sort(), ['condicionFiscal', 'datosFiscalesEncabezado', 'fechaFiscalLegible', 'medioFiscal']);
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

// 2026-10-24. El primer tiquete real salió con la cédula de relleno del cliente
// («100000000») y Hacienda lo rechazó: el XML de un tiquete no lleva receptor.
// El papel sí dice a quién se le está facturando (el usuario: «ocupo que muestre
// el cliente del cual estoy facturando»), pero sin esa cédula.
describe('un tiquete va sin receptor en el XML; el papel nombra al cliente sin su cédula', () => {
  const xml = (tipo, referencias = []) => {
    const d = venta(tipo);
    d.documento.cliente_nombre = 'ZZ SODA OLGA';
    d.documento.cliente_identificacion = '100000000';
    d.opciones = { referencias };
    return generarVenta(d);
  };
  const ref = (tipo) => [{ tipo, clave: '5'.repeat(50), fecha: '2026-10-05T10:00:00-06:00', codigo: '06', razon: 'ZZ' }];

  test('lo que se lee dice si el comprobante va dirigido a alguien', () => {
    assert.equal(contenidoDelXml(xml('01')).conReceptor, true);
    assert.equal(contenidoDelXml(xml('04')).conReceptor, false);
    assert.equal(contenidoDelXml(xml('03', ref('01'))).conReceptor, true);
    assert.equal(contenidoDelXml(xml('03', ref('04'))).conReceptor, false, 'una nota sobre un tiquete tampoco');
  });

  test('el papel de un tiquete dice a quién se le factura, pero no imprime su cédula', () => {
    const factura = { cliente: { nombre: 'ZZ SODA OLGA', tipoIdentificacion: 'CF', identificacion: '100000000', telefono: '8888-0000', direccion: 'Palmares', correo: 'zz@ejemplo.com' } };
    const tiquete = { fiscal: { ...contenidoDelXml(xml('04')), tipo: '04' } };
    assert.deepEqual(datosDelCliente(factura, tiquete), {
      nombre: 'ZZ SODA OLGA', datos: ['Teléfono: 8888-0000', 'Dirección: Palmares', 'Email: zz@ejemplo.com']
    });
    assert.ok(!datosDelCliente(factura, tiquete).datos.some((d) => /Cédula|100000000/.test(d)), 'la cédula de relleno no sale en el papel');
    // Sin nombre guardado, el de siempre.
    assert.equal(datosDelCliente({ cliente: { identificacion: '100000000' } }, tiquete).nombre, 'Cliente de contado');
    // La factura electrónica y la de venta siguen diciendo a quién, con su cédula.
    const electronica = datosDelCliente(factura, { fiscal: { ...contenidoDelXml(xml('01')), tipo: '01' } });
    assert.equal(electronica.nombre, 'ZZ SODA OLGA');
    assert.ok(electronica.datos.includes('Cédula física: 100000000'));
    const deVenta = datosDelCliente(factura, { fiscal: null });
    assert.equal(deVenta.nombre, 'ZZ SODA OLGA');
    assert.equal(deVenta.datos.length, 4);
    assert.deepEqual(datosDelCliente({}, { fiscal: null }), { nombre: 'Cliente de contado', datos: [] });
  });

  test('el PDF de un tiquete se arma', async () => {
    const f = {
      numero: '001000015099', fecha: '2026-10-24', estado: 'emitida', electronica: true, haciendaEstado: 'aceptada',
      condicionVenta: 'contado', moneda: 'CRC', subtotal: 100, descuento: 0, impuesto: 13, total: 113,
      cliente: { nombre: 'ZZ SODA OLGA', identificacion: '100000000' },
      lineas: [{ numeroLinea: 1, nombre: 'ZZ producto', cabys: '1234567890123', cantidad: 1, precioUnitario: 100, tarifa: 13, impuestoMonto: 13, total: 113 }],
      fiscal: { clave: '5'.repeat(50), consecutivo: '00100001040000001971', tipo: '04', ...contenidoDelXml(xml('04')) }
    };
    assert.equal(papelDeFactura(f).titulo, 'TIQUETE ELECTRÓNICO');
    assert.equal((await generarPdfFactura(f)).subarray(0, 4).toString(), '%PDF');
  });
});
