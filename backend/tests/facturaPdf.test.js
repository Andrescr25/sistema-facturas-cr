const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  generarPdfFactura, impuestoPorTarifa, importeLinea, tarifaTexto, columnas, detalleLinea, subtotalMostrado,
  subtotalAntesDeDescuento, renglonesDeTotales
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

describe('los totales cierran con la calculadora', () => {
  // El papel decía "Subtotal 1.469 / Descuento −36 / IVA 191 / TOTAL 1.660",
  // y 1.469 − 36 + 191 no es 1.660: el subtotal ya traía el descuento restado.
  // Desde el 2026-10-19 el usuario pide «subtotal / descuento / impuesto /
  // total»: el Subtotal impreso es el de ANTES del descuento, y así cierra.
  const CON_DESCUENTO = {
    ...FACTURA, subtotal: 1469, descuento: 36, impuesto: 190.97, total: 1659.97,
    lineas: [
      { ...LINEA, cantidad: 8, precioUnitario: 130, descuentoMonto: 0, impuestoMonto: 135.2 },
      { ...LINEA, numeroLinea: 2, cantidad: 6, precioUnitario: 60, descuentoPorcentaje: 10, descuentoMonto: 36, impuestoMonto: 42.12 },
      { ...LINEA, numeroLinea: 3, cantidad: 1, precioUnitario: 105, descuentoMonto: 0, impuestoMonto: 13.65 }
    ]
  };

  test('la base (lo que suman los importes) es la suma de la columna de importes', () => {
    const suma = CON_DESCUENTO.lineas.reduce((s, l) => s + importeLinea(l), 0);
    assert.equal(Math.round(subtotalMostrado(CON_DESCUENTO)), Math.round(suma));
  });

  test('subtotal − descuento + impuesto da el total', () => {
    const bruto = subtotalAntesDeDescuento(CON_DESCUENTO);
    assert.equal(bruto, 1505, 'el subtotal impreso es el de antes del descuento');
    assert.ok(Math.abs(bruto - CON_DESCUENTO.descuento + CON_DESCUENTO.impuesto - CON_DESCUENTO.total) < 0.01);
  });

  test('una copiada de Alegra, que guarda el subtotal ANTES del descuento, también cierra', () => {
    const deAlegra = { ...CON_DESCUENTO, subtotal: 1505 };
    assert.equal(subtotalAntesDeDescuento(deAlegra), 1505);
    assert.ok(Math.abs(subtotalAntesDeDescuento(deAlegra) - deAlegra.descuento + deAlegra.impuesto - deAlegra.total) < 0.01);
  });

  test('los renglones salen en el orden pedido: Subtotal, Descuento, Impuesto por tarifa', () => {
    const r = renglonesDeTotales(CON_DESCUENTO);
    assert.deepEqual(r.map(([e]) => e), ['Subtotal', 'Descuento', 'Impuesto 13 %']);
    assert.match(r[1][1], /^−₡/, 'el descuento se lee como resta');
    // El caso real del 2026-10-19 (SUPER BUEN PRECIO, 5 % en 28 de 49 líneas).
    const real = { ...FACTURA, subtotal: 227512.47, descuento: 7516.76, impuesto: 29576.64, total: 257089.11,
      lineas: [{ ...LINEA, tarifa: 13, impuestoMonto: 29576.64 }] };
    assert.equal(subtotalAntesDeDescuento(real), 235029.23);
    assert.ok(Math.abs(235029.23 - 7516.76 + 29576.64 - 257089.11) < 0.01);
  });

  test('sin descuento el renglón Descuento sale en ₡0, y una tarifa por renglón, de la mayor a la menor', () => {
    // «impuesto 13 % xx / impuesto 2 % xx» (el usuario, 2026-10-19).
    const r = renglonesDeTotales({ ...FACTURA, lineas: [{ ...LINEA, numeroLinea: 2, tarifa: 2, impuestoMonto: 30 }, LINEA, { ...LINEA, numeroLinea: 3, tarifa: 1, impuestoMonto: 5 }] });
    assert.deepEqual(r.map(([e]) => e), ['Subtotal', 'Descuento', 'Impuesto 13 %', 'Impuesto 2 %', 'Impuesto 1 %']);
    assert.deepEqual(r.slice(2).map(([, v]) => v), ['₡390', '₡30', '₡5']);
    assert.equal(r[0][1], r.find(([e]) => e === 'Subtotal')[1]);
    assert.doesNotMatch(r[1][1], /−/);
    assert.deepEqual(renglonesDeTotales({ ...FACTURA, impuesto: 0, lineas: [{ ...LINEA, tarifa: 0, impuestoMonto: 0 }] }).map(([e]) => e),
      ['Subtotal', 'Descuento', 'Impuesto'], 'exento: un renglón Impuesto en ₡0');
  });

  test('sin descuento se imprime el subtotal guardado, tal cual', () => {
    assert.equal(subtotalMostrado(FACTURA), 3000);
    assert.equal(subtotalMostrado({ ...FACTURA, subtotal: '3000.00', descuento: '0.00' }), 3000);
  });
});

describe('el detalle escrito en la línea sale en el papel', () => {
  // La pantalla lo llama "Detalle en la factura" y la factura salía sin él.
  test('lo que alguien escribió se imprime', () => {
    assert.equal(detalleLinea({ ...LINEA, descripcion: '  ENTREGADO ' }), 'ENTREGADO');
    assert.equal(detalleLinea({ ...LINEA, descripcion: 'OJO CERRADO ,,VIGILADO X CAMARAS' }), 'OJO CERRADO ,,VIGILADO X CAMARAS');
  });

  test('si es el nombre del producto repetido, no se imprime dos veces', () => {
    // Sin detalle escrito, el servidor guarda ahí la descripción del producto.
    assert.equal(detalleLinea({ ...LINEA, descripcion: 'tornillo  goloso 8X1' }), null);
    assert.equal(detalleLinea({ ...LINEA, descripcion: null }), null);
    assert.equal(detalleLinea({ ...LINEA, descripcion: '   ' }), null);
  });

  test('el PDF se arma con detalles largos y con descuento', async () => {
    const pdf = await generarPdfFactura({
      ...FACTURA, subtotal: 2700, descuento: 300, impuesto: 351, total: 3051,
      lineas: [{ ...LINEA, descuentoPorcentaje: 10, descuentoMonto: 300, impuestoMonto: 351, descripcion: 'ENTREGADO '.repeat(30) }]
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
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
      // El papel dice CON QUÉ se pagó y su referencia: es lo que le permite
      // al cliente comprobar que su SINPE se aplicó a esta factura.
      cobros: [{ id: 1, metodo: 'SINPE Móvil', referencia: '8827-2453', anulado: false, monto: 1000 }],
      lineas: [{ ...LINEA, descuentoPorcentaje: 10, descuentoMonto: 300 },
               { ...LINEA, numeroLinea: 2, tarifa: 1, impuestoMonto: 10 }]
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });
});
