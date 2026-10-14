const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
const migracion = readFileSync(require.resolve('../migrations/independencia/059_telefonos_whatsapp_proveedor.sql'), 'utf8');

describe('varios WhatsApp de proveedor — PostgreSQL y migración 059', { skip: !activo }, () => {
  let pool, c, servicio, anterior, nueva, huellasComerciales;
  const tablas = ['proveedor', 'bitacora_cambio', 'supplier_product_mapping', 'producto', 'facturas_proveedores', 'orden_compra_ciclo', 'movimiento_inventario'];
  const tipo = async () => (await c.query(`SELECT data_type, character_maximum_length
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedor' AND column_name = 'telefono_whatsapp'`)).rows[0];
  const huellas = async (lista = tablas) => {
    const r = {};
    for (const tabla of lista) r[tabla] = (await c.query(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) h FROM ${tabla} t`)).rows[0].h;
    return r;
  };

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect();
    await c.query('BEGIN');
    anterior = (await c.query(`INSERT INTO proveedor(nombre, telefono, telefono_whatsapp, observaciones)
      VALUES($1, '2453 1234', '88888888 / 87777777 Juan', 'Conservar ficha histórica') RETURNING *`, ['zz-whatsapp-' + randomUUID()])).rows[0];
    const ruta = require.resolve('../config/database');
    require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports: baseEnTransaccion(c, 'telefonos') };
    servicio = require('../src/modules/proveedores/proveedores.maestro.service');
    huellasComerciales = await huellas(tablas.slice(2));
  });

  after(async () => {
    if (c) { await c.query('ROLLBACK'); c.release(); }
    await pool?.end();
  });

  test('ensancha el campo sin cambiar filas y la migración se puede revertir íntegra', async () => {
    const antes = await huellas(), inicial = await tipo();
    assert.ok(['character varying', 'text'].includes(inicial.data_type));
    await c.query('SAVEPOINT ensayo_059');
    await c.query(migracion);
    assert.deepEqual(await tipo(), { data_type: 'text', character_maximum_length: null });
    assert.deepEqual(await huellas(), antes);
    await c.query('ROLLBACK TO SAVEPOINT ensayo_059');
    assert.deepEqual(await tipo(), inicial);
    assert.deepEqual(await huellas(), antes);
    await c.query('RELEASE SAVEPOINT ensayo_059');
    await c.query(migracion);
  });

  test('repetir la 059 conserva datos, compras e historial', async () => {
    const antes = await huellas();
    await c.query(migracion);
    assert.deepEqual(await huellas(), antes);
    assert.deepEqual(await tipo(), { data_type: 'text', character_maximum_length: null });
  });

  test('crear diez contactos supera el antiguo límite sin truncar y queda auditado', async () => {
    const numeros = Array.from({ length: 10 }, (_, i) => `8888888${i}`);
    nueva = await servicio.crearFicha({ nombre: 'zz-contactos-' + randomUUID(), telefono_whatsapp: numeros.join('\n') });
    assert.equal(nueva.telefono_whatsapp.length, 99);
    assert.equal(nueva.telefono_whatsapp.split('\n').length, 10);
    const eventos = (await c.query("SELECT despues FROM bitacora_cambio WHERE entidad = 'proveedor' AND entidad_id = $1 AND accion = 'crear'", [String(nueva.id)])).rows;
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].despues.telefono_whatsapp, nueva.telefono_whatsapp);
  });

  test('editar contactos sólo cambia WhatsApp y conserva el teléfono principal', async () => {
    const antes = (await c.query('SELECT * FROM proveedor WHERE id = $1', [anterior.id])).rows[0];
    const editada = await servicio.editarFicha(anterior.id, { telefono_whatsapp: '+506 8888-8888\n87777777' });
    assert.equal(editada.telefono_whatsapp, '8888 8888\n8777 7777');
    for (const [campo, valor] of Object.entries(antes)) {
      if (['telefono_whatsapp', 'actualizado_en'].includes(campo)) continue;
      assert.deepEqual(editada[campo], valor, campo);
    }
    const eventos = (await c.query("SELECT cambios FROM bitacora_cambio WHERE entidad = 'proveedor' AND entidad_id = $1 AND accion = 'editar'", [String(anterior.id)])).rows;
    assert.equal(eventos.length, 1);
    assert.deepEqual(eventos[0].cambios, { telefono_whatsapp: [anterior.telefono_whatsapp, editada.telefono_whatsapp] });
  });

  test('rechazar una lista inválida no cambia contactos ni bitácora', async () => {
    const antes = await huellas();
    for (const valor of ['88888888\n\n87777777', '88888888\n+50688888888', '88888888\n8777777']) {
      await assert.rejects(servicio.editarFicha(anterior.id, { telefono_whatsapp: valor }), e => e.status === 400);
      await assert.rejects(servicio.crearFicha({ nombre: 'zz-no-guardar', telefono_whatsapp: valor }), e => e.status === 400);
    }
    assert.deepEqual(await huellas(), antes);
  });

  test('editar otro campo conserva la lista; borrar los contactos explícitamente conserva la ficha', async () => {
    const guardada = nueva.telefono_whatsapp;
    assert.equal((await servicio.editarFicha(nueva.id, { observaciones: 'Revisar antes de enviar' })).telefono_whatsapp, guardada);
    assert.equal((await servicio.obtenerFicha(nueva.id)).telefono_whatsapp, guardada);
    assert.equal((await servicio.editarFicha(nueva.id, { telefono_whatsapp: '' })).telefono_whatsapp, null);
    assert.deepEqual(await huellas(tablas.slice(2)), huellasComerciales);
  });
});
