/**
 * El pedido que el agente levanta en la calle.
 *
 * LO QUE NO PUEDE PASAR
 *   1. Que un reenvío cree un segundo pedido. En la calle la señal se corta y
 *      el dispositivo no sabe si el pedido entró: va a reenviar. Si eso
 *      duplica, alguien factura dos veces la misma venta.
 *   2. Que el pedido entre y nadie lo vea. Un pedido del agente NO tiene
 *      cuenta de portal detrás (solo 5 de 239 clientes tienen), y la consulta
 *      del personal usaba un JOIN que lo dejaba fuera: entraba a la base y
 *      era invisible. Una venta perdida sin que nadie se entere.
 *   3. Que el precio lo ponga el dispositivo. La tablet puede tener el
 *      catálogo de hace días, y además nadie debería poder pedir a precio 1.
 *
 * Estas son las reglas estructurales. catalogoAgenteIdsPropios.test.js
 * comprueba además el ciclo y los fallos sobre PostgreSQL LOCAL, usando
 * BEGIN/ROLLBACK y el guard de aislamiento. La carpeta de developer tiene
 * la base de producción: estas verificaciones pertenecen a independencia.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RUTA_SERVICIO = path.join(__dirname, '..', 'src', 'modules', 'catalogo-agente', 'pedidos-agente.service.js');
const RUTA_PEDIDOS = path.join(__dirname, '..', 'src', 'modules', 'portal-clientes', 'portal-clientes.pedidos.service.js');
const RUTA_MIGRACION = path.join(__dirname, '..', 'migrations', 'add_pedido_agente.sql');

const SERVICIO = fs.readFileSync(RUTA_SERVICIO, 'utf8');
const PEDIDOS = fs.readFileSync(RUTA_PEDIDOS, 'utf8');
const MIGRACION = fs.readFileSync(RUTA_MIGRACION, 'utf8');

describe('pedido del agente: no duplicar', () => {
  test('la clave es obligatoria', () => {
    // Aceptarla vacía dejaría sin protección justo el caso que la motiva.
    assert.match(SERVICIO, /if \(!claveIdempotencia\)/,
      'sin clave no se puede distinguir un reenvío de un pedido nuevo');
  });

  test('antes de crear se busca si esa clave ya entró', () => {
    assert.match(SERVICIO, /SELECT \* FROM pedido_cliente WHERE clave_idempotencia/,
      'un reenvío debe devolver el pedido que ya existe');
  });

  test('la base impide el duplicado, no solo el código', () => {
    // Dos envíos simultáneos pasarían los dos por la comprobación de arriba
    // antes de que ninguno escriba. El índice UNIQUE es lo que no falla.
    assert.match(MIGRACION, /CREATE UNIQUE INDEX[\s\S]*clave_idempotencia/,
      'hace falta un índice único: la comprobación en JavaScript no alcanza');
  });

  test('si dos envíos chocan, el perdedor devuelve el pedido del ganador', () => {
    // ON CONFLICT espera la confirmación de la transacción ganadora. Ese choque
    // NO es un error: su pedido está guardado.
    assert.match(SERVICIO, /ON CONFLICT \(clave_idempotencia\)/,
      'el choque de unicidad debe resolverse devolviendo el pedido, no fallando');
  });
});

describe('pedido del agente: que no se pierda de vista', () => {
  test('la lista del personal usa LEFT JOIN con cliente_portal', () => {
    const listado = PEDIDOS.slice(PEDIDOS.indexOf('async function listarPedidos'), PEDIDOS.indexOf('async function detalle'));
    assert.match(listado, /LEFT JOIN cliente_portal/,
      'con JOIN normal, un pedido del agente (sin cuenta de portal) no aparece nunca');
    assert.doesNotMatch(listado, /\n\s+JOIN cliente_portal/,
      'quedó un JOIN normal: dejaría fuera los pedidos del agente');
  });

  test('el detalle también', () => {
    const detalle = PEDIDOS.slice(PEDIDOS.indexOf('async function detalle'), PEDIDOS.indexOf('async function facturar'));
    assert.match(detalle, /LEFT JOIN cliente_portal/);
  });

  test('el nombre del cliente sale de la cuenta o del pedido', () => {
    // Un pedido del agente no tiene cuenta: el nombre se guardó en el pedido.
    assert.match(PEDIDOS, /COALESCE\(cp\.nombre, p\.cliente_nombre\)/);
  });

  test('se distingue de dónde vino cada pedido', () => {
    assert.match(PEDIDOS, /origen: p\.origen/,
      'quien factura debe saber si el pedido lo levantó un agente o el cliente');
  });
});

describe('pedido del agente: el precio lo pone el servidor', () => {
  test('el precio se lee del catálogo, no de la petición', () => {
    assert.match(SERVICIO, /FROM producto p/,
      'el precio debe salir del catálogo del servidor');
    // La petición trae producto y cantidad; cualquier `precio` que mandara el
    // dispositivo se ignora.
    assert.doesNotMatch(SERVICIO, /l\.precio\b(?!\s*[,)])/,
      'no debe tomarse ningún precio de la línea recibida');
  });

  test('solo entran productos activos y visibles', () => {
    assert.match(SERVICIO, /p\.activo = TRUE AND p\.oculto = FALSE AND p\.precio_sin_iva > 0/);
  });

  test('un producto dado de baja no tira abajo el pedido entero', () => {
    // Es peor perder una venta completa que una línea: se informa aparte.
    assert.match(SERVICIO, /noDisponibles/);
    assert.match(SERVICIO, /if \(!p\) continue;/);
  });
});

describe('pedido del agente: reglas de la base', () => {
  test('un pedido del portal SIEMPRE conserva su cuenta', () => {
    // Relajar la columna para el agente no debe permitir portales huérfanos.
    assert.match(MIGRACION, /CHECK \(origen <> 'portal' OR cliente_portal_id IS NOT NULL\)/);
  });

  test('el origen solo admite portal o agente', () => {
    assert.match(MIGRACION, /CHECK \(origen IN \('portal', 'agente'\)\)/);
  });
});
