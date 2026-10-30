/**
 * Consultar la bitácora de cambios: quién hizo qué, sobre qué y cuándo.
 *
 * La bitácora se ESCRIBE en `utils/bitacora.js`, dentro de la misma
 * transacción que cada cambio. Esto es lo que faltaba: poder LEERLA. Hasta
 * acá estaba en la base y nadie la podía mirar sin SQL, que es lo mismo que
 * no tenerla el día que alguien pregunta "¿quién anuló esta factura?".
 *
 * SOLO ADMINISTRADORES. Cuelga de `/usuarios`, que está en RUTAS_ADMIN: dice
 * qué hizo cada persona y trae el estado anterior y posterior de cada
 * registro (precios, costos, saldos). No es para repartir por módulo.
 *
 * ES DE SOLO LECTURA, Y TIENE QUE SEGUIR SIÉNDOLO. Una bitácora que se puede
 * editar o borrar desde una pantalla no sirve como bitácora. Acá no hay ni
 * va a haber una ruta que escriba.
 *
 * EL TÍTULO DE CADA LÍNEA sale de la foto guardada (`despues` o `antes`), no
 * de la tabla del registro: una factura anulada o un producto borrado tienen
 * que seguir diciendo qué eran, y la ficha de hoy puede llamarse distinto de
 * como se llamaba cuando se cambió.
 */

const { pool } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');

const POR_PAGINA = 30;
const MAXIMO_POR_PAGINA = 100;

/** Cómo se le dice a cada cosa. Lo que no esté acá sale con su nombre técnico. */
const ENTIDADES = {
  producto: 'Producto',
  categoria_producto: 'Categoría',
  subcategoria: 'Subcategoría',
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  factura: 'Factura',
  nota_credito: 'Nota de crédito',
  cotizacion: 'Cotización',
  pago: 'Cobro',
  pago_proveedor: 'Pago a proveedor',
  cierre_caja: 'Cierre de caja',
  compra: 'Compra',
  empresa: 'Datos de la empresa',
  // Las rutas que atiende un agente (2026-10-29).
  usuario: 'Usuario',
  rendicion_efectivo: 'Entrega de efectivo'
};

const ACCIONES = {
  crear: 'creó',
  editar: 'editó',
  anular: 'anuló',
  desactivar: 'desactivó',
  activar: 'reactivó',
  borrar: 'borró',
  facturar: 'facturó'
};

// De la foto del registro, el primer campo que sirva para nombrarlo.
const TITULO_SQL = `COALESCE(
  NULLIF(b.despues->>'numero', ''), NULLIF(b.antes->>'numero', ''),
  NULLIF(b.despues->>'nombre', ''), NULLIF(b.antes->>'nombre', '')
)`;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dónde buscar el nombre de un registro cuando la foto no lo trae.
 *
 * Una edición guarda a veces solo los campos que cambiaron: "Producto 2695
 * editó subcategoría" no le dice nada a nadie. Para esas líneas se lee el
 * nombre de HOY de su tabla. Es una lista cerrada —la entidad de la línea
 * elige de acá, nunca arma el SQL— y lo que no esté queda con su número.
 */
const DONDE_SE_LLAMA = {
  producto: { tabla: 'producto', columna: 'nombre' },
  categoria_producto: { tabla: 'categoria_producto', columna: 'nombre' },
  subcategoria: { tabla: 'subcategoria', columna: 'nombre' },
  cliente: { tabla: 'cliente', columna: 'nombre' },
  proveedor: { tabla: 'proveedor', columna: 'nombre' },
  factura: { tabla: 'factura', columna: 'numero' },
  nota_credito: { tabla: 'nota_credito', columna: 'numero' },
  cotizacion: { tabla: 'cotizacion', columna: 'numero' },
  compra: { tabla: 'compra', columna: 'numero_consecutivo' }
};

/** Completa el título de las líneas que no lo traen. Una consulta por entidad. */
async function completarTitulos(lineas) {
  const pendientes = new Map();
  for (const l of lineas) {
    if (l.titulo || !DONDE_SE_LLAMA[l.entidad] || !/^\d{1,9}$/.test(String(l.entidadId))) continue;
    if (!pendientes.has(l.entidad)) pendientes.set(l.entidad, new Set());
    pendientes.get(l.entidad).add(Number(l.entidadId));
  }

  for (const [entidad, ids] of pendientes) {
    const { tabla, columna } = DONDE_SE_LLAMA[entidad];
    const { rows } = await pool.query(
      `SELECT id, ${columna}::text AS titulo FROM ${tabla} WHERE id = ANY($1::int[])`, [[...ids]]);
    const porId = new Map(rows.map(r => [Number(r.id), r.titulo]));
    for (const l of lineas) {
      if (l.entidad === entidad && !l.titulo) l.titulo = porId.get(Number(l.entidadId)) || null;
    }
  }
  return lineas;
}

function nombreDeEntidad(entidad) {
  return ENTIDADES[entidad] || entidad;
}

function verboDeAccion(accion) {
  return ACCIONES[accion] || accion;
}

/** Una línea de la lista, sin las fotos completas. */
function aLinea(r) {
  return {
    id: Number(r.id),
    entidad: r.entidad,
    entidadNombre: nombreDeEntidad(r.entidad),
    entidadId: r.entidad_id,
    titulo: r.titulo || null,
    accion: r.accion,
    accionVerbo: verboDeAccion(r.accion),
    motivo: r.motivo || null,
    usuarioId: r.usuario_id,
    // Una línea sin usuario la escribió un proceso (una carga, una migración).
    usuarioNombre: r.usuario_nombre || (r.usuario_id ? `Usuario ${r.usuario_id}` : 'El sistema'),
    camposCambiados: Number(r.campos_cambiados) || 0,
    // Texto 'AAAA-MM-DD HH:MM:SS', tal como está guardado: la columna no lleva
    // zona, y pasarla por Date la corre según dónde corra el servidor.
    cuando: r.cuando
  };
}

/**
 * @param {{entidad?: string, accion?: string, usuarioId?: string|number, desde?: string,
 *          hasta?: string, buscar?: string, pagina?: number, limite?: number}} filtros
 */
async function listar({ entidad = '', accion = '', usuarioId = '', desde = '', hasta = '', buscar = '', pagina = 1, limite = POR_PAGINA } = {}) {
  const where = [];
  const params = [];
  const p = (valor) => { params.push(valor); return `$${params.length}`; };

  if (String(entidad).trim()) where.push(`b.entidad = ${p(String(entidad).trim().slice(0, 60))}`);
  if (String(accion).trim()) where.push(`b.accion = ${p(String(accion).trim().slice(0, 40))}`);

  if (String(usuarioId).trim()) {
    // "sistema" son las líneas que no escribió una persona.
    if (String(usuarioId).trim() === 'sistema') where.push('b.usuario_id IS NULL');
    else where.push(`b.usuario_id = ${p(idValido(usuarioId))}`);
  }

  for (const [valor, etiqueta] of [[desde, 'Desde'], [hasta, 'Hasta']]) {
    if (valor && !FECHA.test(String(valor))) throw httpError(400, `${etiqueta}: va como AAAA-MM-DD.`);
  }
  if (desde) where.push(`b.creado_en >= ${p(desde)}::date`);
  // Hasta el final de ese día, no hasta su medianoche.
  if (hasta) where.push(`b.creado_en < ${p(hasta)}::date + 1`);

  const texto = String(buscar).trim().slice(0, 80);
  if (texto) {
    const parecido = p(`%${texto.toLowerCase()}%`);
    where.push(`(b.entidad_id = ${p(texto)} OR lower(COALESCE(${TITULO_SQL}, '')) LIKE ${parecido} OR lower(COALESCE(b.motivo, '')) LIKE ${parecido})`);
  }

  const lim = Math.min(Math.max(parseInt(limite, 10) || POR_PAGINA, 1), MAXIMO_POR_PAGINA);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);

  const { rows } = await pool.query(`
    SELECT b.id, b.entidad, b.entidad_id, b.accion, b.motivo, b.usuario_id,
           u.nombre AS usuario_nombre,
           ${TITULO_SQL} AS titulo,
           CASE WHEN jsonb_typeof(b.cambios) = 'object'
                THEN (SELECT COUNT(*) FROM jsonb_object_keys(b.cambios)) ELSE 0 END AS campos_cambiados,
           to_char(b.creado_en, 'YYYY-MM-DD HH24:MI:SS') AS cuando,
           COUNT(*) OVER() AS total
      FROM bitacora_cambio b
      LEFT JOIN usuario u ON u.id = b.usuario_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY b.creado_en DESC, b.id DESC
     LIMIT ${p(lim)} OFFSET ${p((pag - 1) * lim)}
  `, params);

  const total = rows[0] ? Number(rows[0].total) : 0;
  return {
    data: await completarTitulos(rows.map(aLinea)),
    paginacion: { total, pagina: pag, limite: lim, paginas: Math.ceil(total / lim) }
  };
}

/** Con qué se puede filtrar: solo lo que de verdad aparece en la bitácora. */
async function filtros() {
  const [entidades, acciones, usuarios] = await Promise.all([
    pool.query(`SELECT entidad, COUNT(*)::int AS lineas FROM bitacora_cambio GROUP BY entidad ORDER BY lineas DESC, entidad`),
    pool.query(`SELECT accion, COUNT(*)::int AS lineas FROM bitacora_cambio GROUP BY accion ORDER BY lineas DESC, accion`),
    pool.query(`
      SELECT b.usuario_id, u.nombre, COUNT(*)::int AS lineas
        FROM bitacora_cambio b LEFT JOIN usuario u ON u.id = b.usuario_id
       GROUP BY b.usuario_id, u.nombre
       ORDER BY lineas DESC`)
  ]);

  return {
    entidades: entidades.rows.map(r => ({ valor: r.entidad, nombre: nombreDeEntidad(r.entidad), lineas: r.lineas })),
    acciones: acciones.rows.map(r => ({ valor: r.accion, nombre: verboDeAccion(r.accion), lineas: r.lineas })),
    usuarios: usuarios.rows.map(r => ({
      valor: r.usuario_id === null ? 'sistema' : String(r.usuario_id),
      nombre: r.nombre || (r.usuario_id === null ? 'El sistema' : `Usuario ${r.usuario_id}`),
      lineas: r.lineas
    }))
  };
}

/** Un valor de la foto, listo para mostrarse lado a lado. */
function comoTexto(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/**
 * Lo que cambió, campo por campo.
 *
 * Una edición ya trae `cambios` ({ campo: [antes, después] }). En lo demás
 * —crear, anular, borrar— se comparan las dos fotos: lo creado es todo
 * "después", lo borrado es todo "antes".
 */
function cambiosDe(fila) {
  if (fila.cambios && typeof fila.cambios === 'object' && !Array.isArray(fila.cambios)) {
    return Object.entries(fila.cambios).map(([campo, par]) => ({
      campo,
      antes: comoTexto(Array.isArray(par) ? par[0] : null),
      despues: comoTexto(Array.isArray(par) ? par[1] : par)
    }));
  }
  const antes = fila.antes && typeof fila.antes === 'object' ? fila.antes : {};
  const despues = fila.despues && typeof fila.despues === 'object' ? fila.despues : {};
  return [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
    .map(campo => ({ campo, antes: comoTexto(antes[campo]), despues: comoTexto(despues[campo]) }))
    .filter(c => c.antes !== c.despues);
}

/** Una línea con todo: sus fotos y lo que cambió. */
async function obtener(id) {
  const { rows } = await pool.query(`
    SELECT b.id, b.entidad, b.entidad_id, b.accion, b.motivo, b.usuario_id,
           b.antes, b.despues, b.cambios,
           u.nombre AS usuario_nombre,
           ${TITULO_SQL} AS titulo,
           0 AS campos_cambiados,
           to_char(b.creado_en, 'YYYY-MM-DD HH24:MI:SS') AS cuando
      FROM bitacora_cambio b
      LEFT JOIN usuario u ON u.id = b.usuario_id
     WHERE b.id = $1
  `, [idValido(id)]);

  if (!rows[0]) throw httpError(404, 'Esa línea de la bitácora no existe.');
  const cambios = cambiosDe(rows[0]);
  const [linea] = await completarTitulos([aLinea(rows[0])]);
  return { ...linea, camposCambiados: cambios.length, cambios };
}

module.exports = { listar, filtros, obtener, cambiosDe, nombreDeEntidad, verboDeAccion, ENTIDADES, ACCIONES };
