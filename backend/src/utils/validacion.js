/**
 * Validación de datos que llegan de una pantalla, compartida por los
 * módulos propios (Configuración, Productos…).
 *
 * Cada validador recibe (valor, etiqueta) y devuelve el valor limpio o lanza
 * un error 400 que dice qué corregir. `validar` aplica una definición de
 * campos: al crear, los obligatorios tienen que venir; al editar, lo que no
 * vino se deja como estaba. Lo que venga y no esté en la definición se
 * ignora: la definición es la lista blanca de columnas.
 */

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const texto = (max, { patron, mensajePatron } = {}) => (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (s.length > max) throw httpError(400, `${etiqueta}: hasta ${max} caracteres.`);
  if (patron && !patron.test(s)) throw httpError(400, `${etiqueta}: ${mensajePatron}.`);
  return s;
};

const numero = ({ min, max, entero = false }) => (v, etiqueta) => {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw httpError(400, `${etiqueta}: tiene que ser un número.`);
  if (entero && !Number.isInteger(n)) throw httpError(400, `${etiqueta}: tiene que ser un número entero.`);
  if (n < min || n > max) throw httpError(400, `${etiqueta}: entre ${min} y ${max}.`);
  return n;
};

const booleano = (v, etiqueta) => {
  if (typeof v !== 'boolean') throw httpError(400, `${etiqueta}: tiene que ser sí o no.`);
  return v;
};

const opcion = (opciones) => (v, etiqueta) => {
  if (!opciones.includes(v)) throw httpError(400, `${etiqueta}: tiene que ser ${opciones.join(', ')}.`);
  return v;
};

const soloDigitos = (max) => (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  const s = String(v).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(s)) throw httpError(400, `${etiqueta}: solo números.`);
  if (s.length > max) throw httpError(400, `${etiqueta}: hasta ${max} dígitos.`);
  return s;
};

/**
 * Un correo. No se valida "de verdad" —eso solo lo sabe el que lo recibe—,
 * pero sí se rechaza lo que seguro no es uno, para que no llegue a la ficha de
 * un cliente y se descubra el día que haya que mandarle la factura.
 */
const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const correo = (max = 160) => (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s.length > max) throw httpError(400, `${etiqueta}: hasta ${max} caracteres.`);
  if (!CORREO.test(s)) throw httpError(400, `${etiqueta}: no parece un correo.`);
  return s;
};

/**
 * Una lista (los correos adicionales de un cliente, por ejemplo). Se limpia
 * cada elemento con el validador que se le pase, se quitan los vacíos y los
 * repetidos, y se corta en `max`. Una lista vacía se guarda como lista vacía,
 * no como nulo: la columna es un arreglo.
 */
const lista = (validarUno, { max = 10 } = {}) => (v, etiqueta) => {
  if (v === null || v === undefined || v === '') return [];
  if (!Array.isArray(v)) throw httpError(400, `${etiqueta}: tiene que ser una lista.`);
  if (v.length > max) throw httpError(400, `${etiqueta}: hasta ${max}.`);
  const limpios = v.map(x => validarUno(x, etiqueta)).filter(x => x !== null && x !== undefined);
  return [...new Set(limpios)];
};

/**
 * Un objeto que se guarda tal cual en una columna JSON (la exoneración de un
 * cliente viene de Hacienda con forma propia y cambia sin avisar). Se revisa
 * que sea un objeto y que no sea enorme; el contenido no se inventa.
 */
const objeto = ({ maxBytes = 8000 } = {}) => (v, etiqueta) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw httpError(400, `${etiqueta}: tiene que ser un objeto.`);
  if (Object.keys(v).length === 0) return null;
  if (JSON.stringify(v).length > maxBytes) throw httpError(400, `${etiqueta}: es demasiado grande.`);
  return v;
};

function validar(campos, datos, { crear }) {
  const fila = {};
  for (const [campo, def] of Object.entries(campos)) {
    const v = datos?.[campo];
    if (v === undefined) {
      if (crear && def.requerido) throw httpError(400, `${def.etiqueta}: es obligatorio.`);
      continue;
    }
    const limpio = def.validar(v, def.etiqueta);
    if (def.requerido && (limpio === null || limpio === undefined)) {
      throw httpError(400, `${def.etiqueta}: es obligatorio.`);
    }
    fila[campo] = limpio;
  }
  return fila;
}

function idValido(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'Identificador inválido.');
  return n;
}

function uuidValido(v) {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(v))) {
    throw httpError(400, 'Identificador inválido.');
  }
  return String(v);
}

module.exports = { uuidValido, httpError, texto, numero, booleano, opcion, soloDigitos, correo, lista, objeto, validar, idValido };
