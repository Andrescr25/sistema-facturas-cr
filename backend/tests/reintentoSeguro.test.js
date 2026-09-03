/**
 * El reintento automático hacia Alegra no puede duplicar escrituras.
 *
 * EL BUG
 * requestWithRetry reintentaba CUALQUIER petición que fallara por red o
 * timeout, sin mirar si era lectura o escritura. Para un GET está bien. Para
 * un POST es peligroso: un timeout no significa que Alegra no hizo nada,
 * significa que no escuchamos la respuesta. Si Alegra creó la factura y tardó
 * en contestar, cada reintento creaba OTRA — hasta cuatro documentos fiscales
 * de un solo clic, con la anulación por nota de crédito que eso implica.
 *
 * Y no era solo facturas: createInventoryAdjustment tenía el mismo camino, o
 * sea que un ajuste podía aplicarse cuatro veces y descuadrar el stock.
 *
 * Esto importa el doble ahora que el catálogo del agente va a sincronizar
 * pedidos desde la calle, donde la señal intermitente es lo normal y no la
 * excepción.
 *
 * SE PRUEBA SIN RED
 * Se le pasa a requestWithRetry una función que falla como falla la vida
 * real —ETIMEDOUT, ECONNRESET, 503— y se cuenta cuántas veces la llamó.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Se apunta al módulo del cliente, NO al índice de la integración: ese
// levanta los servicios de dominio, que abren la base y escriben en consola
// al cargarse. Dentro de un worker de node:test esa salida rompe el canal
// por donde el runner lee los resultados ("Unable to deserialize cloned
// data") y el archivo entero cuenta como fallido sin que falle una prueba.
const cliente = require('../src/integrations/alegra/alegra.client').getInstance();

// La consulta silenciada: requestWithRetry escribe un aviso por cada intento
// no reintentado, y esta prueba provoca decenas a propósito. Ese torrente
// —con emojis, que son varios bytes— por el canal que node:test usa para
// devolverle los resultados al runner lo rompe con "Unable to deserialize
// cloned data", y el archivo entero cuenta como fallido sin que falle una
// sola prueba. Lo que se mide acá son los intentos, no lo que se imprime.
const consolaOriginal = { log: console.log, warn: console.warn, error: console.error };
before(() => { console.log = console.warn = console.error = () => {}; });
after(() => { Object.assign(console, consolaOriginal); });

/** Una petición que siempre falla del modo indicado, contando intentos. */
function fallaSiempre(comoFalla) {
  const estado = { intentos: 0 };
  const fn = async () => {
    estado.intentos++;
    const e = new Error(comoFalla.mensaje || 'falló');
    if (comoFalla.code) e.code = comoFalla.code;
    if (comoFalla.status) {
      e.response = { status: comoFalla.status, statusText: 'x', data: comoFalla.data || {} };
    }
    throw e;
  };
  return { fn, estado };
}

async function contarIntentos(comoFalla, metodo) {
  const { fn, estado } = fallaSiempre(comoFalla);
  // Reintentos y espera al mínimo: se mide cuántas veces se llama, no cuánto tarda.
  await cliente.requestWithRetry(fn, 2, 1, { metodo }).catch(() => {});
  return estado.intentos;
}

describe('reintento hacia Alegra: lectura vs escritura', () => {
  test('un GET que expira SÍ se reintenta', async () => {
    assert.equal(await contarIntentos({ code: 'ETIMEDOUT' }, 'GET'), 3);
  });

  test('un POST que expira NO se reintenta — ahí nacían las facturas duplicadas', async () => {
    assert.equal(await contarIntentos({ code: 'ETIMEDOUT' }, 'POST'), 1,
      'un timeout no dice que Alegra no la creó; reintentar la duplica');
  });

  test('un POST sin respuesta de red NO se reintenta', async () => {
    assert.equal(await contarIntentos({ code: 'ECONNRESET' }, 'POST'), 1);
  });

  test('un POST con 503 NO se reintenta: pudo ejecutarse detrás del proxy', async () => {
    assert.equal(await contarIntentos({ status: 503 }, 'POST'), 1);
  });

  test('un GET con 503 sí se reintenta', async () => {
    assert.equal(await contarIntentos({ status: 503 }, 'GET'), 3);
  });

  test('un 429 se reintenta incluso en POST: consta que no se procesó', async () => {
    // Es el único código que confirma que el servidor la rechazó sin ejecutarla.
    assert.equal(await contarIntentos({ status: 429 }, 'POST'), 3);
  });

  test('el límite de Alegra llega como 400 con code 429, y también se reintenta', async () => {
    // ESTO ES LO QUE PASABA DE VERDAD Y NO SE REINTENTABA NUNCA.
    // Alegra no contesta 429: contesta 400 con el 429 dentro del cuerpo. La
    // rama que miraba `status === 429` no se ejecutó ni una vez — en un solo
    // arranque del servidor se contaron 20 límites y 0 reintentos, y los
    // que llamaban veían un 400 pelado: la pantalla de cotizaciones se quedó
    // sin clientes y un barrido reportó 86 productos "inexistentes".
    const cuerpo = { code: 429, message: 'Too many requests' };
    assert.equal(await contarIntentos({ status: 400, data: cuerpo }, 'GET'), 3);
    assert.equal(await contarIntentos({ status: 400, data: cuerpo }, 'POST'), 3,
      'el límite confirma que no se procesó, así que reintentar no duplica');
  });

  test('un 400 de verdad —datos malos— sigue sin reintentarse', async () => {
    // El arreglo no puede convertir cualquier 400 en reintentable: mandar
    // cuatro veces una factura mal armada no la arregla.
    assert.equal(await contarIntentos({ status: 400, data: { code: 11034, message: 'item inválido' } }, 'GET'), 1);
    assert.equal(await contarIntentos({ status: 400, data: {} }, 'POST'), 1);
  });

  test('sin declarar método se asume escritura', async () => {
    // La suposición segura: equivocarse hacia "no reintento" cuesta un
    // reintento manual; hacia "reintento", una factura ante Hacienda.
    assert.equal(await contarIntentos({ code: 'ETIMEDOUT' }, undefined), 1);
  });

  test('PUT y DELETE tampoco se reintentan ante un timeout', async () => {
    assert.equal(await contarIntentos({ code: 'ETIMEDOUT' }, 'PUT'), 1);
    assert.equal(await contarIntentos({ code: 'ETIMEDOUT' }, 'DELETE'), 1);
  });
});

describe('todas las llamadas declaran su método', () => {
  const RAIZ = path.join(__dirname, '..', 'src');

  function archivosJs(dir) {
    const salida = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const c = path.join(dir, e.name);
      if (e.isDirectory()) salida.push(...archivosJs(c));
      else if (e.name.endsWith('.js')) salida.push(c);
    }
    return salida;
  }

  test('ninguna llamada a requestWithRetry omite el método', () => {
    const culpables = [];
    for (const archivo of archivosJs(RAIZ)) {
      const texto = fs.readFileSync(archivo, 'utf8');
      for (const m of texto.matchAll(/requestWithRetry\(/g)) {
        // La DEFINICIÓN del método no es una llamada: viene precedida de
        // `async `. Sin esta exclusión, la prueba se señalaba a sí misma.
        if (texto.slice(Math.max(0, m.index - 6), m.index) === 'async ') continue;
        // Se mira el bloque de la llamada, que puede ocupar varias líneas.
        const bloque = texto.slice(m.index, m.index + 700);
        const cierre = bloque.indexOf('\n\n');
        const trozo = cierre > 0 ? bloque.slice(0, cierre) : bloque;
        if (!/metodo:/.test(trozo)) {
          culpables.push(`${path.relative(RAIZ, archivo)}: ${trozo.split('\n')[0].trim().slice(0, 60)}`);
        }
      }
    }
    assert.deepEqual(culpables, [],
      'Sin declarar el método se asume escritura y se pierde el reintento de una\n' +
      'lectura, o peor: alguien lo agrega como lectura y vuelve el duplicado.\n  ' +
      culpables.join('\n  '));
  });
});

describe('cuánto se espera cuando Alegra corta por límite', () => {
  /** Un error con el cuerpo que manda Alegra. */
  const errorLimite = (headers) => ({
    response: { status: 400, data: { code: 429, message: 'Too many requests', headers } }
  });

  test('se respeta x-rate-limit-reset en vez del backoff', () => {
    // La ventana es por minuto: esperar menos de lo que Alegra pide es
    // gastar un intento en un fallo seguro.
    const r = cliente.limiteDePeticiones(errorLimite({ 'x-rate-limit-reset': 54 }));
    assert.equal(r.esLimite, true);
    assert.equal(r.esperaMs, 55000);
  });

  test('la espera se topa en un minuto', () => {
    assert.equal(cliente.limiteDePeticiones(errorLimite({ 'x-rate-limit-reset': 600 })).esperaMs, 60000);
  });

  test('sin cabecera de reset se cae al backoff normal', () => {
    const r = cliente.limiteDePeticiones(errorLimite(undefined));
    assert.equal(r.esLimite, true);
    assert.equal(r.esperaMs, 0, '0 significa "usá el backoff"');
  });

  test('un error que no es de límite no se confunde con uno', () => {
    assert.equal(cliente.limiteDePeticiones({ response: { status: 400, data: { code: 11034 } } }).esLimite, false);
    assert.equal(cliente.limiteDePeticiones({ code: 'ETIMEDOUT' }).esLimite, false);
  });

  test('si algún día Alegra manda un 429 de verdad, también cuenta', () => {
    assert.equal(cliente.limiteDePeticiones({ response: { status: 429, data: {} } }).esLimite, true);
  });
});
