/**
 * La salida cuando el proveedor abierto desaparece del reporte.
 *
 * LO QUE SE ROMPIÓ DE VERDAD
 *
 * Al pasar TODOS los productos de un proveedor a otro, el de origen sale del
 * reporte (loadReporte descarta a los que quedan sin faltantes) pero la
 * pantalla seguía apuntándole. No lo encontraba, caía en una rama que
 * devolvía `null`, y quedaba en blanco: sin botón de volver y sin forma de
 * salir que no fuera recargar la página.
 *
 * La marca de «ya se le mandó el pedido» ya no sale del historial semanal de
 * envíos (`/orden-compra/enviados`, retirado el 2026-10-20 con los ciclos):
 * cada orden enviada queda guardada y tachada (ver envioReporteProveedor).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');

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
