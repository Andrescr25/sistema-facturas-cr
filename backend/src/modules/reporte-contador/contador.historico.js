// Sólo lectura de reportes guardados: no se reimportan ni se borran meses entregados.
const XLSX = require('xlsx');
const { query } = require('../../../config/database');
const { httpError } = require('../../utils/validacion');
const { diaDeBase } = require('../../utils/fechaCR');

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
const ETIQUETA_TIPO_TARIFA = {
  GENERAL: 'General',
  REDUCED: 'Reducido',
  EXEMPT: 'Exento',
  TRANSIENT: 'Transitorio'
};
const NOMBRE_POR_TIPO_TARIFA = {
  GENERAL: 'IVA',
  REDUCED: 'IVA reducido',
  EXEMPT: 'IVA exento',
  TRANSIENT: 'IVA transitorio'
};

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
  const iso = diaDeBase(fecha);
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
    if (celda && celda.v === encabezado) {
      columna = c;
      break;
    }
  }
  if (columna === -1) return;
  for (let f = rango.s.r + 1; f <= rango.e.r; f++) {
    const celda = hoja[XLSX.utils.encode_cell({ r: f, c: columna })];
    if (celda && celda.t === 'n') celda.z = 'dd/mm/yyyy';
  }
}

// La fecha va como 'AAAA-MM-DD' leída de sus partes LOCALES (`diaDeBase`, en
// utils/fechaCR.js). Sin eso se guardaba un día antes: `new Date('2026-08-11')`
// es medianoche UTC y el driver lo escribe en hora local (UTC−6), con lo que
// la columna DATE truncaba a 2026-08-10.

async function listarPeriodos(anio, mes) {
  const result = await query(
    `
    SELECT id, anio, mes, tipo, nombre_archivo, base_gravable_original, impuesto_original,
           base_devoluciones_original, impuesto_devoluciones_original, fecha_carga
    FROM reporte_contador_periodo
    WHERE anio = $1 AND mes = $2
    ORDER BY tipo;
  `,
    [Number(anio), Number(mes)]
  );

  return result.rows.map((r) => ({
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
  const periodoRes = await query(`SELECT * FROM reporte_contador_periodo WHERE id = $1;`, [
    periodoId
  ]);
  if (periodoRes.rows.length === 0) throw httpError(404, 'Período no encontrado.');
  const periodo = periodoRes.rows[0];

  const lineasRes = await query(
    `
    SELECT * FROM reporte_contador_linea WHERE periodo_id = $1 ORDER BY orden ASC;
  `,
    [periodoId]
  );

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

  const incluidas = lineasRes.rows.filter((r) => !r.excluido);
  const incluidasFacturas = incluidas.filter((r) => !esDevolucion(r));
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
      porTarifa.set(key, {
        tarifa: r.tarifa,
        tipoTarifa: r.tipo_tarifa,
        base: 0,
        impuesto: 0,
        baseDevoluciones: 0,
        impuestoDevoluciones: 0
      });
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
      totalFacturas: facturas.filter((f) => !f.esNotaCredito).length,
      totalDevoluciones: facturas.filter((f) => f.esNotaCredito).length,
      facturasExcluidas: facturas.filter((f) => f.excluida).length,
      porTarifa: [...porTarifa.values()].map((t) => ({
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

async function exportarPeriodo(periodoId) {
  const { periodo, resumen, facturas } = await obtenerPeriodo(periodoId);

  const config = COLUMNAS_DETALLE[periodo.tipo];

  // Columnas comunes a las dos hojas de detalle. La de devoluciones se
  // diferencia solo en cómo nombra el número y en que agrega la factura
  // rectificada — el resto es idéntico.
  const filaDetalle = (f, l) => ({
    Concepto: l.concepto,
    'Ítem - Cantidad': l.cantidad,
    'Ítem - Precio unitario': l.precioUnitario,
    'Ítem - Precio total': l.precioTotal,
    Descuento: l.descuento,
    'Nombre impuesto': l.nombreImpuesto,
    'Tipo impuesto': l.tipoImpuesto,
    Tarifa: l.tarifa,
    'Tipo tarifa': l.tipoTarifa,
    Acreditable: l.acreditable,
    'Base gravable': l.baseGravable,
    Impuesto: l.impuesto
  });

  const filasDetalle = [];
  const filasDevoluciones = [];
  for (const f of facturas) {
    for (const l of f.lineas) {
      if (l.excluido) continue;
      if (f.esNotaCredito) {
        filasDevoluciones.push({
          'Tipo Documento': f.tipoDocumento || TIPO_NOTA_CREDITO,
          Fecha: serialExcel(f.fecha),
          'Número Nota Crédito': f.numero,
          'Documento asociado': f.documentoAsociado || '',
          [config.contraparte]: f.contraparte,
          [config.actividad]: '',
          ...filaDetalle(f, l)
        });
      } else {
        filasDetalle.push({
          'Tipo Documento': f.tipoDocumento || 'Factura',
          Fecha: serialExcel(f.fecha),
          Número: f.numero,
          [config.contraparte]: f.contraparte,
          [config.actividad]: '',
          ...filaDetalle(f, l)
        });
      }
    }
  }
  filasDetalle.push({
    'Tipo Documento': '',
    Fecha: '',
    Número: '',
    [config.contraparte]: '',
    [config.actividad]: '',
    Concepto: '',
    'Ítem - Cantidad': '',
    'Ítem - Precio unitario': '',
    'Ítem - Precio total': '',
    Descuento: '',
    'Nombre impuesto': '',
    'Tipo impuesto': '',
    Tarifa: '',
    'Tipo tarifa': '',
    Acreditable: 'TOTALES',
    'Base gravable': resumen.baseGravableAjustada,
    Impuesto: resumen.impuestoAjustado
  });

  const filasResumen = resumen.porTarifa.map((t) => ({
    Nombre: nombreImpuestoPorTarifa(t.tipoTarifa),
    'Tipo impuesto': 'IVA',
    Tarifa: t.tarifa,
    'Tipo tarifa': etiquetaTipoTarifa(t.tipoTarifa),
    Acreditable: 'Sí',
    'Base gravable': t.base,
    Impuesto: t.impuesto,
    'Base devoluciones': t.baseDevoluciones,
    'Impuesto en devoluciones': t.impuestoDevoluciones
  }));
  filasResumen.push({
    Nombre: '',
    'Tipo impuesto': '',
    Tarifa: '',
    'Tipo tarifa': '',
    Acreditable: 'TOTALES',
    'Base gravable': resumen.baseGravableAjustada,
    Impuesto: resumen.impuestoAjustado,
    'Base devoluciones': resumen.baseDevoluciones,
    'Impuesto en devoluciones': resumen.impuestoDevoluciones
  });

  const hojaDetalle = XLSX.utils.json_to_sheet(filasDetalle);
  formatearColumnaFecha(hojaDetalle, 'Fecha');

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(filasResumen),
    'Resumen de Impuestos'
  );
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

module.exports = { listarPeriodos, obtenerPeriodo, exportarPeriodo };
