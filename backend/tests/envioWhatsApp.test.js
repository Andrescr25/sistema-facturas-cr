/**
 * El módulo compartido de WhatsApp: enviar y dejar registro.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Hasta ahora la llamada a Evolution estaba copiada en dos lugares (la orden
 * de compra y la invitación al portal), cada uno leyendo las variables de
 * entorno por su lado y armando el payload por su lado. Con las cotizaciones,
 * facturas, saldos y avisos encima serían seis copias.
 *
 * Lo que se fija acá es lo que no puede cambiar al juntarlas:
 *
 *   · el número se valida SIEMPRE antes de llamar a Evolution — por estos
 *     mensajes salen documentos del cliente, y mandarlos a un número
 *     equivocado es entregárselos a un desconocido;
 *   · un PDF viaja como archivo, nunca como enlace: los de Alegra vienen
 *     firmados, caducan en ~10 horas y son públicos;
 *   · lo que falla también se anota, porque un "no tiene WhatsApp" repetido
 *     es un teléfono que hay que corregir en Alegra;
 *   · si la base falla al anotar, el envío NO se deshace: el mensaje ya
 *     llegó y reintentarlo lo mandaría dos veces.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaAxios = require.resolve('axios');
const rutaDb = require.resolve('../config/database');
const rutaCliente = require.resolve('../src/integrations/whatsapp/whatsapp.client');
const rutaIndice = require.resolve('../src/integrations/whatsapp');
const rutaEnvios = require.resolve('../src/modules/envios-whatsapp/envios.service');

const axiosReal = require.cache[rutaAxios];

/** Sustituye axios y la base por dobles y devuelve el servicio recién cargado. */
function montar({ respuesta = { key: { id: 'MSG1' } }, fallo = null, fallaLaBase = false } = {}) {
  const registro = { peticiones: [], escrituras: [] };

  require.cache[rutaAxios] = {
    id: rutaAxios, filename: rutaAxios, loaded: true,
    exports: {
      post: async (url, payload, config) => {
        registro.peticiones.push({ url, payload, config });
        if (fallo) throw fallo;
        return { data: respuesta };
      },
      get: async () => ({ data: {} })
    }
  };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        if (fallaLaBase) throw new Error('la base no está');
        registro.escrituras.push({ sql: String(sql), params });
        return { rows: [] };
      }
    }
  };

  for (const r of [rutaCliente, rutaIndice, rutaEnvios]) delete require.cache[r];
  return { envios: require(rutaEnvios), whatsapp: require(rutaIndice), registro };
}

/** Un error de axios como el que devuelve Evolution. */
const errorHttp = (status, data = {}) => Object.assign(new Error('falló'), { response: { status, data } });

beforeEach(() => {
  process.env.WHATSAPP_API_URL = 'https://wa.ejemplo';
  process.env.WHATSAPP_INSTANCE_NAME = 'instancia_prueba';
  process.env.WHATSAPP_API_KEY = 'clave';
  for (const r of [rutaAxios, rutaDb, rutaCliente, rutaIndice, rutaEnvios]) delete require.cache[r];
});

afterEach(() => {
  if (axiosReal) require.cache[rutaAxios] = axiosReal; else delete require.cache[rutaAxios];
});

describe('mandar un texto', () => {
  test('le pega a sendText de la instancia configurada, con el 506 adelante', async () => {
    const { whatsapp, registro } = montar();
    const r = await whatsapp.enviarTexto({ telefono: '8827 2453', mensaje: 'hola' });

    assert.equal(registro.peticiones[0].url, 'https://wa.ejemplo/message/sendText/instancia_prueba');
    assert.deepEqual(registro.peticiones[0].payload, { number: '50688272453', text: 'hola' });
    assert.equal(registro.peticiones[0].config.headers.apikey, 'clave');
    assert.equal(r.telefono, '8827 2453', 'devuelve el número legible para la pantalla');
  });

  test('un número inválido NO llega a Evolution', async () => {
    // El chequeo va antes de la red a propósito: no se le pide a WhatsApp que
    // decida si un número de 6 dígitos es de alguien.
    const { whatsapp, registro } = montar();
    await assert.rejects(() => whatsapp.enviarTexto({ telefono: '882724', mensaje: 'hola' }),
      (e) => e.status === 400);
    assert.equal(registro.peticiones.length, 0);
  });

  test('un mensaje vacío tampoco', async () => {
    const { whatsapp, registro } = montar();
    await assert.rejects(() => whatsapp.enviarTexto({ telefono: '88272453', mensaje: '   ' }),
      (e) => e.status === 400);
    assert.equal(registro.peticiones.length, 0);
  });
});

describe('mandar un PDF', () => {
  const pdf = Buffer.from('%PDF-1.4 contenido de prueba');

  test('va como documento en base64, no como enlace', async () => {
    // Mandar la URL de Alegra sería darle al cliente un enlace público que se
    // rompe en unas horas.
    const { whatsapp, registro } = montar();
    await whatsapp.enviarDocumento({
      telefono: '88272453', mensaje: 'su cotización', pdf, nombreArchivo: 'cot-8.pdf'
    });

    const p = registro.peticiones[0];
    assert.equal(p.url, 'https://wa.ejemplo/message/sendMedia/instancia_prueba');
    assert.equal(p.payload.mediatype, 'document');
    assert.equal(p.payload.mimetype, 'application/pdf');
    assert.equal(p.payload.fileName, 'cot-8.pdf');
    assert.equal(p.payload.media, pdf.toString('base64'));
    assert.ok(!JSON.stringify(p.payload).includes('http'), 'no debe viajar ninguna URL');
  });

  test('sin contenido no se manda un archivo vacío', async () => {
    const { whatsapp, registro } = montar();
    await assert.rejects(() => whatsapp.enviarDocumento({ telefono: '88272453', pdf: Buffer.alloc(0) }));
    assert.equal(registro.peticiones.length, 0);
  });

  test('el bloqueo previo del canal indica que el envío nunca se inició', async () => {
    const { whatsapp, registro } = montar(), contexto = process.env.NODE_TEST_CONTEXT;
    delete process.env.NODE_TEST_CONTEXT;
    try {
      await assert.rejects(whatsapp.enviarDocumento({ telefono: '88888888', pdf }),
        e => e.status === 423 && e.envioNoIniciado === true);
      assert.equal(registro.peticiones.length, 0);
    } finally { if (contexto !== undefined) process.env.NODE_TEST_CONTEXT = contexto; }
  });

  test('un timeout tras enviar el PDF conserva la incertidumbre, sin atribuirlo a un fallo previo', async () => {
    const { whatsapp, registro } = montar({ fallo: Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }) });
    await assert.rejects(whatsapp.enviarDocumento({ telefono: '88888888', pdf }),
      e => e.envioNoIniciado !== true);
    assert.equal(registro.peticiones.length, 1);
  });
});

describe('los errores dicen qué revisar', () => {
  test('un 400 señala al sujeto correcto', async () => {
    const { whatsapp } = montar({ fallo: errorHttp(400, { message: 'Bad Request' }) });
    await assert.rejects(
      () => whatsapp.enviarTexto({ telefono: '88272453', mensaje: 'x', sujeto: 'proveedor' }),
      (e) => /8827 2453/.test(e.message) && /proveedor/.test(e.message)
    );
  });

  test('un 404 nombra la instancia, que es lo que hay que corregir', async () => {
    const { whatsapp } = montar({ fallo: errorHttp(404, {}) });
    await assert.rejects(() => whatsapp.enviarTexto({ telefono: '88272453', mensaje: 'x' }),
      (e) => /instancia_prueba/.test(e.message));
  });

  test('un timeout menciona que puede estar despertando', async () => {
    // Fuera de martes/miércoles/jueves la instancia duerme en Render y el
    // primer envío tarda ~30s. Sin decirlo, parece que se rompió.
    const { whatsapp } = montar({ fallo: Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }) });
    await assert.rejects(() => whatsapp.enviarTexto({ telefono: '88272453', mensaje: 'x' }),
      (e) => /despertando/.test(e.message));
  });
});

describe('el registro de lo que sale', () => {
  test('un envío bueno queda anotado con el número al que llegó', async () => {
    const { envios, registro } = montar();
    await envios.enviarYRegistrar({
      tipo: 'cotizacion', referencia: 'COT-8', alegraContactId: '141',
      telefono: '8827 2453', mensaje: 'su cotización', usuarioId: 4
    });

    const ins = registro.escrituras.find(e => /INSERT INTO envio_whatsapp/.test(e.sql));
    assert.ok(ins, 'debió anotarse');
    // El orden es (tipo, referencia, alegra_contact_id, cliente_id, telefono,
    // enviado_por, exito): `cliente_id` se agregó para no meter un id nuestro
    // en la columna de Alegra.
    assert.deepEqual(ins.params.slice(0, 7), ['cotizacion', 'COT-8', '141', null, '50688272453', 4, true]);
  });

  test('un envío fallido TAMBIÉN queda anotado, con el motivo', async () => {
    // Es el dato que dice que hay que corregir el teléfono en Alegra.
    const { envios, registro } = montar({ fallo: errorHttp(400, {}) });
    await assert.rejects(() => envios.enviarYRegistrar({
      tipo: 'factura', referencia: '00100001010000002454', telefono: '88272453', mensaje: 'x'
    }));

    const ins = registro.escrituras.find(e => /INSERT INTO envio_whatsapp/.test(e.sql));
    assert.equal(ins.params[6], false);
    assert.match(ins.params[7], /no pudo recibir el mensaje/);
  });

  test('si la base falla al anotar, el envío no se deshace', async () => {
    // El mensaje ya llegó: devolver un error haría que se reintente y el
    // cliente lo reciba dos veces.
    const { envios } = montar({ fallaLaBase: true });
    const r = await envios.enviarYRegistrar({
      tipo: 'pedido', referencia: '12', telefono: '88272453', mensaje: 'listo'
    });
    assert.equal(r.enviado, true);
  });

  test('un tipo desconocido se rechaza antes de mandar nada', async () => {
    const { envios, registro } = montar();
    await assert.rejects(() => envios.enviarYRegistrar({
      tipo: 'lo_que_sea', telefono: '88272453', mensaje: 'x'
    }), (e) => e.status === 400);
    assert.equal(registro.peticiones.length, 0);
  });
});

describe('los teléfonos de un cliente por su id PROPIO', () => {
  /** La base con una sola ficha: el cliente propio 8. */
  function conFicha() {
    const consultas = [];
    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true,
      exports: {
        query: async (sql, params) => {
          consultas.push({ sql: String(sql), params });
          return {
            rows: Number(params?.[0]) === 8
              ? [{ nombre: 'AB CHANA', telefono: '2445 1010', telefono_secundario: '22 33', celular: '8827 2453' }]
              : []
          };
        }
      }
    };
    for (const r of [rutaCliente, rutaIndice, rutaEnvios]) delete require.cache[r];
    return { envios: require(rutaEnvios), consultas };
  }

  test('se leen de la ficha propia, no de Alegra', async () => {
    // El cliente propio 8 es "AB CHANA"; el contacto 8 de Alegra es "EL
    // LLANO". Preguntarle a Alegra con el id propio proponía el celular de
    // otra persona (47 de los 54 deudores de Cuentas por Cobrar).
    const { envios, consultas } = conFicha();
    const r = await envios.telefonosDeCliente(8);
    assert.match(consultas[0].sql, /FROM cliente WHERE id = \$1/);
    assert.equal(r.cliente, 'AB CHANA');
    assert.equal(r.telefonos[0].nacional, '88272453', 'el celular va primero');
    assert.deepEqual(r.telefonosSinReconocer, ['22 33'], 'lo ilegible se avisa, no se descarta');
  });

  test('un cliente que no existe es 404, y un id raro es 400', async () => {
    const { envios } = conFicha();
    await assert.rejects(() => envios.telefonosDeCliente(99), (e) => e.status === 404);
    await assert.rejects(() => envios.telefonosDeCliente('abc'), (e) => e.status === 400);
  });
});
