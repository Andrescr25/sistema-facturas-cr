/**
 * Traducción de los contactos de Alegra a clientes y proveedores propios.
 *
 * Funciones puras. Nada se inventa ni se "arregla" en silencio: lo que viene
 * incompleto se carga como está y se cuenta como aviso, para corregirlo con
 * nombre y apellido. Los teléfonos se guardan tal cual (ver la migración
 * 006); solo se cuenta si hay alguno usable, con la misma regla que usan
 * WhatsApp y el portal.
 */

const { telefonosDe } = require('../../utils/telefonosCliente');
const { limpiar, calza } = require('./identificacion');

/** Tipos de identificación de Alegra → los propios. Lo desconocido queda vacío. */
const TIPOS = { CF: 'CF', CJ: 'CJ', DIMEX: 'DIMEX', NITE: 'NITE', PE: 'EXTRANJERO', NC: 'NO_CONTRIBUYENTE' };
const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

const texto = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

function identificacionDe(contacto, avisos) {
  const tipoAlegra = String(contacto.identificationObject?.type || '').toUpperCase();
  const tipo = TIPOS[tipoAlegra] ?? null;
  if (tipoAlegra && !tipo) avisos.push('tipo_identificacion_desconocido');

  const identificacion = limpiar(contacto.identificationObject?.number ?? contacto.identification, tipo);
  if (!identificacion) avisos.push('sin_identificacion');
  else if (!calza(tipo, identificacion)) avisos.push('identificacion_no_calza_con_su_tipo');
  return { tipo, identificacion };
}

/** Los correos de los dos campos, separados si vienen varios en uno. */
function correosDe(contacto, avisos) {
  const todos = [contacto.email, contacto.emailSecondary]
    .filter(Boolean)
    .flatMap(c => String(c).split(/[,;\s]+/))
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);
  const validos = [...new Set(todos.filter(c => CORREO.test(c)))];
  if (todos.length > validos.length) avisos.push('correo_invalido');
  if (validos.length === 0) avisos.push('sin_correo');
  return { correo: validos[0] || null, adicionales: validos.slice(1, 4) };
}

function actividadDe(contacto) {
  const a = contacto.economicActivity;
  const codigo = a && typeof a === 'object' ? (a.code ?? a.id) : a;
  const digitos = codigo === null || codigo === undefined ? '' : String(codigo).replace(/\D/g, '');
  return digitos ? digitos.slice(0, 10) : null;
}

function plazoDe(contacto, plazos) {
  const id = contacto.term?.id;
  return id === undefined || id === null ? null : (plazos.get(String(id)) ?? null);
}

/**
 * @param {object} contacto  GET /contacts/:id
 * @param {{ plazos: Map<string, number> }} contexto  alegra_id del plazo → plazo_credito.id
 */
function clienteDesdeAlegra(contacto, { plazos }) {
  if (!contacto || contacto.id === undefined || contacto.id === null || !texto(contacto.name, 200)) {
    throw new Error('contacto de Alegra sin id o nombre');
  }
  const avisos = [];
  const { tipo, identificacion } = identificacionDe(contacto, avisos);
  const { correo, adicionales } = correosDe(contacto, avisos);
  const dir = contacto.address || {};
  const actividad = actividadDe(contacto);
  if (!actividad) avisos.push('sin_actividad_economica');
  if (telefonosDe(contacto).candidatos.length === 0) avisos.push('sin_telefono_usable');

  const limite = Number(contacto.creditLimit);
  const exoneracion = contacto.exoneration && typeof contacto.exoneration === 'object' && Object.keys(contacto.exoneration).length
    ? contacto.exoneration
    : null;

  return {
    fila: {
      nombre: texto(contacto.name, 200),
      tipo_identificacion: tipo,
      identificacion,
      correo,
      correos_adicionales: adicionales,
      telefono: texto(contacto.phonePrimary, 60),
      telefono_secundario: texto(contacto.phoneSecondary, 60),
      celular: texto(contacto.mobile, 60),
      // En Alegra Costa Rica: department = provincia, city = cantón.
      provincia: texto(dir.department, 40),
      canton: texto(dir.city, 60),
      distrito: texto(dir.district, 60),
      barrio: texto(dir.neighborhood, 80),
      otras_senas: texto(dir.address, 2000),
      actividad_economica: actividad,
      plazo_credito_id: plazoDe(contacto, plazos),
      limite_credito: Number.isFinite(limite) && limite > 0 ? limite : null,
      exoneracion,
      observaciones: texto(contacto.observations, 2000),
      activo: String(contacto.status || 'active') === 'active',
      alegra_id: String(contacto.id)
    },
    avisos
  };
}

function proveedorDesdeAlegra(contacto, { plazos }) {
  if (!contacto || contacto.id === undefined || contacto.id === null || !texto(contacto.name, 200)) {
    throw new Error('contacto de Alegra sin id o nombre');
  }
  const avisos = [];
  const { tipo, identificacion } = identificacionDe(contacto, avisos);
  const { correo } = correosDe(contacto, avisos);
  return {
    fila: {
      nombre: texto(contacto.name, 200),
      tipo_identificacion: tipo,
      identificacion,
      correo,
      telefono: texto(contacto.phonePrimary || contacto.mobile, 60),
      plazo_credito_id: plazoDe(contacto, plazos),
      observaciones: texto(contacto.observations, 2000),
      activo: String(contacto.status || 'active') === 'active',
      alegra_id: String(contacto.id)
    },
    avisos
  };
}

/**
 * En esta cuenta hay 43 contactos sin ningún tipo puesto, y no son fichas
 * sueltas: entre ellos están las pulperías que más compran (una tiene 1.549
 * ventas en el histórico). Dejarlos fuera sería perder los clientes de
 * siempre, así que el contacto sin tipo cuenta como cliente. El que dice ser
 * proveedor, en cambio, tiene que decirlo.
 */
const esCliente = (c) => {
  const tipos = c.type || [];
  return tipos.includes('client') || tipos.length === 0;
};
const esProveedor = (c) => (c.type || []).includes('provider');

module.exports = { clienteDesdeAlegra, proveedorDesdeAlegra, esCliente, esProveedor, TIPOS };
