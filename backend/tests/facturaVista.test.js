const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Las cuentas y las reglas de la pantalla de una factura.
 *
 * Vivían dentro de VistaFactura.jsx —790 líneas con el dibujo, las cuentas,
 * la copia que se edita y el cobro que se anula todo junto— y solo se podían
 * "probar" buscando texto en el archivo. Al sacarlas a utils/facturaVista.js
 * (revisión de estructura del 2026-10-11) se prueban de verdad.
 */

let u;
before(async () => { u = await import('../../frontend/src/utils/facturaVista.js'); });

const linea = (cambios = {}) => ({
  productoId: 9, nombre: 'ARROZ 2 KG', referencia: '0066', cabys: '2316100000000',
  cantidad: '3', precioUnitario: '1000.00', descuentoPorcentaje: '0', tarifa: '13',
  impuestoMonto: '390.00', descripcion: 'ARROZ 2 KG', ...cambios
});
const factura = (cambios = {}) => ({
  estado: 'emitida', electronica: false, haciendaEstado: null, cobrado: 0, acreditado: 0,
  subtotal: 3000, descuento: 0, impuesto: 390, total: 3390, lineas: [linea()], ...cambios
});

describe('la fila que se muestra y la que se edita', () => {
  test('los números llegan como texto de la base y salen como números', () => {
    const f = u.filaDe(linea());
    assert.deepEqual([f.cantidad, f.precioUnitario, f.descuentoPorcentaje, f.tarifa, f.impuestoMonto], [3, 1000, 0, 13, 390]);
  });

  test('el detalle viaja con la línea: corregir una cantidad no borra lo escrito en las demás', () => {
    assert.equal(u.filaDe(linea({ descripcion: 'ENTREGADO' })).descripcion, 'ENTREGADO');
    assert.equal(u.filaDe(linea({ descripcion: null })).descripcion, '');
  });

  test('el detalle solo se muestra si dice algo distinto del nombre', () => {
    assert.equal(u.esDetallePropio({ nombre: 'ARROZ 2 KG', descripcion: 'arroz  2 kg ' }), false);
    assert.equal(u.esDetallePropio({ nombre: 'ARROZ 2 KG', descripcion: 'ENTREGADO' }), true);
    assert.equal(u.esDetallePropio({ nombre: 'ARROZ 2 KG', descripcion: '' }), false);
  });

  test('una línea nueva toma la tarifa del producto, nunca de lo que escriba alguien', () => {
    const nueva = u.lineaDeProducto({ id: 7, name: 'ATÚN', reference: 'A1', cabys: '1', price: '850', tax: [{ percentage: '1' }] });
    assert.deepEqual(nueva, {
      productoId: 7, nombre: 'ATÚN', referencia: 'A1', cabys: '1', cantidad: 1, precioUnitario: 850,
      descuentoPorcentaje: 0, tarifa: 1, descripcion: ''
    });
    assert.equal(u.lineaDeProducto({ id: 8, name: 'X', price: 1 }).tarifa, 0);
    // El catálogo del navegador trae el id propio en `productoId` cuando existe.
    assert.equal(u.lineaDeProducto({ id: 'viejo', productoId: 31, name: 'X', price: 1 }).productoId, 31);
  });
});

describe('los totales', () => {
  test('sin editar son los del documento guardado', () => {
    const f = factura();
    const t = u.totalesDe(f, f.lineas.map(u.filaDe), false);
    assert.deepEqual([t.subtotal, t.impuesto, t.total, t.descuento], [3000, 390, 3390, 0]);
    assert.deepEqual(t.porTarifa, [[13, 390]]);
    assert.equal(t.hayDescuento, false);
  });

  test('en edición se recalculan con la copia de trabajo', () => {
    const filas = [{ ...u.filaDe(linea()), cantidad: 5 }];
    const t = u.totalesDe(factura(), filas, true);
    assert.deepEqual([t.subtotal, t.impuesto, t.total], [5000, 650, 5650]);
    assert.equal(t.hayDescuento, true, 'en edición la columna de descuento siempre está');
  });

  test('con descuento, el subtotal ya lo trae restado y la cuenta cierra', () => {
    // El caso que no cerraba: 1.469 − 36 + 191 no es 1.660. Las facturas
    // copiadas de Alegra guardan el subtotal ANTES del descuento.
    const f = factura({ subtotal: 1505, descuento: 36, impuesto: 191, total: 1660, lineas: [linea({ descuentoPorcentaje: '2.4' })] });
    const t = u.totalesDe(f, f.lineas.map(u.filaDe), false);
    assert.equal(t.subtotal, 1469);
    assert.equal(t.subtotal + t.impuesto, t.total);
    assert.equal(t.descuento, 36);
    assert.equal(t.hayDescuento, true);
  });

  test('el IVA se agrupa por tarifa, de menor a mayor, y sin las tarifas en cero', () => {
    const filas = [linea({ tarifa: '13', impuestoMonto: '130' }), linea({ tarifa: '1', impuestoMonto: '10' }),
      linea({ tarifa: '13', impuestoMonto: '65' }), linea({ tarifa: '0', impuestoMonto: '0' })].map(u.filaDe);
    assert.deepEqual(u.totalesDe(factura(), filas, false).porTarifa, [[1, 10], [13, 195]]);
  });

  test('lo que vale una línea ya trae su descuento', () => {
    assert.equal(u.baseDe({ cantidad: 2, precioUnitario: 1000, descuentoPorcentaje: 10 }), 1800);
    assert.equal(u.baseDe({ cantidad: 2, precioUnitario: 1000 }), 2000);
  });
});

describe('cuándo no se puede editar, y por qué', () => {
  test('una factura emitida y sin nada encima sí se edita', () => {
    assert.equal(u.porQueNoSeEdita(factura()), null);
  });

  test('cada impedimento dice el suyo, en este orden', () => {
    assert.match(u.porQueNoSeEdita(factura({ estado: 'anulada', electronica: true })), /Está anulada/);
    assert.match(u.porQueNoSeEdita(factura({ estado: 'borrador' })), /borrador/);
    assert.match(u.porQueNoSeEdita(factura({ electronica: true, cobrado: 100 })), /nota de crédito/);
    assert.match(u.porQueNoSeEdita(factura({ haciendaEstado: 'enviada' })), /reservada ante Hacienda/);
    assert.match(u.porQueNoSeEdita(factura({ cobrado: 100 })), /cobro aplicado/);
    assert.match(u.porQueNoSeEdita(factura({ acreditado: 100 })), /nota de crédito aplicada/);
  });

  test('mientras se emite, y desde que Hacienda la tiene, tampoco: aunque la factura no se haya releído', () => {
    // El panel de emisión se entera antes que la pantalla: en ese rato Editar
    // quedaba ofreciendo un cambio que la base ya no deja hacer.
    assert.match(u.porQueNoSeEdita(factura(), { emitiendo: true }), /Se está emitiendo/);
    const recibida = u.reservaFiscalDe({ ambiente: 'produccion', estado: 'recibida' });
    assert.match(u.porQueNoSeEdita(factura(), { reservaFiscal: recibida }), /reservada ante Hacienda/);
    const aceptada = u.reservaFiscalDe({ ambiente: 'produccion', estado: 'aceptada' });
    assert.match(u.porQueNoSeEdita(factura(), { reservaFiscal: aceptada }), /Ya se emitió electrónicamente/);
  });

  test('una prueba, o un rechazo, no reservan la factura', () => {
    assert.equal(u.reservaFiscalDe({ ambiente: 'pruebas', estado: 'aceptada' }), null);
    assert.equal(u.reservaFiscalDe({ ambiente: 'produccion', estado: 'rechazada' }), null);
    assert.equal(u.reservaFiscalDe(null), null);
    assert.equal(u.porQueNoSeEdita(factura(), { reservaFiscal: null }), null);
  });
});

describe('lo que se guarda al corregir', () => {
  const cliente = { id: 12, nombre: 'PULPERÍA LA ESQUINA', identificacion: '3101123456' };

  test('no se guarda una factura sin líneas ni con una cantidad en cero', () => {
    assert.match(u.faltaParaGuardar([]), /sin líneas/);
    assert.match(u.faltaParaGuardar([{ cantidad: '0' }]), /cantidad en cero/);
    assert.match(u.faltaParaGuardar([{ cantidad: 2 }, { cantidad: '' }]), /cantidad en cero/);
    assert.equal(u.faltaParaGuardar([{ cantidad: '2' }]), '');
  });

  test('viaja el cliente con lo que se veía, para que el servidor lo compare con su ficha', () => {
    const c = u.cuerpoDeEdicion({ cliente, lineas: [], observaciones: 'x', motivo: '' });
    assert.deepEqual([c.clienteId, c.clienteNombre, c.clienteIdentificacion], [12, 'PULPERÍA LA ESQUINA', '3101123456']);
    assert.equal(u.cuerpoDeEdicion({ cliente: null, lineas: [], observaciones: '', motivo: '' }).clienteNombre, '');
  });

  test('cada línea va con su referencia, su nombre y su detalle; el impuesto NO va', () => {
    const [item] = u.cuerpoDeEdicion({
      cliente, observaciones: '', motivo: '',
      lineas: [{ productoId: 9, referencia: '0066', nombre: 'ARROZ', cantidad: '2', precioUnitario: '1000', descuentoPorcentaje: '5', tarifa: 13, descripcion: '  ENTREGADO  ' }]
    }).items;
    assert.deepEqual(item, { productoId: 9, reference: '0066', name: 'ARROZ', quantity: 2, price: 1000, discount: 5, description: 'ENTREGADO' });
  });

  test('un descuento fuera de 0–100 se acota', () => {
    const d = (v) => u.cuerpoDeEdicion({ cliente, observaciones: '', motivo: '', lineas: [{ cantidad: 1, precioUnitario: 1, descuentoPorcentaje: v }] }).items[0].discount;
    assert.deepEqual([d(150), d(-5), d('abc'), d(12.5)], [100, 0, 0, 12.5]);
  });

  test('el motivo de la corrección va a la bitácora; vacío es "sin motivo"', () => {
    assert.equal(u.cuerpoDeEdicion({ cliente, lineas: [], observaciones: '', motivo: '  Se facturó de más  ' }).motivo, 'Se facturó de más');
    assert.equal(u.cuerpoDeEdicion({ cliente, lineas: [], observaciones: '', motivo: '   ' }).motivo, null);
  });

  test('el cliente elegido en el buscador toma la forma que guarda la factura', () => {
    assert.deepEqual(u.clienteDeFicha({ id: 5, name: 'SUPER X', identification: '1', phonePrimary: '', mobile: '8888', email: 'a@b.cr' }),
      { id: 5, nombre: 'SUPER X', identificacion: '1', telefono: '8888', direccion: null, correo: 'a@b.cr' });
  });
});

describe('el medio de pago y la fecha, en palabras', () => {
  test('las claves de Alegra y las propias se leen igual', () => {
    assert.equal(u.medio('cash'), 'Efectivo');
    assert.equal(u.medio('sinpe_movil'), 'SINPE Móvil');
    assert.equal(u.medio('TRANSFERENCIA'), 'Transferencia');
    assert.equal(u.medio(null), null);
  });

  test('la fecha corta no pasa por Date: no se corre un día', async () => {
    const { fechaCorta } = await import('../../frontend/src/utils/fechaCR.js');
    assert.equal(fechaCorta('2026-10-11'), '11/10/2026');
    assert.equal(fechaCorta('2026-10-11T23:30:00.000Z'), '11/10/2026');
    assert.equal(fechaCorta(null), '—');
    assert.equal(fechaCorta('', ''), '');
  });
});
