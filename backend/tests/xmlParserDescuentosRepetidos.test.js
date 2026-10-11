const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const XmlParser = require('../services/xmlParser');

/**
 * Descuentos e impuestos repetidos en una línea de factura de proveedor.
 *
 * La 4.3/4.4 de Hacienda permite hasta 5 `<Descuento>` y varios `<Impuesto>`
 * por línea. Con `explicitArray: false` de xml2js, dos o más hermanos con el
 * mismo nombre llegan como ARRAY; uno solo llega como objeto suelto. El
 * código asumía siempre lo segundo, y `parseFloat(array.Monto)` da `NaN`.
 *
 * Medido sobre la copia local: 6.013 de 8.600 líneas de compra tienen
 * descuento > 0 — el caso no es raro, y es candidato directo al descuadre
 * entre el total de una factura y la suma de sus líneas.
 */

const parser = new XmlParser();

const LINEA_BASE = {
  NumeroLinea: '1',
  Detalle: 'PRODUCTO DE PRUEBA',
  Cantidad: '10',
  UnidadMedida: 'Unid',
  PrecioUnitario: '1000',
  MontoTotal: '10000',
  SubTotal: '10000',
  MontoTotalLinea: '9000'
};

describe('un solo Descuento / Impuesto — el caso de siempre', () => {
  test('se lee igual que antes, sin arreglo de por medio', () => {
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Descuento: { MontoDescuento: '500', NaturalezaDescuento: 'Pronto pago' },
      Impuesto: { Codigo: '01', CodigoTarifa: '08', Tarifa: '13', Monto: '1235' }
    });

    assert.equal(linea.descuento.monto, 500);
    assert.equal(linea.descuento.naturaleza, 'Pronto pago');
    assert.equal(linea.impuesto.monto, 1235);
    assert.equal(linea.impuesto.tarifa, 13);
  });
});

describe('varios Descuento en la misma línea', () => {
  test('el monto es la SUMA, no NaN', () => {
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Descuento: [
        { MontoDescuento: '300', NaturalezaDescuento: 'Pronto pago' },
        { MontoDescuento: '200', NaturalezaDescuento: 'Volumen' }
      ]
    });

    assert.equal(linea.descuento.monto, 500);
    assert.ok(!Number.isNaN(linea.descuento.monto), 'no puede quedar en NaN');
  });

  test('las naturalezas distintas se unen, ninguna se pierde', () => {
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Descuento: [
        { MontoDescuento: '300', NaturalezaDescuento: 'Pronto pago' },
        { MontoDescuento: '200', NaturalezaDescuento: 'Volumen' }
      ]
    });

    assert.equal(linea.descuento.naturaleza, 'Pronto pago; Volumen');
  });

  test('una naturaleza repetida no se duplica en el texto', () => {
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Descuento: [
        { MontoDescuento: '100', NaturalezaDescuento: 'Pronto pago' },
        { MontoDescuento: '150', NaturalezaDescuento: 'Pronto pago' }
      ]
    });

    assert.equal(linea.descuento.naturaleza, 'Pronto pago');
    assert.equal(linea.descuento.monto, 250);
  });

  test('un descuento sin NaturalezaDescuento no rompe el join', () => {
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Descuento: [
        { MontoDescuento: '100' },
        { MontoDescuento: '50', NaturalezaDescuento: 'Volumen' }
      ]
    });

    assert.equal(linea.descuento.monto, 150);
    assert.equal(linea.descuento.naturaleza, 'Volumen');
  });
});

describe('varios Impuesto en la misma línea', () => {
  test('el monto es la suma de los dos impuestos', () => {
    // IVA más un impuesto selectivo de consumo, por ejemplo.
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Impuesto: [
        { Codigo: '01', CodigoTarifa: '08', Tarifa: '13', Monto: '1300' },
        { Codigo: '99', Tarifa: '10', Monto: '1000' }
      ]
    });

    assert.equal(linea.impuesto.monto, 2300);
    assert.ok(!Number.isNaN(linea.impuesto.monto));
  });

  test('código y tarifa describen el primero de la lista', () => {
    const linea = parser.extractLineaDetalle({
      ...LINEA_BASE,
      Impuesto: [
        { Codigo: '01', CodigoTarifa: '08', Tarifa: '13', Monto: '1300' },
        { Codigo: '99', Tarifa: '10', Monto: '1000' }
      ]
    });

    assert.equal(linea.impuesto.codigo, '01');
    assert.equal(linea.impuesto.tarifa, 13);
  });
});

describe('sin Descuento ni Impuesto', () => {
  test('los dos quedan null, no un objeto con NaN adentro', () => {
    const linea = parser.extractLineaDetalle({ ...LINEA_BASE });
    assert.equal(linea.descuento, null);
    assert.equal(linea.impuesto, null);
  });
});
