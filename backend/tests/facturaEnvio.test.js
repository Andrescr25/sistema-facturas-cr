const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

/**
 * Mandarle al cliente su factura por WhatsApp.
 *
 * Lo que se cuida:
 *  - que una factura ANULADA no se mande: es un documento sin valor y
 *    mandarlo invita a que lo paguen;
 *  - que el número se valide antes de salir, porque las fichas traen cosas
 *    como "89350207 JEISON" y mandarle la factura de un cliente a un
 *    desconocido es el error que importa acá;
 *  - que el envío quede REGISTRADO con el cliente y el número al que de
 *    verdad llegó, incluso cuando falla.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaEnvios = path.join(__dirname, '..', 'src', 'modules', 'envios-whatsapp', 'envios.service.js');
const rutaWhats = path.join(__dirname, '..', 'src', 'integrations', 'whatsapp', 'index.js');
const rutaConsulta = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaConsulta.service.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaEnvio.service.js');

const FACTURA = {
  id: 500, numero: '001000014868', estado: 'emitida', tipoDocumento: 'factura', electronica: false,
  fecha: '2026-09-12', moneda: 'CRC',
  cliente: { id: 7, nombre: 'PULPERÍA LA ESQUINA', identificacion: '3101123456', telefono: '8827 2453' },
  condicionVenta: 'contado', subtotal: 2700, descuento: 0, impuesto: 351, total: 3051,
  cobrado: 0, acreditado: 0, saldo: 3051,
  lineas: [{
    numeroLinea: 1, nombre: 'TORNILLO', referencia: 'TOR02', cabys: '4294401030100',
    cantidad: 3, precioUnitario: 1000, descuentoPorcentaje: 0, descuentoMonto: 0,
    tarifa: 13, impuestoMonto: 351, total: 3051
  }]
};

function montar({ factura = FACTURA, fallaEnvio = null, ficha = { telefono: '8827 2453 MARIO', celular: null } } = {}) {
  const enviados = [];
  const anotado = [];

  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    if (/FROM empresa/.test(texto)) return { rows: [{ nombre: 'Distribuidora Tachi', identificacion: '204050474' }] };
    if (/FROM cliente WHERE id/.test(texto)) return { rows: ficha ? [{ ...ficha }] : [] };
    if (/INSERT INTO envio_whatsapp/.test(texto)) { anotado.push(params); return { rows: [] }; }
    return { rows: [] };
  };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { query: ejecutar, connect: async () => ({ query: ejecutar, release: () => {} }) }, query: ejecutar }
  };
  require.cache[rutaWhats] = {
    id: rutaWhats, filename: rutaWhats, loaded: true,
    exports: {
      enviarDocumento: async (datos) => {
        if (fallaEnvio) throw new Error(fallaEnvio);
        enviados.push(datos);
        return { numero: datos.telefono, enviado: true };
      },
      enviarTexto: async () => ({ numero: 'x' })
    }
  };
  require.cache[rutaConsulta] = {
    id: rutaConsulta, filename: rutaConsulta, loaded: true,
    exports: { obtenerFactura: async () => JSON.parse(JSON.stringify(factura)) }
  };

  delete require.cache[rutaEnvios];
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), enviados, anotado };
}

beforeEach(() => {
  for (const r of [rutaDb, rutaEnvios, rutaWhats, rutaConsulta, rutaServicio]) delete require.cache[r];
});

describe('a qué número', () => {
  test('propone los de la ficha, con los celulares primero', async () => {
    const { servicio } = montar({ ficha: { telefono: '2453 1122', celular: '8827 2453' } });
    const r = await servicio.telefonosParaFactura(500);
    assert.equal(r.candidatos[0].esMovil, true, 'el celular va primero: es donde llega un WhatsApp');
    assert.equal(r.candidatos[0].numero, '50688272453');
  });

  test('lo que no se pudo leer se avisa, no se descarta en silencio', async () => {
    // "89350207 JEISON": de 120 fichas revisadas, 19 traían algo así.
    const { servicio } = montar({ ficha: { telefono: '89350207 JEISON', celular: null } });
    const r = await servicio.telefonosParaFactura(500);
    assert.equal(r.candidatos.length + r.sinReconocer.length > 0, true);
  });
});

describe('mandar la factura', () => {
  const BIEN = { telefono: '8827 2453', mensaje: 'Le paso su factura, gracias por la compra.' };

  test('adjunta el PDF propio, no un enlace', async () => {
    const { servicio, enviados } = montar();
    await servicio.enviarFacturaPorWhatsApp(500, { ...BIEN, usuarioId: 4 });
    assert.equal(enviados.length, 1);
    assert.equal(Buffer.isBuffer(enviados[0].pdf), true, 'no mandó el archivo');
    assert.equal(enviados[0].pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(enviados[0].nombreArchivo, 'factura-001000014868.pdf');
    assert.equal(enviados[0].telefono, '50688272453');
  });

  test('una factura anulada no se manda', async () => {
    // Es un documento sin valor: mandarlo invita a que lo paguen.
    const { servicio, enviados } = montar({ factura: { ...FACTURA, estado: 'anulada' } });
    await assert.rejects(servicio.enviarFacturaPorWhatsApp(500, BIEN), e => e.status === 409);
    assert.equal(enviados.length, 0);
  });

  test('un número que no se entiende no sale', async () => {
    const { servicio, enviados } = montar();
    // Lo ambiguo se rechaza: con dos números en el mismo campo no se puede
    // saber a cuál de los dos iba la factura.
    for (const telefono of ['8827 2453 / 2453 1122', '123', '', 'no sé']) {
      await assert.rejects(servicio.enviarFacturaPorWhatsApp(500, { ...BIEN, telefono }), e => e.status === 400);
    }
    assert.equal(enviados.length, 0);
  });

  test('un nombre pegado al número no lo invalida', async () => {
    // Las fichas traen "89350207 JEISON". El número es el que la persona
    // quiso escribir; la anotación es del que llevó el registro.
    const { servicio, enviados } = montar();
    await servicio.enviarFacturaPorWhatsApp(500, { ...BIEN, telefono: '89350207 JEISON' });
    assert.equal(enviados[0].telefono, '50689350207');
  });

  test('sin mensaje tampoco', async () => {
    const { servicio } = montar();
    await assert.rejects(servicio.enviarFacturaPorWhatsApp(500, { ...BIEN, mensaje: '   ' }), e => e.status === 400);
  });

  test('queda registrado con el cliente y el número al que llegó', async () => {
    const { servicio, anotado } = montar();
    await servicio.enviarFacturaPorWhatsApp(500, { ...BIEN, usuarioId: 4 });
    assert.equal(anotado.length, 1);
    const [tipo, referencia, alegraId, clienteId, telefono, usuario, exito] = anotado[0];
    assert.equal(tipo, 'factura');
    assert.equal(referencia, '001000014868');
    assert.equal(alegraId, null, 'nuestro id no va en la columna de Alegra');
    assert.equal(clienteId, 7);
    assert.equal(telefono, '50688272453');
    assert.equal(usuario, 4);
    assert.equal(exito, true);
  });

  test('un envío que falla TAMBIÉN queda registrado', async () => {
    // Un "no tiene WhatsApp" repetido es un teléfono que hay que corregir en
    // la ficha; sin registro, nadie se entera.
    const { servicio, anotado } = montar({ fallaEnvio: 'ese número no tiene WhatsApp' });
    await assert.rejects(servicio.enviarFacturaPorWhatsApp(500, BIEN));
    assert.equal(anotado.length, 1);
    assert.equal(anotado[0][6], false);
    assert.match(String(anotado[0][7]), /no tiene WhatsApp/);
  });
});
