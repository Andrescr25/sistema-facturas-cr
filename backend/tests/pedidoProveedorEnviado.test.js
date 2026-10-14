/**
 * La marca de "ya se le mandó el pedido" a un proveedor, y la salida cuando
 * el proveedor abierto desaparece del reporte.
 *
 * DOS COSAS QUE SE ROMPIERON DE VERDAD
 *
 * 1. Al pasar TODOS los productos de un proveedor a otro, el de origen sale
 *    del reporte (loadReporte descarta a los que quedan sin faltantes) pero
 *    la pantalla seguía apuntándole. No lo encontraba, caía en una rama que
 *    devolvía `null`, y quedaba en blanco: sin botón de volver y sin forma
 *    de salir que no fuera recargar la página.
 *
 * 2. El pedido se mandaba por WhatsApp sin dejar registro, así que quien
 *    abría el reporte desde otra máquina no tenía cómo saber a quién ya le
 *    habían escrito — y el proveedor recibía el mismo pedido dos veces.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/orders-whatsapp/orders-whatsapp.service');
const rutaHistorial = require.resolve('../src/modules/orders-whatsapp/historialEnviosProveedor.service');

/** Monta el servicio con una base falsa que devuelve las filas indicadas. */
function montar(filas) {
  const registro = { consultas: [] };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        registro.consultas.push({ sql: String(sql), params });
        return { rows: filas };
      }
    }
  };
  delete require.cache[rutaServicio];
  // El historial separado captura la conexión al cargarse: cada escenario
  // debe usar su propia base falsa, sin conservar las filas del anterior.
  delete require.cache[rutaHistorial];
  const Servicio = require(rutaServicio);
  return { servicio: new Servicio(), registro };
}

describe('a qué proveedores ya se les mandó el pedido', () => {
  test('devuelve el proveedor con su último envío y cuántas veces', async () => {
    const { servicio } = montar([
      { referencia: 'IMPORTACIONES VEGA', ultimo_envio: new Date('2026-09-08T15:30:00Z'), veces: 2 }
    ]);

    const r = await servicio.getOrdenesEnviadas('2026-09-01');

    assert.equal(r.length, 1);
    assert.equal(r[0].proveedor, 'IMPORTACIONES VEGA');
    assert.equal(r[0].veces, 2);
    assert.ok(r[0].ultimoEnvio instanceof Date);
  });

  test('solo cuenta los envíos que salieron bien', async () => {
    // Un intento fallido —número sin WhatsApp, instancia caída— no es un
    // pedido enviado. Marcarlo como tal es peor que no marcarlo: alguien ve
    // el check y no vuelve a mandarlo.
    const { servicio, registro } = montar([]);
    await servicio.getOrdenesEnviadas(null);
    assert.match(registro.consultas[0].sql, /exito\s*=\s*TRUE/);
  });

  test('filtra por tipo orden_compra y no por cualquier envío', async () => {
    // La misma tabla guarda cotizaciones, facturas y recordatorios de saldo.
    const { servicio, registro } = montar([]);
    await servicio.getOrdenesEnviadas(null);
    assert.match(registro.consultas[0].sql, /tipo\s*=\s*'orden_compra'/);
  });

  test('sin fecha trae todo el histórico, con fecha lo acota', async () => {
    // El reporte trabaja por período: una orden del mes pasado no dice nada
    // sobre la de esta semana.
    const { servicio, registro } = montar([]);
    await servicio.getOrdenesEnviadas(null);
    assert.deepEqual(registro.consultas[0].params, [null]);

    const otro = montar([]);
    await otro.servicio.getOrdenesEnviadas('2026-09-01');
    assert.deepEqual(otro.registro.consultas[0].params, ['2026-09-01']);
  });

  test('el envío del pedido queda anotado', () => {
    const servicio = fs.readFileSync(rutaServicio, 'utf8');
    assert.match(servicio, /enviarYRegistrar/,
      'la orden debe pasar por enviarYRegistrar para quedar en envio_whatsapp');
    assert.match(servicio, /tipo:\s*'orden_compra'/);
    assert.match(servicio, /referencia:\s*proveedor/,
      'la referencia debe ser el nombre del proveedor: es la llave que comparten el reporte y el registro');
  });
});

describe('el reporte de proveedores siempre tiene salida', () => {
  const pagina = fs.readFileSync(path.join(FRONT, 'pages', 'ReporteProveedores.jsx'), 'utf8');

  test('vuelve a la lista si el proveedor abierto ya no está', () => {
    assert.match(pagina, /setProveedorActivoId\(null\)/,
      'debe existir el efecto que devuelve a la lista');
    assert.match(pagina, /proveedores\.some\(p => p\.id === proveedorActivoId\)/,
      'la condición es que el proveedor abierto ya no aparezca en el reporte');
  });

  test('la rama de "no encontrado" no puede ser null', () => {
    // Ese `null` era exactamente la pantalla en blanco sin salida.
    const ramaMuerta = /\)\s*:\s*null\s*\}/.test(pagina);
    assert.equal(ramaMuerta, false,
      'la rama sin proveedor debe pintar algo con un botón de volver, no null');
  });

  test('esa rama ofrece volver', () => {
    assert.match(pagina, /Volver a proveedores/);
  });
});
