/**
 * Reporte de Clientes: buscar por producto y que los filtros no se pierdan
 * (pedido del usuario, 2026-10-01).
 *
 *  - "Busco X producto y me salen los clientes con ese producto": por nombre
 *    o código, sin mayúsculas ni tildes, cada palabra en cualquier orden.
 *  - "Si me devuelvo a ver otro cliente, los filtros se mantienen": vivían
 *    adentro de la lista, que se desmonta al entrar a un cliente.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
let u;
const cargar = async () => { u = u || await import('../../frontend/src/utils/reporteClientesUtils.js'); return u; };

const producto = (nombre, codigo, cantidad, proveedor = 'PROVEEDOR A') =>
  ({ nombre, codigo, cantidad_faltante: cantidad, proveedor_asignado: proveedor });
const cliente = (nombre, ...facturas) => ({
  nombre,
  facturas_con_faltantes: facturas.map((productos, i) => ({ numero_factura: `F${i}`, productos_faltantes: productos }))
});

const CLIENTES = [
  cliente('SUPER EL BARREAL',
    [producto('TUBO PVC 1/2 SCH40', 'PVC12', 3), producto('JABÓN EN POLVO MI HOGAR', 'JAB3', 2, 'PROVEEDOR B')],
    [producto('TUBO PVC 1/2 SCH40', 'PVC12', 4)]),
  cliente('FERRETERIA SUAREZ', [producto('CODO PVC 1/2 X 90', 'COD12', 5)]),
  cliente('BAZAR MARY RINCON', [producto('TUBO PVC 1/2 SCH40', 'PVC12', 0)])
];
const nombres = (lista) => lista.map((c) => c.nombre);

describe('buscar por producto', () => {
  test('salen los clientes que tienen ese producto entre sus faltantes', async () => {
    const { filtrarClientes, FILTROS_VACIOS } = await cargar();
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, producto: 'tubo pvc' })), ['SUPER EL BARREAL'],
      'BAZAR lo tiene en 0: ya no le falta');
  });

  test('por código, sin mayúsculas ni tildes, y las palabras en cualquier orden', async () => {
    const { filtrarClientes, FILTROS_VACIOS } = await cargar();
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, producto: 'cod12' })), ['FERRETERIA SUAREZ']);
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, producto: 'jabon' })), ['SUPER EL BARREAL']);
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, producto: '1/2 pvc' })), ['SUPER EL BARREAL', 'FERRETERIA SUAREZ']);
  });

  test('la tarjeta dice cuánto le falta de cada producto, sumando sus facturas', async () => {
    const { productosQueCoinciden } = await cargar();
    assert.deepEqual(productosQueCoinciden(CLIENTES[0], 'tubo'), [{ nombre: 'TUBO PVC 1/2 SCH40', codigo: 'PVC12', cantidad: 7 }]);
    assert.deepEqual(productosQueCoinciden(CLIENTES[0], '   '), [], 'sin búsqueda no hay coincidencias');
  });
});

describe('los filtros se combinan', () => {
  test('cliente, producto y proveedor a la vez', async () => {
    const { filtrarClientes, FILTROS_VACIOS } = await cargar();
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, producto: 'pvc', proveedores: ['PROVEEDOR B'] })), ['SUPER EL BARREAL']);
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, cliente: 'suárez', producto: 'pvc' })), ['FERRETERIA SUAREZ']);
    assert.deepEqual(nombres(filtrarClientes(CLIENTES, { ...FILTROS_VACIOS, cliente: 'bazar', producto: 'pvc' })), []);
    assert.equal(filtrarClientes(CLIENTES, FILTROS_VACIOS).length, 3, 'sin filtros salen todos');
  });

  test('hayFiltros ve cualquiera de los tres', async () => {
    const { hayFiltros, FILTROS_VACIOS } = await cargar();
    assert.equal(hayFiltros(FILTROS_VACIOS), false);
    assert.equal(hayFiltros({ ...FILTROS_VACIOS, producto: 'x' }), true);
    assert.equal(hayFiltros({ ...FILTROS_VACIOS, cliente: '  ' }), false);
    assert.equal(hayFiltros({ ...FILTROS_VACIOS, proveedores: ['A'] }), true);
  });
});

describe('al volver de un cliente, los filtros siguen', () => {
  test('la lista no guarda los filtros: los recibe de la página', () => {
    const lista = fs.readFileSync(path.join(FRONT, 'components', 'reporte-clientes', 'ListaClientes.jsx'), 'utf8');
    assert.doesNotMatch(lista, /useState\(''\)|useState\(new Set\(\)\)/, 'un filtro con estado propio se pierde al desmontarse la lista');
    assert.match(lista, /filtros, onFiltrosChange/);
  });

  test('la página, que no se desmonta, los guarda y se los pasa', () => {
    const pagina = fs.readFileSync(path.join(FRONT, 'pages', 'ReporteClientes.jsx'), 'utf8');
    assert.match(pagina, /const \[filtros, setFiltros\] = useState\(FILTROS_VACIOS\)/);
    assert.match(pagina, /filtros=\{filtros\}/);
    assert.match(pagina, /onFiltrosChange=\{setFiltros\}/);
  });
});
