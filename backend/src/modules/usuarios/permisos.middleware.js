/**
 * Autorización por módulo.
 *
 * ACÁ ES DONDE SE PROTEGE DE VERDAD. Esconder opciones del menú es cosmética:
 * quien sepa la URL de la API la llama igual con su token. Este middleware
 * corre DESPUÉS de requireAuth (que ya dijo quién es) y decide si esa persona
 * puede tocar ese prefijo.
 *
 * Las rutas se clasifican en tres, y el caso por defecto es el restrictivo:
 *
 *   compartida  -> pasa cualquiera que haya entrado (ver COMPARTIDAS)
 *   de admin    -> solo administradores
 *   de módulo   -> solo quien tenga ese módulo
 *   sin clasificar -> se trata como compartida, a propósito: un prefijo nuevo
 *                     que nadie mapeó rompería pantallas enteras si lo
 *                     bloqueáramos, y el daño de un falso "prohibido" acá es
 *                     que el sistema deja de funcionar sin explicación. Los
 *                     módulos con datos sensibles SÍ están mapeados, que es
 *                     lo que importa. Que no quede ninguno sin clasificar lo
 *                     cuida un test que recorre cada prefijo montado en
 *                     server.js (tests/permisosModulos.test.js). Ese test se
 *                     nombraba acá desde el principio y no existía: había un
 *                     prefijo, /envios-whatsapp, pasando por omisión.
 */

const { permisosDe } = require('./usuarios.service');
const { moduloDeRuta, esCompartida, esRutaAdmin, accionDeAdmin, modulosQuePuedenUsar } = require('./modulos');

function requirePermiso(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  // Sin usuario en la petición, requireAuth ya la dejó pasar por pública
  // (el catálogo de clientes, el portal, /health). No hay nada que autorizar.
  if (!req.usuario) return next();

  // La ruta se clasifica como la va a entender Express, que no distingue
  // mayúsculas ni la barra final: ver `normalizarRuta` en modulos.js. Cuando se
  // comparaba tal cual, '/Usuarios' no calzaba con nada y pasaba.
  const ruta = req.path;
  if (esCompartida(ruta)) return next();

  const clave = moduloDeRuta(ruta);
  // Lo que pide administrador aunque se tenga el módulo (anular, reabrir caja).
  const accion = accionDeAdmin(req.method, ruta);
  const necesitaAdmin = esRutaAdmin(ruta) || Boolean(accion);
  if (!clave && !necesitaAdmin) return next();

  permisosDe(req.usuario.id)
    .then(permisos => {
      // El usuario se borró o se desactivó DESPUÉS de que le dieron el token.
      // Sin esta comprobación, alguien despedido sigue trabajando hasta que
      // le venza el token — 12 horas.
      if (!permisos) {
        return res.status(401).json({
          success: false, error: 'Su cuenta ya no está activa.', code: 'CUENTA_INACTIVA'
        });
      }

      if (necesitaAdmin && !permisos.esAdmin) {
        const mensaje = accion
          ? `Solo un administrador puede ${accion.que}.`
          : 'Solo un administrador puede hacer esto.';
        return res.status(403).json({
          success: false, error: mensaje, message: mensaje, code: 'SIN_PERMISO',
          ...(accion ? { accion: accion.clave } : {})
        });
      }

      // Entra el dueño de la ruta, y también el módulo que la tiene prestada
      // porque su pantalla trabaja con esos datos (ver `tambienUsa`).
      if (clave && !modulosQuePuedenUsar(ruta, req.method).some(c => permisos.modulos.has(c))) {
        return res.status(403).json({
          success: false, error: 'No tiene acceso a este módulo.', code: 'SIN_PERMISO', modulo: clave
        });
      }

      // Para que el controlador sepa, sin otra consulta, si tiene un permiso
      // de acción (ver `puedeHacer`).
      req.permisos = permisos;
      next();
    })
    .catch(next);
}

/**
 * ¿Quien hace esta petición tiene ese permiso de acción (PERMISOS_DE_ACCION)?
 *
 * Sin usuario no hay nada que restringir (lo mismo que `requirePermiso`). Los
 * permisos salen de la base, no del token: quitárselo a alguien vale en su
 * próxima petición, no cuando le venza la sesión.
 */
async function puedeHacer(req, clave) {
  if (!req.usuario) return true;
  const permisos = req.permisos || await permisosDe(req.usuario.id);
  return Boolean(permisos && (permisos.esAdmin || permisos.modulos.has(clave)));
}

module.exports = { requirePermiso, puedeHacer };
