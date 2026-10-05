/**
 * El registro HTTP necesita la ruta, nunca el enlace personal completo.
 * Las invitaciones permiten crear acceso y el contexto de preventa viaja en
 * query: redactarlos también en Referer evita conservarlos en los logs.
 */
function urlParaRegistro(valor) {
  return String(valor || '').split(/[?#]/, 1)[0]
    .replace(/(\/portal\/(?:invitacion|activar)\/)[^/\s]+/gi, '$1[oculto]');
}
module.exports = { urlParaRegistro };
