const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');
const { primerLibre, numeroValido, TIPOS, USADOS_TOLERADOS } = require('../src/integrations/hacienda/numeracion');

/**
 * Con qué número sale el próximo comprobante electrónico.
 *
 * EL CASO (2026-10-11). La serie de facturas electrónicas de Alegra iba por
 * el 2480, pero Alegra dejó dos con los números 4902 y 4946 (nacieron como
 * tiquete). La regla era "el mayor que exista + 1", así que la primera
 * factura propia salió con el 4947. El usuario decidió, textual: «empieza la
 * factura electrónica con 2481». Con esa regla no se podía: todo número
 * menor al máximo se ignoraba.
 *
 * La regla nueva: manda el numerador, y un número ya usado se salta. Acá va
 * lo que no necesita la base; lo demás, en haciendaNumeracionPg.test.js.
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const codigo = (...partes) => sinComentarios(fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8'));
const servidor = (...partes) => sinComentarios(fs.readFileSync(path.join(__dirname, '..', 'src', 'integrations', 'hacienda', ...partes), 'utf8'));

let u;
before(async () => { u = await import('../../frontend/src/utils/numeracionTexto.js'); });

describe('el primer número libre', () => {
  const USADOS = ['4902', '4946', '4947'];   // como llegan de la base: texto

  test('sigue desde donde dice el numerador aunque más adelante haya usados', () => {
    assert.equal(primerLibre('2481', USADOS), 2481n, 'un número suelto de más adelante arrastró la serie');
    assert.equal(primerLibre(2482n, USADOS), 2482n);
  });

  test('al llegar a un usado lo salta, y salta también los que vengan pegados', () => {
    assert.equal(primerLibre('4902', USADOS), 4903n);
    assert.equal(primerLibre('4946', USADOS), 4948n, 'repitió el 4947, que ya fue aceptado por Hacienda');
    assert.equal(primerLibre('4947', USADOS), 4948n);
    assert.equal(primerLibre('4948', USADOS), 4948n);
  });

  test('no depende del orden ni de cómo vengan escritos los usados', () => {
    assert.equal(primerLibre(10, [12n, '11', 10]), 13n);
    assert.equal(primerLibre('10', []), 10n);
    assert.equal(primerLibre('10', undefined), 10n);
  });
});

describe('lo que se puede escribir como número', () => {
  test('un entero de hasta diez dígitos, con o sin espacios alrededor', () => {
    assert.equal(numeroValido('2481'), 2481n);
    assert.equal(numeroValido(' 2481 '), 2481n);
    assert.equal(numeroValido(2481), 2481n);
    assert.equal(numeroValido('9999999998'), 9999999998n);
  });

  test('nada que no sea eso', () => {
    for (const valor of ['', ' ', '0', '-5', '2.481', '2,481', '2481a', '1e3', '9999999999', '12345678901', null, undefined, {}, []]) {
      assert.throws(() => numeroValido(valor), (e) => e.code === 'NUMERO_INVALIDO', `aceptó ${JSON.stringify(valor)}`);
    }
  });

  test('se numeran desde acá factura, tiquete, nota de crédito y aceptación de compra, en ese orden', () => {
    // El 05 (2026-10-12): las compras se aceptan solas y su numeración es
    // propia. Si antes se aceptaban desde otro sistema, acá se dice dónde seguir.
    assert.deepEqual(Object.keys(TIPOS), ['01', '04', '03', '05']);
    assert.equal(TIPOS['05'], 'Aceptación de compra');
    assert.ok(USADOS_TOLERADOS >= 3, 'los tres sueltos de producción (4902, 4946, 4947) tienen que poder saltarse');
  });
});

describe('lo que dice la pantalla', () => {
  test('los usados de más adelante se nombran, para que el salto no sorprenda', () => {
    assert.equal(u.avisoDeUsados({ usadosAdelante: 0, primerosUsados: [] }), '');
    assert.equal(u.avisoDeUsados({ usadosAdelante: 1, primerosUsados: ['4902'] }), 'El 4902 ya está usado: se salta solo.');
    assert.equal(
      u.avisoDeUsados({ usadosAdelante: 3, primerosUsados: ['4902', '4946', '4947'] }),
      'Ya usados más adelante: 4902, 4946 y 4947. Se saltan solos.'
    );
    assert.equal(
      u.avisoDeUsados({ usadosAdelante: 8, primerosUsados: ['11', '12', '13', '14', '15'] }),
      'Ya usados más adelante: 11, 12, 13, 14, 15 y 3 más. Se saltan solos.'
    );
    assert.equal(u.avisoDeUsados(), '');
  });

  test('el campo avisa antes de mandar algo que el servidor va a rechazar', () => {
    assert.equal(u.numeroEscrito('2481', '4948'), '');
    assert.equal(u.numeroEscrito(' 2481 ', '4948'), '');
    assert.match(u.numeroEscrito('', '4948'), /Escribí el número/);
    assert.match(u.numeroEscrito('2.481', '4948'), /sin puntos ni letras/);
    assert.match(u.numeroEscrito('0', '4948'), /sin puntos ni letras/);
    assert.match(u.numeroEscrito('4948', '4948'), /ya es el próximo/);
    assert.match(u.numeroEscrito('004948', '4948'), /ya es el próximo/);
  });
});

describe('cómo quedó conectado', () => {
  test('emitir pide el número a numeracion.js, y ahí ya no manda "el mayor + 1"', () => {
    const emision = servidor('emision.service.js');
    assert.match(emision, /const numerar = \(db, c, tipo\) => numeracion\.reservar\(db, c, tipo\)/);
    assert.doesNotMatch(emision, /GREATEST\(/, 'la regla vieja volvió al servicio de emisión');

    const numeracion = servidor('numeracion.js');
    const reservar = numeracion.slice(numeracion.indexOf('async function reservar'), numeracion.indexOf('async function ambienteParaNumerar'));
    assert.match(reservar, /primerLibre\(fila\.siguiente, await usados\(db, s, fila\.siguiente\)\)/);
    // "El mayor + 1" solo sirve para arrancar una serie que no tiene numerador.
    assert.match(reservar, /if \(!fila\) \{[\s\S]*await inicio\(db, s\)/);
    assert.doesNotMatch(reservar, /GREATEST\(/);
    // Bloquea el numerador: dos reservas a la vez no reciben el mismo número.
    assert.match(reservar, /FOR UPDATE/);
  });

  test('cambiarlo pide el módulo Configuración, corre en una transacción y queda en la bitácora', () => {
    const rutas = servidor('rutas.js');
    assert.match(rutas, /configuracion\.get\(\s*"\/:ambiente\/numeracion"/);
    assert.match(rutas, /configuracion\.put\(\s*"\/:ambiente\/numeracion"/);
    assert.match(rutas, /enTransaccion\(pool, \(db\) =>\s*numeracion\.fijar\(db, req\.params\.ambiente, req\.body \|\| \{\}, req\.usuario\?\.id\)/);
    const servidorJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(servidorJs, /app\.use\('\/api\/configuracion\/hacienda', haciendaModule\.configuracion\)/);
    assert.match(servidor('numeracion.js'), /entidad: "hacienda_numerador"/);
  });

  test('Configuración → Hacienda muestra la numeración del ambiente elegido', () => {
    const pantalla = codigo('integrations', 'hacienda', 'ConfiguracionHacienda.jsx');
    assert.match(pantalla, /<NumeracionHacienda key=\{`\$\{ambiente\}-\$\{estado\.revision\}`\} ambiente=\{ambiente\} \/>/);
    // El bloque dibuja; hablar con el servidor es del gancho.
    const bloque = codigo('components', 'configuracion', 'NumeracionHacienda.jsx');
    assert.match(bloque, /Hacienda rechaza un número repetido/);
    assert.match(bloque, /useNumeracionHacienda\(ambiente\)/);
    assert.doesNotMatch(bloque, /integrations\/hacienda\/api/, 'el bloque volvió a llamar al servidor por su cuenta');
    assert.match(codigo('hooks', 'useNumeracionHacienda.js'), /fijarNumeracion\(ambiente, t\.tipo, numero\)/);
    const api = codigo('integrations', 'hacienda', 'api.js');
    assert.match(api, /api\.get\(`\/configuracion\/hacienda\/\$\{ambiente\}\/numeracion`\)/);
    assert.match(api, /api\.put\(`\/configuracion\/hacienda\/\$\{ambiente\}\/numeracion`, \{ tipo, siguiente \}\)/);
  });
});
