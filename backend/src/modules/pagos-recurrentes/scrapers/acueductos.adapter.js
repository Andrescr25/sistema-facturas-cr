/**
 * Adaptador de acueductoscr.com — consulta de recibos de agua propios.
 *
 * El sitio es ASP.NET WebForms clásico: no hay API ni JSON, y el estado
 * viaja completo en __VIEWSTATE/__EVENTVALIDATION (no usa cookie de sesión,
 * verificado en vivo). Los dropdowns son una cascada de DOS niveles y cada
 * uno necesita su propio postback:
 *
 *   1. GET /Recibos                        → viewstate inicial
 *   2. POST con __EVENTTARGET=ddlProvincia → puebla la lista de acueductos
 *   3. POST con __EVENTTARGET=ddlAcueducto → el servidor prepara la consulta
 *   4. POST con btnConsultar               → tabla de recibos
 *
 * El paso 3 parece redundante y no lo es: sin él el paso 4 devuelve la
 * página de error genérica del sitio (comprobado). Cada POST tiene que
 * arrastrar el viewstate que devolvió el anterior.
 */

const axios = require('axios');

const URL_RECIBOS = 'https://acueductoscr.com/Recibos';

// User-Agent honesto: dice quién consulta y para qué. Son recibos propios y
// el formulario es público, pero el servidor es ajeno y merece saber quién
// lo está llamando.
const USER_AGENT = 'TachiDistribuidora-ConsultaRecibos/1.0 (uso interno, consulta de recibos propios; contacto: javargas360@gmail.com)';
const TIMEOUT_MS = 25000;

const CAMPO_PROVINCIA = 'ctl00$MainContent$ddlProvincia';
const CAMPO_ACUEDUCTO = 'ctl00$MainContent$ddlAcueducto';
const CAMPO_MEDIDOR = 'ctl00$MainContent$txtMedidor';
const CAMPO_BOTON = 'ctl00$MainContent$btnConsultar';

class ConsultaFallida extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ConsultaFallida';
    this.status = 502;
  }
}

function decodificarHtml(texto) {
  return String(texto || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function estadoDelFormulario(html) {
  const leer = (id) => {
    const m = new RegExp(`id="${id}" value="([^"]*)"`).exec(html);
    return m ? m[1] : '';
  };
  const estado = {
    __VIEWSTATE: leer('__VIEWSTATE'),
    __VIEWSTATEGENERATOR: leer('__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: leer('__EVENTVALIDATION')
  };
  if (!estado.__VIEWSTATE) {
    throw new ConsultaFallida('La página de acueductoscr.com cambió de formato (no se encontró el viewstate).');
  }
  return estado;
}

function opcionesDe(html, selectId) {
  const bloque = new RegExp(`<select[^>]*id="${selectId}"[\\s\\S]*?</select>`).exec(html);
  if (!bloque) return [];
  return [...bloque[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)]
    .map(m => ({ valor: m[1], nombre: decodificarHtml(m[2]) }))
    // "Seleccione" es el placeholder del formulario, no un dato.
    .filter(o => o.valor && o.valor !== '0');
}

async function pedir(datos, htmlPrevio) {
  const cuerpo = new URLSearchParams({ ...estadoDelFormulario(htmlPrevio), ...datos }).toString();
  const res = await axios.post(URL_RECIBOS, cuerpo, {
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': URL_RECIBOS
    },
    timeout: TIMEOUT_MS
  });
  return res.data;
}

async function cargarFormulario() {
  const res = await axios.get(URL_RECIBOS, { headers: { 'User-Agent': USER_AGENT }, timeout: TIMEOUT_MS });
  return res.data;
}

async function listarProvincias() {
  const html = await cargarFormulario();
  return opcionesDe(html, 'MainContent_ddlProvincia');
}

/**
 * @param {string} provincia - valor del dropdown (Alajuela = '2')
 */
async function listarAcueductos(provincia) {
  const inicial = await cargarFormulario();
  const html = await pedir({
    __EVENTTARGET: CAMPO_PROVINCIA,
    __EVENTARGUMENT: '',
    [CAMPO_PROVINCIA]: String(provincia),
    [CAMPO_ACUEDUCTO]: '0',
    [CAMPO_MEDIDOR]: ''
  }, inicial);

  return opcionesDe(html, 'MainContent_ddlAcueducto');
}

/**
 * Recibos pendientes de una paja de agua.
 *
 * OJO con las dos fechas: `periodo` es el mes de CONSUMO (07-2026) y
 * `vencimiento` es cuándo hay que pagarlo (18-08-2026). Para control de
 * flujo importa la segunda — quien decide en qué mes cae el pago es
 * pagos-recurrentes.service, no este adaptador.
 *
 * @returns {Promise<Array<{documento:string, periodo:string, monto:number, vencimiento:string}>>}
 */
async function consultarRecibos({ provincia, acueducto, medidor }) {
  if (!provincia || !acueducto || !medidor) {
    const error = new Error('Faltan provincia, acueducto o número de paja.');
    error.status = 400;
    throw error;
  }

  const inicial = await cargarFormulario();

  const conProvincia = await pedir({
    __EVENTTARGET: CAMPO_PROVINCIA,
    __EVENTARGUMENT: '',
    [CAMPO_PROVINCIA]: String(provincia),
    [CAMPO_ACUEDUCTO]: '0',
    [CAMPO_MEDIDOR]: ''
  }, inicial);

  // Paso imprescindible: sin este postback el de abajo devuelve la página
  // de error del sitio en vez de la tabla.
  const conAcueducto = await pedir({
    __EVENTTARGET: CAMPO_ACUEDUCTO,
    __EVENTARGUMENT: '',
    [CAMPO_PROVINCIA]: String(provincia),
    [CAMPO_ACUEDUCTO]: String(acueducto),
    [CAMPO_MEDIDOR]: ''
  }, conProvincia);

  const resultado = await pedir({
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    [CAMPO_PROVINCIA]: String(provincia),
    [CAMPO_ACUEDUCTO]: String(acueducto),
    [CAMPO_MEDIDOR]: String(medidor),
    [CAMPO_BOTON]: 'Consultar'
  }, conAcueducto);

  if (/Le ofrecemos disculpas por el inconveniente/i.test(resultado)) {
    throw new ConsultaFallida('acueductoscr.com respondió con su página de error. Revisá que la provincia, el acueducto y el número de paja sean correctos.');
  }

  return extraerRecibos(resultado);
}

/**
 * Lee la tabla de resultados. Formato observado en vivo:
 *   Documento | Periodo | Monto | Vencimiento
 *   Ver detalle | 211595 | 07-2026 | ₡3 823 | 18-08-2026
 * (la primera celda es un link "Ver detalle" que no aporta dato)
 */
function extraerRecibos(html) {
  const recibos = [];

  for (const tabla of html.match(/<table[\s\S]*?<\/table>/g) || []) {
    if (!/Vencimiento/i.test(tabla)) continue;

    for (const fila of tabla.match(/<tr[\s\S]*?<\/tr>/g) || []) {
      const celdas = (fila.match(/<td[\s\S]*?<\/td>/g) || [])
        .map(c => decodificarHtml(c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')))
        .filter(Boolean);

      // Se descartan encabezados y filas de relleno ("Consultando...").
      const periodo = celdas.find(c => /^\d{2}-\d{4}$/.test(c));
      const vencimiento = celdas.find(c => /^\d{2}-\d{2}-\d{4}$/.test(c));
      if (!periodo || !vencimiento) continue;

      const celdaMonto = celdas.find(c => /[₡¢]/.test(c));
      const monto = celdaMonto ? Number(celdaMonto.replace(/[^\d]/g, '')) : 0;
      const documento = celdas.find(c => /^\d{4,}$/.test(c) && c !== periodo) || '';

      recibos.push({ documento, periodo, monto, vencimiento });
    }
  }

  return recibos;
}

module.exports = {
  listarProvincias,
  listarAcueductos,
  consultarRecibos,
  extraerRecibos,
  ConsultaFallida,
  FUENTE: 'acueductoscr'
};
