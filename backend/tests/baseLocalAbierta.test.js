const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * La base local del navegador se abre sola cuando hace falta.
 *
 * EL ERROR. En el catálogo del agente, al volver la conexión:
 *
 *   TypeError: Cannot read properties of null (reading 'transaction')
 *     at IndexedDBService.getFacturasPendientes
 *     at FacturacionService.sincronizarFacturasPendientes
 *     at FacturacionService.handleOnline
 *
 * `facturacionService` se carga con la aplicación y escucha el evento
 * `online` en TODAS las pantallas; al dispararse intenta mandar las facturas
 * pendientes. Pero la base local solo la abría la pantalla de Facturación al
 * montarse, y cada método usaba `this.db` a secas. En cualquier otra pantalla
 * —y también después de que la base se cierra sola por un cambio de versión—
 * `this.db` era null: reventaba, y lo pendiente no se mandaba.
 *
 * Acá se carga el servicio de verdad con una IndexedDB de mentira (el archivo
 * es ESM con un import sin extensión: se le quitan las líneas de módulo y se
 * evalúa, como las demás pruebas de utilidades del frontend).
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const FUENTE = fs.readFileSync(path.join(FRONTEND, 'services', 'indexedDBService.js'), 'utf8');
const FACTURACION = fs.readFileSync(path.join(FRONTEND, 'services', 'facturacionService.js'), 'utf8');

/** Una IndexedDB con lo justo: abrir, leer y escribir por clave. */
function navegadorFalso({ noAbre = false, datos = {} } = {}) {
  const estado = { aperturas: 0, bases: [] };
  const almacenes = new Map(Object.entries(datos).map(([n, filas]) => [n, new Map(filas.map(f => [f.localId ?? f.id, f]))]));
  const de = (n) => { if (!almacenes.has(n)) almacenes.set(n, new Map()); return almacenes.get(n); };

  const pedido = (hacer) => {
    const req = {};
    setTimeout(() => {
      try { req.result = hacer(); req.onsuccess?.({ target: req }); }
      catch (e) { req.error = e; req.onerror?.({ target: req }); }
    }, 0);
    return req;
  };

  const abrirBase = () => {
    const db = {
      cerrada: false,
      close() { db.cerrada = true; },
      transaction() {
        if (db.cerrada) throw new Error('InvalidStateError: la conexión se cerró');
        const tx = {
          objectStore: (n) => ({
            getAll: () => pedido(() => [...de(n).values()]),
            get: (k) => pedido(() => de(n).get(k)),
            put: (v) => pedido(() => { de(n).set(v.localId ?? v.id, v); return v.id; }),
            delete: (k) => pedido(() => { de(n).delete(k); })
          })
        };
        setTimeout(() => tx.oncomplete?.(), 5);
        return tx;
      }
    };
    estado.bases.push(db);
    return db;
  };

  const indexedDB = {
    open() {
      estado.aperturas++;
      const req = {};
      setTimeout(() => {
        if (noAbre) { req.error = new Error('el navegador no deja abrir la base'); req.onerror?.(); return; }
        req.result = abrirBase();
        req.onsuccess?.();
      }, 0);
      return req;
    }
  };
  return { indexedDB, estado, de };
}

let copias;
before(async () => { copias = await import('../../frontend/src/utils/facturasLocales.js'); });

/** El servicio de verdad, recién creado, sobre ese navegador. */
function servicioSobre(navegador) {
  const cuerpo = FUENTE
    .replace(/^import .*$/gm, '')
    .replace(/^export default .*$/gm, '');
  const silencio = { log() {}, warn() {}, error() {} };
  const Clase = new Function('indexedDB', 'combinarCopiaFactura', 'convertirCopiaV3', 'console',
    `${cuerpo}\nreturn IndexedDBService;`)(navegador.indexedDB, copias.combinarCopiaFactura, copias.convertirCopiaV3, silencio);
  return new Clase();
}

const PENDIENTES = {
  facturas_pendientes: [
    { localId: 1, clienteId: 7, sincronizada: false },
    { localId: 2, clienteId: 9, sincronizada: true },
    { localId: 3, clienteId: 7, sincronizada: false }
  ]
};

describe('la base local se abre cuando alguien la necesita', () => {
  let navegador, servicio;
  beforeEach(() => { navegador = navegadorFalso({ datos: PENDIENTES }); servicio = servicioSobre(navegador); });

  test('pedir las facturas pendientes SIN haber pasado por Facturación ya no revienta', async () => {
    assert.equal(servicio.db, null, 'la prueba parte de la base sin abrir, como en el catálogo del agente');

    const pendientes = await servicio.getFacturasPendientes();

    assert.deepEqual(pendientes.map(f => f.localId), [1, 3]);
    assert.equal(navegador.estado.aperturas, 1);
  });

  test('dos que la piden a la vez la abren UNA sola vez', async () => {
    // Al volver la conexión se piden las facturas y las ediciones pendientes.
    const [facturas, ediciones] = await Promise.all([servicio.getFacturasPendientes(), servicio.getEdicionesPendientes()]);

    assert.equal(facturas.length, 2);
    assert.deepEqual(ediciones, []);
    assert.equal(navegador.estado.aperturas, 1);
  });

  test('si ya estaba abierta no se vuelve a abrir', async () => {
    await servicio.init();
    await servicio.getFacturasPendientes();
    await servicio.getFacturasPendientes();
    assert.equal(navegador.estado.aperturas, 1);
  });

  test('si la base se cierra sola por un cambio de versión, la próxima llamada la reabre', async () => {
    await servicio.getFacturasPendientes();
    // Otra pestaña abrió una versión nueva: el navegador avisa y esta conexión se cierra.
    navegador.estado.bases[0].onversionchange();
    assert.equal(servicio.db, null);

    const pendientes = await servicio.getFacturasPendientes();

    assert.equal(pendientes.length, 2);
    assert.equal(navegador.estado.aperturas, 2);
  });

  test('guardar una factura pendiente sin haber abierto la base también funciona', async () => {
    await servicio.updateFacturaPendiente(1, { claveIdempotencia: 'disp-x-f1' });
    assert.equal(navegador.de('facturas_pendientes').get(1).claveIdempotencia, 'disp-x-f1');
  });
});

describe('cuando el navegador no deja abrir la base', () => {
  let servicio;
  beforeEach(() => { servicio = servicioSobre(navegadorFalso({ noAbre: true })); });

  test('el error es el de la base, no "reading \'transaction\'"', async () => {
    await assert.rejects(() => servicio.getFacturasPendientes(), /no deja abrir la base/);
  });

  test('la copia de facturas no se guarda, pero no hace fallar la venta que ya se hizo', async () => {
    assert.equal(await servicio.saveFacturasCache([{ id: 5, numero: '001000014869' }]), 0);
    assert.equal(await servicio.deleteFacturaCache('5'), undefined);
  });

  test('las ediciones pendientes se dan por vacías', async () => {
    assert.deepEqual(await servicio.getEdicionesPendientes(), []);
  });

  test('un intento fallido no deja la apertura trabada para siempre', async () => {
    await assert.rejects(() => servicio.getFacturasPendientes());
    assert.equal(servicio.abriendo, null);
  });
});

describe('ningún método usa la conexión sin asegurarse de que esté abierta', () => {
  const codigo = sinComentarios(FUENTE);

  test('`this.db` solo se toca al abrir', () => {
    const lineas = codigo.split('\n');
    const fuera = [];
    let metodo = null;
    for (const l of lineas) {
      const m = l.match(/^  (?:async )?(\w+)\(.*\) \{$/);
      if (m) metodo = m[1];
      if (/this\.db\b/.test(l) && !['constructor', 'init', 'abierta'].includes(metodo)) fuera.push(`${metodo}: ${l.trim()}`);
    }
    assert.deepEqual(fuera, []);
  });

  test('cada método que abre una transacción pidió antes la base abierta', () => {
    const cuerpos = codigo.split(/\n  (?=async \w+\()/).slice(1);
    const sinPedir = cuerpos
      .filter(c => /\bdb\.transaction\(/.test(c) && !/await this\.abierta\(\)/.test(c))
      .map(c => c.slice(0, c.indexOf('(')));
    assert.deepEqual(sinPedir, []);
    assert.ok(cuerpos.filter(c => /\bdb\.transaction\(/.test(c)).length >= 25, 'no se reconocieron los métodos: cambió la forma del archivo');
  });
});

describe('al volver la conexión, desde cualquier pantalla', () => {
  const codigo = sinComentarios(FACTURACION);
  // Desde la definición hasta la siguiente (`handleOffline` también se nombra
  // antes, en el constructor: se busca a partir de acá).
  const desde = codigo.indexOf('async handleOnline()');
  const manejador = codigo.slice(desde, codigo.indexOf('handleOffline()', desde));

  test('sin sesión no se intenta mandar nada: las pendientes esperan intactas', () => {
    // El catálogo del agente se usa con la sesión vencida. Mandar igual solo
    // conseguía un 401 por factura.
    const sinSesion = manejador.indexOf('if (!this.haySesion())');
    assert.ok(sinSesion > 0, 'handleOnline ya no mira si hay sesión');
    assert.ok(sinSesion < manejador.indexOf('sincronizarFacturasPendientes'));
    assert.match(codigo, /haySesion\(\) \{\s*try \{\s*return Boolean\(localStorage\.getItem\(TOKEN_KEY\)\);/);
  });

  test('las facturas y las ediciones se mandan una después de la otra', () => {
    // Comparten `syncInProgress`: lanzadas juntas, la segunda encontraba la
    // bandera puesta y no hacía nada.
    assert.equal(/Promise\.all\(/.test(manejador), false);
    assert.match(manejador, /await sincronizar\(\)/);
    assert.ok(manejador.indexOf('sincronizarFacturasPendientes') < manejador.indexOf('sincronizarEdicionesPendientes'));
  });

  test('una sesión vencida a mitad del envío no le anota un error a ninguna factura ni edición', () => {
    for (const [desde, hasta, marca] of [
      ['async sincronizarFacturasPendientes()', 'async getFacturasPendientes()', 'markFacturaError'],
      ['async sincronizarEdicionesPendientes()', 'async getEdicionesPendientes()', 'markEdicionError(edicion.localId, motivo)']
    ]) {
      const cuerpo = codigo.slice(codigo.indexOf(desde), codigo.indexOf(hasta));
      const corte = cuerpo.indexOf('if (error?.response?.status === 401)');
      assert.ok(corte > 0, `${desde} ya no reconoce la sesión vencida`);
      assert.ok(corte < cuerpo.indexOf(marca, corte), `${desde}: se anota el error antes de mirar si fue la sesión`);
      assert.match(cuerpo.slice(corte, corte + 260), /resultados\.sinSesion = true;[\s\S]*break;/);
      assert.match(cuerpo, /sinSesion: Boolean\(resultados\.sinSesion\)/);
    }
  });
});
