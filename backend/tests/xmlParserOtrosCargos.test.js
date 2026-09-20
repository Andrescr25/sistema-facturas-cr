const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const XmlParser = require('../services/xmlParser');

/**
 * Los tres campos del resumen que explican por qué el total de una factura
 * de proveedor no siempre es la suma de sus líneas.
 *
 * De las 862 facturas, 18 no cuadran: de ₡65 a ₡16.941,92, algunas
 * NEGATIVAS. El parser nunca leía `TotalOtrosCargos` ni `TotalIVADevuelto`
 * (ninguno de los dos, en ningún lado del repositorio), y `TotalDescuentos`
 * se leía pero se tiraba sin guardar. Sin estos tres, la diferencia no tenía
 * ninguna explicación posible.
 */

const parser = new XmlParser();

describe('el resumen trae los tres campos que faltaban', () => {
  test('con los tres presentes', () => {
    const resumen = parser.extractResumenData({
      CodigoTipoMoneda: { CodigoMoneda: 'CRC', TipoCambio: '1' },
      TotalVenta: '10000',
      TotalDescuentos: '500',
      TotalVentaNeta: '9500',
      TotalImpuesto: '1235',
      TotalOtrosCargos: '1000',
      TotalIVADevuelto: '200',
      TotalComprobante: '11535'
    });

    assert.equal(resumen.totales.descuentos, 500);
    assert.equal(resumen.totales.otrosCargos, 1000);
    assert.equal(resumen.totales.ivaDevuelto, 200);
  });

  test('sin ninguno de los tres, quedan en 0 — no en NaN ni undefined', () => {
    const resumen = parser.extractResumenData({
      CodigoTipoMoneda: { CodigoMoneda: 'CRC', TipoCambio: '1' },
      TotalVenta: '10000',
      TotalVentaNeta: '10000',
      TotalImpuesto: '1300',
      TotalComprobante: '11300'
    });

    assert.equal(resumen.totales.descuentos, 0);
    assert.equal(resumen.totales.otrosCargos, 0);
    assert.equal(resumen.totales.ivaDevuelto, 0);
  });
});

describe('el bloque <OtrosCargos>, que es hermano de <ResumenFactura>', () => {
  test('uno solo llega como objeto suelto, no como array', () => {
    const cargos = XmlParser.extractOtrosCargos({
      TipoDocumento: '04', Detalle: 'Flete', Porcentaje: undefined, MontoCargo: '1500'
    });

    assert.equal(cargos.length, 1);
    assert.equal(cargos[0].detalle, 'Flete');
    assert.equal(cargos[0].monto, 1500);
  });

  test('varios llegan como array, y ninguno se pierde', () => {
    const cargos = XmlParser.extractOtrosCargos([
      { TipoDocumento: '04', Detalle: 'Flete', MontoCargo: '1500' },
      { TipoDocumento: '99', Detalle: 'Manejo', MontoCargo: '300' }
    ]);

    assert.equal(cargos.length, 2);
    assert.equal(cargos.reduce((s, c) => s + c.monto, 0), 1800);
  });

  test('sin OtrosCargos, la lista queda vacía, no null', () => {
    assert.deepEqual(XmlParser.extractOtrosCargos(undefined), []);
  });

  test('llega dentro de facturaData, no dentro de facturaData.resumen', () => {
    // Es el error fácil: OtrosCargos es HERMANO de ResumenFactura en el XML,
    // no un hijo suyo. Si se leyera de factura.ResumenFactura.OtrosCargos,
    // esto quedaría vacío siempre.
    const facturaData = parser.extractFacturaData({
      Clave: '1'.repeat(50),
      NumeroConsecutivo: '00100001010000000001',
      FechaEmision: '2026-09-01T00:00:00',
      Emisor: {
        Nombre: 'PROVEEDOR', Identificacion: { Tipo: '02', Numero: '3101000000' }
      },
      OtrosCargos: { TipoDocumento: '04', Detalle: 'Flete', MontoCargo: '1500' },
      DetalleServicio: { LineaDetalle: [] },
      ResumenFactura: {
        CodigoTipoMoneda: { CodigoMoneda: 'CRC', TipoCambio: '1' },
        TotalVenta: '0', TotalVentaNeta: '0', TotalImpuesto: '0', TotalComprobante: '1500'
      }
    });

    assert.equal(facturaData.otrosCargos.length, 1);
    assert.equal(facturaData.otrosCargos[0].monto, 1500);
  });
});
