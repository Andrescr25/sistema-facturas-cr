const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * La pantalla de Facturación factura contra NUESTRO backend.
 *
 * Lo que se cuida acá:
 *  - que la copia propia no pierda el número ni el cliente, que son lo que la
 *    pantalla muestra apenas se factura;
 *  - que la factura propia quede MARCADA, porque esa marca decide a qué ruta
 *    se edita: mandar un id nuestro (1, 2, 3…) a la ruta de Alegra no da un
 *    error, edita OTRA factura;
 *  - que no quede ningún camino mandando facturas a Alegra.
 */

const SERVICIO = path.join(__dirname, '..', '..', 'frontend', 'src', 'services', 'facturacionService.js');

let copias;
test.before(async () => {
  copias = await import('../../frontend/src/utils/facturasLocales.js');
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
  const f = copias.facturaEscrita(PROPIA);
  // Es lo que se muestra en "Factura #… creada". Si se pierde, el cajero no
  // sabe qué número entregó.
  assert.equal(f.numero, '001000014869');
  assert.equal(f.id, 5399);
});

test('la factura propia queda marcada', () => {
  // La marca decide la ruta de edición y cuál PDF se abre.
  assert.equal(copias.facturaEscrita(PROPIA).esPropia, true);
});

test('el cliente y las líneas se guardan con sus números como números', () => {
  const f = copias.facturaEscrita(PROPIA);
  assert.equal(f.cliente.nombre, 'PULPERÍA LA ESQUINA');
  assert.equal(f.total, 3390);
  assert.equal(f.lineas.length, 1);
  assert.equal(f.lineas[0].cantidad, 3);
  assert.equal(f.lineas[0].precioUnitario, 1000);
  assert.equal(f.lineas[0].tarifa, 13);
  assert.equal(f.lineas[0].productoId, 12, 'el id de Alegra no decide qué producto se edita');
  assert.equal(f.lineas[0].id, undefined);
  assert.equal(f.lineas[0].productoId, 12);
});

test('una anulada se cuenta como anulada', () => {
  assert.equal(copias.facturaEscrita({ ...PROPIA, estado: 'anulada' }).estado, 'anulada');
  assert.equal(copias.facturaEscrita(PROPIA).estado, 'emitida');
});

test('una respuesta sin líneas no revienta', () => {
  // Es el caso de la clave repetida: el servidor contesta "ya estaba creada"
  // con el id y el número, sin el detalle.
  const f = copias.facturaEscrita({ id: 5399, numero: '001000014869' });
  assert.equal(f.lineas, null);
  assert.equal(f.numero, '001000014869');
});

test('el documento de la tablet usa campos propios y no inventa el saldo desde la fila SQL', () => {
  const f = copias.facturaEscrita({ ...PROPIA, saldo: '3390', total_pagado: 0 });
  for (const clave of ['numberTemplate', 'client', 'items', 'status', 'date', 'saldo']) assert.equal(clave in f, false);
});

test('una lista o un acuse de idempotencia conserva las líneas y la ficha ya descargadas', () => {
  const anterior = { ...copias.facturaEscrita(PROPIA), detalleDisponible: true };
  const resumida = { id: PROPIA.id, numero: PROPIA.numero, lineas: 1, esPropia: true };
  const lista = copias.combinarCopiaFactura(anterior, resumida);
  assert.deepEqual(lista.lineas, anterior.lineas);
  const acuse = copias.facturaEscrita({ id: PROPIA.id, numero: PROPIA.numero, yaExistia: true });
  const guardada = copias.combinarCopiaFactura(lista, { ...acuse, cliente: undefined });
  assert.deepEqual(guardada.cliente, anterior.cliente);
  assert.deepEqual(guardada.lineas, anterior.lineas);
  assert.equal(guardada.detalleDisponible, true);
});

const VIEJA = {
  id: 12, numberTemplate: { fullNumber: 'HISTORICA-12' }, date: '2026-10-04', status: 'open',
  client: { id: 7, name: 'Ficha histórica' }, total: 3390,
  items: [{ id: 888, productoId: 12, name: 'Tornillo', quantity: 3, price: 1000, tax: [{ percentage: 13 }] }]
};
test('v3 propia conserva su marca y el producto propio aunque el id antiguo sea otro', () => {
  const f = copias.convertirCopiaV3({ ...VIEJA, esPropia: true });
  assert.equal(f.id, '12');
  assert.equal(f.lineas[0].productoId, 12);
  assert.equal(f.cliente.id, 7);
  assert.equal(f.numero, 'HISTORICA-12');
  assert.equal(f.esPropia, true);
});
test('v3 sin marca conserva los ids históricos como referencias y no adquiere permiso de edición', () => {
  const f = copias.convertirCopiaV3(VIEJA);
  assert.equal(f.id, 'copia-alegra-12');
  assert.equal(f.alegraId, 12);
  assert.equal(f.cliente.id, null);
  assert.equal(f.lineas[0].productoId, null);
  assert.equal(f.esPropia, false);
});
test('v3 local solo recupera ids propios desde un contrato explícito de su cola', () => {
  const local = { ...VIEJA, id: 'local-1', localId: 1, items: [{ ...VIEJA.items[0], id: 12, productoId: undefined }] };
  const cola = { clienteId: 7, items: [{ productoId: 12 }], claveIdempotencia: 'misma-clave' };
  const antes = structuredClone(cola);
  const f = copias.convertirCopiaV3(local, cola);
  assert.equal(f.esPropia, true);
  assert.equal(f.estado, 'borrador');
  assert.equal(f.lineas[0].productoId, 12);
  assert.deepEqual(cola, antes);
  assert.equal(copias.convertirCopiaV3(local, { client: 7, items: [{ id: 12 }] }).esPropia, false);
  assert.equal(copias.convertirCopiaV3(local, { ...cola, items: [{ productoId: 888 }] }).esPropia, false);
});
test('v3 resumida queda sin detalle disponible; no se presenta como factura vacía editable', () => {
  const f = copias.convertirCopiaV3({ ...VIEJA, esPropia: true, items: [], cantidadLineas: 4 });
  assert.equal(f.detalleDisponible, false);
});

test('nada queda mandando facturas a Alegra', () => {
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  assert.equal(/alegra\/facturacion\/invoices/.test(fuente), false,
    'quedó un camino enviando la factura a Alegra');
  // Los cuatro: envío directo, sincronización de la cola, reintento de una y
  // envío inmediato de una pendiente.
  assert.equal((fuente.match(/api\.post\('\/facturacion\/facturas'/g) || []).length, 4);
});

test('la edición va a la ruta propia, y solo la de una factura marcada como propia', () => {
  // Mientras hubo dos rutas, la marca elegía a cuál mandar. Desde el
  // 2026-10-04 hay una: lo que no trae la marca no se manda (el detalle está
  // en facturacionSinAlegra.test.js).
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  assert.match(fuente, /await api\.put\(`\/facturacion\/facturas\/\$\{facturaId\}`, datosEdicion\)/);
  assert.equal(/alegra\/facturas/.test(fuente), false, 'volvió la ruta que editaba en Alegra');
  // Y la edición que queda pendiente se guarda con la marca, para que el
  // reintento de dentro de tres días no tenga que adivinar.
  assert.match(fuente, /saveEdicionPendiente\(facturaId, datosEdicion, esPropia\)/);
  assert.match(fuente, /if \(!edicion\.esPropia\)/);
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
  // /catalogos y no /maestro ni /clientes: esos son de otros módulos y un
  // cajero con solo Facturación recibía 403 (ver permisosModulos.test.js).
  for (const ruta of ['/catalogos/productos', '/catalogos/clientes', '/catalogos/configuracion', '/facturacion/facturas']) {
    assert.ok(fuente.includes(ruta), `la pantalla ya no lee de ${ruta}`);
  }
  // Ni impuestos ni métodos de pago escritos a mano como respaldo: si la lista
  // no llega, es mejor fallar que cobrar 13 % sobre un producto al 1 %.
  assert.equal(/id: 3, name: 'IVA 13%'/.test(fuente), false);
  assert.equal(/alegra\/facturacion\//.test(fuente), false, 'quedó una lectura contra Alegra');
});

/**
 * Tres cosas que se rompieron hoy al armar la pantalla y no se veían sin
 * abrirla en un navegador.
 */

const HOOK_FACT = path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useFacturacion.js');

test('el método de pago viaja con su id NUMÉRICO', () => {
  // Mandar la clave de texto ("sinpe_movil"), imitando la forma de Alegra,
  // devolvía 500: "invalid input syntax for type integer".
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  assert.match(fuente, /id: m\.id,\s*\n\s*clave: m\.clave/);
  assert.equal(/id: m\.clave, name: m\.nombre/.test(fuente), false);
});

test('el catálogo se baja ENTERO, no las primeras 20 páginas', () => {
  // El servidor corta en 100 por página aunque se le pidan 500: con 20
  // vueltas se cargaban 2.000 de 2.025 y los últimos 25 productos no
  // aparecían al facturar. Un catálogo incompleto no da error, solo un
  // producto que "no existe" cuando alguien lo busca.
  const fuente = fs.readFileSync(SERVICIO, 'utf8');
  assert.match(fuente, /MAXIMO_VUELTAS = 200/);
  assert.equal(/limite: 500/.test(fuente), false, 'pedir 500 no sirve: el servidor da 100');
});

test('mirar las facturas emitidas NO borra la venta en curso', () => {
  // Antes, cualquier pestaña que no fuera "nueva" caía en "editar" y llamaba
  // a limpiarFactura(): alguien armando una venta que iba a consultar un
  // documento viejo volvía y encontraba el mostrador vacío.
  const fuente = fs.readFileSync(HOOK_FACT, 'utf8');
  const bloque = fuente.slice(fuente.indexOf('const cambiarTab'), fuente.indexOf('const cambiarTab') + 700);
  assert.match(bloque, /if \(tab === 'facturas'\) \{\s*\n\s*setTabActiva\('facturas'\)\s*\n\s*return/);
});
