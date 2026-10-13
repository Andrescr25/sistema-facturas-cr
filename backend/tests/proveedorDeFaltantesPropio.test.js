const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * A qué proveedor se le pide un producto que faltó — con ids propios y sin
 * Alegra (sección 13: Reportes de proveedores y de clientes).
 *
 * Hasta el 2026-10-03, asignar un proveedor a mano desde el Reporte de
 * Proveedores le preguntaba el contacto a Alegra en vivo, y la asignación
 * automática buscaba el mapeo por tres caminos a la vez: el id propio, el id
 * de Alegra y la referencia.
 *
 * Contra PostgreSQL local, en una transacción que se deshace.
 */

const RAIZ = path.join(__dirname, '..');
const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');

describe('el proveedor de un faltante — contra PostgreSQL local', () => {
  let pool, conexion, manual, automatica;
  let factura, proveedorA, proveedorB, inactivo;
  let nivel = 0;

  const producto = async (nombre, { referencia = null, alegraId = null } = {}) => (await conexion.query(
    'INSERT INTO producto (nombre, referencia, alegra_id) VALUES ($1, $2, $3) RETURNING id', [nombre, referencia, alegraId])).rows[0].id;
  const faltante = async (productoId, estado = 'pendiente') => (await conexion.query(`
    INSERT INTO faltantes (factura_propia_id, producto_propio_id, cantidad_faltante, tipo_faltante, estado)
    VALUES ($1, $2, 3, 'parcial', $3) RETURNING id`, [factura, productoId, estado])).rows[0].id;
  const mapeo = async ({ productoId = null, proveedor, alegraItemId = 'zz-0', referencia = null, usado = '2031-03-01' }) => (await conexion.query(`
    INSERT INTO supplier_product_mapping
      (supplier_name, supplier_cedula, supplier_code, supplier_desc, alegra_item_id, alegra_reference, alegra_name,
       producto_id, proveedor_id, last_used_date)
    VALUES ($1, $2, 'zz-cod', 'zz-como le dice el proveedor', $3, $4, 'zz', $5, $6, $7) RETURNING id`,
    [proveedor.nombre, proveedor.cedula, alegraItemId, referencia, productoId, proveedor.id, usado])).rows[0].id;
  const leer = async (id) => (await conexion.query(
    'SELECT proveedor_asignado, proveedor_cedula, asignacion_tipo, mapping_id FROM faltantes WHERE id = $1', [id])).rows[0];

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const ejecutar = (sql, params) => conexion.query(sql, params);
    const db = {
      query: ejecutar,
      pool: {
        query: ejecutar,
        connect: async () => ({
          query: async (sql, params) => {
            if (sql === 'BEGIN') return conexion.query(`SAVEPOINT prov_${++nivel}`);
            if (sql === 'COMMIT') return conexion.query(`RELEASE SAVEPOINT prov_${nivel--}`);
            if (sql === 'ROLLBACK') return conexion.query(`ROLLBACK TO SAVEPOINT prov_${nivel--}`);
            return ejecutar(sql, params);
          },
          release() {}
        })
      }
    };
    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutaDb, db);
    // El precio de cada proveedor sale de la última factura del buzón, que
    // se lee con Prisma. Sin facturas, decide el mapeo usado más recientemente.
    doble(rutaPrisma, { productoFactura: { findFirst: async () => null } });
    for (const m of ['../src/modules/proveedores/proveedores.asignacion.service', '../services/proveedorAsignacionService']) {
      delete require.cache[require.resolve(m)];
    }
    manual = require('../src/modules/proveedores/proveedores.asignacion.service');
    automatica = require('../services/proveedorAsignacionService');

    const proveedor = async (nombre, cedula, activo = true) => {
      const { rows: [p] } = await conexion.query(
        'INSERT INTO proveedor (nombre, identificacion, activo) VALUES ($1, $2, $3) RETURNING id', [nombre, cedula, activo]);
      return { id: p.id, nombre, cedula };
    };
    proveedorA = await proveedor('zz-Proveedor A', 'zz-3101000001');
    proveedorB = await proveedor('zz-Proveedor B', 'zz-3101000002');
    inactivo = await proveedor('zz-Proveedor inactivo', 'zz-3101000003', false);

    factura = (await conexion.query(`
      INSERT INTO factura (numero, estado, fecha, cliente_nombre, tipo_documento)
      VALUES ('zz-prov-000001', 'emitida', '2031-03-10', 'zz-cliente', 'factura') RETURNING id`)).rows[0].id;
  });

  beforeEach(async () => { await conexion.query('SAVEPOINT caso'); });
  afterEach(async () => { await conexion.query('ROLLBACK TO SAVEPOINT caso'); });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  describe('a mano, desde el Reporte de Proveedores', () => {
    test('marca los faltantes PENDIENTES del producto con la ficha del proveedor y su mapeo', async () => {
      const p = await producto('zz-tornillo');
      const pendiente = await faltante(p);
      const yaProcesado = await faltante(await producto('zz-otro'));
      const procesadoDelMismo = (await conexion.query(`
        INSERT INTO faltantes (factura_propia_id, producto_propio_id, cantidad_faltante, tipo_faltante, estado)
        VALUES ((SELECT id FROM factura WHERE numero <> 'zz-prov-000001' ORDER BY id LIMIT 1), $1, 1, 'parcial', 'procesado') RETURNING id`, [p])).rows[0].id;
      const m = await mapeo({ productoId: p, proveedor: proveedorB });

      const r = await manual.asignarProveedorAProducto({ productoId: p, proveedorId: proveedorB.id });
      assert.deepEqual(r, { proveedor: 'zz-Proveedor B', faltantesActualizados: 1, mappingId: m });
      assert.deepEqual(await leer(pendiente), {
        proveedor_asignado: 'zz-Proveedor B', proveedor_cedula: 'zz-3101000002', asignacion_tipo: 'manual', mapping_id: m
      });
      // Ni el de otro producto ni el que ya se procesó se tocan.
      assert.equal((await leer(yaProcesado)).proveedor_asignado, null);
      assert.equal((await leer(procesadoDelMismo)).proveedor_asignado, null);
    });

    test('sin mapeo con ese proveedor igual se asigna: el pedido sale con el nombre propio', async () => {
      const p = await producto('zz-nunca comprado a B');
      const f = await faltante(p);
      await mapeo({ productoId: p, proveedor: proveedorA });   // el mapeo es con OTRO proveedor
      const r = await manual.asignarProveedorAProducto({ productoId: p, proveedorId: proveedorB.id });
      assert.equal(r.mappingId, null);
      assert.deepEqual(await leer(f), {
        proveedor_asignado: 'zz-Proveedor B', proveedor_cedula: 'zz-3101000002', asignacion_tipo: 'manual', mapping_id: null
      });
    });

    test('reasignar es la misma operación: pisa al proveedor anterior', async () => {
      const p = await producto('zz-cambia de manos');
      const f = await faltante(p);
      await manual.asignarProveedorAProducto({ productoId: p, proveedorId: proveedorA.id });
      await manual.asignarProveedorAProducto({ productoId: p, proveedorId: proveedorB.id });
      assert.equal((await leer(f)).proveedor_asignado, 'zz-Proveedor B');
    });

    test('un proveedor inactivo, uno que no existe o un id que no es un id: no se asigna nada', async () => {
      const p = await producto('zz-intacto');
      const f = await faltante(p);
      await assert.rejects(() => manual.asignarProveedorAProducto({ productoId: p, proveedorId: inactivo.id }), e => e.status === 409);
      await assert.rejects(() => manual.asignarProveedorAProducto({ productoId: p, proveedorId: 99999999 }), e => e.status === 404);
      await assert.rejects(() => manual.asignarProveedorAProducto({ productoId: 99999999, proveedorId: proveedorA.id }), e => e.status === 404);
      for (const raro of [undefined, null, '', 'abc', '12abc', 0, -3, 1.5]) {
        await assert.rejects(() => manual.asignarProveedorAProducto({ productoId: raro, proveedorId: proveedorA.id }), e => e.status === 400);
        await assert.rejects(() => manual.asignarProveedorAProducto({ productoId: p, proveedorId: raro }), e => e.status === 400);
      }
      assert.equal((await leer(f)).proveedor_asignado, null);
    });
  });

  describe('asignación por ciclo conserva otras semanas y Sin ciclo', () => {
    const contexto = async () => {
      const p = await producto('zz-tres-semanas');
      const cliente = (await conexion.query("INSERT INTO cliente(nombre) VALUES('zz-cliente ámbito') RETURNING id")).rows[0].id;
      const ruta = (await conexion.query("INSERT INTO ruta_cliente(nombre) VALUES('zz-ruta ámbito') RETURNING id")).rows[0].id;
      const ciclos = [], faltantes = [];
      for (const semana of ['2031-03-03','2031-03-10']) {
        const ciclo = (await conexion.query('INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,\'zz-ruta ámbito\',$2) RETURNING id', [ruta, semana])).rows[0].id;
        const parada = (await conexion.query("INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,1,'zz-cliente ámbito') RETURNING id", [ciclo, cliente])).rows[0].id;
        await conexion.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1', [ciclo]);
        const f = (await conexion.query("INSERT INTO factura(numero,estado,fecha,cliente_nombre,ciclo_ruta_cliente_id,cliente_id) VALUES($1,'emitida',$2,'zz-cliente ámbito',$3,$4) RETURNING id", ['zz-ámbito-' + ciclo, semana, parada, cliente])).rows[0].id;
        faltantes.push((await conexion.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado) VALUES($1,$2,3,'parcial','pendiente') RETURNING id", [f,p])).rows[0].id);
        ciclos.push(ciclo);
      }
      faltantes.push(await faltante(p));
      return { p, ruta, ciclos, faltantes };
    };
    test('una semana asigna solo sus propios faltantes; no cambia mapeos ni cobertura global', async () => {
      const d = await contexto(), m = await mapeo({productoId:d.p,proveedor:proveedorB});
      const r = await manual.asignarProveedorAProducto({productoId:d.p,proveedorId:proveedorB.id,cicloId:String(d.ciclos[1])});
      assert.equal(r.faltantesActualizados,1); assert.equal(r.mappingId,m);
      assert.equal((await leer(d.faltantes[1])).proveedor_asignado,proveedorB.nombre);
      for (const i of [0,2]) assert.equal((await leer(d.faltantes[i])).proveedor_asignado,null);
      assert.equal((await conexion.query('SELECT proveedor_id FROM supplier_product_mapping WHERE id=$1',[m])).rows[0].proveedor_id,proveedorB.id);
    });
    test('Sin ciclo asigna históricos sin tomar faltantes de ninguna semana', async () => {
      const d=await contexto();
      assert.equal((await manual.asignarProveedorAProducto({productoId:d.p,proveedorId:proveedorA.id,cicloId:'sin-ciclo'})).faltantesActualizados,1);
      assert.equal((await leer(d.faltantes[2])).proveedor_asignado,proveedorA.nombre);
      for (const i of [0,1]) assert.equal((await leer(d.faltantes[i])).proveedor_asignado,null);
    });
    test('ámbitos vacíos, inválidos o inexistentes rechazan sin asignar globalmente', async () => {
      const d=await contexto();
      for (const cicloId of [null,'',0,-1,'abc','1abc',1.5,2147483648]) await assert.rejects(()=>manual.asignarProveedorAProducto({productoId:d.p,proveedorId:proveedorA.id,cicloId}),e=>e.status===400);
      await assert.rejects(()=>manual.asignarProveedorAProducto({productoId:d.p,proveedorId:proveedorA.id,cicloId:2147483647}),e=>e.status===404);
      for (const f of d.faltantes) assert.equal((await leer(f)).proveedor_asignado,null);
    });
    for (const ambito of ['ruta','semana','sin-ciclo']) test(`abrir proveedor por ${ambito} y clientes por ruta no asigna ni modifica faltantes`, async () => {
      const d=await contexto(); await mapeo({productoId:d.p,proveedor:proveedorA});
      const reportes=new(require('../src/modules/reports/report.service'))();
      const filtro=ambito==='ruta'?{rutaId:d.ruta}: {cicloId:ambito==='semana'?d.ciclos[1]:'sin-ciclo'};
      const huella=async()=> (await conexion.query("SELECT md5(string_agg(to_jsonb(f)::text,'' ORDER BY id)) h FROM faltantes f WHERE id=ANY($1::int[])",[d.faltantes])).rows[0].h;
      const antes=await huella();
      // Usar los valores por omisión reales de la pantalla: pasar false aquí
      // ocultaría la regresión en GET, aunque la exportación sí fuese segura.
      const proveedor=await reportes.getMissingItemsBySupplier(null,filtro);
      // Clientes usa su ruta actual desde ROT-03; semana/Sin ciclo siguen
      // siendo filtros propios del reporte histórico del proveedor.
      const cliente=await reportes.getMissingItemsByClient({ rutaId: filtro.rutaId || '' });
      assert.equal(proveedor.success,true,proveedor.error); assert.equal(cliente.success,true,cliente.error);
      assert.equal(await huella(),antes);
      for (const f of d.faltantes) assert.equal((await leer(f)).proveedor_asignado,null);
    });
  });

  describe('automática, al abrir el reporte', () => {
    test('usa los mapeos del producto PROPIO; el más usado hace poco si nadie tiene precio', async () => {
      const p = await producto('zz-con dos proveedores');
      const f = await faltante(p);
      await mapeo({ productoId: p, proveedor: proveedorA, usado: '2031-01-01' });
      const reciente = await mapeo({ productoId: p, proveedor: proveedorB, usado: '2031-03-01' });

      const r = await automatica.asignarProveedorAutomatico(f, p, null);
      assert.equal(r.success, true);
      assert.deepEqual(await leer(f), {
        proveedor_asignado: 'zz-Proveedor B', proveedor_cedula: 'zz-3101000002', asignacion_tipo: 'automatica', mapping_id: reciente
      });
    });

    test('un mapeo que solo calza por el id de ALEGRA no es de este producto', async () => {
      // El producto tiene en Alegra el id "zz-777"; hay un mapeo con ese id de
      // Alegra pero SIN producto propio. Antes se lo llevaba; ya no.
      const p = await producto('zz-solo por alegra', { alegraId: 'zz-777' });
      const f = await faltante(p);
      await mapeo({ productoId: null, proveedor: proveedorA, alegraItemId: 'zz-777' });
      const r = await automatica.asignarProveedorAutomatico(f, p, null);
      assert.deepEqual([r.success, r.reason], [false, 'sin_mappings']);
      assert.equal((await leer(f)).proveedor_asignado, null);
    });

    test('la referencia es solo el segundo intento: sirve a la ficha duplicada que no tiene mapeo', async () => {
      // Dos fichas del mismo producto, misma referencia; el mapeo quedó en la
      // primera. La segunda no queda "Sin proveedor".
      const conMapeo = await producto('zz-spray (ficha 1)', { referencia: 'zz-27010136' });
      const gemela = await producto('zz-spray (ficha 2)', { referencia: 'zz-27010136' });
      const m = await mapeo({ productoId: conMapeo, proveedor: proveedorA, referencia: 'zz-27010136' });
      const f = await faltante(gemela);
      assert.equal((await automatica.asignarProveedorAutomatico(f, gemela, 'zz-27010136')).success, true);
      assert.deepEqual([(await leer(f)).proveedor_asignado, (await leer(f)).mapping_id], ['zz-Proveedor A', m]);
    });

    test('con mapeo propio, el de otra ficha con la misma referencia NO entra a competir', async () => {
      const mio = await producto('zz-pega (ficha 1)', { referencia: 'zz-7443' });
      const otra = await producto('zz-pega (ficha 2)', { referencia: 'zz-7443' });
      const propio = await mapeo({ productoId: mio, proveedor: proveedorA, referencia: 'zz-7443', usado: '2031-01-01' });
      // El de la otra ficha se usó más recientemente: antes ganaba él.
      await mapeo({ productoId: otra, proveedor: proveedorB, referencia: 'zz-7443', usado: '2031-03-01' });
      const f = await faltante(mio);
      await automatica.asignarProveedorAutomatico(f, mio, 'zz-7443');
      assert.deepEqual([(await leer(f)).proveedor_asignado, (await leer(f)).mapping_id], ['zz-Proveedor A', propio]);
    });

    test('sin mapeo propio ni referencia, queda sin asignar y lo dice', async () => {
      const p = await producto('zz-huérfano');
      const f = await faltante(p);
      const r = await automatica.asignarProveedorAutomatico(f, p, '');
      assert.deepEqual([r.success, r.reason], [false, 'sin_mappings']);
    });
  });
});

describe('el Reporte de Proveedores ya no le pregunta nada a Alegra', () => {
  const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');

  test('faltantes (missing-items) no importa la integración ni conserva la asignación vieja', () => {
    for (const archivo of ['missing-items.service.js', 'missing-items.controller.js', 'missing-items.routes.js']) {
      const fuente = leer('src', 'modules', 'missing-items', archivo);
      assert.doesNotMatch(fuente, /integrations\/alegra|getClient\(/, `${archivo} usa la integración de Alegra`);
      assert.doesNotMatch(fuente, /assignSupplierManual|router\.post\('\/(reasignar-proveedor|asignar-proveedor-manual)'/, `${archivo} conserva la asignación vieja`);
    }
  });

  test('la asignación y el pedido por WhatsApp buscan el mapeo por producto.id', () => {
    const automatica = leer('services', 'proveedorAsignacionService.js');
    assert.match(automatica, /WHERE producto_id = \$1/);
    assert.doesNotMatch(automatica, /alegra_item_id|alegraItemId|allegraId/);

    const pedido = leer('src', 'modules', 'orders-whatsapp', 'orders-whatsapp.service.js');
    assert.match(pedido, /WHERE producto_id = \$1/);
    assert.doesNotMatch(pedido, /alegra_item_id|alegraItemId|getMappingByAlegraId/);

    assert.doesNotMatch(leer('src', 'modules', 'reports', 'report.service.js'), /alegra_id|alegra_item_id/);
  });

  test('la pantalla busca, crea y asigna proveedores en las fichas propias', () => {
    const frente = path.join(RAIZ, '..', 'frontend', 'src');
    const hook = fs.readFileSync(path.join(frente, 'hooks', 'useReporteProveedores.js'), 'utf8');
    assert.doesNotMatch(hook, /\/alegra\/(proveedores|faltantes|productos)/, 'la pantalla sigue llamando a rutas que consultan a Alegra');
    assert.match(hook, /\/proveedores\/fichas/);
    assert.match(hook, /\/proveedores\/asignaciones/);
    assert.match(hook, /\/catalogos\/productos/);
    assert.doesNotMatch(fs.readFileSync(path.join(frente, 'utils', 'reporteProveedoresUtils.js'), 'utf8'), /alegraItemId|alegra_item_id/);
  });

  test('asignar un proveedor es una ruta del módulo de proveedores, no una compartida', () => {
    const { moduloDeRuta } = require('../src/modules/usuarios/modulos');
    assert.equal(moduloDeRuta('/proveedores/asignaciones'), 'reporte-proveedores');
    assert.match(leer('src', 'modules', 'proveedores', 'proveedores.routes.js'), /router\.post\('\/asignaciones'/);
  });
});
