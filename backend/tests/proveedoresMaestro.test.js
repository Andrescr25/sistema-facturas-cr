const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Maestro propio de proveedores: una sola lista por cédula, con sus productos
 * y sus compras. La base es un doble.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'proveedores', 'proveedores.maestro.service.js');

function montar(responder = () => null) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    const r = await responder(texto, params);
    return r || { rows: [], rowCount: 0 };
  };
  const cliente = { query: ejecutar, release: () => log.push({ sql: 'RELEASE', params: [] }) };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => cliente, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

beforeEach(() => { delete require.cache[rutaDb]; delete require.cache[rutaServicio]; });

const hubo = (log, re) => log.some(l => re.test(l.sql));
const params = (log, re) => log.find(l => re.test(l.sql))?.params;

const FERRETEROS = {
  id: 5, nombre: 'F & G Ferreteros Sociedad Anonima', tipo_identificacion: 'CJ', identificacion: '3101129878',
  correo: 'ventas@fyg.cr', telefono: '2453 1234', telefono_whatsapp: '8455 2056', plazo_credito_id: 3,
  observaciones: null, activo: true, alegra_id: '210', legacy_id: 7, actualizado_en: '2026-09-11'
};

const VALIDO = { nombre: 'FERRETERÍA NUEVA', tipo_identificacion: 'CJ', identificacion: '3-101-987654', telefono_whatsapp: '8827 2453' };

function base({ proveedor = FERRETEROS, plazoActivo = true, duplicado = false } = {}) {
  let actual = { ...proveedor };
  return (sql, p) => {
    if (/FROM plazo_credito WHERE id = \$1/.test(sql)) return { rows: [{ id: p[0], activo: plazoActivo }] };
    if (/INSERT INTO proveedor /.test(sql)) {
      if (duplicado) { const e = new Error('duplicate key value violates unique constraint'); e.code = '23505'; throw e; }
      const columnas = sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      actual = { ...proveedor, id: 50, ...Object.fromEntries(columnas.map((c, i) => [c, p[i]])) };
      return { rows: [{ ...actual }] };
    }
    if (/FROM proveedor WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [{ ...actual }] };
    if (/^UPDATE proveedor SET/.test(sql)) {
      if (duplicado) { const e = new Error('duplicate key value violates unique constraint'); e.code = '23505'; throw e; }
      const cols = sql.match(/SET (.+?), actualizado_en/)[1].split(', ').map(x => x.split(' = ')[0]);
      actual = { ...actual };
      cols.forEach((c, i) => { actual[c] = p[i]; });
      return { rows: [{ ...actual }] };
    }
    if (/INSERT INTO bitacora_cambio/.test(sql)) return { rows: [{ id: '1' }] };
    // La consulta de la ficha va PRIMERO: por dentro lleva las subconsultas
    // que cuentan productos y compras, así que menciona supplier_product_mapping
    // y facturas_proveedores igual que las otras dos. Por eso las de abajo se
    // reconocen por su ORDER BY, que es solo suyo.
    if (/COUNT\(\*\) OVER\(\)/.test(sql)) return { rows: [{ ...actual, total: '1', plazo: '15 días', productos: 12, compras: 3 }] };
    if (/WHERE pr\.id = \$1/.test(sql)) return { rows: [{ ...actual, plazo: '15 días', productos: 12, compras: 3, ultima_compra: '2026-09-01' }] };
    if (/ORDER BY fecha_emision DESC LIMIT 10/.test(sql)) {
      return { rows: [{ numero_consecutivo: '00100001', fecha_emision: '2026-09-01', total_factura: '125000.00', moneda: 'CRC', estado: 'ENVIADA' }] };
    }
    if (/ORDER BY m\.times_used DESC/.test(sql)) {
      return { rows: [{ id: 7, nombre: 'TORNILLO', referencia: 'TOR02', codigo_proveedor: 'A-1' }] };
    }
    return null;
  };
}

describe('crear ficha de proveedor', () => {
  test('sin nombre no llega a la base', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.crearFicha({ identificacion: '3101987654' }, 4), e => e.status === 400 && /Nombre/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('la cédula se guarda sin guiones y tiene que calzar con su tipo', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(
      servicio.crearFicha({ nombre: 'X', tipo_identificacion: 'CJ', identificacion: '310198765' }, 4),
      e => e.status === 400 && /jurídica tiene 10 dígitos, y esa tiene 9/.test(e.message)
    );
    await servicio.crearFicha(VALIDO, 4);
    const insert = log.find(l => /INSERT INTO proveedor /.test(l.sql));
    const columnas = insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    assert.equal(insert.params[columnas.indexOf('identificacion')], '3101987654');
  });

  test('una cédula repetida se explica, no revienta', async () => {
    // A diferencia de los clientes, dos proveedores con la misma cédula son
    // el mismo proveedor cargado dos veces.
    const { servicio } = montar(base({ duplicado: true }));
    await assert.rejects(servicio.crearFicha(VALIDO, 4), e => e.status === 409 && /ya hay un proveedor/i.test(e.message));
  });

  test('un WhatsApp que no es un número no se guarda', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.crearFicha({ nombre: 'X', telefono_whatsapp: 'el de siempre' }, 4), e => e.status === 400 && /WhatsApp/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('varios WhatsApp se guardan separados y normalizados, sin alterar el teléfono principal', async () => {
    const { servicio, log } = montar(base());
    const creada = await servicio.crearFicha({
      ...VALIDO, telefono: '+506 2453-1234', telefono_whatsapp: '+506 8827-2453\r\n 84552056 \r\n(506) 7777 8888'
    }, 4);
    assert.equal(creada.telefono, '2453 1234');
    assert.equal(creada.telefono_whatsapp, '8827 2453\n8455 2056\n7777 8888');
    const bitacora = params(log, /INSERT INTO bitacora_cambio/);
    assert.equal(JSON.parse(bitacora[4]).telefono_whatsapp, creada.telefono_whatsapp);
  });

  test('acepta diez contactos y conserva el formato único anterior', async () => {
    const { servicio } = montar(base());
    const diez = Array.from({ length: 10 }, (_, i) => `8888888${i}`);
    assert.equal((await servicio.crearFicha({ ...VALIDO, telefono_whatsapp: diez.join('\n') }, 4)).telefono_whatsapp.split('\n').length, 10);
    assert.equal((await servicio.crearFicha(VALIDO, 4)).telefono_whatsapp, '8827 2453');
  });

  test('no descarta contactos vacíos, repetidos o mal escritos al guardar', async () => {
    for (const valor of [
      '88888888\n\n87777777', '88888888\n \n87777777',
      '88888888\n+506 8888-8888', '88888888\n8777777',
      '88888888 / 87777777', '88888888\n87777777 JUAN',
      Array.from({ length: 11 }, (_, i) => String(88888800 + i)).join('\n')
    ]) {
      const { servicio, log } = montar(base());
      await assert.rejects(servicio.crearFicha({ ...VALIDO, telefono_whatsapp: valor }, 4), e => e.status === 400 && /WhatsApp/.test(e.message));
      assert.equal(log.length, 0, 'un contacto inválido no llega a la base');
    }
  });

  test('lo que no está en la lista blanca se ignora', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearFicha({ ...VALIDO, activo: false, alegra_id: '999', legacy_id: 3 }, 4);
    const insert = log.find(l => /INSERT INTO proveedor /.test(l.sql));
    for (const prohibida of ['activo', 'alegra_id', 'legacy_id']) {
      assert.equal(insert.sql.includes(prohibida), false, `${prohibida} no puede venir de la pantalla`);
    }
  });

  test('queda en la bitácora como proveedor', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearFicha(VALIDO, 4);
    assert.equal(params(log, /INSERT INTO bitacora_cambio/).includes('proveedor'), true);
  });
});

describe('editar y desactivar', () => {
  test('editar WhatsApp guarda todos los contactos y audita sólo ese campo', async () => {
    const { servicio, log } = montar(base());
    const editada = await servicio.editarFicha(5, { telefono_whatsapp: '88888888\n+50687777777' }, 4);
    assert.equal(editada.telefono_whatsapp, '8888 8888\n8777 7777');
    for (const campo of ['nombre', 'identificacion', 'telefono', 'correo', 'plazo_credito_id', 'alegra_id', 'legacy_id']) {
      assert.equal(editada[campo], FERRETEROS[campo], campo);
    }
    assert.deepEqual(JSON.parse(params(log, /INSERT INTO bitacora_cambio/)[5]), {
      telefono_whatsapp: ['8455 2056', '8888 8888\n8777 7777']
    });
  });

  test('omitir WhatsApp conserva datos antiguos y permite borrar el contacto explícitamente', async () => {
    const antigua = { ...FERRETEROS, telefono_whatsapp: '88888888 / 87777777 Juan' };
    const { servicio } = montar(base({ proveedor: antigua }));
    assert.equal((await servicio.editarFicha(5, { observaciones: 'Llamar antes' }, 4)).telefono_whatsapp, antigua.telefono_whatsapp);
    assert.equal((await servicio.obtenerFicha(5)).telefono_whatsapp, antigua.telefono_whatsapp);
    assert.equal((await servicio.editarFicha(5, { telefono_whatsapp: null }, 4)).telefono_whatsapp, null);
    assert.equal((await servicio.editarFicha(5, { telefono_whatsapp: '  \n  ' }, 4)).telefono_whatsapp, null);
  });

  test('una edición con contactos repetidos se rechaza antes de consultar', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.editarFicha(5, { telefono_whatsapp: '88888888\n8888 8888' }, 4), e => e.status === 400 && /repetido/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('sin datos no hace nada, y un proveedor que no existe da 404', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.editarFicha(5, {}, 4), e => e.status === 400);
    assert.equal(log.length, 0);

    const vacio = montar((sql) => (/FOR UPDATE/.test(sql) ? { rows: [] } : null));
    await assert.rejects(vacio.servicio.editarFicha(5, { nombre: 'OTRO' }, 4), e => e.status === 404);
  });

  test('cambiar solo el tipo tiene que calzar con la cédula que ya estaba', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(
      servicio.editarFicha(5, { tipo_identificacion: 'CF' }, 4),
      e => e.status === 400 && /física tiene 9 dígitos, y esa tiene 10/.test(e.message)
    );
    assert.equal(hubo(log, /^UPDATE proveedor SET/), false);
  });

  test('desactivar no borra y queda anotado', async () => {
    const { servicio, log } = montar(base());
    await servicio.cambiarEstadoFicha(5, false, 4);
    assert.equal(hubo(log, /DELETE/), false);
    assert.ok(hubo(log, /^UPDATE proveedor SET activo/));
    assert.equal(params(log, /INSERT INTO bitacora_cambio/).includes('desactivar'), true);
  });

  test('poner el mismo estado no escribe nada', async () => {
    const { servicio, log } = montar(base());
    await servicio.cambiarEstadoFicha(5, true, 4);
    assert.equal(hubo(log, /^UPDATE proveedor SET/), false);
  });
});

describe('la lista', () => {
  test('un estado que no existe se rechaza antes de consultar', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.listarFichas({ estado: 'borrados' }), e => e.status === 400);
    assert.equal(log.length, 0);
  });

  test('cuenta los productos por el mapeo y las compras por el buzón, los dos por cédula', async () => {
    const { servicio, log } = montar(base());
    await servicio.listarFichas({});
    const consulta = log[0].sql;
    // Por `producto_id`: con el id de Alegra, un producto creado en el sistema
    // no contaba para ningún proveedor (y 7 asignaciones manuales tampoco).
    assert.match(consulta, /supplier_product_mapping m JOIN producto p ON p\.id = m\.producto_id WHERE m\.supplier_cedula = pr\.identificacion/);
    assert.match(consulta, /FROM facturas_proveedores f WHERE f\.proveedor_cedula = pr\.identificacion/);
  });

  test('busca por nombre, cédula y correo, y nadie pide más de 100', async () => {
    const { servicio, log } = montar(base());
    await servicio.listarFichas({ buscar: 'ferreteros', limite: 5000 });
    assert.deepEqual(log[0].params[0], '%ferreteros%');
    assert.equal(log[0].params.includes(100), true);
  });
});

describe('la ficha completa', () => {
  test('trae sus últimas compras y los productos que le compramos', async () => {
    const { servicio } = montar(base());
    const ficha = await servicio.obtenerFicha(5);
    assert.equal(ficha.nombre, FERRETEROS.nombre);
    assert.equal(ficha.ultimasCompras[0].total_factura, 125000, 'el monto llega como número, no como texto de pg');
    assert.equal(ficha.productosQueVende[0].referencia, 'TOR02');
  });

  test('un proveedor que no existe da 404 y no busca sus compras', async () => {
    const { servicio, log } = montar((sql) => (/WHERE pr\.id = \$1/.test(sql) ? { rows: [] } : null));
    await assert.rejects(servicio.obtenerFicha(99), e => e.status === 404);
    // La consulta de la ficha nombra facturas_proveedores en su subconsulta;
    // lo que no puede pasar es que se pidan las últimas compras de nadie.
    assert.equal(hubo(log, /ORDER BY fecha_emision DESC LIMIT 10/), false);
  });
});
