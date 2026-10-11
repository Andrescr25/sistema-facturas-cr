const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * Las cuentas del portal se manejan sin Alegra.
 *
 * ANTES. Listar la pestaña recorría hasta 900 contactos de Alegra paginados de
 * a 30, CADA VEZ que alguien la abría, solo para dibujar una lista. Y crear una
 * invitación le pedía la ficha a Alegra: no se podía invitar a un cliente que
 * no existiera también allá, y si Alegra no contestaba no se podía invitar a
 * nadie.
 *
 * AHORA salen de `cliente`, y la cuenta se llavea por NUESTRO id. Mientras esa
 * columna fuera el contacto de Alegra, el portal no podía existir sin Alegra.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaAuth = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.auth.js');
const rutaAlegra = path.join(__dirname, '..', 'src', 'integrations', 'alegra', 'index.js');
const rutaWhatsapp = path.join(__dirname, '..', 'src', 'integrations', 'whatsapp', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.service.js');

const FICHA = {
  id: 111, nombre: 'KEPESCA', identificacion: '100000000', correo: 'kepesca@correo.com',
  telefono: '2461 1234', telefono_secundario: null, celular: '7236 6788 KENDALL',
  cuenta_id: null, cuenta_activa: null, usuario: null, ultimo_ingreso: null,
  pedidos: 0, ultimo_pedido: null, invitacion_vence: null
};

function montar(filas = [FICHA]) {
  for (const r of [rutaDb, rutaAuth, rutaAlegra, rutaWhatsapp, rutaServicio]) delete require.cache[r];

  const visto = { consultas: [], alegraLlamado: false };
  const ejecutar = async (sql, params) => {
    visto.consultas.push({ sql, params });
    if (/FROM cliente WHERE id = \$1/.test(sql)) return { rows: filas };
    if (/FROM cliente c/.test(sql)) return { rows: filas };
    return { rows: [] };
  };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { query: ejecutar, pool: { query: ejecutar } }
  };
  // Si alguien vuelve a llamar a Alegra desde acá, la prueba lo grita.
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getClient: () => {
        visto.alegraLlamado = true;
        throw new Error('el portal NO puede depender de Alegra');
      }
    }
  };
  require.cache[rutaWhatsapp] = {
    id: rutaWhatsapp, filename: rutaWhatsapp, loaded: true,
    exports: { enviarTexto: async () => ({ telefono: '50672366788' }) }
  };

  delete require.cache[rutaAuth];
  return { servicio: require(rutaServicio), visto };
}

const consulta = (visto, re) => visto.consultas.find(c => re.test(c.sql));

describe('listar las cuentas', () => {
  test('sale de la base propia, sin tocar Alegra', async () => {
    const { servicio, visto } = montar();
    const lista = await servicio.listarClientes({});

    assert.equal(visto.alegraLlamado, false, 'volvió a recorrer los contactos de Alegra');
    assert.equal(lista.length, 1);
    assert.equal(lista[0].nombre, 'KEPESCA');
  });

  test('un cliente sin cuenta aparece como "sin_cuenta"', async () => {
    const { servicio } = montar();
    const lista = await servicio.listarClientes({});
    assert.equal(lista[0].estado, 'sin_cuenta');
  });

  test('con la cuenta ya activada, aparece como activo', async () => {
    const { servicio } = montar([{ ...FICHA, cuenta_id: 5, cuenta_activa: true, usuario: 'kepesca' }]);
    const lista = await servicio.listarClientes({});
    assert.equal(lista[0].estado, 'activo');
  });

  test('una cuenta revocada se distingue', async () => {
    const { servicio } = montar([{ ...FICHA, cuenta_id: 5, cuenta_activa: false, usuario: 'kepesca' }]);
    const lista = await servicio.listarClientes({});
    assert.equal(lista[0].estado, 'revocado');
  });

  test('se cruza por NUESTRO id, no por el contacto de Alegra', async () => {
    const { servicio, visto } = montar();
    await servicio.listarClientes({});
    assert.match(consulta(visto, /FROM cliente c/).sql, /cp\.cliente_id = c\.id/);
  });
});

describe('invitar a un cliente', () => {
  test('la ficha sale de nuestra base, no de Alegra', async () => {
    const { servicio, visto } = montar();
    const r = await servicio.generarInvitacion(111, 4);

    assert.equal(visto.alegraLlamado, false);
    assert.equal(r.nombre, 'KEPESCA');
    assert.equal(r.clienteId, 111);
  });

  test('un cliente que no existe se dice, no se inventa', async () => {
    const { servicio } = montar([]);
    await assert.rejects(servicio.generarInvitacion(999, 4), /No existe ese cliente/);
  });

  test('la cuenta se llavea por cliente_id', async () => {
    const { servicio, visto } = montar();
    await servicio.generarInvitacion(111, 4);
    assert.match(consulta(visto, /INSERT INTO cliente_portal/).sql, /ON CONFLICT \(cliente_id\)/);
  });

  test('las invitaciones viejas sin usar se matan', async () => {
    // Si alguien reenvía el enlace, el anterior no debe seguir sirviendo.
    const { servicio, visto } = montar();
    await servicio.generarInvitacion(111, 4);

    const q = consulta(visto, /UPDATE cliente_invitacion SET expira_en = CURRENT_TIMESTAMP/);
    assert.match(q.sql, /cliente_id = \$1/);
  });

  test('los teléfonos salen de nuestras columnas, con la lógica de siempre', async () => {
    // "7236 6788 KENDALL" trae el nombre de quien contesta pegado: la ayuda
    // que ya sabe leer fichas sucias no se copia, se reusa.
    const { servicio } = montar();
    const r = await servicio.generarInvitacion(111, 4);

    assert.ok(r.telefonos.length > 0, 'no se encontró ningún teléfono usable');
    assert.ok(r.telefonos.some(t => t.nacional === '72366788'));
  });
});

describe('revocar y reactivar', () => {
  test('revocar usa nuestro id', async () => {
    const { servicio, visto } = montar();
    await servicio.revocarAcceso(111).catch(() => {});
    assert.match(consulta(visto, /UPDATE cliente_portal SET activo = FALSE/).sql, /cliente_id = \$1/);
  });

  test('reactivar usa nuestro id', async () => {
    const { servicio, visto } = montar();
    await servicio.reactivarAcceso(111).catch(() => {});
    assert.match(consulta(visto, /UPDATE cliente_portal SET activo = TRUE/).sql, /cliente_id = \$1/);
  });
});
