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

function semanaValida(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw httpError(400, 'Semana: indicá la fecha del lunes.');
  // Un día de calendario no se convierte a la zona del servidor/UTC de hoy.
  const d = new Date(`${v}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() !== Number(v.slice(0, 4)) ||
    d.getUTCMonth() + 1 !== Number(v.slice(5, 7)) || d.getUTCDate() !== Number(v.slice(8, 10)) || d.getUTCDay() !== 1) {
    throw httpError(400, 'Semana: elegí un lunes válido.');
  }
  return v;
}

module.exports = { ubicacionMaps, semanaValida };
