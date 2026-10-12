const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Ver una nota de crédito entera (para su PDF y su correo).
 *
 * Lo que se cuida: que salga con la forma que el PDF de la factura ya sabe
 * dibujar, que los datos del cliente que la nota no guarda salgan de la copia
 * fija de SU factura, y que solo una nota electrónica vaya a buscar su
 * comprobante. La base es un doble: ninguna prueba abre PostgreSQL.
 */
const rutas = {
  db: require.resolve('../config/database'),
  lectura: require.resolve('../src/integrations/hacienda/lectura.service'),
  consultaFactura: require.resolve('../src/modules/facturacion/facturaConsulta.service'),
  servicio: require.resolve('../src/modules/facturacion/notaCreditoConsulta.service')
};
afterEach(() => { for (const ruta of Object.values(rutas)) delete require.cache[ruta]; });

const NOTA = {
  id: 90, numero: 'NC-000083', estado: 'emitida', fecha: '2026-10-11', electronica: false, hacienda_estado: null,
  cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA', cliente_identificacion: '3101123456',
  motivo: 'devolucion', motivo_texto: 'Llegó golpeado', observaciones: null, alegra_id: null,
  subtotal: '1000.00', descuento: '0.00', impuesto: '130.00', total: '1130.00'
};
const LINEA = {
  numero_linea: 1, producto_id: 3, nombre: 'TORNILLO', referencia: 'TOR02', descripcion: null, cabys: '1234567890123',
  unidad: 'Unid', cantidad: '1.0000', precio_unitario: '1000.00000', descuento_porcentaje: '0.000',
  descuento_monto: '0.00', tarifa: '13.000', impuesto_monto: '130.00', total: '1130.00'
};
const FACTURA = {
  id: 500, numero: '001000015014', tipo_documento: 'factura', electronica: true, clave_hacienda: '5'.repeat(50),
  moneda: 'CRC', cliente_tipo_identificacion: 'CJ', cliente_correo: 'copia@example.test',
  cliente_telefono: '8888-0000', cliente_direccion: 'Chomes', monto: '1130.00'
};

function montar({ nota = NOTA, facturas = [FACTURA], fiscal = { id: 41, consecutivo: 'x' } } = {}) {
  const leidas = [];
  const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
  doble(rutas.db, { pool: { query: async (sql) => {
    if (/FROM nota_credito WHERE id/.test(sql)) return { rows: nota ? [nota] : [] };
    if (/FROM nota_credito_linea/.test(sql)) return { rows: [LINEA] };
    if (/FROM nota_credito_factura/.test(sql)) return { rows: facturas };
    throw new Error('consulta inesperada: ' + sql);
  } } });
  doble(rutas.lectura, { notaAceptada: async (_db, id) => { leidas.push(id); return fiscal; } });
  delete require.cache[rutas.consultaFactura];
  delete require.cache[rutas.servicio];
  return { ...require(rutas.servicio), leidas };
}

test('sale con la forma que el PDF de la factura ya sabe dibujar', async () => {
  const { obtenerNota } = montar();
  const n = await obtenerNota(90);
  assert.equal(n.numero, 'NC-000083');
  assert.equal(n.motivo, 'devolucion');
  assert.equal(n.motivoTexto, 'Llegó golpeado');
  // Los NUMERIC de Postgres llegan como texto: salen como números.
  assert.deepEqual([n.subtotal, n.impuesto, n.total], [1000, 130, 1130]);
  assert.deepEqual(n.lineas, [{
    numeroLinea: 1, productoId: 3, nombre: 'TORNILLO', referencia: 'TOR02', descripcion: null, cabys: '1234567890123',
    unidad: 'Unid', cantidad: 1, precioUnitario: 1000, descuentoPorcentaje: 0, descuentoMonto: 0,
    tarifa: 13, impuestoMonto: 130, total: 1130
  }]);
  assert.deepEqual(n.facturas, [{
    id: 500, numero: '001000015014', tipoDocumento: 'factura', electronica: true, claveHacienda: '5'.repeat(50), monto: 1130
  }]);
});

test('lo que la nota no guarda del cliente sale de la copia fija de su factura', async () => {
  const { obtenerNota } = montar();
  assert.deepEqual((await obtenerNota(90)).cliente, {
    id: 7, nombre: 'PULPERÍA LA ESQUINA', identificacion: '3101123456', tipoIdentificacion: 'CJ',
    correo: 'copia@example.test', telefono: '8888-0000', direccion: 'Chomes'
  });
});

test('solo una nota electrónica va a buscar su comprobante', async () => {
  const comun = montar();
  assert.equal((await comun.obtenerNota(90)).fiscal, null);
  assert.deepEqual(comun.leidas, [], 'se leyó el almacén fiscal para una nota que no es electrónica');

  const electronica = montar({ nota: { ...NOTA, electronica: true, hacienda_estado: 'aceptada' } });
  const n = await electronica.obtenerNota(90);
  assert.deepEqual(n.fiscal, { id: 41, consecutivo: 'x' });
  assert.equal(n.haciendaEstado, 'aceptada');
  assert.deepEqual(electronica.leidas, [90]);
});

test('una nota anulada trae por qué se anuló', async () => {
  const { obtenerNota } = montar({ nota: { ...NOTA, estado: 'anulada', observaciones: 'Cliente la pidió\nAnulada: se hizo dos veces' } });
  const n = await obtenerNota(90);
  assert.equal(n.estado, 'anulada');
  assert.equal(n.motivoAnulacion, 'se hizo dos veces');
  assert.equal((await montar().obtenerNota(90)).motivoAnulacion, null);
});

test('sin factura enlazada no revienta, y una que no existe da 404', async () => {
  const suelta = montar({ facturas: [] });
  const n = await suelta.obtenerNota(90);
  assert.deepEqual(n.facturas, []);
  assert.equal(n.moneda, 'CRC');
  assert.equal(n.cliente.nombre, 'PULPERÍA LA ESQUINA');

  await assert.rejects(montar({ nota: null }).obtenerNota(90), (e) => e.status === 404);
  await assert.rejects(montar().obtenerNota('abc'), (e) => e.status === 400);
});
