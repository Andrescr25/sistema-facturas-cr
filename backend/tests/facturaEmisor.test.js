const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { datosEmisor, medioDePago, generarPdfFactura } = require('../src/modules/facturacion/factura.pdf');

/**
 * Los datos del emisor salen de la CONFIGURACIÓN, no del código.
 *
 * La cédula, la dirección, la actividad económica y las cuentas por donde le
 * pagan a la empresa cambian; cambiarlas no puede pedir un despliegue. Y son
 * parte de lo que hace válida una factura, no un adorno del pie.
 */

const EMPRESA = {
  nombre: 'Distribuidora Tachi', tipo_identificacion: 'CF', identificacion: '204050474',
  telefono: '+506-86477036', correo: 'tachifacturas@gmail.com',
  provincia: 'Alajuela', canton: 'Palmares', distrito: 'Zaragoza', barrio: 'Rincón',
  otras_senas: 'Contiguo al mirador',
  actividad_economica: '4752.1',
  actividad_economica_nombre: 'Venta al por menor de artículos de ferretería',
  terminos_pago: 'SINPE_86477036\nBanco_Nacional_5518980336453110'
};

describe('el emisor', () => {
  test('sale de la configuración', () => {
    const e = datosEmisor(EMPRESA);
    assert.equal(e.cedula, '204050474');
    assert.equal(e.tipoCedula, 'Cédula Física');
    assert.equal(e.direccion, 'Alajuela Palmares Zaragoza Rincón Contiguo al mirador');
    assert.match(e.actividad, /^4752\.1 - Venta al por menor/);
    assert.match(e.terminos, /SINPE_86477036/);
  });

  test('una jurídica se nombra como jurídica', () => {
    assert.equal(datosEmisor({ ...EMPRESA, tipo_identificacion: 'CJ' }).tipoCedula, 'Cédula Jurídica');
  });

  test('sin configuración, el PDF sale igual con la marca de respaldo', () => {
    // Que falte un dato de la empresa no puede dejar a nadie sin poder
    // entregar la factura.
    const e = datosEmisor(null);
    assert.ok(e.nombre);
    assert.equal(e.actividad, null);
  });

  test('sin actividad económica no se inventa el guion', () => {
    const e = datosEmisor({ ...EMPRESA, actividad_economica: null });
    assert.equal(e.actividad, null);
  });
});

describe('el medio de pago', () => {
  test('las facturas copiadas se leen en español', () => {
    // Las 5.398 lo guardan como lo llama Alegra; al reimprimir una, el
    // cliente leía "cash".
    assert.equal(medioDePago('cash'), 'Efectivo');
    assert.equal(medioDePago('CASH'), 'Efectivo');
    assert.equal(medioDePago('transfer'), 'Transferencia');
    assert.equal(medioDePago('credit-card'), 'Tarjeta de crédito');
  });

  test('lo que ya viene en español se respeta', () => {
    assert.equal(medioDePago('SINPE Móvil'), 'Sinpe móvil');
    assert.equal(medioDePago('Efectivo'), 'Efectivo');
  });

  test('sin método, no se inventa uno', () => {
    assert.equal(medioDePago(null), null);
    assert.equal(medioDePago(''), null);
  });
});

describe('el papel lleva lo que pide una factura', () => {
  const FACTURA = {
    id: 1, numero: '001000014868', tipoDocumento: 'factura', estado: 'emitida',
    fecha: '2026-09-10', fechaVencimiento: '2026-10-02', moneda: 'CRC', metodoPago: 'cash',
    cliente: {
      nombre: 'SUPER LA CENTRAL', tipoIdentificacion: 'CF', identificacion: '100000000',
      telefono: '+506 64003064', direccion: 'Puntarenas Chomes LA COSTA', correo: null
    },
    condicionVenta: 'credito', plazo: '22 días',
    subtotal: 12219, descuento: 0, impuesto: 1588, total: 13807,
    cobrado: 0, acreditado: 0, saldo: 13807, observaciones: null, motivoAnulacion: null,
    lineas: [{
      numeroLinea: 1, nombre: 'FACTURERO C/ COPIA PEQ', referencia: '2015',
      cabys: '3270005000000', unidad: 'Unid', cantidad: 4, precioUnitario: 475,
      descuentoPorcentaje: 0, descuentoMonto: 0, tarifa: 13, impuestoMonto: 247, total: 2147
    }]
  };

  test('se arma con los datos de la empresa', async () => {
    const pdf = await generarPdfFactura(FACTURA, EMPRESA);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 3000);
  });

  test('y también sin ellos', async () => {
    const pdf = await generarPdfFactura(FACTURA, null);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });
});

test('los datos fiscales llegan a la pantalla, no solo al PDF', () => {
  // El catálogo compartido elegía columnas a mano y dejaba afuera la
  // actividad económica y los términos: la pantalla mostraba menos que el
  // papel.
  const fuente = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'modules', 'configuracion', 'configuracion.service.js'), 'utf8');
  for (const campo of ['actividad_economica:', 'actividad_economica_nombre:', 'terminos_pago:']) {
    assert.ok(fuente.includes(campo), `falta ${campo} en catalogosParaOperar`);
  }
});
