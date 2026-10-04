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
  // hosts (ver HOSTS_PERMITIDOS en productos/imagenesSugeridas.js), así que no
  // es un proxy abierto ni expone dato alguno del negocio. Va en la lista de
  // EXACTAS, más abajo: abre esa ruta y nada de lo que cuelgue de /catalogos.
  // La cotización que el cliente abre desde el enlace que le llega por
  // WhatsApp. No queda abierta: la URL lleva un token firmado con el secreto
  // de la aplicación, así que no se adivina ni se recorre (/cotizacion/1,
  // /2, /3… habría dejado ver las de todos los clientes). Y es SOLO lectura
  // de una cotización: crear, editar, facturar y borrar viven en
  // /cotizaciones, detrás del login.
  '/cotizacion-publica'
];

/**
 * Rutas públicas que se comparan EXACTAS, sin abrir lo que cuelga de ellas.
 *
 * POR QUÉ HACE FALTA ESTA SEGUNDA LISTA
 * La de arriba abre una ruta y todo lo que tenga debajo, que es lo correcto
 * para un módulo entero. Acá se abre ruta por ruta, y la diferencia no es
 * cosmética: con la regla de prefijo, poner '/catalogo-agente/historial-clientes'
 * abriría también '/catalogo-agente/historial-clientes/sync', que es una
 * sincronización pesada contra Alegra y no tiene por qué quedar al alcance de
 * cualquiera.
 *
 * QUÉ SE ABRIÓ ACÁ Y POR QUÉ (decisión del usuario, 2026-09-04)
 * Los agentes trabajan en zonas sin cobertura. La sesión dura 12 horas, así
 * que el que abría la tablet al día siguiente se encontraba con el login y sin
 * red para pasarlo — con el catálogo YA descargado en el dispositivo.
 *
 * Se abren solo las rutas que esa pantalla usa. Queda fuera lo que es
 * administrativo: GET /dispositivos (el monitor de tablets del personal) y
 * POST /historial-clientes/sync.
 *
 * LO QUE ESTO EXPONE, DICHO CLARO: quien tenga la dirección puede ver el
 * catálogo con precios, el historial de compras de cada cliente y crear
 * pedidos a nombre de cualquiera de ellos. No hay datos de pago ni facturas.
 * Es una concesión consciente a cambio de que el agente pueda trabajar.
 */
const PUBLICAS_EXACTAS = [
  '/catalogo-agente/productos',
  '/catalogo-agente/categorias',
  '/catalogo-agente/ofertas',
  '/catalogo-agente/ofertas-baja',
  // Solo ids de la lista manual de "Productos nuevos" (2026-09-27): la misma
  // naturaleza que las rebajas, y sin sesión el agente la perdería igual.
  '/catalogo-agente/productos-nuevos',
  '/catalogo-agente/historial-clientes',
  '/catalogo-agente/pedidos',
  '/catalogo-agente/dispositivos/estado',
  // La miniatura de una foto sugerida (ver arriba, en PUBLICAS, por qué no
  // puede pedir sesión). Exacta: de /catalogos no se abre nada más.
  '/catalogos/imagen-proxy'
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
  if (PUBLICAS_EXACTAS.includes(ruta)) return true;
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

module.exports = { requireAuth, PUBLICAS, PUBLICAS_EXACTAS };
