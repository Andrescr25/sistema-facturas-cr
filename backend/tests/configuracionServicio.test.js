const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Configuración de la empresa: validación, lista blanca de columnas,
 * bitácora en la misma transacción y la regla de "siempre queda uno activo".
 *
 * La base es un doble: la local es una copia de producción y no se prueban
 * escrituras contra ella acá.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'configuracion', 'configuracion.service.js');

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

beforeEach(() => {
  delete require.cache[rutaDb];
  delete require.cache[rutaServicio];
});

const sqls = (log) => log.map(l => l.sql);
const hubo = (log, re) => log.some(l => re.test(l.sql));

const EMPRESA = {
  id: 1, nombre: 'Distribuidora Tachi', tipo_identificacion: 'CF', identificacion: '204050474',
  actividad_economica: '523402', telefono: '86477036', correo: 'tachi@ejemplo.cr', decimales: 0,
  actualizado_en: '2026-09-11'
};

describe('empresa', () => {
  test('una cédula física con 8 dígitos no se guarda, y se dice por qué', async () => {
    const { servicio, log } = montar(sql => /FROM empresa WHERE id = 1 FOR UPDATE/.test(sql) ? { rows: [EMPRESA] } : null);
    await assert.rejects(
      servicio.actualizarEmpresa({ identificacion: '20405047' }, '4'),
      e => e.status === 400 && /9 dígitos/.test(e.message) && /8/.test(e.message)
    );
    assert.equal(hubo(log, /INSERT INTO empresa/), false);
    assert.equal(hubo(log, /bitacora_cambio/), false);
    assert.ok(sqls(log).includes('ROLLBACK'));
  });

  test('cambiar el teléfono guarda y deja en la bitácora solo eso, antes del COMMIT', async () => {
    const { servicio, log } = montar((sql, params) => {
      if (/FROM empresa WHERE id = 1 FOR UPDATE/.test(sql)) return { rows: [EMPRESA] };
      if (/INSERT INTO empresa/.test(sql)) return { rows: [{ ...EMPRESA, telefono: '24530000' }] };
      if (/INSERT INTO bitacora_cambio/.test(sql)) return { rows: [{ id: '7' }] };
      return null;
    });
    const r = await servicio.actualizarEmpresa({ telefono: '24530000' }, '4');
    assert.equal(r.telefono, '24530000');

    const iBitacora = log.findIndex(l => /INSERT INTO bitacora_cambio/.test(l.sql));
    const iCommit = log.findIndex(l => l.sql === 'COMMIT');
    assert.ok(iBitacora > -1 && iBitacora < iCommit, 'la bitácora tiene que entrar antes del COMMIT');
    const params = log[iBitacora].params;
    assert.equal(params[2], 'editar');
    assert.deepEqual(JSON.parse(params[5]), { telefono: ['86477036', '24530000'] }, 'actualizado_en no cuenta como cambio');
    assert.strictEqual(params[6], 4, 'el usuario del token ("4") se guarda como número');
  });

  test('la identificación se guarda sin guiones ni espacios', async () => {
    const { servicio, log } = montar((sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [EMPRESA] };
      if (/INSERT INTO empresa/.test(sql)) return { rows: [EMPRESA] };
      if (/bitacora_cambio/.test(sql)) return { rows: [{ id: 1 }] };
      return null;
    });
    await servicio.actualizarEmpresa({ identificacion: '2-0405-0474' }, 4);
    const insert = log.find(l => /INSERT INTO empresa/.test(l.sql));
    assert.ok(insert.params.includes('204050474'));
  });

  test('un correo que no es correo se rechaza', async () => {
    const { servicio } = montar(sql => /FOR UPDATE/.test(sql) ? { rows: [EMPRESA] } : null);
    await assert.rejects(servicio.actualizarEmpresa({ correo: 'tachi arroba gmail' }, 4), e => e.status === 400 && /correo/.test(e.message));
  });
});

describe('catálogos', () => {
  test('un catálogo que no existe es 404 y no toca la base', async () => {
    const { servicio, log } = montar();
    for (const nombre of ['usuarios', 'impuesto; DROP TABLE empresa', '__proto__', 'constructor']) {
      await assert.rejects(servicio.crearEnCatalogo(nombre, { nombre: 'x' }, 4), e => e.status === 404, nombre);
    }
    assert.equal(log.length, 0);
  });

  test('crear un plazo sin días no llega a la base', async () => {
    const { servicio, log } = montar();
    await assert.rejects(servicio.crearEnCatalogo('plazos', { nombre: '45 días' }, 4), e => e.status === 400 && /Días/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('solo se escriben las columnas de la lista blanca', async () => {
    const { servicio, log } = montar((sql) => {
      if (/INSERT INTO plazo_credito/.test(sql)) return { rows: [{ id: 9, nombre: '45 días', dias: 45, activo: true }] };
      if (/bitacora_cambio/.test(sql)) return { rows: [{ id: 1 }] };
      return null;
    });
    await servicio.crearEnCatalogo('plazos', { nombre: '45 días', dias: 45, alegra_id: '999', activo: false, 'id; DROP TABLE x': 1 }, 4);
    const insert = log.find(l => /INSERT INTO plazo_credito/.test(l.sql));
    assert.match(insert.sql, /INSERT INTO plazo_credito \(nombre, dias\) VALUES \(\$1, \$2\)/);
    assert.deepEqual(insert.params, ['45 días', 45]);
  });

  test('una tarifa de 150 % se rechaza', async () => {
    const { servicio, log } = montar();
    await assert.rejects(servicio.editarEnCatalogo('impuestos', 3, { tarifa: 150 }, 4), e => e.status === 400 && /Tarifa/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('editar sin datos o con un id inválido se explica', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.editarEnCatalogo('plazos', 2, { nada: 1 }, 4), /No vino ningún dato/);
    await assert.rejects(servicio.editarEnCatalogo('plazos', 'abc', { dias: 5 }, 4), /Identificador inválido/);
  });

  test('un plazo con días repetidos es 409 con mensaje, no un 500', async () => {
    const { servicio, log } = montar((sql) => {
      if (/INSERT INTO plazo_credito/.test(sql)) {
        const e = new Error('duplicate key value violates unique constraint "plazo_credito_dias_key"');
        e.code = '23505'; e.constraint = 'plazo_credito_dias_key';
        throw e;
      }
      return null;
    });
    await assert.rejects(servicio.crearEnCatalogo('plazos', { nombre: 'Mes', dias: 30 }, 4),
      e => e.status === 409 && /número de días/.test(e.message));
    assert.ok(sqls(log).includes('ROLLBACK'));
  });
});

describe('siempre queda uno activo', () => {
  const METODO = { id: 1, clave: 'efectivo', nombre: 'Efectivo', activo: true };

  test('desactivar el último método de pago activo es 409 y no se escribe nada', async () => {
    const { servicio, log } = montar((sql) => {
      if (/FROM metodo_pago WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [METODO] };
      if (/COUNT\(\*\)::int AS otros/.test(sql)) return { rows: [{ otros: 0 }] };
      return null;
    });
    await assert.rejects(servicio.cambiarActivo('metodos-pago', 1, false, 4),
      e => e.status === 409 && /al menos un método de pago activo/.test(e.message));
    assert.equal(hubo(log, /UPDATE metodo_pago/), false);
    assert.equal(hubo(log, /bitacora_cambio/), false);
    assert.ok(sqls(log).includes('ROLLBACK'));
  });

  test('con otros activos se desactiva y queda en la bitácora', async () => {
    const { servicio, log } = montar((sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [METODO] };
      if (/AS otros/.test(sql)) return { rows: [{ otros: 5 }] };
      if (/UPDATE metodo_pago SET activo/.test(sql)) return { rows: [{ ...METODO, activo: false }] };
      if (/bitacora_cambio/.test(sql)) return { rows: [{ id: 1 }] };
      return null;
    });
    const r = await servicio.cambiarActivo('metodos-pago', 1, false, 4);
    assert.equal(r.activo, false);
    const b = log.find(l => /bitacora_cambio/.test(l.sql));
    assert.equal(b.params[2], 'desactivar');
    assert.ok(sqls(log).indexOf('COMMIT') > log.indexOf(b));
  });

  test('"activo" tiene que ser sí o no, no un texto', async () => {
    const { servicio, log } = montar();
    await assert.rejects(servicio.cambiarActivo('plazos', 1, 'false', 4), e => e.status === 400);
    assert.equal(log.length, 0);
  });
});

describe('lectura', () => {
  test('para operar solo va lo activo y la empresa sin datos internos', async () => {
    const { servicio, log } = montar((sql) => {
      if (/FROM empresa/.test(sql)) return { rows: [{ ...EMPRESA, regimen: 'Régimen tradicional', barrio: 'x' }] };
      return { rows: [] };
    });
    const r = await servicio.catalogosParaOperar();
    for (const tabla of ['impuesto', 'metodo_pago', 'plazo_credito', 'cuenta_dinero']) {
      assert.ok(log.some(l => new RegExp(`FROM ${tabla} WHERE activo = TRUE`).test(l.sql)), `${tabla} sin filtro de activos`);
    }
    assert.equal(r.empresa.nombre, 'Distribuidora Tachi');
    // El régimen es de uso interno y no sale del módulo de Configuración.
    assert.equal('regimen' in r.empresa, false);
    // La actividad económica SÍ sale: va impresa en cada factura junto a su
    // descripción, así que no es un dato interno. Lo mismo los términos de
    // pago, que son por dónde le pagan a la empresa.
    assert.equal(r.empresa.actividad_economica, EMPRESA.actividad_economica);
    assert.equal('actividad_economica_nombre' in r.empresa, true);
    assert.equal('terminos_pago' in r.empresa, true);
  });

  test('la pantalla de Configuración ve también lo inactivo', async () => {
    const { servicio, log } = montar(() => ({ rows: [] }));
    await servicio.obtenerConfiguracion();
    assert.equal(log.some(l => /WHERE activo/.test(l.sql)), false);
  });
});
