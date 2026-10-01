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
 */

const { query } = require('../../../config/database');

/** Una factura despachada sin faltantes, a la cola. `db`: cliente de transacción o el módulo. */
async function encolarSinPendientes(facturaId, db = { query }) {
  const r = await db.query(`
    UPDATE facturas_reimpresion
       SET estado = 'pendiente',
           ajustes_realizados = '[]'::jsonb,
           categoria = 'sin_pendientes',
           total_ajustes = 0,
           fecha_creacion = CURRENT_TIMESTAMP,
           fecha_procesamiento = NULL
     WHERE factura_propia_id = $1
    RETURNING id
  `, [facturaId]);
  if (r.rows.length > 0) return r.rows[0].id;

  const nueva = await db.query(`
    INSERT INTO facturas_reimpresion (factura_propia_id, ajustes_realizados, estado, categoria, total_ajustes, fecha_creacion)
    VALUES ($1, '[]'::jsonb, 'pendiente', 'sin_pendientes', 0, CURRENT_TIMESTAMP)
    RETURNING id
  `, [facturaId]);
  return nueva.rows[0].id;
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
    // Solo para la pantalla vieja de Impresión, que todavía abre la factura en
    // Alegra (paso 3). Una factura propia lo trae vacío.
    alegra_id: r.alegra_id || null,
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
    categoria: r.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
  };
}

const COLUMNAS = `
  fr.id AS reimpresion_id, fr.ajustes_realizados, fr.estado, fr.fecha_creacion,
  fr.fecha_procesamiento, fr.categoria,
  f.id AS factura_id, f.numero, f.alegra_id, f.cliente_nombre, f.cliente_correo,
  f.fecha::text AS fecha, f.total
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

/** Las procesadas de los últimos 7 días: se pueden recuperar mientras tanto. */
async function listarProcesadas() {
  const { rows } = await query(`
    SELECT ${COLUMNAS},
           EXTRACT(DAY FROM (NOW() - fr.fecha_procesamiento)) AS dias_desde_procesamiento
      FROM facturas_reimpresion fr
      JOIN factura f ON f.id = fr.factura_propia_id
     WHERE fr.estado = 'procesada'
       AND fr.fecha_procesamiento >= NOW() - INTERVAL '7 days'
     ORDER BY fr.fecha_procesamiento DESC
  `);

  const facturas = rows.map((r) => {
    const fila = aFilaDeCola(r);
    const dias = Number(r.dias_desde_procesamiento) || 0;
    return {
      ...fila,
      estado_reimpresion: fila.estado,
      dias_restantes_recuperacion: Math.ceil(7 - dias),
      puede_recuperar: dias <= 7,
      tiene_variacion_precio: fila.ajustes_realizados.some((aj) => aj.diferencia_precio_absoluta || aj.diferencia_precio_relativa)
    };
  });
  return {
    success: true,
    data: facturas,
    total: facturas.length,
    resumen: { facturas_procesadas: facturas.length, recuperables: facturas.filter((f) => f.puede_recuperar).length }
  };
}

module.exports = { encolarSinPendientes, listarPendientes, listarProcesadas, aFilaDeCola };
