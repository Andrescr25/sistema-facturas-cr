const { httpError, texto } = require('../../utils/validacion');

function ubicacionMaps(v, etiqueta = 'Ubicación Maps') {
  const s = texto(2000)(v, etiqueta);
  if (s === null) return null;
  let u;
  try { u = new URL(s); } catch { throw httpError(400, `${etiqueta}: pegá el enlace de Google Maps.`); }
  const h = u.hostname.toLowerCase();
  const permitido = h === 'maps.app.goo.gl' || (h === 'goo.gl' && u.pathname.startsWith('/maps/')) ||
    h === 'maps.google.com' ||
    (['google.com', 'www.google.com', 'google.co.cr', 'www.google.co.cr'].includes(h) && /^\/maps(?:\/|$)/.test(u.pathname));
  if (u.protocol !== 'https:' || !permitido || u.username || u.password || u.port) {
    throw httpError(400, `${etiqueta}: usá un enlace https de Google Maps.`);
  }
  return u.href;
}

module.exports = { ubicacionMaps };
