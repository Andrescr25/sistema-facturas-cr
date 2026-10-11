const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * La pantalla "Asignar clientes" de una ruta.
 *
 * QUÉ SE PIDIÓ (2026-10-11): «si yo toco una ruta y le doy asignar clientes
 * NO me redirija al portal de clientes sino que me traiga una lista de esos
 * clientes donde puedo darle click y poner un check para asignarlo».
 *
 * Las cuentas de la pantalla viven en utils/asignacionRuta.js, sin React, y
 * se prueban acá de verdad. Lo del servidor está en
 * rutasAsignarClientes.test.js, contra la base.
 *
 * LO QUE SE CUIDA
 *  - el botón ya no manda al directorio;
 *  - se busca por LUGAR, no solo por nombre (así conoce las rutas quien las arma);
 *  - una marca es un cambio que se deshace tocando otra vez, y nada se manda
 *    hasta guardar;
 *  - al servidor va el orden de los toques y de dónde se vio a cada cliente;
 *  - traer a alguien de OTRA ruta se confirma antes.
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const codigo = (...partes) => sinComentarios(fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8'));

let u;
before(async () => { u = await import('../../frontend/src/utils/asignacionRuta.js'); });

const RUTA = 3;
const libre = { id: 10, nombre: 'SUPER LA CENTRAL', ruta_id: null, canton: 'Orotina', distrito: 'Coyolar', otras_senas: 'Frente a la plaza' };
const deEsta = { id: 11, nombre: 'PULPERÍA EL CRUCE', ruta_id: 3, orden_ruta: 2, canton: 'Orotina', distrito: 'Orotina' };
const deOtra = { id: 12, nombre: 'ABASTECEDOR JIMÉNEZ', ruta_id: 7, ruta_nombre: 'Barranca', canton: 'Puntarenas', distrito: 'Barranca' };
const TODOS = [libre, deEsta, deOtra];

describe('dónde está cada cliente y cómo se lo encuentra', () => {
  test('sin ruta, en esta o en otra', () => {
    assert.equal(u.estadoDe(libre, RUTA), 'sin-ruta');
    assert.equal(u.estadoDe(deEsta, RUTA), 'esta');
    assert.equal(u.estadoDe(deOtra, RUTA), 'otra');
    // El id de la ruta llega como texto desde un <select> o una URL.
    assert.equal(u.estadoDe(deEsta, '3'), 'esta');
  });

  test('el lugar se lee como distrito y cantón, sin repetir el mismo nombre', () => {
    assert.equal(u.lugarDe(libre), 'Coyolar, Orotina');
    assert.equal(u.lugarDe(deEsta), 'Orotina', '"Orotina, Orotina" no dice dos cosas');
    assert.equal(u.lugarDe({ provincia: 'Alajuela' }), 'Alajuela');
    assert.equal(u.lugarDe({}), '');
  });

  test('se busca por nombre Y por lugar, sin acentos ni mayúsculas', () => {
    assert.equal(u.coincide(libre, 'orotina'), true, 'no encontró por cantón');
    assert.equal(u.coincide(libre, 'COYOLAR'), true, 'no encontró por distrito');
    assert.equal(u.coincide(libre, 'plaza'), true, 'no encontró por las señas');
    assert.equal(u.coincide(deEsta, 'pulperia'), true, 'el acento del nombre lo escondió');
    assert.equal(u.coincide(deOtra, 'jimenez barranca'), true, 'dos palabras: nombre y lugar');
    assert.equal(u.coincide(deOtra, 'jimenez orotina'), false);
    assert.equal(u.coincide(libre, '   '), true, 'sin texto, todos');
  });
});

describe('una marca es un cambio que se deshace tocando otra vez', () => {
  test('tocar marca; tocar de nuevo desmarca; el mapa original no se toca', () => {
    const vacio = new Map();
    const una = u.alternar(vacio, libre);
    assert.equal(vacio.size, 0, 'cambió el mapa que recibió: React no vería el cambio');
    assert.deepEqual([...una], [[10, null]]);
    assert.equal(u.alternar(una, libre).size, 0);
  });

  test('qué va a quedar en la ruta al guardar', () => {
    const marcas = u.alternar(u.alternar(new Map(), libre), deEsta);
    assert.equal(u.quedaEnRuta(marcas, libre, RUTA), true, 'el que se marcó para entrar');
    assert.equal(u.quedaEnRuta(marcas, deEsta, RUTA), false, 'el que se marcó para salir');
    assert.equal(u.quedaEnRuta(new Map(), deEsta, RUTA), true, 'sin tocar, el que ya estaba');
    assert.equal(u.quedaEnRuta(new Map(), deOtra, RUTA), false);
  });

  test('"marcar todos" marca a los que faltan y no desmarca lo ya decidido', () => {
    const salida = u.alternar(new Map(), deEsta);             // se va a sacar
    assert.equal(u.porMarcar(salida, TODOS, RUTA), 2);
    const marcas = u.marcarTodos(salida, TODOS, RUTA);
    assert.deepEqual([...marcas.keys()], [11, 10, 12]);
    assert.equal(u.quedaEnRuta(marcas, deEsta, RUTA), false, 'le deshizo la salida al que se iba a quitar');
    assert.equal(u.porMarcar(marcas, TODOS, RUTA), 0);
  });
});

describe('lo que se manda al servidor', () => {
  test('entran en el orden en que se tocaron, con la ruta en que se los vio', () => {
    let marcas = new Map();
    for (const c of [deOtra, libre]) marcas = u.alternar(marcas, c);
    const cambios = u.cambiosDe(marcas, TODOS, RUTA);
    assert.deepEqual(cambios.agregar, [{ clienteId: 12, desdeRutaId: 7 }, { clienteId: 10, desdeRutaId: null }]);
    assert.deepEqual(cambios.quitar, []);
    assert.equal(cambios.total, 2);
  });

  test('los que dejan OTRA ruta se separan, para avisarlo antes de guardar', () => {
    const marcas = u.alternar(u.alternar(new Map(), libre), deOtra);
    assert.deepEqual(u.cambiosDe(marcas, TODOS, RUTA).movidos.map(c => c.nombre), ['ABASTECEDOR JIMÉNEZ']);
  });

  test('desmarcar a uno de la ruta lo manda a quitar', () => {
    const cambios = u.cambiosDe(u.alternar(new Map(), deEsta), TODOS, RUTA);
    assert.deepEqual([cambios.agregar, cambios.quitar], [[], [11]]);
  });

  test('sin marcas no hay nada que guardar', () => {
    assert.equal(u.cambiosDe(new Map(), TODOS, RUTA).total, 0);
  });

  test('después de recargar quedan solo las marcas que siguen siendo ciertas', () => {
    let marcas = new Map();
    for (const c of TODOS) marcas = u.alternar(marcas, c);
    // Mientras tanto alguien puso al "libre" en otra ruta y borró la ficha 12.
    const ahora = [{ ...libre, ruta_id: 7 }, deEsta];
    assert.deepEqual([...u.marcasVigentes(marcas, ahora).keys()], [11]);
  });

  test('la barra y el aviso hablan en singular y en plural', () => {
    assert.equal(u.resumenDe({ agregar: [1], quitar: [] }), '1 se agrega');
    assert.equal(u.resumenDe({ agregar: [1, 2, 3], quitar: [4] }), '3 se agregan · 1 se quita');
    assert.equal(u.resumenDe({ agregar: [], quitar: [4, 5] }), '2 se quitan');
    assert.equal(u.hechoDe({ agregar: [1, 2], quitar: [4] }), '2 agregados · 1 quitado');
    assert.equal(u.hechoDe({ agregar: [1], quitar: [] }), '1 agregado');
  });
});

describe('cómo quedó conectada la pantalla', () => {
  test('"Asignar clientes" abre la lista dentro de Rutas: ya no manda al directorio', () => {
    const pagina = codigo('pages', 'Clientes.jsx');
    assert.doesNotMatch(pagina, /onAsignarClientes/, 'la página volvió a mandar al directorio de fichas');
    const vista = codigo('components', 'clientes', 'VistaRutas.jsx');
    assert.match(vista, /onClick=\{\(\) => setAsignando\(m\.ruta\)\}/);
    assert.match(vista, /if \(asignando\) return <AsignarClientesRuta/);
  });

  test('el servicio lee y guarda en las rutas nuevas del servidor', () => {
    const servicio = codigo('services', 'rutasService.js');
    assert.match(servicio, /candidatos: id => dato\(api\.get\(`\$\{base\}\/\$\{id\}\/asignacion`\)\)/);
    assert.match(servicio, /asignar: \(id, cambios\) => dato\(api\.put\(`\$\{base\}\/\$\{id\}\/clientes`, cambios\)\)/);
    const rutas = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'rutas', 'rutas.routes.js'), 'utf8');
    assert.match(rutas, /router\.get\('\/:id\/asignacion'/);
    assert.match(rutas, /router\.put\('\/:id\/clientes'/);
  });

  const pantalla = codigo('components', 'clientes', 'AsignarClientesRuta.jsx');

  test('nada se manda hasta tocar "Guardar cambios", y lo pendiente queda a la vista', () => {
    assert.equal((pantalla.match(/rutasService\.asignar\(/g) || []).length, 1, 'se guarda desde más de un lugar');
    assert.match(pantalla, /const guardar = async/);
    assert.match(pantalla, /cambios\.total > 0 && <div className="sticky bottom-4/);
    assert.match(pantalla, /Todavía no se guardó/);
  });

  test('traer a alguien de otra ruta se confirma antes, y salir con cambios también', () => {
    assert.match(pantalla, /if \(cambios\.movidos\.length > 0\)/);
    assert.match(pantalla, /title: 'Cambiar de ruta'/);
    assert.match(pantalla, /title: 'Salir sin guardar'/);
  });

  test('toda la tarjeta es el check: es un botón con su estado, no una casilla chica', () => {
    assert.match(pantalla, /<button type="button" data-cliente=\{c\.id\} aria-pressed=\{queda\}/);
    assert.doesNotMatch(pantalla, /type="checkbox"/);
  });

  test('abre en "Sin ruta", que es a quien hay que ubicar', () => {
    assert.match(pantalla, /useState\(\{ estado: 'sin-ruta', dias: 'todos' \}\)/);
  });
});
