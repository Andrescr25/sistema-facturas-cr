/**
 * Traducción de la configuración de Alegra a las tablas propias.
 *
 * Funciones puras: entra lo que devuelve la API de Alegra y sale la fila tal
 * como se guarda. El script de carga (scripts/independencia/
 * cargar-configuracion.js) solo lee de Alegra y escribe con esto; así la
 * traducción se prueba sin red y sin base.
 */

const TIPO_IDENTIFICACION = new Set(['CF', 'CJ', 'DIMEX', 'NITE']);

/** Datos legales de la empresa (GET /company). */
function empresaDesdeAlegra(co) {
  if (!co || !co.name) throw new Error('Alegra no devolvió los datos de la empresa');
  const tipo = String(co.identificationObject?.type || '').toUpperCase();
  const identificacion = String(co.identificationObject?.number || co.identification || '').replace(/\D/g, '');
  if (!identificacion) throw new Error('La empresa no tiene identificación en Alegra');
  const dir = co.address || {};
  return {
    nombre: co.name,
    nombre_comercial: co.tradeName || null,
    // Una cédula física tiene 9 dígitos y una jurídica 10: si Alegra no dice
    // el tipo, se deduce del largo en vez de inventar uno.
    tipo_identificacion: TIPO_IDENTIFICACION.has(tipo) ? tipo : (identificacion.length === 10 ? 'CJ' : 'CF'),
    identificacion,
    actividad_economica: co.economicActivity ? String(co.economicActivity) : null,
    regimen: co.regime || null,
    telefono: co.phone || null,
    correo: co.email || null,
    // En Alegra Costa Rica: department = provincia, city = cantón.
    provincia: dir.department || null,
    canton: dir.city || null,
    distrito: dir.district || null,
    barrio: dir.neighborhood || null,
    otras_senas: dir.address || null,
    logo_url: typeof co.logo === 'string' ? co.logo : (co.logo?.url || null),
    decimales: Number.isInteger(co.decimalPrecision) ? co.decimalPrecision : 0
  };
}

/**
 * Tipo propio a partir del impuesto de Alegra. Se decide por `rateType` y
 * `type`, y por el nombre solo para "sin derecho a crédito", que Alegra
 * devuelve sin rateType.
 */
function tipoImpuesto(t) {
  if (String(t.type).toUpperCase() === 'IVA_BIENES_USADOS') return 'bienes_usados';
  if (/sin derecho a cr[eé]dito/i.test(t.name || '')) return 'sin_credito';
  switch (String(t.rateType || '').toUpperCase()) {
    case 'GENERAL': return 'general';
    case 'REDUCED': return 'reducido';
    case 'TRANSIENT': return 'transitorio';
    case 'EXEMPT': return 'exento';
    default: return Number(t.percentage) === 0 ? 'exento' : 'reducido';
  }
}

/** Una tarifa de IVA (GET /taxes). La tarifa se toma del número, nunca del id. */
function impuestoDesdeAlegra(t) {
  const tarifa = Number(t.percentage);
  if (!Number.isFinite(tarifa)) throw new Error(`Impuesto ${t.id} de Alegra sin porcentaje`);
  const tipo = tipoImpuesto(t);
  // Alegra repite nombres ("IVA reducido" para 0,5 %, 1 %, 2 % y 4 %): se
  // agrega la tarifa para que en una lista se distingan.
  const base = String(t.name || 'IVA').trim();
  const nombre = /\d/.test(base) ? base : `${base} ${String(tarifa).replace('.', ',')} %`;
  return {
    nombre,
    tarifa,
    tipo,
    activo: String(t.status) === 'active',
    alegra_id: String(t.id)
  };
}

/** Plazo de crédito (GET /terms). */
function plazoDesdeAlegra(t) {
  const dias = Number(t.days);
  if (!Number.isInteger(dias) || dias < 0) throw new Error(`Plazo ${t.id} de Alegra con días inválidos`);
  return { nombre: String(t.name).trim(), dias, activo: t.status ? String(t.status) === 'active' : true, alegra_id: String(t.id) };
}

const TIPO_CUENTA = { cash: 'efectivo', bank: 'banco', 'credit-card': 'tarjeta_credito' };

/** Cuenta de dinero (GET /bank-accounts). */
function cuentaDesdeAlegra(b) {
  const tipo = TIPO_CUENTA[String(b.type)];
  if (!tipo) throw new Error(`Cuenta ${b.id} de Alegra con tipo desconocido: ${b.type}`);
  return {
    nombre: String(b.name).trim(),
    tipo,
    numero: b.number || null,
    descripcion: b.description || null,
    saldo_inicial: Number(b.initialBalance) || 0,
    activo: String(b.status) === 'active',
    alegra_id: String(b.id)
  };
}

module.exports = { empresaDesdeAlegra, impuestoDesdeAlegra, tipoImpuesto, plazoDesdeAlegra, cuentaDesdeAlegra };
