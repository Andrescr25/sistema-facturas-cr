const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * "Suele faltar" en Facturación.
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
 */

const rutaInicio = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.inicio.service.js');
const rutaResponse = path.join(__dirname, '..', 'src', 'utils', 'response.helper.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturacion.service.js');
const rutaControlador = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturacion.controller.js');

function montar(respuesta) {
  for (const r of [rutaInicio, rutaControlador]) delete require.cache[r];

  const visto = {};
  require.cache[rutaInicio] = {
    id: rutaInicio, filename: rutaInicio, loaded: true,
    exports: {
      obtenerInicio: async (contacto) => {
        visto.contacto = contacto;
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      }
    }
  };

  const Controlador = require(rutaControlador);
  const controlador = new Controlador();

  const res = { estado: null, cuerpo: null };
  res.status = (c) => { res.estado = c; return res; };
  res.json = (b) => { res.cuerpo = b; return res; };

  return { controlador, res, visto };
}

const DATOS = {
  habituales: [{ id: '462', nombre: 'YOYO DE PESCA NEGRO', veces: 22, dias: 3 }],
  perdidos: [{ id: '900', nombre: 'TABLA MARMELO', veces: 5, dias: 199 }],
  ofertas: [{ id: '111', nombre: 'UNA OFERTA' }]
};

describe('las sugerencias del cliente al facturarle', () => {
  test('devuelve lo que compra seguido y lo que dejó de comprar', async () => {
    const { controlador, res } = montar(DATOS);
    await controlador.getSugerenciasCliente({ params: { alegraContactId: '90' } }, res);

    assert.equal(res.cuerpo.data.habituales[0].nombre, 'YOYO DE PESCA NEGRO');
    assert.equal(res.cuerpo.data.perdidos[0].dias, 199);
  });

  test('NO devuelve las ofertas: acá no vienen al caso', async () => {
    // El panel de Facturación es para recordarle al cliente lo que lleva, no
    // para vender lo que está rebajado.
    const { controlador, res } = montar(DATOS);
    await controlador.getSugerenciasCliente({ params: { alegraContactId: '90' } }, res);

    assert.equal('ofertas' in res.cuerpo.data, false);
  });

  test('el cliente que se consulta es el de la ruta', async () => {
    // En el portal sale del token porque un cliente no puede pedir la portada
    // de otro; acá quien factura es del personal y le cobra a ese cliente.
    const { controlador, res, visto } = montar(DATOS);
    await controlador.getSugerenciasCliente({ params: { alegraContactId: '1234' } }, res);

    assert.equal(visto.contacto, '1234');
  });

  test('si falla NO se cae la facturación: se responde vacío', async () => {
    // Una sugerencia que no cargó no puede impedir cobrar.
    const { controlador, res } = montar(new Error('la base dijo que no'));
    await controlador.getSugerenciasCliente({ params: { alegraContactId: '90' } }, res);

    assert.deepEqual(res.cuerpo.data, { habituales: [], perdidos: [] });
    assert.notEqual(res.estado, 500);
  });

  test('un cliente sin historial devuelve listas vacías, no un error', async () => {
    const { controlador, res } = montar({ habituales: [], perdidos: [], ofertas: [] });
    await controlador.getSugerenciasCliente({ params: { alegraContactId: '77' } }, res);

    assert.deepEqual(res.cuerpo.data, { habituales: [], perdidos: [] });
  });
});
