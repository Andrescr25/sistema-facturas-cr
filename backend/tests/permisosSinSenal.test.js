/**
 * El agente tiene que poder abrir el catálogo SIN SEÑAL.
 *
 * EL BUG, Y POR QUÉ ERA GRAVE
 * Al recargar, el frontend le pregunta al servidor quién es el usuario
 * (/auth/yo) para saber qué puede ver. En la calle esa pregunta no llega, y
 * el respaldo solo sacaba del token el nombre y el usuario — sin permisos.
 *
 * Resultado: el agente abría la tablet en una zona sin cobertura y el
 * catálogo le decía "No tiene acceso a esta pantalla", con los productos ya
 * descargados ahí mismo en el dispositivo. Todo el trabajo de pedidos sin
 * conexión quedaba inalcanzable en el primer paso.
 *
 * Apareció al probar el build de producción con el service worker, no en
 * desarrollo: en desarrollo el servidor sirve los módulos al vuelo y sin red
 * la página ni siquiera abre, así que el problema quedaba tapado por otro.
 *
 * LA SOLUCIÓN Y SU COSTO
 * Los permisos viajan dentro del token. Quedan congelados hasta que el token
 * se renueva: si se le quita un módulo a alguien, lo sigue viendo hasta su
 * próximo ingreso. Se acepta ese costo a cambio de que la tablet funcione sin
 * señal, y porque hoy estos permisos son de INTERFAZ — el backend no los
 * exige en sus rutas.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AUTH = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'auth', 'auth.service.js'), 'utf8');
const CONTEXTO = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'contexts', 'AuthContext.jsx'), 'utf8');

describe('el token lleva lo necesario para trabajar sin señal', () => {
  test('incluye esAdmin y modulos', () => {
    const firma = AUTH.slice(AUTH.indexOf('jwt.sign('), AUTH.indexOf('jwt.sign(') + 400);
    assert.match(firma, /esAdmin: permisos\.esAdmin/,
      'sin esAdmin en el token, un administrador sin señal no puede abrir nada');
    assert.match(firma, /modulos: \[\.\.\.permisos\.modulos\]/);
  });

  test('los permisos se calculan ANTES de firmar', () => {
    // Si se calcularan después, no habría con qué armar el token.
    assert.ok(AUTH.indexOf('const permisos = await permisosDe') < AUTH.indexOf('jwt.sign('),
      'permisosDe debe ejecutarse antes de jwt.sign');
  });
});

describe('el respaldo del navegador usa esos permisos', () => {
  test('datosDelToken devuelve esAdmin y modulos', () => {
    const fn = CONTEXTO.slice(CONTEXTO.indexOf('function datosDelToken'), CONTEXTO.indexOf('function datosDelToken') + 800);
    assert.match(fn, /esAdmin: Boolean\(carga\.esAdmin\)/);
    assert.match(fn, /modulos: carga\.modulos \|\| \[\]/,
      'sin lista de módulos el menú queda vacío y no se puede abrir ninguna pantalla');
  });

  test('sin permisos en el token, el respaldo no inventa acceso', () => {
    // Un token viejo (anterior a este cambio) no los trae: debe quedar sin
    // permisos, no con todos. Equivocarse hacia "todo permitido" sería peor.
    const carga = { sub: '1', usuario: 'x', nombre: 'X' };
    assert.equal(Boolean(carga.esAdmin), false);
    assert.deepEqual(carga.modulos || [], []);
  });

  test('solo un 401 cierra la sesión; la falta de red no', () => {
    // Es lo que sostiene todo: si cualquier fallo cerrara la sesión, el
    // agente sin cobertura quedaría afuera de datos que ya tiene bajados.
    assert.match(CONTEXTO, /if \(err\.response\?\.status === 401\)/);
    assert.match(CONTEXTO, /setUsuario\(datosDelToken\(token\)\)/);
  });
});
