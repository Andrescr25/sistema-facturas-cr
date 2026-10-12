const { test, describe } = require('node:test');
const assert = require('node:assert');
const { generarPdfNotaCredito, papelDeNota, facturaDeReferencia } = require('../src/modules/facturacion/notaCredito.pdf');
const { generarPdfFactura, papelDeFactura, leyenda } = require('../src/modules/facturacion/factura.pdf');

/**
 * El PDF de la nota de crédito.
 *
 * QUÉ SE PIDIÓ (2026-10-11): «en nota de crédito está faltando enviar la
 * nota de crédito por correo al cliente, el pdf con sus xml». La nota no
 * tenía papel propio. Se dibuja con el código de la factura; acá se cuida lo
 * que la nota dice distinto —qué documento es, a qué factura se aplica y por
 * qué— y que la factura siga diciendo lo de siempre.
 *
 * Cómo se VE hay que mirarlo; esto cuida lo que se rompe sin que nadie lo
 * note.
 */

// Una clave de 50 dígitos: país, fecha, cédula, CONSECUTIVO (20), situación y
// código de seguridad.
const CONSECUTIVO_FACTURA = '00100001010000002481';
const CLAVE_FACTURA = `506111026${'000123456789'}${CONSECUTIVO_FACTURA}1${'12345678'}`;

const LINEA = {
  numeroLinea: 1, nombre: 'TORNILLO GOLOSO 8x1', referencia: 'TOR02', unidad: 'Unid',
  cantidad: 1, precioUnitario: 1000, descuentoPorcentaje: 0, descuentoMonto: 0,
  tarifa: 13, impuestoMonto: 130, total: 1130
};

const NOTA = {
  id: 9, numero: 'NC-000083', estado: 'emitida', fecha: '2026-10-11',
  electronica: false, haciendaEstado: null, fiscal: null,
  motivo: 'devolucion', motivoTexto: 'Llegó golpeado', motivoAnulacion: null,
  cliente: { id: 7, nombre: 'PULPERÍA LA ESQUINA', identificacion: '3101123456', tipoIdentificacion: 'CJ' },
  moneda: 'CRC', subtotal: 1000, descuento: 0, impuesto: 130, total: 1130,
  facturas: [{ id: 5565, numero: '001000015014', tipoDocumento: 'factura', electronica: false, claveHacienda: null, monto: 1130 }],
  lineas: [LINEA]
};

const FISCAL = {
  id: 77, clave: `506111026${'000123456789'}${'00100001030000000083'}1${'87654321'}`,
  consecutivo: '00100001030000000083', tipo: '03', fecha: '2026-10-11T20:15:00-06:00',
  empresa: { nombre: 'ZZ emisor', tipo_identificacion: 'CF', identificacion: '123456789' },
  referencia: { tipo: '01', clave: CLAVE_FACTURA }
};
const ACEPTADA = { ...NOTA, electronica: true, haciendaEstado: 'aceptada', fiscal: FISCAL };

describe('a qué factura se aplica', () => {
  test('una nota electrónica lo dice con la clave que FIRMÓ, no con lo que hoy diga la base', () => {
    // La factura de la base trae otro número: manda el XML firmado.
    assert.equal(facturaDeReferencia(ACEPTADA), CONSECUTIVO_FACTURA);
  });

  test('sin comprobante propio, usa la clave de una factura electrónica', () => {
    const nota = { ...NOTA, facturas: [{ ...NOTA.facturas[0], electronica: true, claveHacienda: CLAVE_FACTURA }] };
    assert.equal(facturaDeReferencia(nota), CONSECUTIVO_FACTURA);
  });

  test('sobre una factura de venta común, su número de siempre', () => {
    assert.equal(facturaDeReferencia(NOTA), '001000015014');
  });

  test('una clave que no tiene 50 dígitos no se recorta a ciegas', () => {
    const rara = { ...NOTA, facturas: [{ ...NOTA.facturas[0], electronica: true, claveHacienda: '12345' }] };
    assert.equal(facturaDeReferencia(rara), '001000015014');
  });

  test('una nota sin factura no inventa una', () => {
    assert.equal(facturaDeReferencia({ ...NOTA, facturas: [] }), null);
  });
});

describe('lo que el papel de la nota dice distinto', () => {
  test('solo una nota ACEPTADA lleva el título y el número electrónicos', () => {
    assert.equal(papelDeNota(NOTA).titulo, 'NOTA DE CRÉDITO');
    assert.equal(papelDeNota(NOTA).fiscal, null);
    assert.equal(papelDeNota(ACEPTADA).titulo, 'NOTA DE CRÉDITO ELECTRÓNICA');
    assert.equal(papelDeNota(ACEPTADA).fiscal.consecutivo, '00100001030000000083');
    // Enviada pero todavía sin respuesta: no es electrónica.
    const enCamino = { ...ACEPTADA, electronica: false, haciendaEstado: 'enviada' };
    assert.equal(papelDeNota(enCamino).titulo, 'NOTA DE CRÉDITO');
    assert.equal(papelDeNota(enCamino).fiscal, null);
  });

  test('dice a qué factura se aplica y por qué se hizo', () => {
    const papel = papelDeNota(ACEPTADA);
    assert.deepEqual(papel.datos.find(d => /factura/.test(d[0])), ['Se aplica a la factura:', CONSECUTIVO_FACTURA]);
    assert.deepEqual(papel.condiciones.find(c => c[0] === 'Motivo:'), ['Motivo:', 'Devolución']);
    assert.deepEqual(papel.observacion, { titulo: 'DETALLE DEL MOTIVO', texto: 'Llegó golpeado' });
    assert.equal(papel.numeroPropio, 'Nota:');
  });

  test('no lleva condición de venta, medio de pago ni las cuentas para pagar: no es un cobro', () => {
    const papel = papelDeNota(NOTA);
    assert.equal(papel.terminos, false);
    assert.deepEqual(papel.condiciones.map(c => c[0]), ['Motivo:', 'Moneda:']);
  });

  test('sin motivo escrito ni factura, no deja renglones vacíos', () => {
    const papel = papelDeNota({ ...NOTA, motivo: null, motivoTexto: null, facturas: [] });
    assert.equal(papel.observacion, null);
    assert.equal(papel.datos.length, 1);
    assert.equal(papel.condiciones.find(c => c[0] === 'Motivo:')[1], null);
  });
});

describe('la factura sigue diciendo lo suyo', () => {
  const FACTURA = {
    id: 1, numero: '001000014868', tipoDocumento: 'factura', electronica: false, estado: 'emitida',
    fecha: '2026-09-10', fechaVencimiento: '2026-10-10', condicionVenta: 'credito', plazo: '30 días',
    moneda: 'CRC', metodoPago: 'cash', observaciones: 'Entregar atrás.', lineas: [LINEA]
  };

  test('títulos, datos y condiciones de la factura no cambiaron', () => {
    const papel = papelDeFactura(FACTURA);
    assert.equal(papel.titulo, 'FACTURA DE VENTA');
    assert.equal(papelDeFactura({ ...FACTURA, tipoDocumento: 'tiquete' }).titulo, 'TIQUETE');
    assert.deepEqual(papel.datos.map(d => d[0]), ['Fecha de creación:', 'Fecha de vencimiento:']);
    assert.deepEqual(papel.condiciones, [['Condición:', '30 días'], ['Moneda:', 'CRC'], ['Medio de pago:', 'Efectivo']]);
    assert.deepEqual(papel.observacion, { titulo: 'NOTA', texto: 'Entregar atrás.' });
    assert.equal(papel.terminos, true);
    assert.equal(papel.numeroPropio, 'Venta:');
  });

  test('solo la aceptada es electrónica, y un tiquete no se titula factura', () => {
    const fiscal = (tipo) => ({ ...FACTURA, electronica: true, haciendaEstado: 'aceptada', fiscal: { tipo, consecutivo: 'x', clave: 'y' } });
    assert.equal(papelDeFactura(fiscal('01')).titulo, 'FACTURA ELECTRÓNICA');
    assert.equal(papelDeFactura(fiscal('04')).titulo, 'TIQUETE ELECTRÓNICO');
    assert.equal(papelDeFactura({ ...fiscal('01'), haciendaEstado: 'enviada' }).fiscal, null);
  });
});

describe('la letra chica del pie', () => {
  const emisor = { nombre: 'ZZ emisor' };

  test('un comprobante aceptado NO dice que no es un comprobante electrónico', () => {
    // Lo decía: la frase se escribió cuando todo era factura de venta.
    for (const papel of [papelDeNota(ACEPTADA), { fiscal: { tipo: '01' } }]) {
      const texto = leyenda(papel, emisor);
      assert.doesNotMatch(texto, /No constituye/);
      assert.match(texto, /aceptado por el Ministerio de Hacienda/);
    }
  });

  test('uno que no fue a Hacienda lo sigue advirtiendo', () => {
    for (const papel of [papelDeNota(NOTA), { fiscal: null }]) {
      assert.match(leyenda(papel, emisor), /No constituye un comprobante electrónico/);
      assert.match(leyenda(papel, emisor), /ZZ emisor/);
    }
  });
});

describe('el archivo', () => {
  test('sale un PDF de verdad, electrónica o no', async () => {
    for (const nota of [NOTA, ACEPTADA]) {
      const pdf = await generarPdfNotaCredito(nota);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.length > 3000, `pesó ${pdf.length} bytes`);
    }
  });

  test('no es el papel de una factura con otro nombre', async () => {
    // Mismo contenido, distinto papel: si la nota saliera con el rótulo de la
    // factura, el cliente recibiría un segundo cobro en vez de una devolución.
    const comoNota = await generarPdfNotaCredito(NOTA);
    const comoFactura = await generarPdfFactura(NOTA);
    assert.notEqual(comoNota.length, comoFactura.length);
  });

  test('una nota anulada no sale igual que una vigente', async () => {
    const vigente = await generarPdfNotaCredito(NOTA);
    const anulada = await generarPdfNotaCredito({ ...NOTA, estado: 'anulada', motivoAnulacion: 'se hizo dos veces' });
    assert.notEqual(anulada.length, vigente.length);
  });

  test('una nota sin líneas no produce un papel en blanco con un total', async () => {
    await assert.rejects(async () => generarPdfNotaCredito({ ...NOTA, lineas: undefined }));
    await assert.rejects(async () => generarPdfNotaCredito(null));
  });
});
