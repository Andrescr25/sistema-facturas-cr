const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Maestro de clientes propio: validación, identificación que calza con su
 * tipo, teléfonos que sirven, bitácora y lo que se le muestra al resto del
 * sistema. La base es un doble.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'clientes', 'clientes.service.js');

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

// Una fila como la devuelve pg.
const PULPERIA = {
  id: 7, nombre: 'PULPERÍA LA ESQUINA', tipo_identificacion: 'CJ', identificacion: '3101123456',
  correo: 'pulperia@correo.com', correos_adicionales: [], telefono: '2453 1234', telefono_secundario: null,
  celular: '8827 2453', provincia: 'Alajuela', canton: 'Palmares', distrito: 'Zaragoza', barrio: null,
  otras_senas: null, actividad_economica: '523402', plazo_credito_id: 3, limite_credito: '250000.00',
  exoneracion: null, observaciones: null, activo: true, alegra_id: '90', actualizado_en: '2026-09-11'
};

const VALIDO = { nombre: 'PULPERÍA NUEVA', tipo_identificacion: 'CF', identificacion: '1-0234-0567', celular: '8827 2453' };

function base({ cliente = PULPERIA, plazoActivo = true } = {}) {
  let actual = { ...cliente };
  return (sql, p) => {
    if (/FROM plazo_credito WHERE id = \$1/.test(sql)) return { rows: [{ id: p[0], activo: plazoActivo }] };
    if (/INSERT INTO cliente/.test(sql)) {
      const columnas = sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      actual = { ...cliente, id: 50, ...Object.fromEntries(columnas.map((c, i) => [c, p[i]])) };
      return { rows: [{ ...actual }] };
    }
    if (/FROM cliente WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [{ ...actual }] };
    if (/^UPDATE cliente SET/.test(sql)) {
      const cols = sql.match(/SET (.+?), actualizado_en/)[1].split(', ').map(x => x.split(' = ')[0]);
      actual = { ...actual };
      cols.forEach((c, i) => { actual[c] = p[i]; });
      return { rows: [{ ...actual }] };
    }
    if (/INSERT INTO bitacora_cambio/.test(sql)) return { rows: [{ id: '1' }] };
    if (/WHERE c\.id = \$1/.test(sql)) return { rows: [{ ...actual, plazo: '15 días', plazo_dias: 15 }] };
    if (/COUNT\(\*\) OVER\(\)/.test(sql)) return { rows: [{ ...actual, total: '1', plazo: '15 días', plazo_dias: 15 }] };
    return null;
  };
}

describe('crear cliente', () => {
  test('la actividad con punto se guarda y se edita sin perder el separador', async () => {
    const { servicio } = montar(base());
    const creada = await servicio.crearCliente({ ...VALIDO, actividad_economica: ' 4752.1 ' }, 4);
    assert.equal(creada.actividad_economica, '4752.1');
    const editada = await servicio.editarCliente(creada.id, { actividad_economica: '4711.1' }, 4);
    assert.equal(editada.actividad_economica, '4711.1');
  });

  test('los códigos numéricos anteriores y la actividad vacía siguen permitidos', async () => {
    const { servicio } = montar(base());
    for (const actividad of ['523402', '47521', null, '']) {
      const creada = await servicio.crearCliente({ ...VALIDO, actividad_economica: actividad }, 4);
      assert.equal(creada.actividad_economica, actividad || null);
    }
  });

  test('letras, puntos sueltos o repetidos y códigos demasiado largos se rechazan antes de escribir', async () => {
    const { servicio, log } = montar(base());
    for (const actividad of ['4752.a', '.', '.47521', '47521.', '4752..1', '4752,1', '12345678901']) {
      await assert.rejects(servicio.crearCliente({ ...VALIDO, actividad_economica: actividad }, 4),
        e => e.status === 400 && /Actividad económica/.test(e.message));
    }
    assert.equal(log.length, 0);
  });

  test('sin nombre no llega a la base', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.crearCliente({ celular: '8827 2453' }, 4), e => e.status === 400 && /Nombre/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('una cédula jurídica con 9 dígitos se rechaza diciendo cuántos faltan', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(
      servicio.crearCliente({ nombre: 'X', tipo_identificacion: 'CJ', identificacion: '310112345' }, 4),
      e => e.status === 400 && /jurídica tiene 10 dígitos, y esa tiene 9/.test(e.message)
    );
    assert.equal(log.length, 0);
  });

  test('la identificación se guarda sin guiones', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearCliente(VALIDO, 4);
    const insert = log.find(l => /INSERT INTO cliente/.test(l.sql));
    const columnas = insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    assert.equal(insert.params[columnas.indexOf('identificacion')], '102340567');
  });

  test('el pasaporte se guarda como viene, con letras y todo', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearCliente({ nombre: 'TURISTA', tipo_identificacion: 'EXTRANJERO', identificacion: 'X-99 ABC' }, 4);
    const insert = log.find(l => /INSERT INTO cliente/.test(l.sql));
    const columnas = insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    assert.equal(insert.params[columnas.indexOf('identificacion')], 'X-99 ABC');
  });

  test('un teléfono que no es un teléfono no se guarda', async () => {
    const { servicio, log } = montar(base());
    // Es la lección de los teléfonos sucios: 75 fichas no tienen ninguno usable.
    await assert.rejects(servicio.crearCliente({ nombre: 'X', celular: 'preguntar por doña Ana' }, 4), e => e.status === 400 && /Celular/.test(e.message));
    await assert.rejects(servicio.crearCliente({ nombre: 'X', telefono: '8827 2453 / 2453 1234' }, 4), e => e.status === 400 && /un solo número/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('un correo que no parece correo no se guarda, ni en la lista de otros', async () => {
    const { servicio } = montar(base());
    await assert.rejects(servicio.crearCliente({ nombre: 'X', correo: 'pulperia arroba correo' }, 4), e => e.status === 400 && /no parece un correo/.test(e.message));
    await assert.rejects(servicio.crearCliente({ nombre: 'X', correos_adicionales: ['bien@correo.com', 'mal'] }, 4), e => e.status === 400);
  });

  test('los otros correos se guardan como lista, sin repetidos', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearCliente({ ...VALIDO, correos_adicionales: ['Uno@Correo.com', 'uno@correo.com', 'dos@correo.com'] }, 4);
    const insert = log.find(l => /INSERT INTO cliente/.test(l.sql));
    const columnas = insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    assert.deepEqual(insert.params[columnas.indexOf('correos_adicionales')], ['uno@correo.com', 'dos@correo.com']);
  });

  test('un plazo inactivo no se asigna', async () => {
    const { servicio, log } = montar(base({ plazoActivo: false }));
    await assert.rejects(servicio.crearCliente({ ...VALIDO, plazo_credito_id: 3 }, 4), e => e.status === 400 && /Plazo/.test(e.message));
    assert.equal(hubo(log, /INSERT INTO cliente/), false);
  });

  test('lo que no está en la lista blanca se ignora', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearCliente({ ...VALIDO, activo: false, alegra_id: '999', saldo: 1000 }, 4);
    const insert = log.find(l => /INSERT INTO cliente/.test(l.sql));
    for (const prohibida of ['activo', 'alegra_id', 'saldo']) {
      assert.equal(insert.sql.includes(prohibida), false, `${prohibida} no puede venir de la pantalla`);
    }
  });

  test('queda en la bitácora', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearCliente(VALIDO, 4);
    assert.ok(hubo(log, /INSERT INTO bitacora_cambio/));
    assert.ok(hubo(log, /^COMMIT$/));
  });
});

describe('editar cliente', () => {
  test('sin datos no hace nada', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.editarCliente(7, {}, 4), e => e.status === 400);
    assert.equal(log.length, 0);
  });

  test('un cliente que no existe da 404', async () => {
    const { servicio } = montar((sql) => (/FOR UPDATE/.test(sql) ? { rows: [] } : null));
    await assert.rejects(servicio.editarCliente(7, { nombre: 'OTRO' }, 4), e => e.status === 404);
  });

  test('cambiar SOLO el tipo tiene que calzar con el número que ya estaba', async () => {
    // La ficha tiene 3101123456 (10 dígitos, jurídica). Pasarla a física sin
    // tocar el número dejaría una identificación imposible.
    const { servicio, log } = montar(base());
    await assert.rejects(
      servicio.editarCliente(7, { tipo_identificacion: 'CF' }, 4),
      e => e.status === 400 && /física tiene 9 dígitos, y esa tiene 10/.test(e.message)
    );
    assert.equal(hubo(log, /^UPDATE cliente SET/), false);
    assert.ok(hubo(log, /^ROLLBACK$/));
  });

  test('el cambio queda en la bitácora con el antes y el después', async () => {
    const { servicio, log } = montar(base());
    await servicio.editarCliente(7, { nombre: 'PULPERÍA LA ESQUINITA' }, 4);
    const bitacora = params(log, /INSERT INTO bitacora_cambio/);
    const texto = JSON.stringify(bitacora);
    assert.ok(/PULPERÍA LA ESQUINA/.test(texto) && /ESQUINITA/.test(texto));
  });
});

describe('activar y desactivar', () => {
  test('desactivar no borra: cambia el estado y lo anota', async () => {
    const { servicio, log } = montar(base());
    await servicio.cambiarEstadoCliente(7, false, 4);
    assert.equal(hubo(log, /DELETE/), false);
    assert.ok(hubo(log, /^UPDATE cliente SET activo/));
    assert.equal(params(log, /INSERT INTO bitacora_cambio/).includes('desactivar'), true);
  });

  test('poner el mismo estado no escribe nada', async () => {
    const { servicio, log } = montar(base());
    await servicio.cambiarEstadoCliente(7, true, 4);
    assert.equal(hubo(log, /^UPDATE cliente SET/), false);
    assert.equal(hubo(log, /INSERT INTO bitacora_cambio/), false);
  });

  test('activo tiene que ser sí o no', async () => {
    const { servicio } = montar(base());
    await assert.rejects(servicio.cambiarEstadoCliente(7, 'quizás', 4), e => e.status === 400);
  });
});

describe('listar y buscar', () => {
  test('un estado que no existe se rechaza antes de consultar', async () => {
    const { servicio, log } = montar(base());
    await assert.rejects(servicio.listarClientes({ estado: 'borrados' }), e => e.status === 400);
    assert.equal(log.length, 0);
  });

  test('busca por nombre, identificación y correo, sin acentos', async () => {
    const { servicio, log } = montar(base());
    await servicio.listarClientes({ buscar: 'pulpería esquina' });
    const consulta = log[0];
    assert.match(consulta.sql, /c\.nombre.*c\.identificacion.*c\.correo/);
    assert.deepEqual(consulta.params.slice(0, 2), ['%pulperia%', '%esquina%']);
  });

  test('nadie puede pedir más de 100 de un golpe', async () => {
    const { servicio, log } = montar(base());
    await servicio.listarClientes({ limite: 5000 });
    assert.equal(log[0].params.includes(100), true);
  });

  test('los de crédito son los que tienen un plazo de más de 0 días', async () => {
    const { servicio, log } = montar(base());
    await servicio.listarClientes({ conCredito: 'true' });
    assert.match(log[0].sql, /plazo_credito_id IS NOT NULL AND COALESCE\(p\.dias, 0\) > 0/);
  });
});

describe('lo que ven las otras pantallas', () => {
  test('para facturar no viaja el límite de crédito ni las observaciones', async () => {
    const { servicio } = montar(base());
    const r = await servicio.clientesParaOperar({ buscar: 'pulpería' });
    assert.equal('limite_credito' in r.data[0], false);
    assert.equal('observaciones' in r.data[0], false);
    assert.equal(r.data[0].nombre, 'PULPERÍA LA ESQUINA');
    assert.equal(r.data[0].plazo_dias, 15);
  });

  test('solo los activos', async () => {
    const { servicio, log } = montar(base());
    await servicio.clientesParaOperar({});
    assert.match(log[0].sql, /c\.activo = TRUE/);
  });
});

/**
 * Qué es una identificación válida.
 *
 * Las reglas se contrastaron contra las 247 fichas cargadas antes de
 * escribirlas: una regla inventada que rechaza una cédula legítima es peor
 * que no tenerla, porque deja a un cliente real sin poder guardarse.
 */
describe('la identificación tiene que calzar con su tipo', () => {
  const crear = (extra) => {
    const { servicio } = montar(base());
    return servicio.crearCliente({ nombre: 'ZZ', ...extra }, 4);
  };

  test('una cédula física con letras se rechaza', async () => {
    // Tiene nueve caracteres, así que pasaba el largo. El error aparecería
    // recién el día que esa factura se le mandara a Hacienda.
    await assert.rejects(
      crear({ tipo_identificacion: 'CF', identificacion: '1ABCD6789' }),
      /solo números/
    );
  });

  test('una cédula jurídica que no empieza con 3 se rechaza', async () => {
    await assert.rejects(
      crear({ tipo_identificacion: 'CJ', identificacion: '1102920581' }),
      /empieza con 3/
    );
  });

  test('el pasaporte se guarda como viene: puede traer letras', async () => {
    const { servicio, log } = montar(base());
    await servicio.crearCliente({ nombre: 'ZZ', tipo_identificacion: 'EXTRANJERO', identificacion: 'AB-123456' }, 4);
    const insert = log.find(l => /INSERT INTO cliente/.test(l.sql));
    const columnas = insert.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    assert.equal(insert.params[columnas.indexOf('identificacion')], 'AB-123456');
  });

  test('no se inventa una regla de provincia para la cédula física', async () => {
    // De las cargadas, ocho empiezan con 8 o 9. La regla que uno esperaría
    // —provincia del 1 al 7— las dejaría a todas sin poder guardarse.
    for (const n of ['801230456', '901230456', '401230456']) {
      const { servicio } = montar(base());
      await servicio.crearCliente({ nombre: 'ZZ', tipo_identificacion: 'CF', identificacion: n }, 4);
    }
  });

  test('sin tipo no se inventa ninguna regla', async () => {
    const { servicio } = montar(base());
    await servicio.crearCliente({ nombre: 'ZZ', identificacion: '12345' }, 4);
  });
});

describe('avisar de una identificación repetida', () => {
  /** Una base que devuelve `filas` para la consulta de coincidencias. */
  const conFichas = (filas) => montar((sql) => {
    if (/FROM cliente WHERE identificacion = \$1/.test(sql)) {
      return { rows: filas.map(f => ({ ...f, total: filas.length })) };
    }
    return null;
  });

  test('dice con quién choca y cuántas son', async () => {
    const { servicio } = conFichas([
      { id: 1, nombre: 'WILBERTH BUZANO', tipo_identificacion: 'CF', activo: true },
      { id: 2, nombre: 'WILBERTH BUZANO', tipo_identificacion: 'CF', activo: true }
    ]);
    const r = await servicio.fichasConIdentificacion('100010000');

    assert.equal(r.total, 2);
    assert.deepEqual(r.fichas.map(f => f.nombre), ['WILBERTH BUZANO', 'WILBERTH BUZANO']);
  });

  test('NO bloquea: solo informa', async () => {
    // 139 fichas comparten el número del cliente de mostrador. Si esto
    // impidiera guardar, no se podría dar de alta la próxima pulpería.
    const { servicio } = conFichas([{ id: 1, nombre: 'AB ANA', tipo_identificacion: null, activo: true }]);
    const r = await servicio.fichasConIdentificacion('100000000');
    assert.ok(r.total > 0, 'informa');
    assert.ok(!(r instanceof Error), 'no levanta un error');
  });

  test('trae el total aunque solo muestre las primeras', async () => {
    const { servicio, log } = conFichas([{ id: 1, nombre: 'AB ANA', activo: true }]);
    await servicio.fichasConIdentificacion('100000000');
    const consulta = log.find(l => /FROM cliente WHERE identificacion/.test(l.sql));

    assert.match(consulta.sql, /COUNT\(\*\) OVER\(\)/, 'sin el total, decir "5" haría creer que se pueden revisar a ojo');
    assert.match(consulta.sql, /LIMIT 5/);
  });

  test('la ficha que se está editando no choca consigo misma', async () => {
    const { servicio, log } = conFichas([]);
    await servicio.fichasConIdentificacion('3101123456', 7);
    const consulta = log.find(l => /FROM cliente WHERE identificacion/.test(l.sql));

    assert.match(consulta.sql, /id <> \$2/);
    assert.deepEqual(consulta.params, ['3101123456', 7]);
  });

  test('sin identificación no se consulta nada', async () => {
    const { servicio, log } = conFichas([]);
    const r = await servicio.fichasConIdentificacion('');

    assert.deepEqual(r, { total: 0, fichas: [] });
    assert.equal(log.length, 0, 'preguntar por vacío traería fichas que no tienen nada que ver');
  });
});
