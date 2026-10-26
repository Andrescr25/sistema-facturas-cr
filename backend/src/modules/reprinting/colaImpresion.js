/**
 * La cola de impresión sobre la factura PROPIA (sección 11 del checklist,
 * pasos 2 y 3; rama independencia-alegra, 2026-09-30).
 *
 * `facturas_reimpresion` cuelga de `factura` por `factura_propia_id`
 * (migración 032). Antes colgaba de la tabla vieja `facturas` y se buscaba por
 * `alegra_id`: una factura hecha en el sistema no tenía cómo entrar.
 *
 * Una factura llega a la cola por dos caminos:
 *  - Bodega la despacha SIN faltantes → categoría 'sin_pendientes'.
 *  - El Reporte de Clientes la da por lista con sus ajustes de entrega.
 *
 * La cola NO guarda una fila por intento: si la factura ya estaba (procesada
 * o no), se reusa. Hay filas repetidas de antes (80 en la copia local), así
 * que las listas toman la más reciente de cada factura.
 *
 * LAS HORAS se escriben con AHORA_CR_SQL, nunca con CURRENT_TIMESTAMP: son
 * columnas sin zona horaria, y en producción el pooler de Supabase deja 1 de
 * cada 5 consultas en UTC (la nota "En impresión" llegó a decir 17:25 para
 * algo enviado a las 11:25; ver utils/fechaCR.js).
 */

const { query, pool } = require('../../../config/database');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { AHORA_CR_SQL } = require('../../utils/fechaCR');
const { validarEntrega } = require('../missing-items/ajusteEntrega');
const { ingresoRespaldado } = require('../missing-items/ingresoFaltante');
const {
  impresaFueraDePlazo, MOVIMIENTOS_REPORTE, ULTIMA_COLA, JOIN_HISTORIAL_REPORTE
} = require('../reports/historialClientes.sql');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

/**
 * Una factura impresa hace 24 h o más ya no se recupera desde Reporte Clientes
 * (2026-10-24, pedido del usuario). Desde Impresión no se recupera nunca.
 */
function noSeRecupera(numero) {
  return httpError(409, `La factura ${numero} ya no se recupera: pasaron más de 24 horas. ` +
    'Si hay que quitar algo, se hace una nota de crédito; si hay que agregar algo, una factura nueva.');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function idDeFactura(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Factura inválida.');
  return id;
}

/** Una factura despachada sin faltantes, a la cola. `db`: cliente de transacción o el módulo. */
async function encolarSinPendientes(facturaId, db = { query }) {
  const r = await db.query(`
    UPDATE facturas_reimpresion
       SET estado = 'pendiente',
           ajustes_realizados = '[]'::jsonb,
           categoria = 'sin_pendientes',
           total_ajustes = 0,
           fecha_creacion = ${AHORA_CR_SQL},
           fecha_procesamiento = NULL
     WHERE factura_propia_id = $1
    RETURNING id
  `, [facturaId]);
  if (r.rows.length > 0) return r.rows[0].id;

  const nueva = await db.query(`
    INSERT INTO facturas_reimpresion (factura_propia_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion)
    VALUES ($1, '[]'::jsonb, 'pendiente', 'sin_pendientes', 0, ${AHORA_CR_SQL})
    RETURNING id
  `, [facturaId]);
  return nueva.rows[0].id;
}

/** Deja la fila de la cola de una factura con estos datos, o la crea. */
async function ponerEnCola(db, facturaId, { ajustes, categoria }) {
  const datos = [facturaId, JSON.stringify(ajustes), categoria, ajustes.length];
  const r = await db.query(`
    UPDATE facturas_reimpresion
       SET estado = 'pendiente', ajustes_realizados = $2::jsonb, categoria = $3, total_ajustes = $4,
           fecha_creacion = ${AHORA_CR_SQL}, fecha_procesamiento = NULL
     WHERE factura_propia_id = $1
    RETURNING id
  `, datos);
  if (r.rows.length > 0) return r.rows[0].id;
  const nueva = await db.query(`
    INSERT INTO facturas_reimpresion (factura_propia_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion)
    VALUES ($1, $2::jsonb, 'pendiente', $3, $4, ${AHORA_CR_SQL})
    RETURNING id
  `, datos);
  return nueva.rows[0].id;
}

/**
 * Lo que llegó de cada faltante de una factura, tal como quedó guardado en
 * el Reporte de Clientes (`faltantes_ajustes`, que se escribe producto por
 * producto mientras se revisa). La propuesta de una cola anterior conserva
 * su comportamiento; un envío nuevo exige respuesta y revisión persistidas.
 */
async function ajustesDeFactura(db, facturaId) {
  const { rows } = await db.query(`
    SELECT f.id AS faltante_id, f.cantidad_faltante, p.id AS producto_id, p.referencia, p.nombre,
           aj.cantidad_entregada, aj.estado, aj.requiere_actualizacion, aj.revisado
      FROM faltantes f
      JOIN producto p ON p.id = f.producto_propio_id
      LEFT JOIN faltantes_ajustes aj ON aj.faltante_id = f.id
     WHERE f.factura_propia_id = $1
       AND f.estado = 'pendiente'
       AND f.tipo_faltante <> 'completo'
       AND f.cantidad_faltante > 0
     ORDER BY f.id
  `, [facturaId]);
  return rows.map((r) => ({
    faltante_id: r.faltante_id,
    producto_id: r.producto_id,
    producto_codigo: r.referencia,
    producto_nombre: r.nombre,
    cantidad_faltante: Number(r.cantidad_faltante),
    cantidad_entregada: Number(r.cantidad_entregada) || 0,
    estado: r.estado || 'pendiente',
    revisado: r.revisado === true,
    requiere_actualizacion: r.estado ? r.requiere_actualizacion === true : true
  }));
}

/**
 * POST /reportes/faltantes/cliente/facturas/:facturaId/impresion — el
 * Reporte de Clientes da la factura por lista: a la cola, con lo que llegó.
 *
 * Los ajustes se arman acá, de la base, y no con lo que mande la pantalla:
 * son los mismos que la pantalla fue guardando, y así no puede llegar a
 * Impresión una versión distinta de la que quedó registrada.
 */
async function encolarDesdeReporte(facturaIdCrudo) {
  const facturaId = idDeFactura(facturaIdCrudo);
  return enTransaccion(async (c) => {
    const { rows: [f] } = await c.query('SELECT numero, estado FROM factura WHERE id = $1 FOR UPDATE', [facturaId]);
    if (!f) throw httpError(404, 'Esa factura no existe.');
    if (f.estado === 'anulada') throw httpError(409, `La factura ${f.numero} está anulada.`);

    const ajustes = await ajustesDeFactura(c, facturaId);
    if (ajustes.length === 0) throw httpError(409, `La factura ${f.numero} no tiene faltantes pendientes.`);
    // El formulario confirma antes de enviarla, pero ese guardado puede
    // seguir en vuelo. Se exige la revisión persistida bajo el mismo bloqueo.
    for (const ajuste of ajustes) {
      if (!ajuste.revisado) throw httpError(409, 'Falta confirmar la revisión de todos los productos antes de enviar a Impresión.');
      try {
        ajuste.requiere_actualizacion = validarEntrega(ajuste.cantidad_faltante, {
          cantidadEntregada: ajuste.cantidad_entregada, estado: ajuste.estado, revisado: ajuste.revisado
        }).requiereActualizacion;
      } catch (error) {
        throw httpError(409, 'Hay una entrega incoherente. Recupere y revise la factura antes de enviarla a Impresión.');
      }
    }
    // Lo entregado tiene que seguir respaldado por lo que ingresó: una compra
    // pudo anularse después de marcar (missing-items/ingresoFaltante.js).
    const respaldado = await ingresoRespaldado(c, ajustes.map((aj) => aj.faltante_id));
    const sinRespaldo = ajustes.find((aj) => aj.cantidad_entregada > (respaldado.get(aj.faltante_id) || 0));
    if (sinRespaldo) {
      throw httpError(409, `${sinRespaldo.producto_nombre}: la compra que respaldaba lo entregado ya no está registrada. ` +
        'Vuelva a marcar qué llegó antes de enviarla a Impresión.');
    }
    const requiereCambios = ajustes.some((aj) => aj.requiere_actualizacion);
    await ponerEnCola(c, facturaId, { ajustes, categoria: requiereCambios ? 'requiere_cambios' : 'sin_cambios' });
    return { factura_id: facturaId, numero_factura: f.numero, total_ajustes: ajustes.length, requiere_cambios: requiereCambios };
  });
}

/**
 * POST /reportes/faltantes/cliente/facturas/:facturaId/recuperar — el
 * Reporte de Clientes recupera la factura para volver a revisarla.
 *
 * Si todavía no se imprimió, sale de la cola: con el camino viejo seguía ahí,
 * y al recargar el reporte volvía a aparecer bloqueada "en impresión" (e
 * Impresión la habría procesado con los ajustes de antes). Si ya se procesó,
 * sus faltantes vuelven a pendientes y la fila procesada queda como
 * historial de Impresión.
 *
 * Pasadas 24 h ya no (2026-10-24): ni la que está en el historial del
 * reporte, ni la que Impresión imprimió hace 24 h o más aunque una gestión
 * reciente la haya devuelto a los activos.
 */
async function devolverAlReporte(facturaIdCrudo) {
  const facturaId = idDeFactura(facturaIdCrudo);
  return enTransaccion(async (c) => {
    // Impresión toma primero este bloqueo. Recuperar espera a que termine
    // de guardar para no dejar faltantes procesados fuera de su cola.
    await c.query('SELECT id FROM factura WHERE id = $1 FOR UPDATE', [facturaId]);
    const { rows: [f] } = await c.query(`
      SELECT fa.numero, ${impresaFueraDePlazo('fr')} AS vencida FROM factura fa ${ULTIMA_COLA} WHERE fa.id = $1
    `, [facturaId]);
    const { rows: [h] } = await c.query(`
      ${MOVIMIENTOS_REPORTE}
      SELECT archivo.en_historial FROM factura fa ${ULTIMA_COLA} ${JOIN_HISTORIAL_REPORTE} WHERE fa.id = $1
    `, [facturaId]);
    if (f && (f.vencida || h?.en_historial)) throw noSeRecupera(f.numero);
    const faltantes = await c.query(`
      UPDATE faltantes SET estado = 'pendiente', updated_at = ${AHORA_CR_SQL}
       WHERE factura_propia_id = $1 AND estado = 'procesado'
      RETURNING id
    `, [facturaId]);
    const cola = await c.query(`
      DELETE FROM facturas_reimpresion WHERE factura_propia_id = $1 AND estado = 'pendiente' RETURNING id
    `, [facturaId]);
    return { factura_id: facturaId, faltantes_reabiertos: faltantes.rows.length, sacada_de_la_cola: cola.rows.length > 0 };
  });
}

const leerAjustes = (valor) => {
  const ajustes = typeof valor === 'string' ? JSON.parse(valor) : valor;
  return Array.isArray(ajustes) ? ajustes : [];
};

/** Lo común de las dos listas: la factura propia con su fila de la cola. */
function aFilaDeCola(r) {
  const ajustes = leerAjustes(r.ajustes_realizados);
  const requiereActualizacion = ajustes.some((aj) => aj.requiere_actualizacion);
  return {
    id: r.reimpresion_id,
    reimpresion_id: r.reimpresion_id,
    factura_id: r.factura_id,
    numero_factura: r.numero,
    cliente_nombre: r.cliente_nombre,
    cliente_email: r.cliente_correo || null,
    fecha_emision: r.fecha,
    total: Number(r.total) || 0,
    estado: r.estado,
    fecha_creacion: r.fecha_creacion,
    fecha_procesamiento: r.fecha_procesamiento || null,
    ajustes_realizados: ajustes,
    total_ajustes: ajustes.length,
    requiere_actualizacion: requiereActualizacion,
    categoria: r.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios'),
    // Para «Imprimir y emitir» (2026-10-20): solo se ofrece si la factura
    // todavía no es electrónica, no tiene un comprobante en curso y no es una
    // histórica de Alegra. La regla está en utils/impresionUtils.js.
    electronica: Boolean(r.electronica),
    con_comprobante: Boolean(r.con_comprobante),
    historica: Boolean(r.historica)
  };
}

const COLUMNAS = `
  fr.id AS reimpresion_id, fr.ajustes_realizados, fr.estado, fr.fecha_creacion,
  fr.fecha_procesamiento, fr.categoria,
  f.id AS factura_id, f.numero, f.cliente_nombre, f.cliente_correo,
  f.fecha::text AS fecha, f.total, f.electronica,
  (f.hacienda_comprobante_id IS NOT NULL) AS con_comprobante, (f.alegra_id IS NOT NULL) AS historica
`;

/** Las pendientes: la fila más reciente de cada factura, lo más nuevo primero. */
async function listarPendientes() {
  const { rows } = await query(`
    SELECT * FROM (
      SELECT DISTINCT ON (fr.factura_propia_id) ${COLUMNAS}
        FROM facturas_reimpresion fr
        JOIN factura f ON f.id = fr.factura_propia_id
       WHERE fr.estado = 'pendiente'
         AND f.estado <> 'anulada'
       ORDER BY fr.factura_propia_id, fr.fecha_creacion DESC
    ) t
    ORDER BY t.fecha_creacion DESC
  `);

  const facturas = rows.map(aFilaDeCola);
  const sinCambios = facturas.filter((f) => f.categoria === 'sin_cambios');
  const requiereCambios = facturas.filter((f) => f.categoria !== 'sin_cambios');
  return {
    success: true,
    data: { sin_cambios: sinCambios, requiere_cambios: requiereCambios },
    total_pendientes: facturas.length,
    resumen: {
      facturas_pendientes: facturas.length,
      facturas_sin_cambios: sinCambios.length,
      facturas_con_cambios: requiereCambios.length
    }
  };
}

const POR_PAGINA = 50;

/**
 * El historial de Impresión: TODO lo impreso, lo más nuevo primero, de a 50
 * (2026-10-24, pedido del usuario: «que el historial sea solo para ver el PDF
 * y no se borre nada, solo que queden ahí»). Desde ahí ya no se recupera
 * nada: una factura impresa se corrige con nota de crédito o factura nueva.
 * Antes eran 7 días y, por un rato ese mismo día, 48 h.
 *
 * Una fila por factura: hay facturas con dos filas procesadas de antes de que
 * la cola reusara la suya, y se veían repetidas.
 */
async function listarProcesadas({ pagina = 1, limite = POR_PAGINA } = {}) {
  const lim = Math.min(Math.max(parseInt(limite, 10) || POR_PAGINA, 1), 200);
  const pag = Math.max(parseInt(pagina, 10) || 1, 1);
  const { rows } = await query(`
    SELECT ${COLUMNAS}, COUNT(*) OVER() AS total_filas
      FROM (
        SELECT DISTINCT ON (r.factura_propia_id) r.*
          FROM facturas_reimpresion r
         WHERE r.estado = 'procesada'
         ORDER BY r.factura_propia_id, r.fecha_procesamiento DESC NULLS LAST, r.id DESC
      ) fr
      JOIN factura f ON f.id = fr.factura_propia_id
     ORDER BY fr.fecha_procesamiento DESC NULLS LAST, fr.id DESC
     LIMIT $1 OFFSET $2
  `, [lim, (pag - 1) * lim]);

  const total = rows[0] ? Number(rows[0].total_filas) : 0;
  const facturas = rows.map((r) => {
    const fila = aFilaDeCola(r);
    return {
      ...fila,
      estado_reimpresion: fila.estado,
      tiene_variacion_precio: fila.ajustes_realizados.some((aj) => aj.diferencia_precio_absoluta || aj.diferencia_precio_relativa)
    };
  });
  return {
    success: true,
    data: facturas,
    total,
    paginacion: { pagina: pag, limite: lim, total, hayMas: pag * lim < total },
    resumen: { facturas_procesadas: total }
  };
}

module.exports = {
  encolarSinPendientes, encolarDesdeReporte, devolverAlReporte,
  listarPendientes, listarProcesadas, aFilaDeCola, ajustesDeFactura
};
