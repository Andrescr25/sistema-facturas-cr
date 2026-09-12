const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * La pantalla de Facturación factura contra NUESTRO backend.
 *
 * Lo que se cuida acá:
 *  - que la traducción no pierda el número ni el cliente, que son lo que la
 *    pantalla muestra apenas se factura;
 *  - que la factura propia quede MARCADA, porque esa marca decide a qué ruta
 *    se edita: mandar un id nuestro (1, 2, 3…) a la ruta de Alegra no da un
 *    error, edita OTRA factura;
 *  - que no quede ningún camino mandando facturas a Alegra.
 */

const SERVICIO = path.join(__dirname, '..', '..', 'frontend', 'src', 'services', 'facturacionService.js');

let adaptador;
test.before(async () => {
  adaptador = await import('../../frontend/src/services/facturaPropiaAdaptador.js');
});

// Lo que devuelve el servidor propio al crear.
const PROPIA = {
  id: 5399, numero: '001000014869', serie: '00100001', consecutivo: 4869,
  estado: 'emitida', fecha: '2026-09-12', fecha_vencimiento: '2026-09-12',
  cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA', cliente_identificacion: '3101123456',
  observaciones: 'Entregar el lunes', total: '3390.00',
  lineas: [{
    producto_id: 12, alegra_item_id: '888', nombre: 'TORNILLO', referencia: 'TOR02',
    descripcion: null, cantidad: '3.0000', precio_unitario: '1000.00000',
    descuento_porcentaje: '0.000', impuesto_id: 3, tarifa: '13.000', total: '3390.00'
  }]
};

test('el número llega entero a la pantalla', () => {
  const f = adaptador.desdeFacturaPropia(PROPIA);
  // Es lo que se muestra en "Factura #… creada". Si se pierde, el cajero no
  // sabe qué número entregó.
  assert.equal(f.numberTemplate.fullNumber, '001000014869');
  assert.equal(f.id, 5399);
});

test('la factura propia queda marcada', () => {
  // La marca decide la ruta de edición y cuál PDF se abre.
  assert.equal(adaptador.desdeFacturaPropia(PROPIA).esPropia, true);
});

test('el cliente y las líneas se traducen con sus números como números', () => {
  const f = adaptador.desdeFacturaPropia(PROPIA);
  assert.equal(f.client.name, 'PULPERÍA LA ESQUINA');
  assert.equal(f.total, 3390);
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].quantity, 3);
  assert.equal(f.items[0].price, 1000);
  assert.equal(f.items[0].tax[0].percentage, 13);
  assert.equal(f.items[0].id, '888', 'usa el id de Alegra mientras el catálogo lo tenga');
  assert.equal(f.items[0].productoId, 12);
});

test('una anulada se cuenta como anulada', () => {
  assert.equal(adaptador.desdeFacturaPropia({ ...PROPIA, estado: 'anulada' }).status, 'void');
  assert.equal(adaptador.desdeFacturaPropia(PROPIA).status, 'open');
});

test('una respuesta sin líneas no revienta', () => {
  // Es el caso de la clave repetida: el servidor contesta "ya estaba creada"
  // con el id y el número, sin el detalle.
  const f = adaptador.desdeFacturaPropia({ id: 5399, numero: '001000014869' });
  assert.deepEqual(f.items, []);
  assert.equal(f.numberTemplate.fullNumber, '001000014869');
});

test('nada queda mandando facturas a Alegra', () => {
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  assert.equal(/alegra\/facturacion\/invoices/.test(fuente), false,
    'quedó un camino enviando la factura a Alegra');
  // Los cuatro: envío directo, sincronización de la cola, reintento de una y
  // envío inmediato de una pendiente.
  assert.equal((fuente.match(/api\.post\('\/facturacion\/facturas'/g) || []).length, 4);
});

test('la edición se enruta por la marca, no por el id', () => {
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  assert.match(fuente, /esPropia\s*\n?\s*\?\s*await api\.put\(`\/facturacion\/facturas\/\$\{facturaId\}`/);
  // Y la edición que queda pendiente se guarda con la marca, para que el
  // reintento de dentro de tres días no tenga que adivinar.
  assert.match(fuente, /saveEdicionPendiente\(facturaId, datosEdicion, esPropia\)/);
  assert.match(fuente, /edicion\.esPropia/);
});

/**
 * La tarifa que ve el cajero tiene que ser la que se guarda.
 *
 * Verificado en el navegador: con un producto al 1 % y otro al 2 %, la
 * pantalla cobraba ₡1.907,89 (13 % sobre todo) mientras el servidor guardaba
 * ₡1.716,07. ₡191,82 de diferencia entre lo que se cobra y lo que dice la
 * factura.
 */
const UTILS = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'facturacionUtils.js');
const HOOK = path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useFacturacion.js');

test('el impuesto se suma con la tarifa de CADA línea', async () => {
  const { calcularImpuestos } = await import('../../frontend/src/utils/facturacionUtils.js');
  const principal = { id: 3, percentage: 13 };
  const items = [
    { quantity: 2, price: 305, discount: 0, tax: [{ id: 1, percentage: 1 }] },
    { quantity: 1, price: 1078.40, discount: 0, tax: [{ id: 2, percentage: 2 }] }
  ];
  // 610 × 1 % = 6,10  +  1.078,40 × 2 % = 21,568
  assert.equal(Math.round(calcularImpuestos(items, principal, []) * 100) / 100, 27.67);
});

test('una línea nace con la tarifa del PRODUCTO, no con la principal de la factura', () => {
  const fuente = fs.readFileSync(HOOK, 'utf8');
  assert.match(fuente, /const impuestoDelProducto = Array\.isArray\(producto\.tax\)/);
  assert.match(fuente, /tax: impuestoDelProducto/);
  assert.equal(/tax: impuestoDefault,/.test(fuente), false,
    'volvió a nacer la línea con el impuesto principal');
});

test('la línea lleva nuestro id de producto', () => {
  const fuente = fs.readFileSync(HOOK, 'utf8');
  assert.match(fuente, /productoId: producto\.productoId \?\? producto\.id/);
  assert.match(fuente, /clienteId: parseInt\(clienteSeleccionado\.id\)/);
});

test('los catálogos de la pantalla salen de la base propia', () => {
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  for (const ruta of ['/maestro/productos', '/clientes', '/catalogos/configuracion', '/facturacion/facturas']) {
    assert.ok(fuente.includes(ruta), `la pantalla ya no lee de ${ruta}`);
  }
  // Ni impuestos ni métodos de pago escritos a mano como respaldo: si la lista
  // no llega, es mejor fallar que cobrar 13 % sobre un producto al 1 %.
  assert.equal(/id: 3, name: 'IVA 13%'/.test(fuente), false);
  assert.equal(/alegra\/facturacion\//.test(fuente), false, 'quedó una lectura contra Alegra');
});
