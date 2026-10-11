/**
 * Asignar clientes a una ruta de una vez — contra la base local de la rama.
 *
 * QUÉ SE PIDIÓ (2026-10-11). Un empleado que se sabe las rutas las va a
 * asignar. El botón "Asignar clientes" mandaba al directorio filtrado por
 * "sin ruta" y había que abrir la ficha de cada uno: con 248 clientes sin
 * ruta, 248 fichas. Ahora la ruta trae la lista de todos, se marcan los que
 * van y se guarda una vez.
 *
 * LO QUE SE CUIDA
 *  - los que entran van al final, en el orden en que se marcaron, y los que
 *    ya estaban no pierden su lugar;
 *  - sacar o mover un cliente deja compacto el recorrido que abandona
 *    (1, 2, 3… sin huecos: hay una restricción UNIQUE sobre ruta + orden);
 *  - una lista abierta hace rato no le saca un cliente a OTRA ruta sin que
 *    nadie lo haya decidido: se manda de dónde se lo estaba viendo, y si ya
 *    no está ahí no se guarda NADA;
 *  - los recorridos de las semanas ya creadas no cambian.
 *
 * CÓMO NO DEJA RASTRO. Una sola conexión dentro de BEGIN y ROLLBACK al final;
 * las transacciones del servicio se vuelven SAVEPOINT. Solo con la base
 * LOCAL: config/aislado.js se niega a conectar a otra.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const hayBase = Boolean(process.env.DATABASE_URL);
let pool; let cliente;

function baseDePrueba() {
  const query = (sql, params) => cliente.query(sql, params);
  let nivel = 0;
  return {
    query,
    pool: {
      query,
      connect: async () => ({
        query: async (sql, params) => {
          const t = String(sql).trim();
          if (t === 'BEGIN') return cliente.query(`SAVEPOINT prueba_${++nivel}`);
          if (t === 'COMMIT') return cliente.query(`RELEASE SAVEPOINT prueba_${nivel--}`);
          if (t === 'ROLLBACK') return cliente.query(`ROLLBACK TO SAVEPOINT prueba_${nivel--}`);
          return cliente.query(sql, params);
        },
        release() {}
      })
    }
  };
}

describe('asignar clientes a una ruta — contra la base local', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let rutas; let n = 0;

  const nuevaRuta = async (activa = true) => {
    const r = await rutas.crearRuta({ nombre: `ZZ ruta ${process.pid}-${++n}` });
    return activa ? r : rutas.editarRuta(r.id, { activo: false });
  };
  const nuevoCliente = async (datos = {}) => (await cliente.query(
    `INSERT INTO cliente (nombre, activo, canton) VALUES ($1, $2, $3) RETURNING id`,
    [`ZZ cliente ${process.pid}-${++n}`, datos.activo ?? true, datos.canton ?? 'ZZ cantón'])).rows[0].id;
  const recorrido = async (rutaId) => (await cliente.query(
    'SELECT id, orden_ruta FROM cliente WHERE ruta_id = $1 ORDER BY orden_ruta', [rutaId])).rows;
  const idsDe = async (rutaId) => (await recorrido(rutaId)).map(c => c.id);
  const sinRuta = (ids) => ids.map(clienteId => ({ clienteId, desdeRutaId: null }));

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    cliente = await pool.connect();
    await cliente.query('BEGIN');
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseDePrueba() };
    delete require.cache[require.resolve('../src/modules/rutas/rutas.service')];
    rutas = require('../src/modules/rutas/rutas.service');
  });

  after(async () => {
    await cliente?.query('ROLLBACK').catch(() => {});
    cliente?.release();
    await pool?.end().catch(() => {});
  });

  test('la lista trae a todos los activos con la ruta que tienen hoy', async () => {
    const a = await nuevaRuta(); const b = await nuevaRuta();
    const [enA, enB, libre, inactivoLibre] = [await nuevoCliente(), await nuevoCliente(), await nuevoCliente({ canton: 'ZZ Orotina' }), await nuevoCliente({ activo: false })];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([enA]) });
    await rutas.asignarClientes(b.id, { agregar: sinRuta([enB]) });

    const { ruta, clientes } = await rutas.candidatosDeRuta(a.id);
    assert.equal(ruta.id, a.id);
    const de = (id) => clientes.find(c => c.id === id);
    assert.deepEqual([de(enA).ruta_id, de(enA).orden_ruta], [a.id, 1]);
    assert.equal(de(enB).ruta_nombre, b.nombre, 'no dice en qué otra ruta está');
    assert.equal(de(libre).ruta_id, null);
    assert.equal(de(libre).canton, 'ZZ Orotina', 'sin el lugar no se reconoce a quién se está asignando');
    assert.equal(de(inactivoLibre), undefined, 'un inactivo sin ruta no se ofrece');
  });

  test('un inactivo que YA está en la ruta sí aparece, para poder sacarlo', async () => {
    const a = await nuevaRuta(); const c = await nuevoCliente();
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c]) });
    await cliente.query('UPDATE cliente SET activo = FALSE WHERE id = $1', [c]);
    assert.ok((await rutas.candidatosDeRuta(a.id)).clientes.some(x => x.id === c));
    await rutas.asignarClientes(a.id, { quitar: [c] });
    assert.deepEqual(await idsDe(a.id), []);
  });

  test('los que entran van al final, en el orden en que se marcaron', async () => {
    const a = await nuevaRuta();
    const [c1, c2, c3, c4] = [await nuevoCliente(), await nuevoCliente(), await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c2, c1]) });
    const r = await rutas.asignarClientes(a.id, { agregar: sinRuta([c4, c3]) });

    assert.deepEqual(await recorrido(a.id), [c2, c1, c4, c3].map((id, i) => ({ id, orden_ruta: i + 1 })));
    assert.deepEqual(r.clientes.map(c => c.id), [c2, c1, c4, c3], 'la respuesta no trae el recorrido nuevo');
    assert.deepEqual([r.agregados, r.quitados, r.movidos], [2, 0, 0]);
  });

  test('sacar deja el recorrido compacto y al cliente sin ruta ni orden', async () => {
    const a = await nuevaRuta();
    const [c1, c2, c3] = [await nuevoCliente(), await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c1, c2, c3]) });
    await rutas.asignarClientes(a.id, { quitar: [c2] });

    assert.deepEqual(await recorrido(a.id), [{ id: c1, orden_ruta: 1 }, { id: c3, orden_ruta: 2 }]);
    const { rows: [suelto] } = await cliente.query('SELECT ruta_id, orden_ruta FROM cliente WHERE id = $1', [c2]);
    assert.deepEqual(suelto, { ruta_id: null, orden_ruta: null });
  });

  test('agregar y quitar en la misma operación', async () => {
    const a = await nuevaRuta();
    const [c1, c2, c3] = [await nuevoCliente(), await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c1, c2]) });
    const r = await rutas.asignarClientes(a.id, { agregar: sinRuta([c3]), quitar: [c1] });
    assert.deepEqual(await idsDe(a.id), [c2, c3]);
    assert.deepEqual([r.agregados, r.quitados], [1, 1]);
  });

  test('traer un cliente de OTRA ruta lo mueve y compacta la que deja', async () => {
    const a = await nuevaRuta(); const b = await nuevaRuta();
    const [c1, c2, c3] = [await nuevoCliente(), await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(b.id, { agregar: sinRuta([c1, c2, c3]) });
    const versionB = (await rutas.obtenerRuta(b.id)).version;

    const r = await rutas.asignarClientes(a.id, { agregar: [{ clienteId: c2, desdeRutaId: b.id }] });
    assert.deepEqual(await idsDe(a.id), [c2]);
    assert.deepEqual(await recorrido(b.id), [{ id: c1, orden_ruta: 1 }, { id: c3, orden_ruta: 2 }]);
    assert.equal(r.movidos, 1);
    // Quien tenga abierta la otra ruta para ordenarla se entera de que cambió.
    assert.ok((await rutas.obtenerRuta(b.id)).version > versionB);
  });

  test('si otra pantalla ya lo movió, no se le pisa el cambio y NO se guarda nada', async () => {
    const a = await nuevaRuta(); const b = await nuevaRuta();
    const [disputado, inocente] = [await nuevoCliente(), await nuevoCliente()];
    // Esta pantalla lo vio "sin ruta"; mientras tanto alguien lo puso en B.
    await rutas.asignarClientes(b.id, { agregar: sinRuta([disputado]) });

    await assert.rejects(
      rutas.asignarClientes(a.id, { agregar: sinRuta([inocente, disputado]) }),
      (e) => e.status === 409 && e.message.includes(b.nombre) && /Recargá/.test(e.message)
    );
    assert.deepEqual(await idsDe(a.id), [], 'se guardó la mitad');
    assert.deepEqual(await idsDe(b.id), [disputado], 'se le sacó a la otra ruta');
  });

  test('marcar lo que ya estaba, o sacar lo que ya no está, no cambia nada', async () => {
    const a = await nuevaRuta(); const [c1, c2] = [await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c1]) });
    const version = (await rutas.obtenerRuta(a.id)).version;

    const r = await rutas.asignarClientes(a.id, { agregar: sinRuta([c1]), quitar: [c2] });
    assert.deepEqual([r.agregados, r.quitados], [0, 0]);
    assert.equal((await rutas.obtenerRuta(a.id)).version, version, 'subió la versión sin que cambiara nada');
  });

  test('queda en la bitácora quién estaba antes y quién después', async () => {
    const a = await nuevaRuta(); const [c1, c2] = [await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c1]) }, null);
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c2]), quitar: [c1] }, null);
    const { rows: [ultimo] } = await cliente.query(
      `SELECT antes, despues FROM bitacora_cambio WHERE entidad = 'ruta_cliente' AND entidad_id = $1 AND accion = 'asignar' ORDER BY id DESC LIMIT 1`,
      [String(a.id)]);
    assert.deepEqual([ultimo.antes, ultimo.despues], [[c1], [c2]]);
  });

  test('lo que no se puede: ruta inactiva, cliente inactivo, repetidos, nada que guardar', async () => {
    const inactiva = await nuevaRuta(false); const a = await nuevaRuta();
    const [c1, dormido] = [await nuevoCliente(), await nuevoCliente({ activo: false })];

    await assert.rejects(rutas.asignarClientes(inactiva.id, { agregar: sinRuta([c1]) }), (e) => e.status === 400 && /inactiva/.test(e.message));
    await assert.rejects(rutas.asignarClientes(a.id, { agregar: sinRuta([dormido]) }), (e) => e.status === 400 && /inactivo/.test(e.message));
    await assert.rejects(rutas.asignarClientes(a.id, { agregar: sinRuta([c1]), quitar: [c1] }), (e) => e.status === 400 && /repetidos/.test(e.message));
    await assert.rejects(rutas.asignarClientes(a.id, {}), (e) => e.status === 400);
    await assert.rejects(rutas.asignarClientes(a.id, { agregar: 'todos' }), (e) => e.status === 400);
    await assert.rejects(rutas.asignarClientes(a.id, { agregar: sinRuta([2147483000]) }), (e) => e.status === 404);
    await assert.rejects(rutas.asignarClientes(2147483000, { agregar: sinRuta([c1]) }), (e) => e.status === 404);
    assert.deepEqual(await idsDe(a.id), []);
  });

  test('de una ruta inactiva sí se pueden sacar clientes', async () => {
    const a = await nuevaRuta(); const c1 = await nuevoCliente();
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c1]) });
    await rutas.editarRuta(a.id, { activo: false });
    await rutas.asignarClientes(a.id, { quitar: [c1] });
    assert.deepEqual(await idsDe(a.id), []);
  });

  test('el recorrido de una semana ya creada no cambia', async () => {
    const a = await nuevaRuta(); const [c1, c2] = [await nuevoCliente(), await nuevoCliente()];
    await rutas.asignarClientes(a.id, { agregar: sinRuta([c1, c2]) });
    const ciclo = await rutas.crearCiclo(a.id, { semana: '2031-01-06' });
    await rutas.asignarClientes(a.id, { quitar: [c1] });
    assert.deepEqual((await rutas.obtenerCiclo(ciclo.id)).clientes.map(c => c.cliente_id), [c1, c2]);
  });

  test('las dos rutas nuevas son del módulo Clientes, como el resto de rutas', () => {
    const { moduloDeRuta, esCompartida } = require('../src/modules/usuarios/modulos');
    for (const p of ['/clientes/rutas/3/asignacion', '/clientes/rutas/3/clientes']) {
      assert.equal(moduloDeRuta(p), 'clientes');
      assert.equal(esCompartida(p), false);
    }
  });
});
