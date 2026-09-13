/**
 * Clientes — Service (rama independencia-alegra)
 *
 * El maestro de clientes sin Alegra. Reglas:
 *
 * - Nada se borra: `activo = false` lo saca de la lista para facturar, pero
 *   sus facturas, saldos y pedidos siguen existiendo.
 * - La identificación tiene que calzar con su tipo (9 dígitos una cédula
 *   física, 10 una jurídica…). NO se exige que sea única: en esta cuenta hay
 *   decenas de ventas al consumidor final con la misma cédula genérica.
 * - El teléfono que teclea una persona se valida de verdad (ver la lección de
 *   los teléfonos sucios: 75 fichas no tienen ninguno usable). El que ya
 *   estaba no se toca hasta que alguien lo edite.
 * - Todo cambio queda en la bitácora, dentro de la misma transacción.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, texto, numero, booleano, opcion, soloDigitos, correo, lista, objeto, validar, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { TIPOS, limpiar, motivoQueNoCalza } = require('./identificacion');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const LIMITE_MAXIMO = 100;
const entero = numero({ min: 1, max: 2147483647, entero: true });

/**
 * Un teléfono escrito por una persona. Vacío se acepta (muchas fichas no
 * tienen); lo que no es un teléfono de Costa Rica, no: guardarlo es descubrir
 * el día del envío que no se le puede escribir a ese cliente.
 */
const telefono = (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  const r = validarTelefonoEscrito(v);
  if (!r.valido) throw httpError(400, `${etiqueta}: ${r.motivo}`);
  return r.formateado;
};

const tipoIdentificacion = (v, etiqueta) => {
  if (v === null || String(v).trim() === '') return null;
  return opcion(TIPOS)(v, etiqueta);
};

const CAMPOS = {
  nombre: { etiqueta: 'Nombre', requerido: true, validar: texto(200) },
  tipo_identificacion: { etiqueta: 'Tipo de identificación', validar: tipoIdentificacion },
  identificacion: { etiqueta: 'Identificación', validar: texto(20) },
  correo: { etiqueta: 'Correo', validar: correo(160) },
  correos_adicionales: { etiqueta: 'Otros correos', validar: lista(correo(160), { max: 3 }) },
  telefono: { etiqueta: 'Teléfono', validar: telefono },
  telefono_secundario: { etiqueta: 'Otro teléfono', validar: telefono },
  celular: { etiqueta: 'Celular', validar: telefono },
  provincia: { etiqueta: 'Provincia', validar: texto(40) },
  canton: { etiqueta: 'Cantón', validar: texto(60) },
  distrito: { etiqueta: 'Distrito', validar: texto(60) },
  barrio: { etiqueta: 'Barrio', validar: texto(80) },
  otras_senas: { etiqueta: 'Otras señas', validar: texto(2000) },
  actividad_economica: { etiqueta: 'Actividad económica', validar: soloDigitos(10) },
  plazo_credito_id: { etiqueta: 'Plazo de crédito', validar: entero },
  limite_credito: { etiqueta: 'Límite de crédito', validar: numero({ min: 0, max: 1e10 }) },
  exoneracion: { etiqueta: 'Exoneración', validar: objeto({ maxBytes: 8000 }) },
  observaciones: { etiqueta: 'Observaciones', validar: texto(2000) }
};

// ─── Utilidades ────────────────────────────────────────────────────────────

const SELECT_VISTA = `
  SELECT c.*, p.nombre AS plazo, p.dias AS plazo_dias
  FROM cliente c
  LEFT JOIN plazo_credito p ON p.id = c.plazo_credito_id`;

/** Los NUMERIC llegan como texto desde pg. */
function aVista(f) {
  if (!f) return f;
  const { total: _t, ...resto } = f;
  return {
    ...resto,
    limite_credito: f.limite_credito === null || f.limite_credito === undefined ? null : Number(f.limite_credito),
    correos_adicionales: f.correos_adicionales || []
  };
}

function sinTiempos(fila) {
  if (!fila) return fila;
  const { actualizado_en: _a, creado_en: _c, ...resto } = fila;
  return resto;
}

const NORMALIZAR_SQL = (expr) => `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function obtenerCon(ejecutor, id) {
  const { rows } = await ejecutor.query(`${SELECT_VISTA} WHERE c.id = $1`, [id]);
  return aVista(rows[0]);
}

async function revisarPlazo(ejecutor, id) {
  if (!id) return;
  const { rows } = await ejecutor.query('SELECT id, activo FROM plazo_credito WHERE id = $1', [id]);
  if (!rows[0] || !rows[0].activo) throw httpError(400, 'Plazo de crédito: no existe o está inactivo.');
}

/**
 * La identificación se limpia según su tipo y se revisa que calce. Se mira la
 * ficha COMPLETA (lo que venía más lo que se está cambiando): cambiar solo el
 * tipo también tiene que cuadrar con el número que ya estaba.
 */
function revisarIdentificacion(cambios, completa) {
  if (!('identificacion' in cambios) && !('tipo_identificacion' in cambios)) return;
  const tipo = completa.tipo_identificacion ?? null;
  const limpia = limpiar(completa.identificacion, tipo);
  const motivo = motivoQueNoCalza(tipo, limpia);
  if (motivo) throw httpError(400, `Identificación: ${motivo}`);
  if ('identificacion' in cambios) cambios.identificacion = limpia;
}

// ─── Clientes ──────────────────────────────────────────────────────────────

/**
 * @param {object} filtros
 * @param {'activos'|'inactivos'|'todos'} filtros.estado
 */
async function listarClientes({ buscar = '', estado = 'activos', conCredito = false, pagina = 1, limite = 30 } = {}) {
  const where = [];
  const params = [];
  const agregar = (valor) => { params.push(valor); return `$${params.length}`; };

  switch (estado) {
    case 'activos': where.push('c.activo = TRUE'); break;
    case 'inactivos': where.push('c.activo = FALSE'); break;
    case 'todos': break;
    default: throw httpError(400, 'Estado: tiene que ser activos, inactivos o todos.');
  }

  for (const palabra of normalizar(buscar).split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push(`${NORMALIZAR_SQL("c.nombre || ' ' || COALESCE(c.identificacion, '') || ' ' || COALESCE(c.correo, '')")} LIKE ${agregar(`%${palabra}%`)}`);
  }

  if (conCredito === true || conCredito === 'true') {
    where.push('c.plazo_credito_id IS NOT NULL AND COALESCE(p.dias, 0) > 0');
  }

  const lim = Math.min(Math.max(parseInt(limite, 10) || 30, 1), LIMITE_MAXIMO);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `${SELECT_VISTA.replace('SELECT c.*,', 'SELECT c.*, COUNT(*) OVER() AS total,')}
     ${filtro}
     ORDER BY lower(c.nombre), c.id
     LIMIT ${agregar(lim)} OFFSET ${agregar((pag - 1) * lim)}`,
    params
  );
  const total = rows[0] ? Number(rows[0].total) : 0;
  return {
    data: rows.map(aVista),
    paginacion: { total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim) }
  };
}

async function obtenerCliente(id) {
  const cliente = await obtenerCon(pool, idValido(id));
  if (!cliente) throw httpError(404, 'No existe ese cliente.');
  return cliente;
}

/**
 * Qué otras fichas ya tienen esa identificación.
 *
 * NO SE BLOQUEA, SE AVISA. Hay 139 fichas con `100000000`, el número que se
 * usa para el cliente de mostrador: prohibir el repetido dejaría sin poder
 * crear la próxima pulpería. Pero el repetido sí importa cuando es una cédula
 * de verdad —hay dos fichas de WILBERTH BUZANO y dos de OG PWR HOUSE— y quien
 * está llenando la ficha es el único que puede decir si son la misma o dos
 * sucursales. Se le enseña con quién choca y decide.
 *
 * `excepto` es la ficha que se está editando: no se avisa de que choca
 * consigo misma.
 */
async function fichasConIdentificacion(identificacion, excepto = null) {
  const limpia = limpiar(identificacion, null);
  if (!limpia) return { total: 0, fichas: [] };
  const params = [limpia];
  let filtro = '';
  if (excepto) { params.push(idValido(excepto)); filtro = ` AND id <> $${params.length}`; }

  // Va el TOTAL además de los primeros: con el número del mostrador son 139, y
  // decir "10" haría creer que se puede revisar la lista a ojo.
  const { rows } = await pool.query(
    `SELECT id, nombre, tipo_identificacion, activo, COUNT(*) OVER()::int AS total
       FROM cliente WHERE identificacion = $1${filtro}
      ORDER BY activo DESC, nombre LIMIT 5`, params);

  return {
    total: rows[0] ? rows[0].total : 0,
    fichas: rows.map(({ total: _t, ...f }) => f)
  };
}

async function crearCliente(datos, usuarioId) {
  const fila = validar(CAMPOS, datos, { crear: true });
  revisarIdentificacion(fila, fila);

  return enTransaccion(async (cliente) => {
    await revisarPlazo(cliente, fila.plazo_credito_id);
    const columnas = Object.keys(fila);
    const { rows } = await cliente.query(
      `INSERT INTO cliente (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      columnas.map(c => fila[c])
    );
    await registrarCambio(cliente, { entidad: 'cliente', entidadId: rows[0].id, accion: 'crear', despues: sinTiempos(rows[0]), usuarioId });
    return obtenerCon(cliente, rows[0].id);
  });
}

async function editarCliente(id, datos, usuarioId) {
  const n = idValido(id);
  const cambios = validar(CAMPOS, datos, { crear: false });
  if (Object.keys(cambios).length === 0) throw httpError(400, 'No vino ningún dato para cambiar.');

  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query('SELECT * FROM cliente WHERE id = $1 FOR UPDATE', [n]);
    const antes = previas[0];
    if (!antes) throw httpError(404, 'No existe ese cliente.');

    revisarIdentificacion(cambios, { ...antes, ...cambios });
    if ('plazo_credito_id' in cambios) await revisarPlazo(cliente, cambios.plazo_credito_id);

    const columnas = Object.keys(cambios);
    const { rows } = await cliente.query(
      `UPDATE cliente SET ${columnas.map((c, i) => `${c} = $${i + 1}`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $${columnas.length + 1} RETURNING *`,
      [...columnas.map(c => cambios[c]), n]
    );
    await registrarCambio(cliente, {
      entidad: 'cliente', entidadId: n, accion: 'editar',
      antes: sinTiempos(antes), despues: sinTiempos(rows[0]), usuarioId
    });
    return obtenerCon(cliente, n);
  });
}

/** Activar o desactivar. No se borra: sus facturas y pedidos siguen ahí. */
async function cambiarEstadoCliente(id, activo, usuarioId) {
  const n = idValido(id);
  const valor = booleano(activo, 'Activo');
  return enTransaccion(async (cliente) => {
    const { rows: previas } = await cliente.query('SELECT * FROM cliente WHERE id = $1 FOR UPDATE', [n]);
    const antes = previas[0];
    if (!antes) throw httpError(404, 'No existe ese cliente.');
    if (antes.activo === valor) return obtenerCon(cliente, n);

    const { rows } = await cliente.query(
      'UPDATE cliente SET activo = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [valor, n]
    );
    await registrarCambio(cliente, {
      entidad: 'cliente', entidadId: n, accion: valor ? 'activar' : 'desactivar',
      antes: sinTiempos(antes), despues: sinTiempos(rows[0]), usuarioId
    });
    return obtenerCon(cliente, n);
  });
}

/**
 * Lo que necesitan las otras pantallas para facturar o cobrar: quién es y cómo
 * ubicarlo. Sin límite de crédito ni observaciones: eso es del módulo.
 */
async function clientesParaOperar({ buscar = '', pagina = 1, limite = 30 } = {}) {
  const r = await listarClientes({ buscar, pagina, limite, estado: 'activos' });
  return {
    ...r,
    data: r.data.map(c => ({
      id: c.id, alegra_id: c.alegra_id, nombre: c.nombre,
      tipo_identificacion: c.tipo_identificacion, identificacion: c.identificacion,
      correo: c.correo, telefono: c.telefono, celular: c.celular,
      plazo_credito_id: c.plazo_credito_id, plazo: c.plazo, plazo_dias: c.plazo_dias,
      actividad_economica: c.actividad_economica
    }))
  };
}

module.exports = {
  CAMPOS,
  fichasConIdentificacion,
  listarClientes,
  obtenerCliente,
  crearCliente,
  editarCliente,
  cambiarEstadoCliente,
  clientesParaOperar
};
