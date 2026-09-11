const test = require('node:test');
const assert = require('node:assert');
const { clienteDesdeAlegra, proveedorDesdeAlegra, esCliente, esProveedor } = require('../src/modules/clientes/desdeAlegra');

/**
 * Traducción de contactos de Alegra a clientes y proveedores propios.
 * El caso base tiene la forma de GET /contacts (con datos inventados).
 */

const CONTACTO = {
  id: '90',
  name: '  PULPERÍA LA ESQUINA  ',
  identification: '3-101-123456',
  identificationObject: { type: 'CJ', number: '3-101-123456' },
  phonePrimary: '2453-1234',
  phoneSecondary: null,
  mobile: '8827 2453',
  email: 'Pulperia@Correo.com',
  emailSecondary: null,
  status: 'active',
  type: ['client'],
  address: { department: 'Alajuela', city: 'Palmares', district: 'Zaragoza', neighborhood: null, address: '100 m norte de la iglesia' },
  term: { id: '3', name: '15 días', days: '15' },
  creditLimit: 250000,
  observations: 'Entregar antes de las 10',
  exoneration: {},
  economicActivity: '523402'
};
const contexto = { plazos: new Map([['1', 11], ['3', 13]]) };

test('el caso completo: identificación limpia, dirección repartida, plazo propio', () => {
  const { fila, avisos } = clienteDesdeAlegra(CONTACTO, contexto);
  assert.equal(fila.nombre, 'PULPERÍA LA ESQUINA');
  assert.equal(fila.tipo_identificacion, 'CJ');
  assert.equal(fila.identificacion, '3101123456');
  assert.equal(fila.correo, 'pulperia@correo.com');
  assert.deepEqual([fila.provincia, fila.canton, fila.distrito], ['Alajuela', 'Palmares', 'Zaragoza']);
  assert.equal(fila.plazo_credito_id, 13);
  assert.equal(fila.limite_credito, 250000);
  assert.equal(fila.exoneracion, null, 'una exoneración vacía no es una exoneración');
  assert.equal(fila.actividad_economica, '523402');
  assert.equal(fila.alegra_id, '90');
  assert.deepEqual(avisos, []);
});

test('los teléfonos se guardan como vienen, sin "limpiarlos" en silencio', () => {
  const { fila } = clienteDesdeAlegra({ ...CONTACTO, phonePrimary: '8827-2453 doña María' }, contexto);
  assert.equal(fila.telefono, '8827-2453 doña María');
});

test('sin teléfono usable se avisa (misma regla que WhatsApp)', () => {
  const { avisos } = clienteDesdeAlegra({ ...CONTACTO, phonePrimary: 'no tiene', mobile: null }, contexto);
  assert.ok(avisos.includes('sin_telefono_usable'));
});

test('varios correos en un campo se separan; los inválidos se avisan', () => {
  const { fila, avisos } = clienteDesdeAlegra({ ...CONTACTO, email: 'a@x.cr; b@x.cr', emailSecondary: 'esto no es correo' }, contexto);
  assert.equal(fila.correo, 'a@x.cr');
  assert.deepEqual(fila.correos_adicionales, ['b@x.cr']);
  assert.ok(avisos.includes('correo_invalido'));
});

test('sin correo, sin identificación y sin actividad quedan vacíos con aviso', () => {
  const { fila, avisos } = clienteDesdeAlegra({ ...CONTACTO, email: null, identification: null, identificationObject: null, economicActivity: null }, contexto);
  assert.equal(fila.correo, null);
  assert.equal(fila.identificacion, null);
  assert.equal(fila.actividad_economica, null);
  for (const a of ['sin_correo', 'sin_identificacion', 'sin_actividad_economica']) assert.ok(avisos.includes(a), a);
});

test('una cédula física que no tiene 9 dígitos se carga pero se avisa', () => {
  const { fila, avisos } = clienteDesdeAlegra({ ...CONTACTO, identificationObject: { type: 'CF', number: '20405047' } }, contexto);
  assert.equal(fila.identificacion, '20405047');
  assert.ok(avisos.includes('identificacion_no_calza_con_su_tipo'));
});

test('tipos de Alegra: pasaporte y no contribuyente se traducen; uno desconocido no se inventa', () => {
  assert.equal(clienteDesdeAlegra({ ...CONTACTO, identificationObject: { type: 'PE', number: 'A1234567' } }, contexto).fila.tipo_identificacion, 'EXTRANJERO');
  assert.equal(clienteDesdeAlegra({ ...CONTACTO, identificationObject: { type: 'NC', number: '1' } }, contexto).fila.tipo_identificacion, 'NO_CONTRIBUYENTE');
  const raro = clienteDesdeAlegra({ ...CONTACTO, identificationObject: { type: 'COF', number: '123' } }, contexto);
  assert.equal(raro.fila.tipo_identificacion, null);
  assert.ok(raro.avisos.includes('tipo_identificacion_desconocido'));
});

test('un plazo que no existe en la tabla propia queda vacío', () => {
  assert.equal(clienteDesdeAlegra({ ...CONTACTO, term: { id: '99' } }, contexto).fila.plazo_credito_id, null);
});

test('la actividad puede venir como objeto', () => {
  assert.equal(clienteDesdeAlegra({ ...CONTACTO, economicActivity: { code: '523402', name: 'x' } }, contexto).fila.actividad_economica, '523402');
});

test('inactivo en Alegra, inactivo acá', () => {
  assert.equal(clienteDesdeAlegra({ ...CONTACTO, status: 'inactive' }, contexto).fila.activo, false);
});

test('proveedor: lo suyo, con el teléfono principal o el celular', () => {
  const p = proveedorDesdeAlegra({ ...CONTACTO, type: ['provider'], phonePrimary: null }, contexto);
  assert.equal(p.fila.identificacion, '3101123456');
  assert.equal(p.fila.telefono, '8827 2453');
  assert.equal('provincia' in p.fila, false);
});

test('un contacto puede ser cliente y proveedor a la vez', () => {
  const ambos = { ...CONTACTO, type: ['client', 'provider'] };
  assert.equal(esCliente(ambos), true);
  assert.equal(esProveedor(ambos), true);
});

test('sin id o nombre no se carga a medias', () => {
  assert.throws(() => clienteDesdeAlegra({ name: 'x' }, contexto), /sin id o nombre/);
  assert.throws(() => clienteDesdeAlegra({ id: 1, name: '   ' }, contexto), /sin id o nombre/);
});
