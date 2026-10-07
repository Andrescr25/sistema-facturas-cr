/** Auditoría de lectura: ninguna consulta corrige, importa ni reclasifica datos. */
const ident = valor => '"' + String(valor).replace(/"/g, '""') + '"';

async function leerEstado(db, referencia = null) {
  const tablas = {}, columnas = {};
  const esquema = (await db.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    ORDER BY table_name, ordinal_position`)).rows;
  for (const fila of esquema) (columnas[fila.table_name] ||= []).push(fila.column_name);

  for (const [tabla, actuales] of Object.entries(columnas)) {
    const usadas = referencia?.columnas?.[tabla] || actuales;
    if (!Array.isArray(usadas) || !usadas.length || usadas.some(c => !actuales.includes(c))) {
      throw Error('La referencia contiene columnas ausentes.');
    }
    // Proyectar las columnas anteriores permite agregar campos sin excluir
    // ids, importes, timestamps, referencias ni valores fiscales originales.
    // Ordenar las huellas incluye filas repetidas y evita depender del plan SQL.
    tablas[tabla] = (await db.query(`
      SELECT count(*)::int filas, md5(COALESCE(string_agg(h, '' ORDER BY h), '')) huella
      FROM (SELECT md5(to_jsonb(t)::text) h
        FROM (SELECT ${usadas.map(ident).join(',')} FROM public.${ident(tabla)}) t) x`)).rows[0];
  }
  const stock = (await db.query(`
    SELECT count(*)::int productos,
      count(*) FILTER(WHERE existencia <> 0)::int "conExistencias",
      count(*) FILTER(WHERE conteo_confirmado)::int contados,
      count(*) FILTER(WHERE costo_promedio IS NOT NULL)::int valorados
    FROM inventario_saldo`)).rows[0];
  const bodega = (await db.query(`
    SELECT inicializada_en IS NOT NULL inicializada, revision::text
    FROM inventario_bodega WHERE id = 1`)).rows[0];
  const antiguos = {}, documentos = {};
  for (const tabla of ['inventario_auditorias', 'producto_descuento_exceso', 'regalos_exceso']) {
    antiguos[tabla] = (await db.query(`
      SELECT count(*) FILTER(WHERE historica)::int historicos,
        count(*) FILTER(WHERE NOT historica)::int activos FROM ${ident(tabla)}`)).rows[0];
  }
  for (const tabla of ['factura', 'pedido_cliente']) {
    if (columnas[tabla]?.includes('ciclo_ruta_cliente_id')) {
      documentos[tabla] = (await db.query(`
        SELECT count(*) FILTER(WHERE ciclo_ruta_cliente_id IS NOT NULL OR preventa_anticipada)::int clasificados
        FROM ${ident(tabla)}`)).rows[0];
    }
  }
  // Las secuencias no son MVCC: comparar con la aplicación en reposo. Una
  // escritura con ROLLBACK puede consumir un serial y debe quedar visible.
  const secuencias = (await db.query(`
    SELECT sequencename, last_value::text valor, start_value::text inicio,
      increment_by::text incremento FROM pg_sequences
    WHERE schemaname = 'public' ORDER BY sequencename`)).rows;
  return { version: 1, columnas, tablas, secuencias, stock, bodega, antiguos, documentos };
}

async function capturarEstado(pool, referencia = null) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const estado = await leerEstado(db, referencia);
    await db.query('COMMIT');
    return estado;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

function compararHistoria(antes, despues) {
  if (antes?.version !== 1 || despues?.version !== 1) throw Error('Referencia inválida.');
  const diferencias = Object.entries(antes.tablas)
    .filter(([tabla, fila]) => !despues.tablas[tabla]
      || fila.filas !== despues.tablas[tabla].filas || fila.huella !== despues.tablas[tabla].huella)
    .map(([tabla]) => tabla);
  for (const serie of antes.secuencias || []) {
    if (JSON.stringify(serie) !== JSON.stringify(despues.secuencias?.find(s => s.sequencename === serie.sequencename))) {
      diferencias.push('secuencia:' + serie.sequencename);
    }
  }
  return diferencias;
}

/** Estado ANTES de abrir la operación: actividad real posterior deja de ser cero. */
function verificarCero(estado) {
  const fallos = [];
  if (!estado.stock.productos || estado.stock.conExistencias || estado.stock.contados || estado.stock.valorados) {
    fallos.push('existencias/conteo/valoración');
  }
  if (!estado.bodega || estado.bodega.inicializada || estado.bodega.revision !== '0') fallos.push('apertura física');
  for (const [tabla, conteo] of Object.entries(estado.antiguos)) if (conteo.activos) fallos.push(tabla + ' activo');
  for (const tabla of ['movimiento_inventario', 'orden_compra_ciclo', 'orden_compra_ciclo_envio',
    'orden_compra_ciclo_recepcion', 'orden_compra_ciclo_cierre', 'entrega_evento']) {
    if (estado.tablas[tabla]?.filas) fallos.push(tabla);
  }
  for (const [tabla, conteo] of Object.entries(estado.documentos)) if (conteo.clasificados) fallos.push(tabla + ' clasificado');
  return fallos;
}

module.exports = { ident, leerEstado, capturarEstado, compararHistoria, verificarCero };
