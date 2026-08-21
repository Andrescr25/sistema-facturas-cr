/**
 * Auth - Middleware
 *
 * Se protege por lista de EXCEPCIONES, no por lista de rutas protegidas.
 * Es la diferencia entre olvidarse de proteger un módulo nuevo —que queda
 * abierto sin que nadie lo note— y olvidarse de abrirlo, que se ve al
 * instante porque deja de funcionar. Con 20 módulos y más por venir, el
 * error tiene que ser ruidoso.
 */

const { verificarToken } = require('./auth.service');

// Rutas públicas, relativas a /api. Cada una está acá por un motivo
// explícito; agregar una es una decisión de seguridad, no de conveniencia.
const PUBLICAS = [
  '/auth/login',        // sin esto no se puede entrar
  '/auth/estado',       // dice si ya hay usuarios creados, no expone datos
  '/health',            // lo consulta Render para saber si el servicio vive
  '/catalogo-clientes', // el catálogo que se le manda a los clientes: es su razón de ser
  '/portal',            // portal de clientes: tiene su propio guardián (requireCliente)
  // Las miniaturas de imágenes sugeridas se pintan con <img src>, y una
  // etiqueta <img> NO manda la cabecera Authorization. Detrás del login
  // devolvía 401 y no cargaba ninguna. Solo descarga de una lista fija de
  // hosts (ver HOSTS_PERMITIDOS en catalogo.controller.js), así que no es un
  // proxy abierto ni expone dato alguno del negocio.
  '/alegra/catalog/image-proxy'
];

// OJO: '/portal' sale de requireAuth pero NO queda abierto — adentro lo
// protege requireCliente, que valida contra JWT_SECRET_CLIENTES. Un token
// del personal tampoco sirve ahí, y uno de cliente no sirve acá: los dos
// mundos usan secretos distintos, así que no se cruzan ni por error.
//
// El catálogo del AGENTE (/catalogo-agente) no está acá: expone el historial
// de compras de cada cliente y los descuentos por exceso, y lo usa personal
// de la casa. Pide sesión como cualquier otra pantalla del sistema.

function esPublica(ruta) {
  return PUBLICAS.some(publica => ruta === publica || ruta.startsWith(`${publica}/`));
}

function requireAuth(req, res, next) {
  // El preflight de CORS viaja sin cabeceras de autorización; rechazarlo
  // rompe todas las llamadas del navegador desde otro origen.
  if (req.method === 'OPTIONS') return next();

  if (esPublica(req.path)) return next();

  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'No autenticado', code: 'SIN_TOKEN' });
  }

  const datos = verificarToken(token);
  if (!datos) {
    // 401 y no 403 a propósito: el frontend distingue "volvé a entrar" de
    // "no tenés permiso", y un token vencido es lo primero.
    return res.status(401).json({ success: false, error: 'Sesión vencida', code: 'TOKEN_INVALIDO' });
  }

  req.usuario = { id: datos.sub, usuario: datos.usuario, nombre: datos.nombre };
  next();
}

module.exports = { requireAuth, PUBLICAS };
