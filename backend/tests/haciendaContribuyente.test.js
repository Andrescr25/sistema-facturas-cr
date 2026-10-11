const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * La consulta pública de contribuyentes de Hacienda.
 *
 * Es un servicio de TERCEROS y se cae seguido, así que lo que se cuida es que
 * un fallo suyo no impida dar de alta a un cliente, y que lo que devuelve se
 * traduzca a algo que se pueda usar sin adivinar.
 */

const rutaAxios = require.resolve('axios');
const rutaCliente = path.join(__dirname, '..', 'src', 'integrations', 'hacienda', 'hacienda.client.js');

/** Monta el cliente con un axios falso. `respuesta` puede ser un error. */
function montar(respuesta) {
  const visto = {};
  require.cache[rutaAxios] = {
    id: rutaAxios, filename: rutaAxios, loaded: true,
    exports: {
      get: async (url, opciones) => {
        visto.url = url;
        visto.opciones = opciones;
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      }
    }
  };
  delete require.cache[rutaCliente];
  return { cliente: require(rutaCliente), visto };
}

const FARMACIA = {
  status: 200,
  data: {
    nombre: 'FARMACIAS EOS SOCIEDAD ANONIMA',
    tipoIdentificacion: '02',
    regimen: { codigo: 1, descripcion: 'Régimen general' },
    situacion: { moroso: 'NO', omiso: 'NO', estado: 'Inscrito', administracionTributaria: 'Grandes Contribuyentes' },
    actividades: [
      { estado: 'A', tipo: 'S', codigo: '4772.0', descripcion: 'Venta al por menor de productos farmacéuticos' },
      { estado: 'A', tipo: 'P', codigo: '4659.0', descripcion: 'Venta al por mayor de maquinaria' },
      { estado: 'D', tipo: 'S', codigo: '1234.0', descripcion: 'Una que dieron de baja' }
    ]
  }
};

describe('lo que se le pide a Hacienda', () => {
  test('la cédula viaja en dígitos, como la pide el servicio', async () => {
    const { cliente, visto } = montar(FARMACIA);
    await cliente.consultarContribuyente('3-101-002346');
    assert.strictEqual(visto.opciones.params.identificacion, '3101002346');
  });

  test('la consulta tiene tiempo límite: Hacienda se cae seguido', async () => {
    const { cliente, visto } = montar(FARMACIA);
    await cliente.consultarContribuyente('3101002346');
    assert.ok(visto.opciones.timeout > 0 && visto.opciones.timeout <= 15000);
  });

  test('sin cédula no se molesta al servicio', async () => {
    const { cliente } = montar(FARMACIA);
    await assert.rejects(cliente.consultarContribuyente(''), /qué cédula/);
  });
});

describe('lo que se entiende de la respuesta', () => {
  test('el tipo de Hacienda se traduce al del sistema', async () => {
    const { cliente } = montar(FARMACIA);
    const r = await cliente.consultarContribuyente('3101002346');
    assert.strictEqual(r.tipoIdentificacion, 'CJ');
  });

  test('un código de tipo desconocido queda vacío, no inventado', async () => {
    // Poner un tipo equivocado en una factura es peor que dejarlo sin poner.
    const { cliente } = montar({ status: 200, data: { ...FARMACIA.data, tipoIdentificacion: '99' } });
    const r = await cliente.consultarContribuyente('3101002346');
    assert.strictEqual(r.tipoIdentificacion, null);
  });

  test('las actividades dadas de baja no se ofrecen', async () => {
    // Ofrecerla sería empujar a que alguien escoja una que no sirve para facturar.
    const { cliente } = montar(FARMACIA);
    const r = await cliente.consultarContribuyente('3101002346');

    assert.strictEqual(r.actividades.length, 2);
    assert.ok(!r.actividades.some(a => a.codigo === '1234.0'));
  });

  test('la principal va primero: es la que se propone', async () => {
    const { cliente } = montar(FARMACIA);
    const r = await cliente.consultarContribuyente('3101002346');

    assert.strictEqual(r.actividades[0].codigo, '4659.0');
    assert.strictEqual(r.actividades[0].principal, true);
  });

  test('moroso y omiso llegan como sí o no, no como texto', async () => {
    // Quien da crédito querría saberlo antes de darlo.
    const { cliente } = montar({
      status: 200,
      data: { ...FARMACIA.data, situacion: { ...FARMACIA.data.situacion, moroso: 'SI', omiso: 'NO' } }
    });
    const r = await cliente.consultarContribuyente('3101002346');

    assert.strictEqual(r.situacion.moroso, true);
    assert.strictEqual(r.situacion.omiso, false);
  });

  test('sin actividades inscritas no revienta: devuelve la lista vacía', async () => {
    const { cliente } = montar({ status: 200, data: { ...FARMACIA.data, actividades: undefined } });
    const r = await cliente.consultarContribuyente('3101002346');
    assert.deepStrictEqual(r.actividades, []);
  });
});

describe('cuando Hacienda no ayuda', () => {
  test('una cédula que no está inscrita se dice con su número', async () => {
    const { cliente } = montar({ status: 404, data: { code: 404, status: 'Information no available' } });
    await assert.rejects(
      cliente.consultarContribuyente('999999999'),
      (e) => e.status === 404 && /999999999/.test(e.message)
    );
  });

  test('si tarda demasiado, se dice que la ficha se puede guardar igual', async () => {
    // Un servicio de terceros caído no puede impedir dar de alta a un cliente.
    const error = new Error('timeout of 8000ms exceeded');
    error.code = 'ECONNABORTED';
    const { cliente } = montar(error);

    await assert.rejects(
      cliente.consultarContribuyente('3101002346'),
      (e) => e.status === 502 && /no contestó a tiempo/.test(e.message) && /guardar igual/.test(e.message)
    );
  });

  test('si el servicio está caído, tampoco se pierde lo escrito', async () => {
    const { cliente } = montar(new Error('getaddrinfo ENOTFOUND api.hacienda.go.cr'));
    await assert.rejects(
      cliente.consultarContribuyente('3101002346'),
      (e) => e.status === 502 && /guardar igual/.test(e.message)
    );
  });

  test('una respuesta 200 sin nombre se trata como no encontrada', async () => {
    const { cliente } = montar({ status: 200, data: {} });
    await assert.rejects(cliente.consultarContribuyente('3101002346'), (e) => e.status === 404);
  });
});
