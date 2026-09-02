/**
 * La búsqueda del catálogo del agente.
 *
 * POR QUÉ IMPORTA TANTO
 * El agente está de pie, con el cliente enfrente, y el cliente le dice un
 * código o media palabra. Cada segundo buscando en una lista mal ordenada es
 * un segundo de silencio incómodo delante del cliente.
 *
 * Antes era un `includes` sobre nombre o referencia y los resultados salían
 * alfabéticos por categoría: escribir la referencia exacta "167" devolvía
 * también "1670", "2167" y cualquier producto con 167 en el nombre, todos
 * mezclados. El que se buscaba podía quedar en el medio.
 *
 * Los casos de acá salen de productos reales del catálogo.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// El módulo es ESM y estas pruebas son CommonJS. En vez de convertir toda la
// suite, se lee el archivo, se le quitan los `export` y se evalúa pidiéndole
// que devuelva las tres funciones. Es explícito y no depende de reemplazos
// con expresiones regulares, que ya me habían dejado un archivo roto.
const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'buscarCatalogoAgente.js'), 'utf8');

const { normalizar, puntuar, buscarProductos } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { normalizar, puntuar, buscarProductos };`
)();

const CATALOGO = [
  { id: 1, name: 'PALO P/ ESCOBA', reference: { reference: '167' } },
  { id: 2, name: 'ESCOBA PLASTICA', reference: { reference: '1670' } },
  { id: 3, name: 'BOMBILLO LED 167 LUMENS', reference: { reference: '2455' } },
  { id: 4, name: 'CINTA MASKING 2167', reference: { reference: '900' } },
  { id: 5, name: 'ACEITE 20W-50 P/ MOTOR', reference: { reference: 'AC-20' } },
  { id: 6, name: 'ACEITE', reference: { reference: 'AC-01' } },
  { id: 7, name: 'ACEITE PARA MOTOR DIESEL 20 LITROS', reference: { reference: 'AC-99' } },
  { id: 8, name: 'CAÑA DE AZUCAR', reference: { reference: 'CA-1' } },
  { id: 9, name: 'DESGASTADO GAS', reference: { reference: 'X-1' } },
  { id: 10, name: 'GAS BUTANO', reference: { reference: 'GB-1' } },
];

const nombres = (t) => buscarProductos(CATALOGO, t).map(p => p.name);

describe('la referencia manda', () => {
  test('la referencia EXACTA sale primero', () => {
    // Es el caso que motivó todo: el cliente dicta un código.
    assert.equal(nombres('167')[0], 'PALO P/ ESCOBA');
  });

  test('una referencia que empieza igual va antes que una que solo la contiene', () => {
    const r = nombres('167');
    assert.ok(r.indexOf('ESCOBA PLASTICA') < r.indexOf('CINTA MASKING 2167'),
      'ref 1670 (empieza con 167) debe ir antes que ref 900 con 2167 en el nombre');
  });

  test('una referencia con letras también se encuentra', () => {
    assert.deepEqual(nombres('ac-20'), ['ACEITE 20W-50 P/ MOTOR']);
  });

  test('escribir solo dígitos no trae coincidencias por nombre de primeras', () => {
    // "500" no debe llenar la pantalla de productos que dicen "500ML".
    const cat = [
      { id: 1, name: 'CLORO 500ML', reference: { reference: '111' } },
      { id: 2, name: 'JABON', reference: { reference: '500' } },
    ];
    assert.equal(buscarProductos(cat, '500')[0].name, 'JABON');
  });
});

describe('búsqueda por nombre', () => {
  test('el nombre más corto va primero con el mismo parecido', () => {
    // Entre "ACEITE" y "ACEITE PARA MOTOR DIESEL 20 LITROS", casi siempre se
    // busca el primero.
    assert.equal(nombres('aceite')[0], 'ACEITE');
  });

  test('varias palabras, en cualquier orden', () => {
    const r = nombres('motor aceite');
    assert.ok(r.includes('ACEITE 20W-50 P/ MOTOR'),
      'debe encontrarlo aunque el orden no coincida con el del catálogo');
  });

  test('una palabra entera pesa más que encontrarla dentro de otra', () => {
    const r = nombres('gas');
    assert.ok(r.indexOf('GAS BUTANO') < r.indexOf('DESGASTADO GAS'));
  });

  test('lo que no coincide no aparece', () => {
    assert.deepEqual(nombres('zzzz'), []);
  });
});

describe('acentos y mayúsculas no estorban', () => {
  test('sin tilde encuentra lo que sí la tiene', () => {
    // El agente teclea rápido y en una tablet las tildes son un estorbo.
    assert.deepEqual(nombres('cana'), ['CAÑA DE AZUCAR']);
  });

  test('con tilde también', () => {
    assert.deepEqual(nombres('caña'), ['CAÑA DE AZUCAR']);
  });

  test('mayúsculas o minúsculas da igual', () => {
    assert.deepEqual(nombres('ACEITE').length, nombres('aceite').length);
  });

  test('normalizar devuelve texto recompuesto', () => {
    // Si devolviera la ñ como n + tilde suelta, comparar contra un texto
    // escrito normal fallaría sin que se vea la diferencia en pantalla.
    assert.equal(normalizar('CAÑA'), 'caña');
    assert.equal(normalizar('Café'), 'cafe');
  });
});

describe('detalles que no deben romperse', () => {
  test('sin término se devuelve el catálogo entero', () => {
    assert.equal(buscarProductos(CATALOGO, '').length, CATALOGO.length);
    assert.equal(buscarProductos(CATALOGO, '   ').length, CATALOGO.length);
  });

  test('un producto sin referencia no rompe', () => {
    const cat = [{ id: 1, name: 'SIN REFERENCIA' }];
    assert.doesNotThrow(() => buscarProductos(cat, 'sin'));
    assert.equal(buscarProductos(cat, 'sin').length, 1);
  });

  test('caracteres especiales no rompen la expresión regular', () => {
    // Alguien escribe "p/" o "(20)" y no debe explotar.
    for (const t of ['p/', '(20)', 'a+b', '[x]', '20w-50']) {
      assert.doesNotThrow(() => buscarProductos(CATALOGO, t), `falló con ${t}`);
    }
  });

  test('puntuar da 0 a lo que no coincide', () => {
    assert.equal(puntuar({ name: 'MARTILLO', reference: { reference: '1' } }, 'destornillador'), 0);
  });
});
