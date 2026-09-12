const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  generarPdfFactura, impuestoPorTarifa, importeLinea, tarifaTexto, columnas
} = require('../src/modules/facturacion/factura.pdf');
const { fechaLarga } = require('../src/utils/marcaPdf');

/**
 * El PDF de la factura.
 *
 * Cómo se VE hay que mirarlo. Acá se cuida lo que se rompe sin que nadie lo
 * note: que las columnas cierren exacto el ancho de la hoja (si se pasan, el
 * importe queda fuera del papel), que el impuesto se agrupe por tarifa —acá se
 * vende al 1 %, 2 %, 4 % y 13 %— y que una factura sin líneas dé un error en
 * vez de un papel en blanco con un total.
 */

const LINEA = {
  numeroLinea: 1, nombre: 'TORNILLO GOLOSO 8x1', referencia: 'TOR02', unidad: 'Unid',
  cantidad: 3, precioUnitario: 1000, descuentoPorcentaje: 0, descuentoMonto: 0,
  tarifa: 13, impuestoMonto: 390, total: 3390
};

const FACTURA = {
  id: 1, numero: '001000014868', serie: '00100001', consecutivo: 4868,
  tipoDocumento: 'factura', electronica: false, estado: 'emitida',
  fecha: '2026-09-10', fechaVencimiento: '2026-09-10',
  cliente: { id: 7, nombre: 'PULPERÍA LA ESQUINA', identificacion: '3101123456' },
  condicionVenta: 'contado', plazo: 'De contado',
  subtotal: 3000, descuento: 0, impuesto: 390, total: 3390,
  cobrado: 0, acreditado: 0, saldo: 3390,
  motivoAnulacion: null, observaciones: null,
  lineas: [LINEA]
};

const ANCHO = 612 - 44 * 2;   // carta, con el margen de la casa

describe('las columnas de la tabla', () => {
  for (const conDescuento of [false, true]) {
    test(`cierran exacto el ancho de la hoja ${conDescuento ? 'con' : 'sin'} columna de descuento`, () => {
      const c = columnas(ANCHO, conDescuento);
      const orden = conDescuento
        ? [c.num, c.desc, c.cant, c.precio, c.descuento, c.iva, c.total]
        : [c.num, c.desc, c.cant, c.precio, c.iva, c.total];

      // Pegadas una a la otra, sin huecos ni encimes.
      for (let i = 1; i < orden.length; i++) {
        assert.equal(orden[i].x, orden[i - 1].x + orden[i - 1].w,
          `la columna ${i + 1} no arranca donde termina la anterior`);
      }
      // Y la última termina justo en el margen derecho.
      const ultima = orden[orden.length - 1];
      assert.equal(ultima.x + ultima.w, 44 + ANCHO);
      // A la descripción le queda espacio de verdad para el nombre.
      assert.ok(c.desc.w > 180, `la descripción quedó en ${c.desc.w} puntos`);
    });
  }

  test('la columna de descuento ocupa cero cuando no se usa', () => {
    assert.equal(columnas(ANCHO, false).descuento.w, 0);
  });
});

describe('el impuesto desglosado', () => {
  test('agrupa por tarifa y ordena de menor a mayor', () => {
    const desglose = impuestoPorTarifa([
      { tarifa: 13, impuestoMonto: 390 },
      { tarifa: 1, impuestoMonto: 10 },
      { tarifa: 13, impuestoMonto: 130 },
      { tarifa: 4, impuestoMonto: 40 }
    ]);
    assert.deepEqual(desglose, [[1, 10], [4, 40], [13, 520]]);
  });

  test('no muestra una tarifa que no aporta impuesto', () => {
    // Un producto exento existe y va en la factura, pero un renglón
    // "IVA 0 % ₡0" en los totales no le dice nada a nadie.
    const desglose = impuestoPorTarifa([
      { tarifa: 0, impuestoMonto: 0 },
      { tarifa: 13, impuestoMonto: 390 }
    ]);
    assert.deepEqual(desglose, [[13, 390]]);
  });

  test('los NUMERIC que llegan como texto se suman como números', () => {
    assert.deepEqual(impuestoPorTarifa([
      { tarifa: '13.000', impuestoMonto: '390.00' },
      { tarifa: '13.000', impuestoMonto: '130.00' }
    ]), [[13, 520]]);
  });
});

describe('el importe de la línea', () => {
  test('va sin impuesto: cantidad × precio menos el descuento', () => {
    // `linea.total` trae el impuesto adentro. Imprimirlo dejaba un papel donde
    // 3 × ₡464,60 daba ₡1.575 y el cliente multiplicaba sin que le cuadrara.
    assert.equal(importeLinea(LINEA), 3000);
    assert.equal(importeLinea({ ...LINEA, descuentoMonto: 300 }), 2700);
  });

  test('la suma de los importes da el Subtotal', () => {
    // La regla que sostiene toda la tabla: si no se cumple, los números del
    // papel no se explican entre ellos.
    const lineas = [
      { cantidad: 20, precioUnitario: 2412, descuentoMonto: 0 },
      { cantidad: 15, precioUnitario: 1747.3, descuentoMonto: 0 }
    ];
    const suma = lineas.reduce((s, l) => s + importeLinea(l), 0);
    assert.equal(Math.round(suma), 74450);   // el subtotal real de la 2164
  });

  test('los NUMERIC como texto se multiplican como números', () => {
    assert.equal(importeLinea({ cantidad: '3.0000', precioUnitario: '1000.00000', descuentoMonto: '0.00' }), 3000);
  });
});

describe('la fecha del papel', () => {
  test('una fecha de Postgres se escribe, no sale "Invalid Date"', () => {
    // Las columnas DATE llegan como Date. Recortar String(unDate) a diez
    // caracteres da "Wed Sep 10", y eso imprimía "Invalid Date" donde va la
    // fecha de la factura.
    const escrita = fechaLarga(new Date(2026, 8, 10));
    assert.equal(/Invalid/.test(escrita), false, `salió "${escrita}"`);
    assert.match(escrita, /10.*se[pt]?tiembre.*2026/);
  });

  test('y el texto de siempre sigue funcionando', () => {
    assert.match(fechaLarga('2026-09-10'), /10.*se[pt]?tiembre.*2026/);
  });

  test('no cambia de día por la zona horaria', () => {
    // Costa Rica es UTC−6: pasar por toISOString corría al día anterior.
    assert.match(fechaLarga(new Date(2026, 0, 1)), /1.*enero.*2026/);
  });

  test('una fecha vacía no imprime basura', () => {
    assert.equal(fechaLarga(null), '');
    assert.equal(fechaLarga(undefined), '');
  });
});

describe('la tarifa escrita', () => {
  test('sin decimales cuando no los necesita', () => {
    assert.equal(tarifaTexto(13), '13 %');
    assert.equal(tarifaTexto('1.000'), '1 %');
    assert.equal(tarifaTexto(0), '0 %');
    assert.equal(tarifaTexto(2.5), '2.5 %');
  });
});

describe('el archivo', () => {
  test('sale un PDF de verdad', async () => {
    const pdf = await generarPdfFactura(FACTURA);
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 3000, `pesó ${pdf.length} bytes`);
  });

  test('una factura anulada no sale igual que una emitida', async () => {
    // Lleva el sello y el motivo. Si saliera idéntica, un papel anulado
    // pasaría por válido.
    const emitida = await generarPdfFactura(FACTURA);
    const anulada = await generarPdfFactura({
      ...FACTURA, estado: 'anulada', motivoAnulacion: 'error de digitación'
    });
    assert.notEqual(anulada.length, emitida.length);
  });

  test('una factura sin líneas no produce un papel en blanco con un total', async () => {
    await assert.rejects(async () => generarPdfFactura({ ...FACTURA, lineas: undefined }));
    await assert.rejects(async () => generarPdfFactura(null));
  });

  test('una factura larga se arma igual, con sus páginas', async () => {
    const muchas = Array.from({ length: 70 }, (_, i) => ({ ...LINEA, numeroLinea: i + 1 }));
    const pdf = await generarPdfFactura({ ...FACTURA, lineas: muchas });
    const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.ok(paginas >= 3, `se esperaban varias páginas y salieron ${paginas}`);
  });

  test('se arma con cobros, con descuento y sin cédula', async () => {
    // Los tres casos que rompen un PDF armado a la ligera: el cliente de
    // contado sin ficha, el descuento por línea y la factura ya abonada.
    const pdf = await generarPdfFactura({
      ...FACTURA,
      cliente: { id: null, nombre: null, identificacion: null },
      condicionVenta: 'credito', plazo: '30 días', fechaVencimiento: '2026-10-10',
      descuento: 300, cobrado: 1000, acreditado: 500, saldo: 1890,
      observaciones: 'Entregar en la bodega de atrás.',
      lineas: [{ ...LINEA, descuentoPorcentaje: 10, descuentoMonto: 300 },
               { ...LINEA, numeroLinea: 2, tarifa: 1, impuestoMonto: 10 }]
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });
});
