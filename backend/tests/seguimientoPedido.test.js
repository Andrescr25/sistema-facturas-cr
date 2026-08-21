/**
 * Tests del seguimiento del pedido (portal-clientes/seguimiento.js).
 *
 * Es lo que el cliente lee en su teléfono para saber si su pedido va a
 * llegar, así que las reglas se prueban una por una. El módulo es puro
 * —sin base ni red— justamente para poder hacerlo: la base local ES
 * producción.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ETAPAS, EN_REVISION, EN_PREPARACION, LISTO_PARA_ENVIO, NO_PROCESADO,
  etapaDePedido, seguimientoDePedido
} = require('../src/modules/portal-clientes/seguimiento');

describe('etapaDePedido — de qué datos sale cada etapa', () => {
  test('recién enviado, nadie lo tocó', () => {
    assert.equal(etapaDePedido({ estado: 'pendiente', estadoBodega: null }), EN_REVISION);
  });

  test('facturado y en bodega sin alistar', () => {
    assert.equal(etapaDePedido({ estado: 'facturado', estadoBodega: 'pendiente' }), EN_PREPARACION);
  });

  test('facturado y bodega ya lo alistó', () => {
    assert.equal(etapaDePedido({ estado: 'facturado', estadoBodega: 'procesado' }), LISTO_PARA_ENVIO);
  });

  test('rechazado por el personal', () => {
    assert.equal(etapaDePedido({ estado: 'rechazado', estadoBodega: null }), NO_PROCESADO);
  });

  test('facturado SIN fila en facturas todavía -> En preparación, no un error', () => {
    // La factura se crea en Alegra y la fila local se inserta en el mismo
    // golpe; leer en el medio no debe mostrarle al cliente que algo falló.
    assert.equal(etapaDePedido({ estado: 'facturado', estadoBodega: null }), EN_PREPARACION);
    assert.equal(etapaDePedido({ estado: 'facturado', estadoBodega: undefined }), EN_PREPARACION);
  });

  test('la factura se anuló: el pedido NO puede quedar "En preparación"', () => {
    // Pasa cuando duplicados-electronica anula la copia que deja Alegra al
    // convertir a electrónica. Ese pedido no le va a llegar al cliente.
    assert.equal(etapaDePedido({ estado: 'facturado', estadoBodega: 'anulada' }), NO_PROCESADO);
  });
});

describe('seguimientoDePedido — la línea de tiempo', () => {
  test('un pedido en revisión tiene el primer paso alcanzado y los otros no', () => {
    const t = seguimientoDePedido({
      estado: 'pendiente', estadoBodega: null, creadoEn: '2026-08-21T15:14:00Z'
    });

    assert.equal(t.length, 3);
    assert.deepEqual(t.map(x => x.alcanzada), [true, false, false]);
    assert.equal(t[0].fecha, '2026-08-21T15:14:00Z');
    assert.equal(t[1].fecha, null);
  });

  test('en preparación: dos pasos alcanzados, cada uno con su fecha', () => {
    const t = seguimientoDePedido({
      estado: 'facturado', estadoBodega: 'pendiente',
      creadoEn: '2026-08-21T15:14:00Z', resueltoEn: '2026-08-21T16:02:00Z'
    });

    assert.deepEqual(t.map(x => x.alcanzada), [true, true, false]);
    assert.equal(t[1].fecha, '2026-08-21T16:02:00Z');
    assert.equal(t[2].fecha, null);
  });

  test('listo para envío: los tres pasos', () => {
    const t = seguimientoDePedido({
      estado: 'facturado', estadoBodega: 'procesado',
      creadoEn: '2026-08-21T15:14:00Z', resueltoEn: '2026-08-21T16:02:00Z',
      bodegaProcesadoEn: '2026-08-21T18:40:00Z'
    });

    assert.deepEqual(t.map(x => x.alcanzada), [true, true, true]);
    assert.equal(t[2].fecha, '2026-08-21T18:40:00Z');
  });

  test('una etapa alcanzada SIN fecha se muestra alcanzada igual', () => {
    // Las facturas anteriores a la columna bodega_procesado_en. Inventar una
    // fecha sería peor que dejarla en blanco.
    const t = seguimientoDePedido({
      estado: 'facturado', estadoBodega: 'procesado',
      creadoEn: '2026-08-21T15:14:00Z', resueltoEn: '2026-08-21T16:02:00Z',
      bodegaProcesadoEn: null
    });

    assert.equal(t[2].alcanzada, true);
    assert.equal(t[2].fecha, null);
  });

  test('un pedido rechazado NO devuelve línea de tiempo', () => {
    // Dibujar pasos que nunca van a completarse al lado de un "No procesado"
    // solo confunde: esa pantalla muestra el motivo.
    assert.deepEqual(seguimientoDePedido({ estado: 'rechazado', creadoEn: '2026-08-21T15:14:00Z' }), []);
  });

  test('una factura anulada tampoco devuelve línea de tiempo', () => {
    assert.deepEqual(
      seguimientoDePedido({ estado: 'facturado', estadoBodega: 'anulada', creadoEn: '2026-08-21T15:14:00Z' }),
      []
    );
  });

  test('las claves de la línea de tiempo son las de ETAPAS, en orden', () => {
    const t = seguimientoDePedido({ estado: 'pendiente' });
    assert.deepEqual(t.map(x => x.clave), ETAPAS);
  });
});
