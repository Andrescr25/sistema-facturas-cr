/**
 * Pagos Recurrentes - Service
 *
 * Control de los gastos fijos del negocio (luz, agua, internet, alquiler,
 * insumos, planilla) para saber cuánta plata sale cada mes, qué falta pagar
 * y qué está vencido.
 *
 * Modelo en dos niveles (ver migrations/add_pagos_recurrentes.sql):
 * la plantilla `gasto_recurrente` describe el gasto, y `pago_recurrente`
 * guarda una fila por período. Los períodos se generan solos y de forma
 * idempotente al consultar un mes (asegurarPeriodos) — sin cron: un cron
 * que se cae deja meses sin generar y nadie se entera hasta que falta un
 * pago, mientras que generar al mirar el mes no puede desincronizarse.
 */

const { query } = require('../../../config/database');
const acueductos = require('./scrapers/acueductos.adapter');
const iceElectricidad = require('./scrapers/ice-electricidad.adapter');
const facturasRecibidas = require('./scrapers/facturas-recibidas.adapter');

const CATEGORIAS = ['servicios', 'alquiler', 'insumos', 'planilla', 'impuestos', 'otros'];

// Fuentes con consulta automática de recibos. Agregar una es escribir un
// adaptador con la misma firma consultarRecibos({...}) → [{documento,
// periodo, monto, vencimiento}] y registrarlo acá.
const FUENTES_AUTO = {
  [acueductos.FUENTE]: {
    label: 'Acueductos CR (agua)',
    adaptador: acueductos,
    campos: ['provincia', 'acueducto', 'medidor']
  },
  [iceElectricidad.FUENTE]: {
    label: 'ICE (electricidad)',
    adaptador: iceElectricidad,
    campos: ['nise'],
    camposInfo: {
      nise: {
        label: 'Número de servicio (NISE)',
        placeholder: 'Ej: 532117',
        ayuda: 'Está en tu recibo del ICE, arriba a la izquierda. Hasta 9 dígitos.'
      }
    }
  },
  // No consulta un sitio: lee las facturas electrónicas que ya llegaron por
  // correo. Para servicios que facturan por correo (Liberty: internet y
  // planes móviles) es mejor que raspar su portal — el XML trae el monto y el
  // consecutivo validados y no hace falta guardar credenciales.
  [facturasRecibidas.FUENTE]: {
    label: 'Factura por correo (XML)',
    adaptador: facturasRecibidas,
    campos: ['cedulaEmisor'],
    camposInfo: {
      cedulaEmisor: {
        label: 'Cédula jurídica de quien factura',
        placeholder: 'Ej: 3101610198',
        ayuda: 'La del proveedor, no la tuya. Está en su factura. Sus facturas dejarán de pedir que se relacionen con productos del catálogo.'
      }
    }
  }
};

// Cada cuántos meses cae el gasto. 'quincenal' es aparte: cae 2 veces en el
// mismo mes, así que no se expresa como intervalo de meses.
const INTERVALO_MESES = {
  mensual: 1,
  bimensual: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12
};

const FRECUENCIAS = ['quincenal', ...Object.keys(INTERVALO_MESES)];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function esPeriodoValido(periodo) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodo || '');
}

/**
 * Último día del mes — para no generar un vencimiento el 31 de febrero
 * cuando el gasto está configurado para vencer el 31.
 */
function ultimoDiaDelMes(anio, mes) {
  return new Date(anio, mes, 0).getDate();
}

function fechaVencimiento(anio, mes, dia) {
  if (!dia) return null;
  const diaAjustado = Math.min(Number(dia), ultimoDiaDelMes(anio, mes));
  return `${anio}-${String(mes).padStart(2, '0')}-${String(diaAjustado).padStart(2, '0')}`;
}

/**
 * ¿Este gasto cae en este mes? Para los que no son mensuales, se cuenta la
 * distancia en meses desde `mes_referencia` y se ve si es múltiplo exacto
 * del intervalo. Sin `mes_referencia` se asume enero como ancla.
 */
function caeEnElMes(gasto, mes) {
  if (gasto.frecuencia === 'quincenal' || gasto.frecuencia === 'mensual') return true;

  const intervalo = INTERVALO_MESES[gasto.frecuencia];
  if (!intervalo) return false;

  const referencia = Number(gasto.mes_referencia) || 1;
  return ((mes - referencia) % intervalo + intervalo) % intervalo === 0;
}

/**
 * Los períodos que le tocan a un gasto dentro de un mes: uno normalmente,
 * dos si es quincenal.
 */
function periodosDelMes(gasto, periodoMes, anio, mes) {
  if (gasto.frecuencia === 'quincenal') {
    return [
      { periodo: `${periodoMes}-Q1`, vencimiento: fechaVencimiento(anio, mes, 15) },
      { periodo: `${periodoMes}-Q2`, vencimiento: fechaVencimiento(anio, mes, ultimoDiaDelMes(anio, mes)) }
    ];
  }
  return [{ periodo: periodoMes, vencimiento: fechaVencimiento(anio, mes, gasto.dia_vencimiento) }];
}

/**
 * Crea (si faltan) las filas de pago del mes para todos los gastos activos
 * que caen en él. Idempotente por el UNIQUE(gasto_id, periodo), así que se
 * puede llamar en cada carga sin duplicar nada ni pisar montos ya editados.
 */
async function asegurarPeriodos(periodoMes) {
  const [anio, mes] = periodoMes.split('-').map(Number);
  const gastos = await query(`SELECT * FROM gasto_recurrente WHERE activo = TRUE;`);

  for (const gasto of gastos.rows) {
    if (!caeEnElMes(gasto, mes)) continue;

    // Un gasto con consulta automática NO arranca con el monto estimado: el
    // monto real lo trae el adaptador. Sembrarlo con el estimado hacía que el
    // agua apareciera siempre en ₡4.000 —el estimado guardado en el gasto— y
    // ese número se leía como si fuera el recibo real. Queda en 0 y la
    // pantalla lo muestra como "pendiente de consulta".
    const montoSemilla = gasto.fuente_auto ? 0 : gasto.monto_estimado;

    for (const { periodo, vencimiento } of periodosDelMes(gasto, periodoMes, anio, mes)) {
      await query(`
        INSERT INTO pago_recurrente (gasto_id, periodo, monto, fecha_vencimiento)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (gasto_id, periodo) DO NOTHING;
      `, [gasto.id, periodo, montoSemilla, vencimiento]);
    }
  }
}

// ==================== Gastos (plantillas) ====================

async function listarGastos() {
  // El último recibo REAL de cada gasto: el pago más reciente que trajo un
  // documento del proveedor. Para los gastos con consulta automática esto es
  // lo que hay que mostrar en la lista — el monto_estimado es un número que
  // alguien tecleó una vez y queda viejo (el agua decía ₡4.000 cuando sus
  // recibos venían en ₡3.823).
  const result = await query(`
    SELECT g.*,
           (SELECT COUNT(*) FROM pago_recurrente p WHERE p.gasto_id = g.id)::int AS total_pagos,
           u.monto   AS ultimo_monto,
           u.periodo AS ultimo_periodo,
           u.documento_externo AS ultimo_documento
    FROM gasto_recurrente g
    LEFT JOIN LATERAL (
      SELECT p.monto, p.periodo, p.documento_externo
      FROM pago_recurrente p
      WHERE p.gasto_id = g.id AND p.documento_externo IS NOT NULL
      ORDER BY p.periodo DESC
      LIMIT 1
    ) u ON TRUE
    ORDER BY g.activo DESC, g.categoria ASC, g.nombre ASC;
  `);
  return result.rows.map(mapGasto);
}

function mapGasto(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    categoria: row.categoria,
    proveedor: row.proveedor,
    montoEstimado: Number(row.monto_estimado) || 0,
    frecuencia: row.frecuencia,
    mesReferencia: row.mes_referencia,
    diaVencimiento: row.dia_vencimiento,
    notas: row.notas,
    activo: row.activo,
    totalPagos: row.total_pagos,
    fuenteAuto: row.fuente_auto || null,
    configAuto: row.config_auto || null,
    ultimaConsulta: row.ultima_consulta || null,
    // Último recibo traído por la consulta automática (null si nunca hubo).
    ultimoMonto: row.ultimo_monto != null ? Number(row.ultimo_monto) : null,
    ultimoPeriodo: row.ultimo_periodo || null,
    ultimoDocumento: row.ultimo_documento || null
  };
}

function validarGasto({ nombre, categoria, frecuencia, montoEstimado, diaVencimiento, mesReferencia }) {
  if (!nombre || !nombre.trim()) throw httpError(400, 'El nombre es obligatorio.');
  if (categoria && !CATEGORIAS.includes(categoria)) {
    throw httpError(400, `Categoría inválida. Válidas: ${CATEGORIAS.join(', ')}`);
  }
  if (frecuencia && !FRECUENCIAS.includes(frecuencia)) {
    throw httpError(400, `Frecuencia inválida. Válidas: ${FRECUENCIAS.join(', ')}`);
  }
  const monto = Number(montoEstimado);
  if (montoEstimado !== undefined && (!Number.isFinite(monto) || monto < 0)) {
    throw httpError(400, 'El monto estimado no puede ser negativo.');
  }
  if (diaVencimiento != null && diaVencimiento !== '' && (diaVencimiento < 1 || diaVencimiento > 31)) {
    throw httpError(400, 'El día de vencimiento debe estar entre 1 y 31.');
  }
  if (mesReferencia != null && mesReferencia !== '' && (mesReferencia < 1 || mesReferencia > 12)) {
    throw httpError(400, 'El mes de referencia debe estar entre 1 y 12.');
  }
}

/**
 * Normaliza la config de consulta automática. Devuelve [fuente, config] con
 * ambos en null si no se eligió fuente — así "sin consulta automática" es un
 * estado explícito y no un objeto vacío que después hay que interpretar.
 */
function normalizarFuenteAuto({ fuenteAuto, configAuto }) {
  if (!fuenteAuto) return [null, null];
  if (!FUENTES_AUTO[fuenteAuto]) throw httpError(400, 'Fuente de consulta automática desconocida.');
  return [fuenteAuto, configAuto || {}];
}

async function crearGasto(datos) {
  validarGasto(datos);
  const { nombre, categoria, proveedor, montoEstimado, frecuencia, mesReferencia, diaVencimiento, notas } = datos;
  const [fuente, config] = normalizarFuenteAuto(datos);

  const result = await query(`
    INSERT INTO gasto_recurrente
      (nombre, categoria, proveedor, monto_estimado, frecuencia, mes_referencia, dia_vencimiento, notas,
       fuente_auto, config_auto)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `, [
    nombre.trim(),
    categoria || 'servicios',
    proveedor || null,
    Number(montoEstimado) || 0,
    frecuencia || 'mensual',
    mesReferencia || null,
    diaVencimiento || null,
    notas || null,
    fuente,
    config ? JSON.stringify(config) : null
  ]);

  return mapGasto({ ...result.rows[0], total_pagos: 0 });
}

async function actualizarGasto(id, datos) {
  validarGasto(datos);
  const { nombre, categoria, proveedor, montoEstimado, frecuencia, mesReferencia, diaVencimiento, notas, activo } = datos;
  const [fuente, config] = normalizarFuenteAuto(datos);

  const result = await query(`
    UPDATE gasto_recurrente SET
      nombre = $1, categoria = $2, proveedor = $3, monto_estimado = $4,
      frecuencia = $5, mes_referencia = $6, dia_vencimiento = $7, notas = $8,
      activo = COALESCE($9, activo),
      fuente_auto = $11, config_auto = $12
    WHERE id = $10
    RETURNING *;
  `, [
    nombre.trim(),
    categoria || 'servicios',
    proveedor || null,
    Number(montoEstimado) || 0,
    frecuencia || 'mensual',
    mesReferencia || null,
    diaVencimiento || null,
    notas || null,
    activo === undefined ? null : activo,
    id,
    fuente,
    config ? JSON.stringify(config) : null
  ]);

  if (result.rows.length === 0) throw httpError(404, 'Gasto no encontrado.');
  return mapGasto({ ...result.rows[0], total_pagos: 0 });
}

async function cambiarActivoGasto(id, activo) {
  const result = await query(
    `UPDATE gasto_recurrente SET activo = $1 WHERE id = $2 RETURNING *;`,
    [Boolean(activo), id]
  );
  if (result.rows.length === 0) throw httpError(404, 'Gasto no encontrado.');
  return mapGasto({ ...result.rows[0], total_pagos: 0 });
}

/**
 * Borra la plantilla. Se niega si ya tiene pagos registrados: ese historial
 * es el que sirve para ver cómo viene variando el gasto, y borrarlo por
 * querer "limpiar la lista" es una pérdida silenciosa. Para sacarlo de
 * circulación está `activo = false`.
 */
async function eliminarGasto(id) {
  const pagados = await query(
    `SELECT COUNT(*)::int AS n FROM pago_recurrente WHERE gasto_id = $1 AND estado = 'pagado';`,
    [id]
  );
  if (pagados.rows[0].n > 0) {
    throw httpError(400, `No se puede eliminar: tiene ${pagados.rows[0].n} pago(s) registrados. Desactivalo para que deje de aparecer.`);
  }

  const result = await query(`DELETE FROM gasto_recurrente WHERE id = $1 RETURNING nombre;`, [id]);
  if (result.rows.length === 0) throw httpError(404, 'Gasto no encontrado.');
  return { eliminado: true, nombre: result.rows[0].nombre };
}

// ==================== Pagos del período ====================

function mapPago(row, hoy) {
  const vencimiento = row.fecha_vencimiento;
  const pendiente = row.estado !== 'pagado';
  return {
    id: row.id,
    gastoId: row.gasto_id,
    nombre: row.nombre,
    categoria: row.categoria,
    proveedor: row.proveedor,
    frecuencia: row.frecuencia,
    periodo: row.periodo,
    monto: Number(row.monto) || 0,
    montoEstimado: Number(row.monto_estimado) || 0,
    fuenteAuto: row.fuente_auto || null,
    ultimaConsulta: row.ultima_consulta || null,
    // El monto todavía no lo trajo la consulta automática: la pantalla lo
    // dice en palabras en vez de mostrar un ₡0 que se lee como "no debo nada".
    esperandoConsulta: Boolean(row.fuente_auto) && Number(row.monto) === 0 && row.estado !== 'pagado',
    fechaVencimiento: vencimiento,
    fechaPago: row.fecha_pago,
    estado: row.estado,
    metodo: row.metodo,
    notas: row.notas,
    // "Vencido" se calcula acá y no se guarda: es una función de la fecha de
    // hoy, y guardarlo obligaría a un job que lo mantenga al día.
    vencido: pendiente && Boolean(vencimiento) && new Date(vencimiento) < hoy
  };
}

/**
 * Vista de un mes: los pagos que tocan (generándolos si faltan) más los
 * totales que responden "¿cuánta plata sale este mes y cuánta falta?".
 */
async function obtenerPeriodo(periodoMes) {
  if (!esPeriodoValido(periodoMes)) {
    throw httpError(400, 'Período inválido. Usá el formato YYYY-MM.');
  }

  await asegurarPeriodos(periodoMes);

  const result = await query(`
    SELECT p.*, g.nombre, g.categoria, g.proveedor, g.frecuencia, g.monto_estimado,
           g.fuente_auto, g.ultima_consulta
    FROM pago_recurrente p
    JOIN gasto_recurrente g ON g.id = p.gasto_id
    WHERE p.periodo LIKE $1 || '%'
    ORDER BY p.estado ASC, p.fecha_vencimiento ASC NULLS LAST, g.nombre ASC;
  `, [periodoMes]);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const pagos = result.rows.map(row => mapPago(row, hoy));

  const total = pagos.reduce((s, p) => s + p.monto, 0);
  const pagado = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0);
  const vencido = pagos.filter(p => p.vencido).reduce((s, p) => s + p.monto, 0);

  const porCategoria = {};
  for (const p of pagos) {
    if (!porCategoria[p.categoria]) porCategoria[p.categoria] = { categoria: p.categoria, total: 0, pendiente: 0 };
    porCategoria[p.categoria].total += p.monto;
    if (p.estado !== 'pagado') porCategoria[p.categoria].pendiente += p.monto;
  }

  return {
    periodo: periodoMes,
    pagos,
    resumen: {
      total,
      pagado,
      pendiente: total - pagado,
      vencido,
      cantidad: pagos.length,
      cantidadPendiente: pagos.filter(p => p.estado !== 'pagado').length,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.total - a.total)
    }
  };
}

async function actualizarPago(id, { monto, fechaVencimiento, metodo, notas }) {
  if (monto !== undefined) {
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 0) throw httpError(400, 'El monto no puede ser negativo.');
  }

  const result = await query(`
    UPDATE pago_recurrente SET
      monto = COALESCE($1, monto),
      fecha_vencimiento = COALESCE($2, fecha_vencimiento),
      metodo = COALESCE($3, metodo),
      notas = COALESCE($4, notas)
    WHERE id = $5
    RETURNING *;
  `, [
    monto !== undefined ? Number(monto) : null,
    fechaVencimiento || null,
    metodo || null,
    notas !== undefined ? notas : null,
    id
  ]);

  if (result.rows.length === 0) throw httpError(404, 'Pago no encontrado.');
  return result.rows[0];
}

/**
 * Marca un pago como hecho. El monto es opcional: si viene, reemplaza al
 * estimado — el caso normal es que la luz venga distinta de lo presupuestado
 * y ese número real es justamente el que interesa guardar.
 */
async function marcarPagado(id, { monto, fechaPago, metodo, notas } = {}) {
  if (monto !== undefined && monto !== null && monto !== '') {
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 0) throw httpError(400, 'El monto no puede ser negativo.');
  }

  const result = await query(`
    UPDATE pago_recurrente SET
      estado = 'pagado',
      monto = COALESCE($1, monto),
      fecha_pago = COALESCE($2, CURRENT_DATE),
      metodo = COALESCE($3, metodo),
      notas = COALESCE($4, notas)
    WHERE id = $5
    RETURNING *;
  `, [
    monto !== undefined && monto !== null && monto !== '' ? Number(monto) : null,
    fechaPago || null,
    metodo || null,
    notas !== undefined ? notas : null,
    id
  ]);

  if (result.rows.length === 0) throw httpError(404, 'Pago no encontrado.');
  return result.rows[0];
}

async function revertirPago(id) {
  const result = await query(`
    UPDATE pago_recurrente SET estado = 'pendiente', fecha_pago = NULL
    WHERE id = $1 RETURNING *;
  `, [id]);
  if (result.rows.length === 0) throw httpError(404, 'Pago no encontrado.');
  return result.rows[0];
}

/**
 * Historial de un gasto: cómo viene variando período a período. Es lo que
 * permite notar que la luz subió 30% respecto al año pasado.
 */
async function historialGasto(gastoId) {
  const result = await query(`
    SELECT p.*, g.nombre, g.categoria, g.proveedor, g.frecuencia, g.monto_estimado
    FROM pago_recurrente p
    JOIN gasto_recurrente g ON g.id = p.gasto_id
    WHERE p.gasto_id = $1
    ORDER BY p.periodo DESC
    LIMIT 24;
  `, [gastoId]);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const pagos = result.rows.map(row => mapPago(row, hoy));
  const montosPagados = pagos.filter(p => p.estado === 'pagado').map(p => p.monto);

  return {
    pagos,
    promedioPagado: montosPagados.length
      ? Math.round(montosPagados.reduce((s, m) => s + m, 0) / montosPagados.length)
      : null
  };
}

/**
 * Panorama de flujo: lo comprometido por mes (según las plantillas activas,
 * sin depender de que los períodos ya estén generados) y lo que vence pronto.
 */
async function obtenerResumen() {
  const gastos = await query(`SELECT * FROM gasto_recurrente WHERE activo = TRUE;`);

  // Costo mensual promedio: un gasto trimestral de ₡60.000 pesa ₡20.000 por
  // mes en el flujo, no ₡60.000 — prorratearlo es lo que hace comparable el
  // total contra lo que entra cada mes.
  const mensualizado = gastos.rows.reduce((suma, g) => {
    const monto = Number(g.monto_estimado) || 0;
    if (g.frecuencia === 'quincenal') return suma + monto * 2;
    const intervalo = INTERVALO_MESES[g.frecuencia] || 1;
    return suma + monto / intervalo;
  }, 0);

  const proximos = await query(`
    SELECT p.*, g.nombre, g.categoria, g.proveedor, g.frecuencia, g.monto_estimado
    FROM pago_recurrente p
    JOIN gasto_recurrente g ON g.id = p.gasto_id
    WHERE p.estado = 'pendiente' AND p.fecha_vencimiento IS NOT NULL
      AND p.fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
    ORDER BY p.fecha_vencimiento ASC
    LIMIT 20;
  `);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const proximosPagos = proximos.rows.map(row => mapPago(row, hoy));

  return {
    gastosActivos: gastos.rows.length,
    costoMensualEstimado: Math.round(mensualizado),
    proximosPagos,
    totalVencido: proximosPagos.filter(p => p.vencido).reduce((s, p) => s + p.monto, 0)
  };
}

// ==================== Consulta automática de recibos ====================

/** '18-08-2026' (dd-mm-yyyy) → '2026-08-18' */
function fechaCrAIso(fecha) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(fecha || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** '07-2026' (mm-yyyy) → '2026-07' */
function periodoCrAIso(periodo) {
  const m = /^(\d{2})-(\d{4})$/.exec(String(periodo || ''));
  return m ? `${m[2]}-${m[1]}` : null;
}

/**
 * Trae los recibos reales de la fuente del gasto y los vuelca en
 * pago_recurrente.
 *
 * El recibo de agua trae DOS fechas: el período de consumo (07-2026) y el
 * vencimiento (18-08-2026). El pago se registra en el mes del VENCIMIENTO,
 * porque este módulo es de flujo de caja — lo que importa es cuándo sale la
 * plata, no cuándo se consumió el agua. El período de consumo queda en las
 * notas para no perderlo.
 *
 * Nunca pisa un pago ya marcado como pagado: si el recibo se pagó y la
 * fuente todavía lo lista, sobrescribirlo lo devolvería a pendiente y
 * mostraría plata por salir que ya salió.
 */
async function sincronizarGasto(gastoId) {
  const res = await query(`SELECT * FROM gasto_recurrente WHERE id = $1;`, [gastoId]);
  if (res.rows.length === 0) throw httpError(404, 'Gasto no encontrado.');

  const gasto = res.rows[0];
  const fuente = FUENTES_AUTO[gasto.fuente_auto];
  if (!fuente) throw httpError(400, 'Este gasto no tiene configurada una consulta automática.');

  const config = gasto.config_auto || {};
  const faltantes = fuente.campos.filter(c => !config[c]);
  if (faltantes.length) {
    throw httpError(400, `Falta configurar: ${faltantes.join(', ')}.`);
  }

  const recibos = await fuente.adaptador.consultarRecibos(config);

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const recibo of recibos) {
    const vencimientoIso = fechaCrAIso(recibo.vencimiento);
    if (!vencimientoIso) continue;

    const periodoPago = vencimientoIso.slice(0, 7);
    const periodoConsumo = periodoCrAIso(recibo.periodo);
    const nota = periodoConsumo
      ? `Recibo ${recibo.documento || 's/n'} · consumo ${periodoConsumo}`
      : `Recibo ${recibo.documento || 's/n'}`;

    const existente = await query(
      `SELECT id, estado FROM pago_recurrente WHERE gasto_id = $1 AND periodo = $2;`,
      [gastoId, periodoPago]
    );

    if (existente.rows.length === 0) {
      await query(`
        INSERT INTO pago_recurrente (gasto_id, periodo, monto, fecha_vencimiento, notas, documento_externo)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [gastoId, periodoPago, recibo.monto, vencimientoIso, nota, recibo.documento || null]);
      creados++;
      continue;
    }

    if (existente.rows[0].estado === 'pagado') {
      omitidos++;
      continue;
    }

    await query(`
      UPDATE pago_recurrente
      SET monto = $1, fecha_vencimiento = $2, notas = $3, documento_externo = $4
      WHERE id = $5;
    `, [recibo.monto, vencimientoIso, nota, recibo.documento || null, existente.rows[0].id]);
    actualizados++;
  }

  await query(`UPDATE gasto_recurrente SET ultima_consulta = CURRENT_TIMESTAMP WHERE id = $1;`, [gastoId]);

  // Algunas fuentes, además de traer el recibo, tienen que dejar la compra
  // registrada en Alegra — es de ahí que el Reporte Contador toma las compras
  // y el IVA acreditable. Se hace DESPUÉS de guardar el pago y sin tumbar la
  // sincronización si falla: el gasto ya quedó visible, y la compra se
  // reintenta sola en la próxima corrida.
  let contabilidad = null;
  if (typeof fuente.adaptador.registrarEnAlegra === 'function') {
    try {
      contabilidad = await fuente.adaptador.registrarEnAlegra(config);
    } catch (error) {
      console.error(`❌ [Pagos Recurrentes] No se pudo registrar en Alegra: ${error.message}`);
      contabilidad = { registradas: 0, fallidas: 0, error: error.message };
    }
  }

  return { recibos: recibos.length, creados, actualizados, omitidos, contabilidad, detalle: recibos };
}

/**
 * Consulta todos los gastos activos que tengan fuente automática. Se hace
 * en serie y no en paralelo a propósito: son servidores ajenos y no hay
 * ninguna prisa que justifique golpearlos de a varios a la vez.
 */
async function sincronizarTodos() {
  const res = await query(
    `SELECT id, nombre FROM gasto_recurrente WHERE activo = TRUE AND fuente_auto IS NOT NULL;`
  );

  const resultados = [];
  for (const gasto of res.rows) {
    try {
      const r = await sincronizarGasto(gasto.id);
      resultados.push({ id: gasto.id, nombre: gasto.nombre, ok: true, ...r, detalle: undefined });
    } catch (error) {
      resultados.push({ id: gasto.id, nombre: gasto.nombre, ok: false, error: error.message });
    }
  }
  return { consultados: res.rows.length, resultados };
}

/**
 * Cada fuente describe sus propios campos para que la pantalla los dibuje
 * sola. Sin `camposInfo`, agregar una fuente obligaba a tocar también el
 * frontend — y el ICE y las facturas por correo quedaron sin formulario, solo
 * configurables por API.
 */
function listarFuentesAuto() {
  return Object.entries(FUENTES_AUTO).map(([clave, f]) => ({
    clave,
    label: f.label,
    campos: f.campos,
    camposInfo: f.camposInfo || null,
    // El acueducto necesita desplegables en cascada (provincia -> acueducto),
    // así que su formulario es a medida; el resto son campos de texto.
    formularioPropio: Boolean(f.adaptador.listarProvincias)
  }));
}

/** Catálogos para armar los desplegables de la consulta automática. */
async function opcionesFuente(fuenteClave, { provincia } = {}) {
  const fuente = FUENTES_AUTO[fuenteClave];
  if (!fuente) throw httpError(404, 'Fuente desconocida.');

  if (fuenteClave === acueductos.FUENTE) {
    if (!provincia) return { provincias: await fuente.adaptador.listarProvincias() };
    return { acueductos: await fuente.adaptador.listarAcueductos(provincia) };
  }
  return {};
}

module.exports = {
  listarGastos,
  crearGasto,
  actualizarGasto,
  cambiarActivoGasto,
  eliminarGasto,
  obtenerPeriodo,
  actualizarPago,
  marcarPagado,
  revertirPago,
  historialGasto,
  obtenerResumen,
  sincronizarGasto,
  sincronizarTodos,
  listarFuentesAuto,
  opcionesFuente,
  CATEGORIAS,
  FRECUENCIAS
};
