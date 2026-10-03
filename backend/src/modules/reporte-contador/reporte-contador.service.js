/**
 * Reporte Contador — control interno mensual de ventas y compras.
 *
 * El mes se trae de las tablas propias (`factura`, `nota_credito` y `compra`,
 * ver desdeElSistema.js). Hasta el 2026-10-03 se traía de la API de Alegra.
 * Sigue aceptando el par de Excel que exportaba Alegra ("Impuestos en Ventas"
 * / "Impuestos en Compras", cada uno con hoja de resumen + hoja de detalle),
 * para poder revisar un mes viejo contra su archivo. Con las líneas adentro,
 * el módulo:
 *   1. Guarda cada línea del detalle.
 *   2. En ventas, detecta facturas duplicadas: la misma venta registrada
 *      como documento interno ("sin emisión", consecutivo de 12 dígitos) y
 *      además como factura electrónica (consecutivo de 20 dígitos) — se
 *      verificó contra datos reales que esto pasa (15 casos en el mes de
 *      julio, cliente+fecha+monto+ítems idénticos).
 *   3. Deja que el usuario confirme, revierta o edite cualquier línea antes
 *      de exportar. Nada se decide solo: los duplicados de alta confianza
 *      arrancan pre-marcados para excluir (porque la evidencia es fuerte:
 *      mismos ítems), pero siempre reversible con un click.
 *
 * A propósito NO hay ninguna lógica que persiga un total objetivo. La
 * exclusión es por evidencia de duplicado, línea por línea — el número
 * final es el que resulte de eso, sea el que sea.
 */

const XLSX = require('xlsx');
const { query } = require('../../../config/database');
const { traerDelSistema } = require('./desdeElSistema');
const { enviarCorreo, estaConfigurado } = require('../../../services/mailer');

// Regla verificada contra los archivos reales de Alegra: el consecutivo de
// una factura electrónica emitida tiene 20 dígitos; el documento interno
// ("sin emisión") tiene 12. No hay valores intermedios en los datos reales,
// pero se usa >=20 en vez de ===20 por si Hacienda cambia el formato.
const LARGO_MINIMO_EMITIDA = 20;

const COLUMNAS_DETALLE = {
  ventas: {
    hoja: 'Impuestos en Ventas',
    contraparte: 'Cliente',
    actividad: 'Actividad económica cliente',
    // Las notas de crédito viajan en su propia hoja, con dos columnas extra.
    hojaDevoluciones: 'Devoluciones en Ventas'
  },
  compras: {
    hoja: 'Impuestos en Compras',
    contraparte: 'Proveedor',
    actividad: 'Actividad económica proveedor'
  }
};

const TIPO_NOTA_CREDITO = 'Nota de crédito';

function esDevolucion(linea) {
  return (linea.tipoDocumento || linea.tipo_documento) === TIPO_NOTA_CREDITO;
}

// La API devuelve el tipo de tarifa en inglés y en mayúsculas (GENERAL,
// REDUCED, EXEMPT); el Excel de Alegra lo escribe en español. Se traduce solo
// al exportar para que el archivo salga igual al oficial y se puedan comparar
// lado a lado.
const ETIQUETA_TIPO_TARIFA = { GENERAL: 'General', REDUCED: 'Reducido', EXEMPT: 'Exento', TRANSIENT: 'Transitorio' };
const NOMBRE_POR_TIPO_TARIFA = { GENERAL: 'IVA', REDUCED: 'IVA reducido', EXEMPT: 'IVA exento', TRANSIENT: 'IVA transitorio' };

function etiquetaTipoTarifa(tipoTarifa) {
  const clave = String(tipoTarifa || '').toUpperCase();
  return ETIQUETA_TIPO_TARIFA[clave] || tipoTarifa || '';
}

function nombreImpuestoPorTarifa(tipoTarifa) {
  return NOMBRE_POR_TIPO_TARIFA[String(tipoTarifa || '').toUpperCase()] || 'IVA';
}

/**
 * Fecha como serial de Excel (días desde 1899-12-30), calculado a mano.
 *
 * Dejar que SheetJS convierta el Date lo hace en hora LOCAL, y Costa Rica
 * tenía UTC-5:36:13 hasta 1921: el epoch quedaba corrido y las fechas salían
 * como 46244,99985 en vez de 46245 — 13 segundos antes de la medianoche, o
 * sea un día menos al abrir el archivo.
 */
function serialExcel(fecha) {
  const iso = fechaIsoLocal(fecha);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia) / 86400000 + 25569;
}

/** Marca la columna de fechas como fecha para que Excel no muestre el número crudo. */
function formatearColumnaFecha(hoja, encabezado) {
  const rango = XLSX.utils.decode_range(hoja['!ref']);
  let columna = -1;
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const celda = hoja[XLSX.utils.encode_cell({ r: rango.s.r, c })];
    if (celda && celda.v === encabezado) { columna = c; break; }
  }
  if (columna === -1) return;
  for (let f = rango.s.r + 1; f <= rango.e.r; f++) {
    const celda = hoja[XLSX.utils.encode_cell({ r: f, c: columna })];
    if (celda && celda.t === 'n') celda.z = 'dd/mm/yyyy';
  }
}

/**
 * Fecha en 'YYYY-MM-DD' leyendo los componentes LOCALES.
 *
 * Sin esto la fecha se guardaba un día antes: Alegra devuelve '2026-08-11',
 * `new Date()` lo interpreta como medianoche UTC, y el driver de Postgres lo
 * escribe en hora local (UTC-6) — con lo que la columna DATE truncaba a
 * 2026-08-10. Pasando la fecha ya formateada no hay conversión de zona.
 */
function fechaIsoLocal(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) return null;
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  const dia = String(valor.getDate()).padStart(2, '0');
  return `${valor.getFullYear()}-${mes}-${dia}`;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function esEmitida(numero) {
  return String(numero || '').replace(/\D/g, '').length >= LARGO_MINIMO_EMITIDA;
}

const COLUMNAS_LINEA = 24; // debe coincidir con la lista de columnas del INSERT de abajo
const FILAS_POR_INSERT = 150; // mismo tamaño de lote que insertarLotesVentaHistorico — un mes normal ronda 1.000-1.800 filas; insertarlas una por una tardaba minutos y bloqueaba al usuario

/**
 * INSERT multi-fila (chunked): un mes de ventas trae ~1.700 líneas, y
 * insertarlas una por una (una ida y vuelta a Supabase por fila) tardaba
 * minutos. Con reintento por lote — el pooler de Supabase corta a veces la
 * conexión SSL en queries grandes (mismo comportamiento visto y ya resuelto
 * en catalogo-agente.service.js).
 */
async function insertarLotesLineas(periodoId, lineas) {
  for (let i = 0; i < lineas.length; i += FILAS_POR_INSERT) {
    const lote = lineas.slice(i, i + FILAS_POR_INSERT);
    const placeholders = lote
      .map((_, idx) => {
        const base = idx * COLUMNAS_LINEA;
        const cols = Array.from({ length: COLUMNAS_LINEA }, (_, c) => `$${base + c + 1}`);
        return `(${cols.join(', ')})`;
      })
      .join(', ');

    const valores = lote.flatMap((l, idx) => [
      periodoId, i + idx, l.tipoDocumento, fechaIsoLocal(l.fecha), l.numero, l.documentoAsociado || null,
      l.esEmitida, l.contraparte,
      l.actividadEconomica, l.concepto, l.cantidad, l.precioUnitario, l.precioTotal, l.descuento,
      l.nombreImpuesto, l.tipoImpuesto, l.tarifa, l.tipoTarifa, l.acreditable, l.baseGravable, l.impuesto,
      l.excluido || false, l.duplicadoConfianza || null, l.duplicadoDe || null
    ]);

    const sql = `
      INSERT INTO reporte_contador_linea (
        periodo_id, orden, tipo_documento, fecha, numero, documento_asociado,
        es_emitida, contraparte,
        actividad_economica, concepto, cantidad, precio_unitario, precio_total, descuento,
        nombre_impuesto, tipo_impuesto, tarifa, tipo_tarifa, acreditable, base_gravable, impuesto,
        excluido, duplicado_confianza, duplicado_de
      ) VALUES ${placeholders};
    `;

    let ultimoError;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        await query(sql, valores);
        ultimoError = null;
        break;
      } catch (error) {
        ultimoError = error;
        console.log(`   ⚠️ [Reporte Contador] Error insertando lote (intento ${intento}/3): ${error.message}`);
        await new Promise((r) => setTimeout(r, 800 * intento));
      }
    }
    if (ultimoError) throw ultimoError;
  }
}

function normalizarTexto(texto) {
  return String(texto || '').trim().toUpperCase();
}

// ==================== Parseo del Excel ====================

/**
 * Lee el par de hojas (resumen + detalle) de un Excel de Alegra. No valida
 * todavía nada de negocio, solo extrae filas — la validación de que sea el
 * archivo correcto pasa por buscar la hoja de detalle por nombre exacto.
 */
function parsearExcel(buffer, tipo) {
  const config = COLUMNAS_DETALLE[tipo];
  if (!config) throw httpError(400, `Tipo inválido: ${tipo}`);

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (error) {
    throw httpError(400, 'El archivo no es un Excel válido.');
  }

  if (!workbook.SheetNames.includes(config.hoja)) {
    throw httpError(400, `Este no parece el Excel de ${tipo === 'ventas' ? 'Impuestos en Ventas' : 'Impuestos en Compras'} — falta la hoja "${config.hoja}". Hojas encontradas: ${workbook.SheetNames.join(', ')}`);
  }

  const filas = XLSX.utils.sheet_to_json(workbook.Sheets[config.hoja], { defval: '' });

  // Las notas de crédito viven en una hoja aparte con el número bajo otro
  // encabezado ("Número Nota Crédito") y una columna extra que apunta a la
  // factura original. Se leen igual y se guardan como líneas normales
  // marcadas por tipo_documento — no negativas: en el resumen de Alegra las
  // devoluciones son columnas propias, no un descuento de la base gravable.
  const filasDevoluciones = config.hojaDevoluciones && workbook.SheetNames.includes(config.hojaDevoluciones)
    ? XLSX.utils.sheet_to_json(workbook.Sheets[config.hojaDevoluciones], { defval: '' })
    : [];

  const lineas = [];
  for (const fila of [...filas, ...filasDevoluciones]) {
    const numero = String(fila['Número'] ?? fila['Número Nota Crédito'] ?? '').trim();
    // La fila de TOTALES al final del detalle no tiene número de documento;
    // se recalcula de todas formas a partir de las líneas, así que se salta.
    if (!numero || fila['Acreditable'] === 'TOTALES') continue;

    lineas.push({
      tipoDocumento: fila['Tipo Documento'] || '',
      fecha: fila['Fecha'] instanceof Date ? fila['Fecha'] : null,
      numero,
      documentoAsociado: String(fila['Documento asociado'] ?? '').trim() || null,
      esEmitida: esEmitida(numero),
      contraparte: fila[config.contraparte] || '',
      actividadEconomica: fila[config.actividad] || '',
      concepto: fila['Concepto'] || '',
      cantidad: Number(fila['Ítem - Cantidad']) || 0,
      precioUnitario: Number(fila['Ítem - Precio unitario']) || 0,
      precioTotal: Number(fila['Ítem - Precio total']) || 0,
      descuento: Number(fila['Descuento']) || 0,
      nombreImpuesto: fila['Nombre impuesto'] || '',
      tipoImpuesto: fila['Tipo impuesto'] || '',
      tarifa: String(fila['Tarifa'] ?? ''),
      tipoTarifa: fila['Tipo tarifa'] || '',
      acreditable: fila['Acreditable'] || '',
      baseGravable: Number(fila['Base gravable']) || 0,
      impuesto: Number(fila['Impuesto']) || 0
    });
  }

  if (lineas.length === 0) {
    throw httpError(400, 'El archivo no tiene filas de detalle (¿está vacío el mes?).');
  }

  return lineas;
}

// ==================== Detección de duplicados ====================

/**
 * Agrupa las líneas por número de factura y arma la clave de comparación:
 * fecha + cliente (normalizado) + monto total redondeado. Cuando esa clave
 * coincide entre una "sin emisión" y una emitida, es prácticamente seguro
 * que es la misma venta — y si además los ítems son idénticos, la confianza
 * es total (así se verificaron los 15 casos reales de julio).
 */
function agruparPorFactura(lineas) {
  const facturas = new Map();
  for (const l of lineas) {
    if (!facturas.has(l.numero)) {
      facturas.set(l.numero, {
        numero: l.numero,
        esEmitida: l.esEmitida,
        fecha: l.fecha,
        contraparte: l.contraparte,
        baseTotal: 0,
        items: []
      });
    }
    const f = facturas.get(l.numero);
    f.baseTotal += l.baseGravable;
    f.items.push(`${normalizarTexto(l.concepto)}|${l.cantidad}|${l.precioTotal}`);
  }
  return facturas;
}

function claveFactura(f) {
  const fechaIso = f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : '';
  return `${fechaIso}|${normalizarTexto(f.contraparte)}|${Math.round(f.baseTotal)}`;
}

/**
 * Marca en las líneas (mutando el array) qué facturas "sin emisión" son
 * duplicado probable de una emitida. Devuelve un resumen para mostrar de
 * inmediato tras la carga.
 */
function detectarDuplicados(lineas) {
  const facturas = agruparPorFactura(lineas);
  const emitidas = [...facturas.values()].filter(f => f.esEmitida);
  const sinEmision = [...facturas.values()].filter(f => !f.esEmitida);

  const indice = new Map();
  for (const f of emitidas) {
    const clave = claveFactura(f);
    if (!indice.has(clave)) indice.set(clave, []);
    indice.get(clave).push(f);
  }

  let altaConfianza = 0;
  let mediaConfianza = 0;

  for (const f of sinEmision) {
    const candidatas = indice.get(claveFactura(f)) || [];
    if (candidatas.length === 0) continue;

    const itemsF = [...f.items].sort().join(';');
    const match = candidatas.find(c => [...c.items].sort().join(';') === itemsF);

    const confianza = match ? 'alta' : 'media';
    const relacionada = (match || candidatas[0]).numero;

    if (match) altaConfianza++; else mediaConfianza++;

    for (const l of lineas) {
      if (l.numero !== f.numero) continue;
      l.duplicadoConfianza = confianza;
      l.duplicadoDe = relacionada;
      // Solo la alta confianza se pre-marca para excluir — coincidencia de
      // fecha+cliente+monto sola puede ser casualidad (dos compras
      // distintas el mismo día por el mismo monto), así que esa queda para
      // que el usuario la revise antes de decidir.
      if (confianza === 'alta') l.excluido = true;
    }
  }

  return { altaConfianza, mediaConfianza, totalFacturas: facturas.size };
}

/**
 * Duplicados en COMPRAS. La firma es distinta a la de ventas: acá no hay
 * "sin emisión vs emitida", sino la MISMA factura de proveedor cargada dos
 * veces en Alegra — dos registros con idéntico número, proveedor, fecha y
 * monto. En el reporte eso aparece como el mismo número con cada línea
 * repetida.
 *
 * Verificado con datos reales de julio 2026: 4 números con las líneas
 * exactamente duplicadas, ₡474.180 de base contada dos veces.
 *
 * Se marca la copia (la 2ª aparición en adelante), no la primera, y solo
 * cuando la línea es idéntica en concepto + cantidad + base. Dos líneas
 * iguales dentro de una compra legítima son posibles, así que esto queda
 * como sugerencia revisable igual que en ventas.
 */
function detectarDuplicadosCompras(lineas) {
  const vistas = new Map(); // numero|concepto|cantidad|base -> veces
  let altaConfianza = 0;

  for (const l of lineas) {
    const clave = [l.numero, normalizarTexto(l.concepto), l.cantidad, Math.round(l.baseGravable)].join('|');
    const veces = (vistas.get(clave) || 0) + 1;
    vistas.set(clave, veces);

    if (veces > 1) {
      l.duplicadoConfianza = 'alta';
      l.duplicadoDe = l.numero;
      l.excluido = true;
      altaConfianza++;
    }
  }

  return {
    altaConfianza,
    mediaConfianza: 0,
    totalFacturas: new Set(lineas.map(l => l.numero)).size
  };
}

// ==================== Carga ====================

/**
 * Ventas y compras tienen firmas de duplicado distintas — ver cada detector.
 * Las devoluciones quedan fuera: una nota de crédito comparte cliente, fecha
 * y monto con la factura que rectifica, así que el detector de ventas la
 * marcaría como duplicado de esa factura siendo justo lo contrario.
 */
function detectarSegunTipo(lineas, tipo) {
  if (tipo !== 'ventas') return detectarDuplicadosCompras(lineas);
  return detectarDuplicados(lineas.filter(l => !esDevolucion(l)));
}

// Con este prefijo se guarda el período que se trajo de las tablas propias.
const ORIGEN_SISTEMA = 'Traído del sistema';

function esDelSistema(nombreArchivo) {
  return String(nombreArchivo || '').startsWith(ORIGEN_SISTEMA);
}

/**
 * Los duplicados de un mes traído del sistema.
 *
 * EN COMPRAS NO SE BUSCAN. El detector de compras existe porque en Alegra la
 * misma compra quedaba registrada dos veces y cada línea salía repetida. Acá
 * una compra no se puede registrar dos veces: `compra` es única por la clave
 * de Hacienda y por la factura del buzón. Lo único que ese detector encuentra
 * en una compra propia es al proveedor que facturó el mismo producto en dos
 * renglones —pasa: mayo de 2026, Plastimex, dos líneas iguales de tornillos—
 * y sacarla le quita al reporte un IVA que sí se pagó.
 *
 * En ventas sí: la misma venta hecha como factura interna y además como
 * electrónica sigue existiendo en las facturas propias.
 */
function detectarEnElSistema(lineas, tipo) {
  if (tipo === 'ventas') return detectarSegunTipo(lineas, tipo);
  return { altaConfianza: 0, mediaConfianza: 0, totalFacturas: new Set(lineas.map(l => l.numero)).size };
}

/**
 * Guarda un conjunto de líneas ya parseadas como período. Compartido por la
 * carga de Excel y la importación desde la API, para que ambos caminos
 * produzcan exactamente el mismo resultado.
 */
async function guardarPeriodo({ anioNum, mesNum, tipo, lineas, nombreArchivo }) {
  // La base gravable es SOLO de facturas. Las devoluciones se totalizan
  // aparte, igual que en el resumen de Alegra.
  const facturas = lineas.filter(l => !esDevolucion(l));
  const devoluciones = lineas.filter(esDevolucion);

  const baseGravableOriginal = facturas.reduce((s, l) => s + l.baseGravable, 0);
  const impuestoOriginal = facturas.reduce((s, l) => s + l.impuesto, 0);
  const baseDevolucionesOriginal = devoluciones.reduce((s, l) => s + l.baseGravable, 0);
  const impuestoDevolucionesOriginal = devoluciones.reduce((s, l) => s + l.impuesto, 0);

  await query(
    `DELETE FROM reporte_contador_periodo WHERE anio = $1 AND mes = $2 AND tipo = $3;`,
    [anioNum, mesNum, tipo]
  );

  const periodoRes = await query(`
    INSERT INTO reporte_contador_periodo (
      anio, mes, tipo, nombre_archivo, base_gravable_original, impuesto_original,
      base_devoluciones_original, impuesto_devoluciones_original
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id;
  `, [anioNum, mesNum, tipo, nombreArchivo || null, baseGravableOriginal, impuestoOriginal,
      baseDevolucionesOriginal, impuestoDevolucionesOriginal]);

  const periodoId = periodoRes.rows[0].id;
  await insertarLotesLineas(periodoId, lineas);

  return { periodoId, baseGravableOriginal, impuestoOriginal, baseDevolucionesOriginal, impuestoDevolucionesOriginal };
}

/**
 * Trae el mes de las tablas propias: facturas y notas de crédito emitidas, o
 * compras registradas. Volver a traerlo reemplaza el período, igual que
 * volver a subir el Excel — las exclusiones hechas a mano se pierden, y por
 * eso la pantalla lo avisa antes.
 */
async function importarDelSistema({ anio, mes, tipo }) {
  if (!['ventas', 'compras'].includes(tipo)) throw httpError(400, 'Tipo inválido.');
  const anioNum = Number(anio);
  const mesNum = Number(mes);
  if (!anioNum || !mesNum || mesNum < 1 || mesNum > 12) throw httpError(400, 'Año o mes inválido.');

  const lineas = await traerDelSistema(anioNum, mesNum, tipo);
  if (lineas.length === 0) {
    throw httpError(404, `No hay ${tipo} con impuesto en ${String(mesNum).padStart(2, '0')}/${anioNum}.`);
  }

  const resumenDuplicados = detectarEnElSistema(lineas, tipo);
  const guardado = await guardarPeriodo({
    anioNum, mesNum, tipo, lineas,
    nombreArchivo: `${ORIGEN_SISTEMA} · ${String(mesNum).padStart(2, '0')}/${anioNum}`
  });

  return { ...guardado, lineasCargadas: lineas.length, ...resumenDuplicados };
}

async function cargarPeriodo({ anio, mes, tipo, buffer, nombreArchivo }) {
  if (!['ventas', 'compras'].includes(tipo)) throw httpError(400, 'Tipo inválido.');
  const anioNum = Number(anio);
  const mesNum = Number(mes);
  if (!anioNum || !mesNum || mesNum < 1 || mesNum > 12) throw httpError(400, 'Año o mes inválido.');

  const lineas = parsearExcel(buffer, tipo);
  const resumenDuplicados = detectarSegunTipo(lineas, tipo);

  // Re-cargar el mismo mes/tipo reemplaza el período anterior por completo
  // (ON DELETE CASCADE se lleva las líneas) — es más simple y más seguro
  // que intentar reconciliar ediciones línea por línea de una carga vieja
  // contra una nueva. Lo maneja guardarPeriodo.
  const guardado = await guardarPeriodo({ anioNum, mesNum, tipo, lineas, nombreArchivo });

  return { ...guardado, lineasCargadas: lineas.length, ...resumenDuplicados };
}

// ==================== Consulta ====================

async function listarPeriodos(anio, mes) {
  const result = await query(`
    SELECT id, anio, mes, tipo, nombre_archivo, base_gravable_original, impuesto_original,
           base_devoluciones_original, impuesto_devoluciones_original, fecha_carga
    FROM reporte_contador_periodo
    WHERE anio = $1 AND mes = $2
    ORDER BY tipo;
  `, [Number(anio), Number(mes)]);

  return result.rows.map(r => ({
    id: r.id,
    anio: r.anio,
    mes: r.mes,
    tipo: r.tipo,
    nombreArchivo: r.nombre_archivo,
    baseGravableOriginal: Number(r.base_gravable_original),
    impuestoOriginal: Number(r.impuesto_original),
    baseDevolucionesOriginal: Number(r.base_devoluciones_original || 0),
    impuestoDevolucionesOriginal: Number(r.impuesto_devoluciones_original || 0),
    fechaCarga: r.fecha_carga
  }));
}

/**
 * Detalle completo de un período, agrupado por factura, con los totales
 * recalculados según lo que esté excluido AHORA MISMO (no lo que decía el
 * Excel original) — así el resumen siempre refleja las ediciones del
 * usuario en vivo.
 */
async function obtenerPeriodo(periodoId) {
  const periodoRes = await query(`SELECT * FROM reporte_contador_periodo WHERE id = $1;`, [periodoId]);
  if (periodoRes.rows.length === 0) throw httpError(404, 'Período no encontrado.');
  const periodo = periodoRes.rows[0];

  const lineasRes = await query(`
    SELECT * FROM reporte_contador_linea WHERE periodo_id = $1 ORDER BY orden ASC;
  `, [periodoId]);

  const facturasMap = new Map();
  for (const r of lineasRes.rows) {
    if (!facturasMap.has(r.numero)) {
      facturasMap.set(r.numero, {
        numero: r.numero,
        tipoDocumento: r.tipo_documento,
        esNotaCredito: r.tipo_documento === TIPO_NOTA_CREDITO,
        documentoAsociado: r.documento_asociado,
        esEmitida: r.es_emitida,
        fecha: r.fecha,
        contraparte: r.contraparte,
        duplicadoConfianza: r.duplicado_confianza,
        duplicadoDe: r.duplicado_de,
        excluida: true, // se baja a false si hay al menos una línea incluida
        lineas: []
      });
    }
    const f = facturasMap.get(r.numero);
    if (!r.excluido) f.excluida = false;

    // La marca de duplicado puede venir en CUALQUIER línea, no solo en la
    // primera: en compras se marca la copia (2ª aparición en adelante), así
    // que tomarla solo de la primera dejaba la factura sin insignia y el
    // duplicado invisible en la tabla.
    if (r.duplicado_confianza && !f.duplicadoConfianza) {
      f.duplicadoConfianza = r.duplicado_confianza;
      f.duplicadoDe = r.duplicado_de;
    }
    f.lineas.push({
      id: r.id,
      concepto: r.concepto,
      cantidad: Number(r.cantidad),
      precioUnitario: Number(r.precio_unitario),
      precioTotal: Number(r.precio_total),
      descuento: Number(r.descuento),
      nombreImpuesto: r.nombre_impuesto,
      tipoImpuesto: r.tipo_impuesto,
      tarifa: r.tarifa,
      tipoTarifa: r.tipo_tarifa,
      acreditable: r.acreditable,
      baseGravable: Number(r.base_gravable),
      impuesto: Number(r.impuesto),
      excluido: r.excluido
    });
  }

  const facturas = [...facturasMap.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const incluidas = lineasRes.rows.filter(r => !r.excluido);
  const incluidasFacturas = incluidas.filter(r => !esDevolucion(r));
  const incluidasDevoluciones = incluidas.filter(esDevolucion);

  const baseAjustada = incluidasFacturas.reduce((s, r) => s + Number(r.base_gravable), 0);
  const impuestoAjustado = incluidasFacturas.reduce((s, r) => s + Number(r.impuesto), 0);
  const baseDevoluciones = incluidasDevoluciones.reduce((s, r) => s + Number(r.base_gravable), 0);
  const impuestoDevoluciones = incluidasDevoluciones.reduce((s, r) => s + Number(r.impuesto), 0);

  // Una fila por tarifa, con las cuatro cifras que lleva el resumen de
  // Alegra: base/impuesto de facturas y base/impuesto de devoluciones.
  const porTarifa = new Map();
  const acumular = (r, campoBase, campoImpuesto) => {
    const key = `${r.tarifa}|${r.tipo_tarifa}`;
    if (!porTarifa.has(key)) {
      porTarifa.set(key, { tarifa: r.tarifa, tipoTarifa: r.tipo_tarifa, base: 0, impuesto: 0, baseDevoluciones: 0, impuestoDevoluciones: 0 });
    }
    const t = porTarifa.get(key);
    t[campoBase] += Number(r.base_gravable);
    t[campoImpuesto] += Number(r.impuesto);
  };
  for (const r of incluidasFacturas) acumular(r, 'base', 'impuesto');
  for (const r of incluidasDevoluciones) acumular(r, 'baseDevoluciones', 'impuestoDevoluciones');

  return {
    periodo: {
      id: periodo.id,
      anio: periodo.anio,
      mes: periodo.mes,
      tipo: periodo.tipo,
      nombreArchivo: periodo.nombre_archivo,
      fechaCarga: periodo.fecha_carga,
      baseGravableOriginal: Number(periodo.base_gravable_original),
      impuestoOriginal: Number(periodo.impuesto_original),
      baseDevolucionesOriginal: Number(periodo.base_devoluciones_original || 0),
      impuestoDevolucionesOriginal: Number(periodo.impuesto_devoluciones_original || 0)
    },
    resumen: {
      baseGravableAjustada: Math.round(baseAjustada * 100) / 100,
      impuestoAjustado: Math.round(impuestoAjustado * 100) / 100,
      baseDevoluciones: Math.round(baseDevoluciones * 100) / 100,
      impuestoDevoluciones: Math.round(impuestoDevoluciones * 100) / 100,
      totalFacturas: facturas.filter(f => !f.esNotaCredito).length,
      totalDevoluciones: facturas.filter(f => f.esNotaCredito).length,
      facturasExcluidas: facturas.filter(f => f.excluida).length,
      porTarifa: [...porTarifa.values()].map(t => ({
        ...t,
        base: Math.round(t.base * 100) / 100,
        impuesto: Math.round(t.impuesto * 100) / 100,
        baseDevoluciones: Math.round(t.baseDevoluciones * 100) / 100,
        impuestoDevoluciones: Math.round(t.impuestoDevoluciones * 100) / 100
      }))
    },
    facturas
  };
}

// ==================== Edición ====================

async function toggleExcluirFactura(periodoId, numero, excluido) {
  const result = await query(`
    UPDATE reporte_contador_linea SET excluido = $1
    WHERE periodo_id = $2 AND numero = $3
    RETURNING id;
  `, [Boolean(excluido), periodoId, numero]);

  if (result.rows.length === 0) throw httpError(404, 'Factura no encontrada en este período.');
  return { actualizado: true, lineas: result.rows.length };
}

async function actualizarLinea(lineaId, campos) {
  const permitidos = ['concepto', 'cantidad', 'precioUnitario', 'precioTotal', 'baseGravable', 'impuesto', 'excluido'];
  const columnas = { concepto: 'concepto', cantidad: 'cantidad', precioUnitario: 'precio_unitario', precioTotal: 'precio_total', baseGravable: 'base_gravable', impuesto: 'impuesto', excluido: 'excluido' };

  const sets = [];
  const valores = [];
  let i = 1;
  for (const campo of permitidos) {
    if (campos[campo] === undefined) continue;
    sets.push(`${columnas[campo]} = $${i++}`);
    valores.push(campos[campo]);
  }
  if (sets.length === 0) throw httpError(400, 'No se envió ningún campo para actualizar.');

  valores.push(lineaId);
  const result = await query(
    `UPDATE reporte_contador_linea SET ${sets.join(', ')} WHERE id = $${i} RETURNING *;`,
    valores
  );
  if (result.rows.length === 0) throw httpError(404, 'Línea no encontrada.');
  return result.rows[0];
}

async function eliminarLinea(lineaId) {
  const result = await query(`DELETE FROM reporte_contador_linea WHERE id = $1 RETURNING numero;`, [lineaId]);
  if (result.rows.length === 0) throw httpError(404, 'Línea no encontrada.');
  return { eliminado: true, numero: result.rows[0].numero };
}

async function eliminarPeriodo(periodoId) {
  const result = await query(`DELETE FROM reporte_contador_periodo WHERE id = $1 RETURNING tipo, anio, mes;`, [periodoId]);
  if (result.rows.length === 0) throw httpError(404, 'Período no encontrado.');
  return { eliminado: true, ...result.rows[0] };
}

/**
 * Vuelve a correr la detección de duplicados sobre las líneas actuales del
 * período (por si el usuario editó datos que cambian una coincidencia). No
 * toca las exclusiones que el usuario ya haya decidido a mano — solo
 * recalcula la etiqueta de confianza para las que siguen "vírgenes".
 */
async function redetectarDuplicados(periodoId) {
  const periodoRes = await query(`SELECT tipo, nombre_archivo FROM reporte_contador_periodo WHERE id = $1;`, [periodoId]);
  if (periodoRes.rows.length === 0) throw httpError(404, 'Período no encontrado.');
  const tipo = periodoRes.rows[0].tipo;
  // Lo que no se buscó al traerlo tampoco se busca al repasarlo.
  const detectar = esDelSistema(periodoRes.rows[0].nombre_archivo) ? detectarEnElSistema : detectarSegunTipo;

  const lineasRes = await query(`SELECT * FROM reporte_contador_linea WHERE periodo_id = $1 ORDER BY orden ASC;`, [periodoId]);
  const lineas = lineasRes.rows.map(r => ({
    id: r.id,
    numero: r.numero,
    tipoDocumento: r.tipo_documento, // lo necesita esDevolucion para dejar las NC fuera
    esEmitida: r.es_emitida,
    fecha: r.fecha,
    contraparte: r.contraparte,
    concepto: r.concepto,
    cantidad: Number(r.cantidad),
    precioTotal: Number(r.precio_total),
    baseGravable: Number(r.base_gravable),
    excluido: r.excluido
  }));

  const resumen = detectar(lineas, tipo);

  for (const l of lineas) {
    await query(`
      UPDATE reporte_contador_linea
      SET duplicado_confianza = $1, duplicado_de = $2, excluido = $3
      WHERE id = $4;
    `, [l.duplicadoConfianza || null, l.duplicadoDe || null, l.excluido, l.id]);
  }

  return resumen;
}

// ==================== Exportación ====================

/**
 * Regenera el Excel con la misma forma que el original (resumen + detalle),
 * pero solo con las líneas incluidas. El detalle conserva el orden y las
 * columnas originales; el resumen se recalcula agrupando por tarifa a
 * partir de lo que quedó, no se copia del archivo subido.
 */
async function exportarPeriodo(periodoId) {
  const { periodo, resumen, facturas } = await obtenerPeriodo(periodoId);

  const config = COLUMNAS_DETALLE[periodo.tipo];

  // Columnas comunes a las dos hojas de detalle. La de devoluciones se
  // diferencia solo en cómo nombra el número y en que agrega la factura
  // rectificada — el resto es idéntico.
  const filaDetalle = (f, l) => ({
    'Concepto': l.concepto,
    'Ítem - Cantidad': l.cantidad,
    'Ítem - Precio unitario': l.precioUnitario,
    'Ítem - Precio total': l.precioTotal,
    'Descuento': l.descuento,
    'Nombre impuesto': l.nombreImpuesto,
    'Tipo impuesto': l.tipoImpuesto,
    'Tarifa': l.tarifa,
    'Tipo tarifa': l.tipoTarifa,
    'Acreditable': l.acreditable,
    'Base gravable': l.baseGravable,
    'Impuesto': l.impuesto
  });

  const filasDetalle = [];
  const filasDevoluciones = [];
  for (const f of facturas) {
    for (const l of f.lineas) {
      if (l.excluido) continue;
      if (f.esNotaCredito) {
        filasDevoluciones.push({
          'Tipo Documento': f.tipoDocumento || TIPO_NOTA_CREDITO,
          'Fecha': serialExcel(f.fecha),
          'Número Nota Crédito': f.numero,
          'Documento asociado': f.documentoAsociado || '',
          [config.contraparte]: f.contraparte,
          [config.actividad]: '',
          ...filaDetalle(f, l)
        });
      } else {
        filasDetalle.push({
          'Tipo Documento': f.tipoDocumento || 'Factura',
          'Fecha': serialExcel(f.fecha),
          'Número': f.numero,
          [config.contraparte]: f.contraparte,
          [config.actividad]: '',
          ...filaDetalle(f, l)
        });
      }
    }
  }
  filasDetalle.push({
    'Tipo Documento': '', 'Fecha': '', 'Número': '', [config.contraparte]: '', [config.actividad]: '',
    'Concepto': '', 'Ítem - Cantidad': '', 'Ítem - Precio unitario': '', 'Ítem - Precio total': '',
    'Descuento': '', 'Nombre impuesto': '', 'Tipo impuesto': '', 'Tarifa': '', 'Tipo tarifa': '',
    'Acreditable': 'TOTALES', 'Base gravable': resumen.baseGravableAjustada, 'Impuesto': resumen.impuestoAjustado
  });

  const filasResumen = resumen.porTarifa.map(t => ({
    'Nombre': nombreImpuestoPorTarifa(t.tipoTarifa),
    'Tipo impuesto': 'IVA',
    'Tarifa': t.tarifa,
    'Tipo tarifa': etiquetaTipoTarifa(t.tipoTarifa),
    'Acreditable': 'Sí',
    'Base gravable': t.base,
    'Impuesto': t.impuesto,
    'Base devoluciones': t.baseDevoluciones,
    'Impuesto en devoluciones': t.impuestoDevoluciones
  }));
  filasResumen.push({
    'Nombre': '', 'Tipo impuesto': '', 'Tarifa': '', 'Tipo tarifa': '', 'Acreditable': 'TOTALES',
    'Base gravable': resumen.baseGravableAjustada, 'Impuesto': resumen.impuestoAjustado,
    'Base devoluciones': resumen.baseDevoluciones, 'Impuesto en devoluciones': resumen.impuestoDevoluciones
  });

  const hojaDetalle = XLSX.utils.json_to_sheet(filasDetalle);
  formatearColumnaFecha(hojaDetalle, 'Fecha');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filasResumen), 'Resumen de Impuestos');
  XLSX.utils.book_append_sheet(workbook, hojaDetalle, config.hoja);
  if (config.hojaDevoluciones && filasDevoluciones.length > 0) {
    const hojaDev = XLSX.utils.json_to_sheet(filasDevoluciones);
    formatearColumnaFecha(hojaDev, 'Fecha');
    XLSX.utils.book_append_sheet(workbook, hojaDev, config.hojaDevoluciones);
  }

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const nombreSugerido = `${periodo.tipo === 'ventas' ? 'Impuestos en Ventas' : 'Impuestos en Compras'} (revisado) - ${String(periodo.mes).padStart(2, '0')}-${periodo.anio}.xlsx`;

  return { buffer, nombreSugerido };
}

// ==================== Envío al contador ====================

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Contactos guardados, el último usado primero. */
async function listarContactos() {
  const res = await query(`
    SELECT id, nombre, email, ultimo_envio
    FROM reporte_contador_contacto
    ORDER BY ultimo_envio DESC NULLS LAST, nombre ASC;
  `);
  return {
    contactos: res.rows.map(r => ({
      id: r.id, nombre: r.nombre, email: r.email, ultimoEnvio: r.ultimo_envio
    })),
    envioDisponible: estaConfigurado()
  };
}

function validarEmail(email) {
  const limpio = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio)) {
    throw httpError(400, 'El correo no tiene un formato válido.');
  }
  return limpio.toLowerCase();
}

async function crearContacto({ nombre, email }) {
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) throw httpError(400, 'El nombre es obligatorio.');
  const emailLimpio = validarEmail(email);

  // El correo es único: si ya existe, se actualiza el nombre en vez de
  // fallar — es lo que espera alguien que reescribe un contacto.
  const res = await query(`
    INSERT INTO reporte_contador_contacto (nombre, email)
    VALUES ($1, $2)
    ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id, nombre, email, ultimo_envio;
  `, [nombreLimpio, emailLimpio]);

  const r = res.rows[0];
  return { id: r.id, nombre: r.nombre, email: r.email, ultimoEnvio: r.ultimo_envio };
}

async function eliminarContacto(id) {
  const res = await query(`DELETE FROM reporte_contador_contacto WHERE id = $1 RETURNING nombre;`, [id]);
  if (res.rows.length === 0) throw httpError(404, 'Contacto no encontrado.');
  return { eliminado: true, nombre: res.rows[0].nombre };
}

async function enviarAlContador({ anio, mes, contactoId }) {
  const anioNum = Number(anio);
  const mesNum = Number(mes);
  if (!anioNum || !mesNum || mesNum < 1 || mesNum > 12) throw httpError(400, 'Año o mes inválido.');
  if (!contactoId) throw httpError(400, 'Hay que elegir a quién enviarle el reporte.');

  const contactoRes = await query(
    `SELECT id, nombre, email FROM reporte_contador_contacto WHERE id = $1;`, [contactoId]
  );
  if (contactoRes.rows.length === 0) throw httpError(404, 'El contacto elegido ya no existe.');
  const contacto = contactoRes.rows[0];
  const destino = contacto.email;

  const periodosRes = await query(
    `SELECT id, tipo FROM reporte_contador_periodo WHERE anio = $1 AND mes = $2 ORDER BY tipo;`,
    [anioNum, mesNum]
  );
  if (periodosRes.rows.length === 0) {
    throw httpError(404, `No hay reportes cargados para ${String(mesNum).padStart(2, '0')}/${anioNum}.`);
  }

  const adjuntos = [];
  const resumenPorTipo = [];
  for (const fila of periodosRes.rows) {
    const { buffer, nombreSugerido } = await exportarPeriodo(fila.id);
    adjuntos.push({ filename: nombreSugerido, content: buffer });

    const { resumen } = await obtenerPeriodo(fila.id);
    resumenPorTipo.push({ tipo: fila.tipo, resumen });
  }

  const etiquetaMes = `${MESES[mesNum - 1]} ${anioNum}`;
  const faltante = ['ventas', 'compras'].find(t => !periodosRes.rows.some(p => p.tipo === t));

  const moneda = (n) => `₡${Math.round(n).toLocaleString('es-CR')}`;
  const lineas = resumenPorTipo.map(({ tipo, resumen }) => {
    const partes = [`${tipo === 'ventas' ? 'Ventas' : 'Compras'}: base ${moneda(resumen.baseGravableAjustada)}, impuesto ${moneda(resumen.impuestoAjustado)}`];
    if (resumen.baseDevoluciones > 0) {
      partes.push(`  Devoluciones (notas de crédito): base ${moneda(resumen.baseDevoluciones)}, impuesto ${moneda(resumen.impuestoDevoluciones)}`);
    }
    if (resumen.facturasExcluidas > 0) {
      partes.push(`  ${resumen.facturasExcluidas} documento(s) excluido(s) por duplicado`);
    }
    return partes.join('\n');
  });

  const cuerpo = [
    `Adjunto los reportes de impuestos de ${etiquetaMes}.`,
    '',
    ...lineas,
    ...(faltante ? ['', `Nota: el reporte de ${faltante} de este mes no está cargado, así que no va adjunto.`] : []),
    '',
    'Distribuidora Tachi'
  ].join('\n');

  const envio = await enviarCorreo({
    para: destino,
    asunto: `Reportes de impuestos — ${etiquetaMes} — Distribuidora Tachi`,
    texto: cuerpo,
    adjuntos
  });

  // Sella el uso para que la próxima vez venga preseleccionado.
  await query(`UPDATE reporte_contador_contacto SET ultimo_envio = CURRENT_TIMESTAMP WHERE id = $1;`, [contacto.id]);

  return {
    email: destino,
    nombre: contacto.nombre,
    adjuntos: adjuntos.map(a => a.filename),
    faltante: faltante || null,
    messageId: envio.messageId
  };
}

module.exports = {
  listarContactos,
  crearContacto,
  eliminarContacto,
  enviarAlContador,
  cargarPeriodo,
  importarDelSistema,
  listarPeriodos,
  obtenerPeriodo,
  toggleExcluirFactura,
  actualizarLinea,
  eliminarLinea,
  eliminarPeriodo,
  redetectarDuplicados,
  exportarPeriodo
};
