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
 *                     lo que importa. Hay un test que revisa que cada prefijo
 *                     montado en server.js esté clasificado
 *                     (tests/permisosModulos.test.js).
 */

const { permisosDe } = require('./usuarios.service');
const { moduloDeRuta, esCompartida, esRutaAdmin } = require('./modulos');

function requirePermiso(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  // Sin usuario en la petición, requireAuth ya la dejó pasar por pública
  // (el catálogo de clientes, el portal, /health). No hay nada que autorizar.
  if (!req.usuario) return next();

  const ruta = req.path;
  if (esCompartida(ruta)) return next();

  const clave = moduloDeRuta(ruta);
  const necesitaAdmin = esRutaAdmin(ruta);
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
        return res.status(403).json({
          success: false, error: 'Solo un administrador puede hacer esto.', code: 'SIN_PERMISO'
        });
      }

      if (clave && !permisos.modulos.has(clave)) {
        return res.status(403).json({
          success: false, error: 'No tiene acceso a este módulo.', code: 'SIN_PERMISO', modulo: clave
        });
      }

      next();
    })
    .catch(next);
}

module.exports = { requirePermiso };
