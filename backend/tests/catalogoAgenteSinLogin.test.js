/**
 * Qué queda abierto sin sesión, y qué no.
 *
 * POR QUÉ SE ABRIÓ EL CATÁLOGO DEL AGENTE (decisión del usuario, 2026-09-04)
 * Los agentes trabajan en zonas sin cobertura y la sesión dura 12 horas. El
 * que abría la tablet al día siguiente se encontraba el login y sin red para
 * pasarlo — con el catálogo YA descargado en el dispositivo. Pedirle sesión a
 * una pantalla hecha para funcionar sin señal era la contradicción de fondo.
 *
 * POR QUÉ ESTE ARCHIVO
 * Abrir una ruta es una decisión de seguridad, y las decisiones de seguridad
 * se van olvidando. Acá queda escrito exactamente qué se abrió y qué no, para
 * que agregar una ruta nueva al módulo no la deje pública sin que nadie lo
 * note — y para que nadie "simplifique" la lista exacta a un prefijo.
 *
 * EL PREFIJO ES LA TRAMPA
 * La lista PUBLICAS abre una ruta y todo lo que cuelga de ella. Con esa regla,
 * '/catalogo-agente/historial-clientes' abriría también su '/sync', que es una
 * sincronización pesada contra Alegra. Por eso hay una segunda lista que se
 * compara exacta.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { PUBLICAS, PUBLICAS_EXACTAS } = require('../src/modules/auth/auth.middleware');

/** La misma decisión que toma el middleware, para poder probarla sola. */
function esPublica(ruta) {
  if (PUBLICAS_EXACTAS.includes(ruta)) return true;
  return PUBLICAS.some(p => ruta === p || ruta.startsWith(`${p}/`));
}

describe('el catálogo del agente abre sin sesión', () => {
  test('las rutas que usa la pantalla están abiertas', () => {
    // Si alguna se cierra, el agente sin señal se queda sin esa parte y no
    // hay forma de que se entere hasta que esté en la calle.
    for (const ruta of [
      '/catalogo-agente/productos',
      '/catalogo-agente/ofertas',
      '/catalogo-agente/ofertas-baja',
      '/catalogo-agente/productos-nuevos',
      '/catalogo-agente/historial-clientes',
      '/catalogo-agente/pedidos',
      '/catalogo-agente/dispositivos/estado'
    ]) {
      assert.equal(esPublica(ruta), true, `quedó cerrada: ${ruta}`);
    }
  });
});

describe('lo administrativo sigue pidiendo sesión', () => {
  test('la sincronización del historial NO se abrió con el historial', () => {
    // Es el caso que motiva la lista exacta: con la regla de prefijo,
    // '/historial-clientes' habría abierto también su '/sync'.
    assert.equal(esPublica('/catalogo-agente/historial-clientes/sync'), false);
  });

  test('administrar "Productos nuevos" pide sesión: la tablet solo LEE la lista', () => {
    assert.equal(esPublica('/inventario-auditorias/productos-nuevos'), false);
    assert.equal(esPublica('/inventario-auditorias/productos-nuevos/688'), false);
    assert.equal(esPublica('/catalogo-agente/productos-nuevos/688'), false, 'la lista exacta no abre lo que cuelga');
  });

  test('el monitor de tablets del personal sigue cerrado', () => {
    // GET /dispositivos es la pantalla que ve el admin en Clientes; el agente
    // solo REPORTA su estado (POST /dispositivos/estado).
    assert.equal(esPublica('/catalogo-agente/dispositivos'), false);
  });

  test('una ruta nueva del módulo nace cerrada', () => {
    // Lo importante del enfoque: agregar un endpoint al módulo no lo deja
    // público por arrastre.
    for (const inventada of [
      '/catalogo-agente/precios-costo',
      '/catalogo-agente/pedidos/todos',
      '/catalogo-agente'
    ]) {
      assert.equal(esPublica(inventada), false, `nació abierta: ${inventada}`);
    }
  });
});

describe('el resto del sistema no se movió', () => {
  test('las pantallas internas siguen cerradas', () => {
    for (const ruta of [
      '/cotizaciones', '/facturas', '/cuentas-por-cobrar',
      '/revision-precios', '/usuarios', '/reportes/faltantes/cliente'
    ]) {
      assert.equal(esPublica(ruta), false, `quedó abierta: ${ruta}`);
    }
  });

  test('lo que ya era público sigue siéndolo', () => {
    for (const ruta of [
      '/auth/login', '/health', '/catalogo-clientes/productos',
      '/portal/inicio', '/cotizacion-publica/9-abc'
    ]) {
      assert.equal(esPublica(ruta), true, `se cerró: ${ruta}`);
    }
  });
});
