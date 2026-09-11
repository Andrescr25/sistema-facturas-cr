/**
 * Configuración de la empresa — Service (rama independencia-alegra)
 *
 * Los datos legales de la empresa y cuatro catálogos que hoy viven en Alegra:
 * impuestos, métodos de pago, plazos de crédito y cuentas de dinero.
 *
 * Reglas que valen para todos:
 * - Nada se borra: se desactiva. Una factura vieja tiene que poder seguir
 *   diciendo con qué impuesto o en qué plazo se hizo.
 * - Cada cambio queda en la bitácora dentro de la MISMA transacción.
 * - No se puede desactivar el último activo de un catálogo: Facturación y
 *   Cobros se quedarían sin opciones y la pantalla no diría por qué.
 * - Las columnas salen de una lista blanca por catálogo. Lo que venga en la
 *   petición y no esté ahí (alegra_id, id, cualquier otra cosa) se ignora.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ─── Validadores ───────────────────────────────────────────────────────────
// Cada uno recibe (valor, etiqueta) y devuelve el valor limpio, o lanza 400.

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
 * Valida los datos contra la definición. Al crear, los obligatorios tienen
 * que venir; al editar, lo que no vino se deja como estaba.
 */
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

// ─── Empresa ───────────────────────────────────────────────────────────────

/** Largo de la identificación según su tipo (Hacienda). */
const LARGO_IDENTIFICACION = { CF: [9], CJ: [10], DIMEX: [11, 12], NITE: [10] };

const CAMPOS_EMPRESA = {
  nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(160) },
  nombre_comercial: { etiqueta: 'Nombre comercial', validar: texto(160) },
  tipo_identificacion: { etiqueta: 'Tipo de identificación', requerido: true, validar: opcion(Object.keys(LARGO_IDENTIFICACION)) },
  identificacion: { etiqueta: 'Identificación', requerido: true, validar: soloDigitos(12) },
  actividad_economica: { etiqueta: 'Actividad económica', validar: soloDigitos(10) },
  regimen: { etiqueta: 'Régimen', validar: texto(40) },
  telefono: { etiqueta: 'Teléfono', validar: texto(30) },
  correo: { etiqueta: 'Correo', validar: texto(160, { patron: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, mensajePatron: 'no parece un correo' }) },
  provincia: { etiqueta: 'Provincia', validar: texto(40) },
  canton: { etiqueta: 'Cantón', validar: texto(60) },
  distrito: { etiqueta: 'Distrito', validar: texto(60) },
  barrio: { etiqueta: 'Barrio', validar: texto(80) },
  otras_senas: { etiqueta: 'Otras señas', validar: texto(500) },
  logo_url: { etiqueta: 'Logo', validar: texto(2000) },
  decimales: { etiqueta: 'Decimales', validar: numero({ min: 0, max: 5, entero: true }) }
};

function revisarIdentificacion(fila) {
  const largos = LARGO_IDENTIFICACION[fila.tipo_identificacion];
  if (largos && fila.identificacion && !largos.includes(fila.identificacion.length)) {
    throw httpError(400, `Identificación: una ${fila.tipo_identificacion} tiene ${largos.join(' o ')} dígitos y esta tiene ${fila.identificacion.length}.`);
  }
}

async function actualizarEmpresa(datos, usuarioId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM empresa WHERE id = 1 FOR UPDATE');
    const antes = rows[0] || null;

    const cambios = validar(CAMPOS_EMPRESA, datos, { crear: !antes });
    const despues = { ...(antes || {}), ...cambios };
    revisarIdentificacion(despues);

    const columnas = Object.keys(CAMPOS_EMPRESA).filter(c => despues[c] !== undefined);
    const { rows: guardada } = await cliente.query(
      `INSERT INTO empresa (id, ${columnas.join(', ')})
       VALUES (1, ${columnas.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${columnas.map(c => `${c} = EXCLUDED.${c}`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP
       RETURNING *`,
      columnas.map(c => despues[c])
    );

    await registrarCambio(cliente, {
      entidad: 'empresa', entidadId: 1, accion: antes ? 'editar' : 'crear',
      antes: antes && sinTiempos(antes), despues: sinTiempos(guardada[0]), usuarioId
    });

    await cliente.query('COMMIT');
    return guardada[0];
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// ─── Catálogos ─────────────────────────────────────────────────────────────

const TIPOS_IMPUESTO = ['general', 'reducido', 'transitorio', 'exento', 'sin_credito', 'bienes_usados'];
const TIPOS_CUENTA = ['efectivo', 'banco', 'tarjeta_credito'];

const CATALOGOS = {
  impuestos: {
    tabla: 'impuesto', entidad: 'impuesto', nombre: 'impuesto', orden: 'tarifa, nombre', conActualizado: true,
    campos: {
      nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(80) },
      tarifa: { etiqueta: 'Tarifa', requerido: true, validar: numero({ min: 0, max: 100 }) },
      tipo: { etiqueta: 'Tipo', requerido: true, validar: opcion(TIPOS_IMPUESTO) },
      codigo_tarifa_hacienda: { etiqueta: 'Código de tarifa de Hacienda', validar: texto(4) }
    }
  },
  'metodos-pago': {
    tabla: 'metodo_pago', entidad: 'metodo_pago', nombre: 'método de pago', orden: 'orden, nombre',
    campos: {
      clave: { etiqueta: 'Clave', requerido: true, validar: texto(30, { patron: /^[a-z0-9_]+$/, mensajePatron: 'solo minúsculas, números y guion bajo' }) },
      nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(60) },
      pide_referencia: { etiqueta: 'Pide referencia', validar: booleano },
      codigo_medio_pago_hacienda: { etiqueta: 'Código de medio de pago de Hacienda', validar: texto(4) },
      orden: { etiqueta: 'Orden', validar: numero({ min: 0, max: 999, entero: true }) }
    }
  },
  plazos: {
    tabla: 'plazo_credito', entidad: 'plazo_credito', nombre: 'plazo', orden: 'dias',
    campos: {
      nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(40) },
      dias: { etiqueta: 'Días', requerido: true, validar: numero({ min: 0, max: 3650, entero: true }) }
    }
  },
  cuentas: {
    tabla: 'cuenta_dinero', entidad: 'cuenta_dinero', nombre: 'cuenta', orden: 'tipo, nombre',
    campos: {
      nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(80) },
      tipo: { etiqueta: 'Tipo', requerido: true, validar: opcion(TIPOS_CUENTA) },
      numero: { etiqueta: 'Número', validar: texto(60) },
      descripcion: { etiqueta: 'Descripción', validar: texto(500) },
      saldo_inicial: { etiqueta: 'Saldo inicial', validar: numero({ min: -1e12, max: 1e12 }) }
    }
  }
};

function catalogoDe(nombre) {
  const c = Object.prototype.hasOwnProperty.call(CATALOGOS, nombre) ? CATALOGOS[nombre] : null;
  if (!c) throw httpError(404, `No existe el catálogo "${nombre}".`);
  return c;
}

function idValido(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'Identificador inválido.');
  return n;
}

function sinTiempos(fila) {
  if (!fila) return fila;
  const { actualizado_en, creado_en, ...resto } = fila; // eslint-disable-line no-unused-vars
  return resto;
}

/** Un valor repetido en una columna única se explica, no se devuelve como 500. */
function traducirDuplicado(error, c) {
  if (error.code === '23505') {
    return httpError(409, `Ya existe un ${c.nombre} con ese ${error.constraint?.includes('dias') ? 'número de días' : 'mismo dato'}.`);
  }
  return error;
}

async function enTransaccion(trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function crearEnCatalogo(nombre, datos, usuarioId) {
  const c = catalogoDe(nombre);
  const fila = validar(c.campos, datos, { crear: true });
  const columnas = Object.keys(fila);
  try {
    return await enTransaccion(async (cliente) => {
      const { rows } = await cliente.query(
        `INSERT INTO ${c.tabla} (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
        columnas.map(k => fila[k])
      );
      await registrarCambio(cliente, { entidad: c.entidad, entidadId: rows[0].id, accion: 'crear', despues: sinTiempos(rows[0]), usuarioId });
      return rows[0];
    });
  } catch (error) {
    throw traducirDuplicado(error, c);
  }
}

async function editarEnCatalogo(nombre, id, datos, usuarioId) {
  const c = catalogoDe(nombre);
  const n = idValido(id);
  const cambios = validar(c.campos, datos, { crear: false });
  const columnas = Object.keys(cambios);
  if (columnas.length === 0) throw httpError(400, 'No vino ningún dato para cambiar.');
  try {
    return await enTransaccion(async (cliente) => {
      const { rows: previas } = await cliente.query(`SELECT * FROM ${c.tabla} WHERE id = $1 FOR UPDATE`, [n]);
      if (!previas[0]) throw httpError(404, `No existe ese ${c.nombre}.`);
      const { rows } = await cliente.query(
        `UPDATE ${c.tabla} SET ${columnas.map((k, i) => `${k} = $${i + 1}`).join(', ')}${c.conActualizado ? ', actualizado_en = CURRENT_TIMESTAMP' : ''}
         WHERE id = $${columnas.length + 1} RETURNING *`,
        [...columnas.map(k => cambios[k]), n]
      );
      await registrarCambio(cliente, {
        entidad: c.entidad, entidadId: n, accion: 'editar',
        antes: sinTiempos(previas[0]), despues: sinTiempos(rows[0]), usuarioId
      });
      return rows[0];
    });
  } catch (error) {
    throw traducirDuplicado(error, c);
  }
}

async function cambiarActivo(nombre, id, activo, usuarioId) {
  const c = catalogoDe(nombre);
  const n = idValido(id);
  booleano(activo, 'Activo');
  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query(`SELECT * FROM ${c.tabla} WHERE id = $1 FOR UPDATE`, [n]);
    const antes = previas[0];
    if (!antes) throw httpError(404, `No existe ese ${c.nombre}.`);
    if (antes.activo === activo) return antes;

    if (!activo) {
      const { rows } = await cliente.query(`SELECT COUNT(*)::int AS otros FROM ${c.tabla} WHERE activo = TRUE AND id <> $1`, [n]);
      if (rows[0].otros === 0) {
        throw httpError(409, `Tiene que quedar al menos un ${c.nombre} activo.`);
      }
    }

    const { rows } = await cliente.query(
      `UPDATE ${c.tabla} SET activo = $1${c.conActualizado ? ', actualizado_en = CURRENT_TIMESTAMP' : ''} WHERE id = $2 RETURNING *`,
      [activo, n]
    );
    await registrarCambio(cliente, {
      entidad: c.entidad, entidadId: n, accion: activo ? 'activar' : 'desactivar',
      antes: sinTiempos(antes), despues: sinTiempos(rows[0]), usuarioId
    });
    return rows[0];
  });
}

// ─── Lectura ───────────────────────────────────────────────────────────────

/** Todo, para la pantalla de Configuración (incluye lo inactivo). */
async function obtenerConfiguracion({ soloActivos = false } = {}) {
  const filtro = soloActivos ? 'WHERE activo = TRUE' : '';
  const [empresa, impuestos, metodosPago, plazos, cuentas] = await Promise.all([
    pool.query('SELECT * FROM empresa WHERE id = 1'),
    pool.query(`SELECT * FROM impuesto ${filtro} ORDER BY ${CATALOGOS.impuestos.orden}`),
    pool.query(`SELECT * FROM metodo_pago ${filtro} ORDER BY ${CATALOGOS['metodos-pago'].orden}`),
    pool.query(`SELECT * FROM plazo_credito ${filtro} ORDER BY ${CATALOGOS.plazos.orden}`),
    pool.query(`SELECT * FROM cuenta_dinero ${filtro} ORDER BY ${CATALOGOS.cuentas.orden}`)
  ]);
  return {
    empresa: empresa.rows[0] || null,
    impuestos: impuestos.rows,
    metodosPago: metodosPago.rows,
    plazos: plazos.rows,
    cuentas: cuentas.rows
  };
}

/**
 * Lo que necesitan los demás módulos para operar (Facturación, Cobros,
 * PDF): solo lo activo y los datos públicos de la empresa.
 */
async function catalogosParaOperar() {
  const todo = await obtenerConfiguracion({ soloActivos: true });
  const e = todo.empresa;
  return {
    ...todo,
    empresa: e && {
      nombre: e.nombre, nombre_comercial: e.nombre_comercial, tipo_identificacion: e.tipo_identificacion,
      identificacion: e.identificacion, telefono: e.telefono, correo: e.correo,
      provincia: e.provincia, canton: e.canton, distrito: e.distrito, otras_senas: e.otras_senas,
      logo_url: e.logo_url, decimales: e.decimales
    }
  };
}

module.exports = {
  CATALOGOS,
  CAMPOS_EMPRESA,
  obtenerConfiguracion,
  catalogosParaOperar,
  actualizarEmpresa,
  crearEnCatalogo,
  editarEnCatalogo,
  cambiarActivo
};
