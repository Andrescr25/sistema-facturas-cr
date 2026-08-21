/**
 * Test de facturar() (portal-clientes.pedidos.service.js).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Cuando el personal aprobaba un pedido armado desde el portal de clientes,
 * la factura se creaba en Alegra SIN impuesto: el precio ya se mandaba sin
 * IVA (correcto, Alegra lo suma según el impuesto DE LA LÍNEA) pero a esa
 * línea nunca se le decía cuál impuesto aplicar — faltaba el campo `tax`.
 * Alegra no lo completa solo con el del producto: sin ese campo, la línea
 * queda sin impuesto y la factura sale un 13% más barata de lo real. Se
 * detectó en producción: la factura 001000014758 (pedido #5) se creó con
 * `totalTax: 0` en sus 4 líneas — luego anulada.
 *
 * Este test fija que cada línea le mande a Alegra el impuesto que le
 * corresponde según su tax_percentage guardado, tomado del catálogo real de
 * impuestos de la cuenta (GET /taxes) — no de una tabla fija en el código,
 * porque los ids de impuesto son propios de cada cuenta de Alegra.
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS
 * Se sustituyen `config/database` (de donde portal-clientes.auth.js
 * reexporta `query`) y facturacion.service.js (para no llamar a Alegra de
 * verdad) por dobles, cargados en require.cache ANTES de pedir el servicio.
 * Como en comprasAnterioresConIva.test.js, se limpian los TRES módulos de la
 * cadena en cada prueba — dejar alguno cacheado arrastra el doble de la
 * prueba anterior.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaAuth = require.resolve('../src/modules/portal-clientes/portal-clientes.auth');
const rutaFacturacion = require.resolve('../src/modules/facturacion/facturacion.service');
const rutaServicio = require.resolve('../src/modules/portal-clientes/portal-clientes.pedidos.service');

const IMPUESTOS_ALEGRA = [
  { id: '1', name: 'IVA', percentage: '13.00', type: 'IVA', status: 'active' },
  { id: '2', name: 'IVA exento', percentage: '0.00', type: 'IVA', status: 'active' },
  { id: '6', name: 'IVA reducido', percentage: '4.00', type: 'IVA', status: 'active' },
  // Un tipo distinto con el mismo porcentaje no debe poder colarse.
  { id: '9', name: 'Factor bienes usados', percentage: '4.00', type: 'IVA_BIENES_USADOS', status: 'inactive' }
];

/** Cabecera + líneas que devolvería detalle(pedidoId), ya como filas de fila cruda. */
function filasPedido({ id = 1, estado = 'pendiente', lineas }) {
  const cabecera = {
    rows: [{
      id, estado, alegra_contact_id: '38', numero_factura: null,
      alegra_invoice_id: null, observaciones: null, total: 1000, cliente_nombre: 'Cliente Prueba'
    }]
  };
  const detalleLineas = {
    rows: lineas.map((l, i) => ({
      alegra_item_id: l.id, nombre_producto: l.nombre, referencia: '',
      cantidad: String(l.cantidad), precio_unitario: String(l.precio),
      descuento_porcentaje: '0', precio_lista: String(l.precio), tax_percentage: String(l.taxPercentage)
    }))
  };
  return { cabecera, detalleLineas };
}

let capturado;

function cargarServicioConDobles({ lineas }) {
  for (const r of [rutaDb, rutaAuth, rutaFacturacion, rutaServicio]) delete require.cache[r];

  const { cabecera, detalleLineas } = filasPedido({ lineas });
  let llamada = 0;

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true, exports: {
      query: async (sql) => {
        llamada++;
        if (/UPDATE pedido_cliente/.test(sql)) return { rows: [{ id: 1 }] };
        // detalle(): primero la cabecera, después las líneas.
        return llamada === 1 ? cabecera : detalleLineas;
      }
    }
  };

  require.cache[rutaFacturacion] = {
    id: rutaFacturacion, filename: rutaFacturacion, loaded: true, exports: class FacturacionServiceFalso {
      async getTaxes() { return { data: IMPUESTOS_ALEGRA }; }
      async createInvoice(facturaData) {
        capturado = facturaData;
        return { data: { id: 999, numberTemplate: { fullNumber: '001-999' }, total: 1130 } };
      }
    }
  };

  return require(rutaServicio);
}

describe('facturar — cada línea manda el impuesto correcto a Alegra', () => {
  beforeEach(() => { capturado = undefined; });

  test('13% mapea al id de IVA general, no a cualquier 13%', async () => {
    const svc = cargarServicioConDobles({
      lineas: [{ id: '100', nombre: 'Producto normal', cantidad: 2, precio: 1130, taxPercentage: 13 }]
    });

    await svc.facturar(1, 'usuario-1');

    assert.equal(capturado.items.length, 1);
    assert.deepEqual(capturado.items[0].tax, [{ id: '1', percentage: 13, name: 'IVA', type: 'IVA' }]);
  });

  test('4% mapea a IVA reducido y NO al factor de bienes usados con el mismo porcentaje', async () => {
    const svc = cargarServicioConDobles({
      lineas: [{ id: '200', nombre: 'Papel higiénico', cantidad: 1, precio: 1130, taxPercentage: 4 }]
    });

    await svc.facturar(1, 'usuario-1');

    assert.deepEqual(capturado.items[0].tax, [{ id: '6', percentage: 4, name: 'IVA reducido', type: 'IVA' }]);
  });

  test('0% (exento) manda tax vacío, no un impuesto inventado', async () => {
    const svc = cargarServicioConDobles({
      lineas: [{ id: '300', nombre: 'Producto exento', cantidad: 1, precio: 1000, taxPercentage: 0 }]
    });

    await svc.facturar(1, 'usuario-1');

    assert.deepEqual(capturado.items[0].tax, []);
  });

  test('ninguna línea se manda nunca SIN el campo tax', async () => {
    const svc = cargarServicioConDobles({
      lineas: [
        { id: '1', nombre: 'A', cantidad: 1, precio: 1130, taxPercentage: 13 },
        { id: '2', nombre: 'B', cantidad: 1, precio: 1040, taxPercentage: 4 },
        { id: '3', nombre: 'C', cantidad: 1, precio: 1000, taxPercentage: 0 }
      ]
    });

    await svc.facturar(1, 'usuario-1');

    for (const item of capturado.items) {
      assert.ok(Array.isArray(item.tax), `la línea del producto ${item.id} no tiene un array de tax`);
    }
  });

  test('un porcentaje que no existe en Alegra bloquea la factura ANTES de crearla', async () => {
    const svc = cargarServicioConDobles({
      lineas: [{ id: '400', nombre: 'Producto raro', cantidad: 1, precio: 1000, taxPercentage: 7 }]
    });

    await assert.rejects(() => svc.facturar(1, 'usuario-1'), /No se encontró en Alegra el impuesto de 7%/);
    assert.equal(capturado, undefined, 'no debía llegar a llamar a createInvoice');
  });
});
