const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * "Suele llevar" en Facturación.
 *
 * El agente tiene el pedido a medio armar y el cliente enfrente: es el único
 * momento en que preguntar "¿y la cuerda de albañil, no ocupa?" sirve de algo.
 * Después ya se fue.
 *
 * ES EL MISMO CÁLCULO QUE VE EL CLIENTE en su catálogo, a propósito: si fueran
 * dos cuentas distintas, el agente le ofrecería algo que el portal no le
 * muestra y la recomendación dejaría de ser creíble. Por eso se reusa
 * `obtenerInicio` en vez de escribirlo otra vez, y lo que se prueba acá es que
 * el camino de Facturación no lo desvirtúe.
 *
 * Y QUE SEA EL CLIENTE CORRECTO. Cuando las ventas pasaron a salir de las
 * facturas propias, el servidor empezó a esperar `cliente.id`; la pantalla
 * siguió mandando el id de Alegra. Los dos son números: no hubo error, y a
 * 216 de los 247 clientes se les mostró durante días lo que compra OTRO. El
 * bloque contra PostgreSQL arma justo ese cruce —un cliente cuyo id de Alegra
 * es el id propio de otro— para que no vuelva a pasar callado.
 */

const rutaInicio = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.inicio.service.js');
const rutaControlador = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaPropia.controller.js');
const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');

function respuesta() {
  const res = { estado: null, cuerpo: null };
  res.status = (c) => { res.estado = c; return res; };
  res.json = (b) => { res.cuerpo = b; return res; };
  return res;
}

function montar(resultado) {
  for (const r of [rutaInicio, rutaControlador]) delete require.cache[r];

  const visto = { llamadas: 0 };
  require.cache[rutaInicio] = {
    id: rutaInicio, filename: rutaInicio, loaded: true,
    exports: {
      obtenerInicio: async (clienteId, opciones) => {
        visto.llamadas++;
        visto.clienteId = clienteId;
        visto.opciones = opciones;
        if (resultado instanceof Error) throw resultado;
        return resultado;
      }
    }
  };

  return { controlador: require(rutaControlador), res: respuesta(), visto };
}

const DATOS = {
  habituales: [{ id: 462, nombre: 'YOYO DE PESCA NEGRO', veces: 22, dias: 3 }],
  perdidos: [{ id: 900, nombre: 'TABLA MARMELO', veces: 5, dias: 199 }],
  ocasionales: [{ id: 333, nombre: 'CINTA METRICA 5M', veces: 1, dias: 40 }],
  ofertas: [{ id: 111, nombre: 'UNA OFERTA' }]
};

describe('las sugerencias del cliente al facturarle', () => {
  after(() => { for (const r of [rutaInicio, rutaControlador]) delete require.cache[r]; });

  test('devuelve lo que compra seguido y lo que dejó de comprar', async () => {
    const { controlador, res } = montar(DATOS);
    await controlador.sugerencias({ params: { clienteId: '90' } }, res);

    assert.equal(res.cuerpo.data.habituales[0].nombre, 'YOYO DE PESCA NEGRO');
    assert.equal(res.cuerpo.data.perdidos[0].dias, 199);
  });

  test('devuelve también lo que llevó una sola vez este último año', async () => {
    const { controlador, res } = montar(DATOS);
    await controlador.sugerencias({ params: { clienteId: '90' } }, res);

    assert.equal(res.cuerpo.data.ocasionales[0].nombre, 'CINTA METRICA 5M');
  });

  test('pide la versión AMPLIADA; el portal no la pide', async () => {
    const { controlador, res, visto } = montar(DATOS);
    await controlador.sugerencias({ params: { clienteId: '90' } }, res);
    assert.deepEqual(visto.opciones, { ampliado: true });

    const portal = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.controller.js'), 'utf8');
    assert.match(portal, /inicio\.obtenerInicio\(req\.cliente\.clienteId\)/, 'el portal sigue sin pedir lo ampliado');
  });

  test('NO devuelve las ofertas: acá no vienen al caso', async () => {
    // El panel de Facturación es para recordarle al cliente lo que lleva, no
    // para vender lo que está rebajado.
    const { controlador, res } = montar(DATOS);
    await controlador.sugerencias({ params: { clienteId: '90' } }, res);

    assert.equal('ofertas' in res.cuerpo.data, false);
  });

  test('el cliente que se consulta es el de la ruta, como número', async () => {
    // En el portal sale del token porque un cliente no puede pedir la portada
    // de otro; acá quien factura es del personal y le cobra a ese cliente.
    const { controlador, res, visto } = montar(DATOS);
    await controlador.sugerencias({ params: { clienteId: '1234' } }, res);

    assert.equal(visto.clienteId, 1234);
  });

  test('si falla NO se cae la facturación: se responde vacío', async () => {
    // Una sugerencia que no cargó no puede impedir cobrar.
    const { controlador, res } = montar(new Error('la base dijo que no'));
    await controlador.sugerencias({ params: { clienteId: '90' } }, res);

    assert.deepEqual(res.cuerpo.data, { habituales: [], perdidos: [], ocasionales: [] });
    assert.notEqual(res.estado, 500);
  });

  test('un cliente sin historial devuelve listas vacías, no un error', async () => {
    const { controlador, res } = montar({ habituales: [], perdidos: [], ofertas: [] });
    await controlador.sugerencias({ params: { clienteId: '77' } }, res);

    assert.deepEqual(res.cuerpo.data, { habituales: [], perdidos: [], ocasionales: [] });
  });

  test('lo que no es un id (un cliente creado sin señal, "undefined") ni se consulta', async () => {
    for (const clienteId of ['local-17', 'undefined', 'null', '0', '-4', '12.5', '']) {
      const { controlador, res, visto } = montar(DATOS);
      await controlador.sugerencias({ params: { clienteId } }, res);

      assert.equal(visto.llamadas, 0, `se consultó con "${clienteId}"`);
      assert.deepEqual(res.cuerpo.data, { habituales: [], perdidos: [], ocasionales: [] });
    }
  });
});

describe('las sugerencias salen del cliente correcto — contra PostgreSQL local', () => {
  let pool, conexion, controlador;
  let clienteA, productoX, productoY, productoZ;

  // El cruce que pasó de verdad: el id de Alegra de A es el id PROPIO de B.
  const ID_DE_B = 900000001;

  const pedir = async (clienteId) => {
    const res = respuesta();
    await controlador.sugerencias({ params: { clienteId: String(clienteId) } }, res);
    return res.cuerpo.data;
  };

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    // Todo lo de `src` se vuelve a cargar: cada módulo se quedó con el `query`
    // que había cuando se requirió, y tiene que ser el de esta transacción.
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'sug') };
    controlador = require(rutaControlador);

    await conexion.query(`INSERT INTO cliente (id, nombre) VALUES ($1, 'zz-cliente B, el del número cruzado')`, [ID_DE_B]);
    clienteA = (await conexion.query(
      `INSERT INTO cliente (nombre, alegra_id) VALUES ('zz-cliente A', $1) RETURNING id`, [String(ID_DE_B)])).rows[0].id;

    const producto = async (nombre, referencia) => (await conexion.query(
      `INSERT INTO producto (nombre, referencia, alegra_id, precio_sin_iva) VALUES ($1, $2, $3, 1000) RETURNING id`,
      [nombre, referencia, `zz-alegra-${referencia}`])).rows[0].id;
    productoX = await producto('zz-lo que A lleva seguido', 'ZZ-SUG-X');
    productoY = await producto('zz-lo que lleva B', 'ZZ-SUG-Y');
    productoZ = await producto('zz-lo que A dejó de llevar', 'ZZ-SUG-Z');

    const venta = async (clienteId, productoId, diasAtras, estado = 'emitida') => {
      const facturaId = (await conexion.query(
        `INSERT INTO factura (cliente_id, cliente_nombre, fecha, estado)
         VALUES ($1, 'zz-venta de prueba', CURRENT_DATE - $2::int, $3) RETURNING id`,
        [clienteId, diasAtras, estado])).rows[0].id;
      await conexion.query(
        `INSERT INTO factura_linea (factura_id, numero_linea, producto_id, nombre, cantidad, precio_unitario, total)
         VALUES ($1, 1, $2, 'zz-línea', 1, 1000, 1130)`, [facturaId, productoId]);
    };

    for (const dias of [2, 9]) await venta(clienteA, productoX, dias);           // habitual de A
    for (const dias of [100, 130, 160]) await venta(clienteA, productoZ, dias);  // perdido de A
    for (const dias of [1, 5]) await venta(ID_DE_B, productoY, dias);            // habitual de B
    // Una anulada no es una venta: sola, no vuelve "habitual" a nada.
    await venta(clienteA, productoY, 3, 'anulada');
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('con el id propio de A vuelve lo de A, con ids PROPIOS de producto', async () => {
    const { habituales, perdidos } = await pedir(clienteA);

    assert.deepEqual(habituales.map(p => p.id), [productoX]);
    assert.equal(habituales[0].veces, 2);
    assert.deepEqual(perdidos.map(p => p.id), [productoZ]);
    assert.equal(perdidos[0].veces, 3);
    assert.ok(perdidos[0].dias >= 100);
  });

  test('lo que compra B no aparece al facturarle a A', async () => {
    const { habituales, perdidos } = await pedir(clienteA);
    const ids = [...habituales, ...perdidos].map(p => p.id);

    assert.equal(ids.includes(productoY), false);
  });

  test('con el id de ALEGRA de A el servidor contesta lo de B, sin error: por eso la pantalla no lo manda', async () => {
    // No es un comportamiento deseado, es la trampa: el servidor no puede
    // saber de qué clase es un número. Quien llama tiene que mandar el propio.
    const { habituales } = await pedir(ID_DE_B);

    assert.deepEqual(habituales.map(p => p.id), [productoY]);
  });
});

describe('la pantalla pide y muestra en ids propios', () => {
  const leer = (...partes) => fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8');
  const utiles = () => import('../../frontend/src/utils/facturacionUtils.js');

  test('el id con que se pide es `cliente.id`, nunca `alegraId`', async () => {
    const { idPropioDelCliente } = await utiles();

    assert.equal(idPropioDelCliente({ id: 186, clienteId: 186, alegraId: '80' }), 186);
    assert.equal(idPropioDelCliente({ id: '186', alegraId: '80' }), 186);
  });

  test('sin id propio no hay id: no se cae al de Alegra', async () => {
    const { idPropioDelCliente } = await utiles();

    for (const cliente of [null, undefined, {}, { alegraId: '80' }, { id: 'local-3', alegraId: '80' }, { id: 0 }]) {
      assert.equal(idPropioDelCliente(cliente), null);
    }
  });

  test('una sugerencia conserva su id: el 12 propio no pasa a ser el producto cuyo id de Alegra es 12', async () => {
    const { sugerenciasDelCatalogo } = await utiles();
    const productos = [
      { id: 12, alegraId: '900', name: 'CUERDA DE ALBAÑIL' },
      { id: 55, alegraId: '12', name: 'OTRO PRODUCTO' }
    ];
    const r = sugerenciasDelCatalogo({ habituales: [{ id: 12, nombre: 'CUERDA DE ALBAÑIL' }], perdidos: [] }, productos);

    assert.deepEqual(r.habituales.map(s => s.id), [12]);
  });

  test('la que no está en el catálogo de la tablet no se muestra: no se podría agregar', async () => {
    const { sugerenciasDelCatalogo } = await utiles();
    const r = sugerenciasDelCatalogo(
      { habituales: [{ id: 12 }, { id: 99 }], perdidos: [{ id: '12' }, { id: 7 }], ocasionales: [{ id: 12 }, { id: 5 }] },
      [{ id: 12 }]
    );

    assert.deepEqual(r.habituales.map(s => s.id), [12]);
    assert.deepEqual(r.perdidos.map(s => s.id), ['12']);
    assert.deepEqual(r.ocasionales.map(s => s.id), [12]);
  });

  test('sin sugerencias o sin catálogo devuelve listas vacías', async () => {
    const { sugerenciasDelCatalogo } = await utiles();

    const vacio = { habituales: [], perdidos: [], ocasionales: [] };
    assert.deepEqual(sugerenciasDelCatalogo(undefined, undefined), vacio);
    assert.deepEqual(sugerenciasDelCatalogo({ habituales: [{ id: 1 }] }, []), vacio);
  });

  test('el hook usa esas dos funciones y ya no mira `alegraId`', () => {
    const hook = leer('hooks', 'useFacturacion.js');

    assert.match(hook, /const clienteIdSugerencias = idPropioDelCliente\(clienteSeleccionado\)/);
    assert.match(hook, /getSugerenciasCliente\(clienteIdSugerencias\)/);
    assert.match(hook, /sugerenciasDelCatalogo\(sugerencias, productos\)/);
    assert.equal(/alegraId/.test(hook), false, 'el hook de Facturación volvió a usar un id de Alegra');
  });

  test('la ruta del servidor nombra de quién es el id', () => {
    const rutas = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturacion.routes.js'), 'utf8');

    assert.match(rutas, /router\.get\('\/clientes\/:clienteId\/sugerencias', facturaPropia\.sugerencias\)/);
    assert.equal(/alegraContactId/.test(rutas), false);
  });
});
