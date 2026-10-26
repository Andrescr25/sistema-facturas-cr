/**
 * Las reglas puras de «solo llega lo que ingresó» (2026-10-25): qué botones
 * deja Reporte Clientes, y cómo se lee y se arma la factura cargada a mano.
 * La parte con base está en ingresoFaltanteLocal.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validarCompraManual, montosDeLinea } = require('../src/modules/compras/compraManual.service');

describe('Reporte Clientes: lo que ingresó decide las respuestas', () => {
  const cargar = () => import('../../frontend/src/utils/reporteClientesUtils.js');

  test('sin ingreso solo queda «No llegó», y lo dice', async () => {
    const { respuestasPorIngreso } = await cargar();
    const r = respuestasPorIngreso({ cantidad_faltante: 5, ingreso_disponible: 0 });
    assert.equal(r.completo, false);
    assert.equal(r.parcial, false);
    assert.equal(r.aviso, 'Todavía no ingresa por Revisión de precios');
  });

  test('con parte del ingreso, «Parte» hasta lo que hay', async () => {
    const { respuestasPorIngreso } = await cargar();
    const r = respuestasPorIngreso({ cantidad_faltante: 5, ingreso_disponible: 3 });
    assert.deepEqual(r, { completo: false, parcial: true, maximoParcial: 3, aviso: 'Ingresaron 3 de 5 por Revisión de precios' });
    // Una fracción (una caja partida) no alcanza para una unidad más.
    assert.equal(respuestasPorIngreso({ cantidad_faltante: 5, ingreso_disponible: 3.5 }).maximoParcial, 3);
  });

  test('con todo lo ingresado no hay aviso, y «Parte» sigue debajo del faltante', async () => {
    const { respuestasPorIngreso } = await cargar();
    assert.deepEqual(respuestasPorIngreso({ cantidad_faltante: 5, ingreso_disponible: 12 }),
      { completo: true, parcial: true, maximoParcial: 4, aviso: null });
    assert.equal(respuestasPorIngreso({ cantidad_faltante: 1, ingreso_disponible: 1 }).parcial, false, 'de uno no hay parte');
  });

  test('sin el dato (historial) no se limita nada', async () => {
    const { respuestasPorIngreso } = await cargar();
    assert.deepEqual(respuestasPorIngreso({ cantidad_faltante: 2, ingreso_disponible: null }),
      { completo: true, parcial: true, maximoParcial: 1, aviso: null });
  });
});

describe('la factura de compra cargada a mano', () => {
  const HOY = '2026-10-25';
  const BASE = { proveedorId: 7, numero: 'A-1', fecha: '2026-10-24', condicion: 'contado',
    lineas: [{ productoId: 3, cantidad: 2, costoConIva: 113 }] };
  const rechaza = (cambio, patron) => assert.throws(() => validarCompraManual({ ...BASE, ...cambio }, HOY),
    (e) => e.status === 400 && patron.test(e.message));

  test('lo válido pasa limpio', () => {
    assert.deepEqual(validarCompraManual({ ...BASE, numero: '  A-1 ' }, HOY),
      { proveedorId: 7, numero: 'A-1', fecha: '2026-10-24', condicion: 'contado', plazoDias: 0,
        lineas: [{ productoId: 3, cantidad: 2, costoConIva: 113 }] });
    assert.equal(validarCompraManual({ ...BASE, condicion: 'credito', plazoDias: 30 }, HOY).plazoDias, 30);
  });

  test('rechaza lo que no se puede registrar', () => {
    rechaza({ numero: '  ' }, /número/);
    rechaza({ fecha: '2026-02-30' }, /fecha/);
    rechaza({ fecha: '2026-10-26' }, /después de hoy/);
    rechaza({ condicion: 'fiado' }, /Condición/);
    rechaza({ condicion: 'credito' }, /plazo/);
    rechaza({ lineas: [] }, /ninguna línea/);
    rechaza({ lineas: [{ productoId: 3, cantidad: 0, costoConIva: 1 }] }, /cantidad/);
    rechaza({ lineas: [{ productoId: 3, cantidad: 1, costoConIva: -1 }] }, /costo/);
    rechaza({ lineas: [{ productoId: 3, cantidad: 1 }] }, /faltan la cantidad o el costo/);
    assert.throws(() => validarCompraManual({ ...BASE, proveedorId: 'x' }, HOY), (e) => e.status === 400);
  });

  test('el IVA sale de la tarifa de la línea, no de un 13 % fijo', () => {
    assert.deepEqual(montosDeLinea({ cantidad: 2, costoConIva: 113 }, 13),
      { cantidad: 2, precio_unitario: 100, descuento: 0, impuesto: 26, total_linea: 226 });
    assert.deepEqual(montosDeLinea({ cantidad: 3, costoConIva: 102 }, 2),
      { cantidad: 3, precio_unitario: 100, descuento: 0, impuesto: 6, total_linea: 306 });
    assert.equal(montosDeLinea({ cantidad: 5, costoConIva: 40 }, 0).impuesto, 0);
  });
});

describe('la pantalla de la factura a mano', () => {
  const cargar = () => import('../../frontend/src/utils/facturaManualUtils.js');
  const HOY = '2026-10-25';

  test('dice qué falta antes de dejar guardar', async () => {
    const u = await cargar();
    const b = u.borradorVacio(HOY);
    assert.equal(u.motivoParaNoGuardar(b, HOY), 'Elegí el proveedor.');
    const listo = { ...b, proveedorId: '4', numero: 'F-9', lineas: [u.lineaDeProducto({ id: 3, name: 'Café', cost: 1500 })] };
    assert.equal(u.motivoParaNoGuardar(listo, HOY), 'Café: falta la cantidad o el costo.');
    listo.lineas[0].cantidad = '2';
    assert.equal(u.motivoParaNoGuardar(listo, HOY), null);
    assert.equal(u.motivoParaNoGuardar({ ...listo, condicion: 'credito' }, HOY), 'Falta el plazo del crédito, en días.');
    assert.equal(u.motivoParaNoGuardar({ ...listo, fecha: '2026-10-26' }, HOY), 'La fecha no puede ser después de hoy.');
    assert.equal(u.totalDeFactura(listo.lineas), 3000);
    assert.deepEqual(u.datosParaEnviar({ ...listo, numero: ' F-9 ' }), {
      proveedorId: 4, numero: 'F-9', fecha: HOY, condicion: 'contado', plazoDias: undefined,
      lineas: [{ productoId: 3, cantidad: 2, costoConIva: 1500 }]
    });
  });
});
