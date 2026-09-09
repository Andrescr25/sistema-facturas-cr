/**
 * Las líneas de una factura de venta, para el detalle de Cuentas por Cobrar.
 *
 * POR QUÉ EXISTE ESTA PRUEBA
 * El espejo local de cuentas por cobrar guarda número, fechas, total y
 * saldo — no las líneas. Se le piden a Alegra al abrir la factura, y ahí
 * hay tres formas de equivocarse que ya se equivocaron una vez:
 *
 *   · `getInvoiceById` envuelve la respuesta en { success, data }. Leer los
 *     items de la raíz devuelve cero líneas SIEMPRE, y en silencio: la
 *     pantalla dice "esta factura no trae detalle" y parece un dato que no
 *     existe en vez de un error.
 *   · La referencia llega como texto en unas facturas y como objeto en
 *     otras, según por dónde se creó la línea.
 *   · El total de línea a veces no viene y hay que calcularlo.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const rutaPrisma = require.resolve('../lib/prisma');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaEnvios = require.resolve('../src/modules/envios-whatsapp/envios.service');
const rutaServicio = require.resolve('../src/modules/cuentas-por-cobrar/cuentas-por-cobrar.service');

/** Monta el servicio con un Alegra falso que devuelve la factura indicada. */
function montar(respuesta) {
  require.cache[rutaPrisma] = { id: rutaPrisma, filename: rutaPrisma, loaded: true, exports: {} };
  require.cache[rutaEnvios] = {
    id: rutaEnvios, filename: rutaEnvios, loaded: true,
    exports: { enviarYRegistrar: async () => ({}) }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getClient: () => ({}),
      getInvoiceService: () => ({ getInvoiceById: async () => respuesta })
    }
  };
  delete require.cache[rutaServicio];
  return require(rutaServicio);
}

const linea = (o = {}) => ({
  id: '841', name: 'BOLSA 5X10 X KILO TRANSPARENTE', description: '',
  reference: 'B345', quantity: 1, price: 2800, discount: 0, total: 3164, ...o
});

describe('líneas de una factura de venta', () => {
  test('las saca de dentro de { success, data }', async () => {
    // Es la forma real que devuelve getInvoiceById. Leer de la raíz daba
    // siempre cero líneas.
    const servicio = montar({ success: true, data: { items: [linea(), linea({ id: '842' })] } });
    const r = await servicio.getProductosDeFactura('5263');
    assert.equal(r.length, 2);
    assert.equal(r[0].descripcion, 'BOLSA 5X10 X KILO TRANSPARENTE');
  });

  test('también acepta la factura sin envolver', async () => {
    const servicio = montar({ items: [linea()] });
    const r = await servicio.getProductosDeFactura('5263');
    assert.equal(r.length, 1);
  });

  test('la referencia sirve venga como texto o como objeto', async () => {
    const comoTexto = montar({ data: { items: [linea({ reference: 'B345' })] } });
    assert.equal((await comoTexto.getProductosDeFactura('1'))[0].codigo, 'B345');

    const comoObjeto = montar({ data: { items: [linea({ reference: { reference: 'B345' } })] } });
    assert.equal((await comoObjeto.getProductosDeFactura('1'))[0].codigo, 'B345');
  });

  test('respeta el total que manda Alegra, que ya trae el impuesto', async () => {
    // 1 × 2800 sin impuesto da 3164 con el 13%. Recalcularlo por nuestra
    // cuenta mostraría 2800 y la suma de líneas no cuadraría con la factura.
    const servicio = montar({ data: { items: [linea({ quantity: 1, price: 2800, total: 3164 })] } });
    const r = await servicio.getProductosDeFactura('1');
    assert.equal(r[0].precioUnitario, 2800);
    assert.equal(r[0].total, 3164);
  });

  test('si el total no viene, lo calcula con el descuento', async () => {
    const servicio = montar({ data: { items: [linea({ quantity: 4, price: 1000, discount: 10, total: undefined })] } });
    const r = await servicio.getProductosDeFactura('1');
    assert.equal(r[0].total, 3600);
  });

  test('una factura sin líneas devuelve una lista vacía, no revienta', async () => {
    const servicio = montar({ data: {} });
    assert.deepEqual(await servicio.getProductosDeFactura('1'), []);
  });

  test('sin id de factura, error claro', async () => {
    const servicio = montar({ data: { items: [] } });
    await assert.rejects(() => servicio.getProductosDeFactura(null), /requerido/);
  });
});

describe('los dos modales de pago comparten las piezas', () => {
  const fs = require('fs');
  const path = require('path');
  const COMP = path.join(__dirname, '..', '..', 'frontend', 'src', 'components');

  const cobrar = fs.readFileSync(path.join(COMP, 'cuentas-por-cobrar', 'ModalAbono.jsx'), 'utf8');
  const pagar = fs.readFileSync(path.join(COMP, 'pagos-proveedores', 'ModalDetalleCuenta.jsx'), 'utf8');

  const COMPARTIDAS = ['HojaModal', 'ResumenSaldo', 'OpcionesPago', 'TablaProductosFactura'];

  for (const pieza of COMPARTIDAS) {
    test(`cobrar usa ${pieza}`, () => {
      assert.match(cobrar, new RegExp(`from '\\.\\./pagos/${pieza}'`));
    });
    test(`pagar usa ${pieza}`, () => {
      assert.match(pagar, new RegExp(`from '\\.\\./pagos/${pieza}'`));
    });
  }

  test('ninguno arma su propio caparazón de modal', () => {
    // Si vuelve a aparecer el div de fondo negro es que alguien se salió de
    // la pieza compartida y los dos van a empezar a separarse otra vez.
    for (const [nombre, texto] of [['cobrar', cobrar], ['pagar', pagar]]) {
      assert.ok(!/fixed inset-0 .*bg-black/.test(texto),
        `${nombre} volvió a dibujar su propio fondo de modal en vez de usar HojaModal`);
    }
  });
});
