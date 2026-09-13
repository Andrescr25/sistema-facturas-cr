/**
 * Consulta pública de contribuyentes de Hacienda.
 *
 * POR QUÉ HACE FALTA. De las 247 fichas cargadas, **245 no tienen actividad
 * económica**, y sin ella no se puede emitir una factura electrónica a nombre
 * de ese cliente. Escribirlas a mano una por una es un día de trabajo y una
 * fuente de errores; Hacienda las da por cédula, gratis y sin credenciales.
 *
 * ESTO NO ES UNA "SALIDA AL MUNDO REAL" de las que bloquea `config/aislado`.
 * Ese bloqueo existe para que la rama no escriba en Alegra, no mande WhatsApp
 * y no despache correos. Esto es una LECTURA de un servicio público: no
 * cambia nada en ningún lado, así que corre también aislado.
 *
 * QUÉ SE HACE CON LO QUE LLEGA: se PROPONE, no se pisa lo que la persona
 * escribió. El nombre legal casi nunca es el que usa la casa —Hacienda dice
 * "OG PWR HOUSE SOCIEDAD DE RESPONSABILIDAD LIMITADA" y en el mostrador es
 * "OG PWR HOUSE …-GYM Palmares"—, y reemplazarlo dejaría fichas que nadie
 * reconoce. Quien llena la ficha decide qué toma.
 *
 * SI HACIENDA NO CONTESTA NO PASA NADA: se avisa y la ficha se guarda igual.
 * Un servicio de terceros caído no puede impedir dar de alta a un cliente.
 */

const axios = require('axios');

const URL = 'https://api.hacienda.go.cr/fe/ae';
const ESPERA_MS = 8000;

/** Los códigos de Hacienda, en los tipos que usa el sistema. */
const TIPOS = { '01': 'CF', '02': 'CJ', '03': 'DIMEX', '04': 'NITE' };

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * @param {string} identificacion  solo dígitos, como la pide Hacienda
 * @returns {Promise<object>} nombre, tipo, régimen, situación y actividades
 */
async function consultarContribuyente(identificacion) {
  const cedula = String(identificacion || '').replace(/\D/g, '');
  if (!cedula) throw httpError(400, 'Hay que decir qué cédula consultar.');

  let respuesta;
  try {
    respuesta = await axios.get(URL, {
      params: { identificacion: cedula },
      timeout: ESPERA_MS,
      // Los 404 se manejan acá abajo con un mensaje que se entienda, en vez
      // de que axios los tire como error de red.
      validateStatus: (s) => s === 200 || s === 404
    });
  } catch (error) {
    // Hacienda se cae seguido. Se dice qué pasó, no "error 500".
    const porTiempo = error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '');
    throw httpError(502, porTiempo
      ? 'Hacienda no contestó a tiempo. La ficha se puede guardar igual y consultarla después.'
      : 'No se pudo consultar a Hacienda en este momento. La ficha se puede guardar igual.');
  }

  if (respuesta.status === 404 || !respuesta.data?.nombre) {
    throw httpError(404, `Hacienda no tiene a nadie inscrito con la cédula ${cedula}.`);
  }

  const d = respuesta.data;
  // Solo las ACTIVAS: una actividad dada de baja no sirve para facturar, y
  // ofrecerla sería empujar a que alguien la escoja.
  const activas = (d.actividades || []).filter((a) => a.estado === 'A');

  return {
    identificacion: cedula,
    nombre: d.nombre,
    // `null` cuando Hacienda manda un código que el sistema no conoce: es
    // preferible dejarlo vacío a poner un tipo equivocado en una factura.
    tipoIdentificacion: TIPOS[d.tipoIdentificacion] || null,
    regimen: d.regimen?.descripcion || null,
    situacion: {
      estado: d.situacion?.estado || null,
      moroso: d.situacion?.moroso === 'SI',
      omiso: d.situacion?.omiso === 'SI',
      administracion: d.situacion?.administracionTributaria || null
    },
    // La principal primero: es la que se propone.
    actividades: activas
      .map((a) => ({ codigo: a.codigo, descripcion: a.descripcion, principal: a.tipo === 'P' }))
      .sort((a, b) => Number(b.principal) - Number(a.principal))
  };
}

module.exports = { consultarContribuyente, TIPOS };
