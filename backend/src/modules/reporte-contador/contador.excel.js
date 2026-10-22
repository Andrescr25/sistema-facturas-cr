const XLSX = require('xlsx');
const { agregarTablaExcel, escribirExcel } = require('../../utils/exportarExcel');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { gastosExcel, pendientesExcel, resumenMoneda, ventasPorTarifa } = require('./contador.excelDatos');

const c = (clave, titulo, tipo = 'texto', ancho = 20) => ({ clave, titulo, tipo, ancho });
const importe = (clave, titulo) => ({ ...c(clave, titulo, 'numero', 21), formato: '#,##0.00;[Red]-#,##0.00' });
const identificacion = [
  { ...c('fecha', 'Fecha', 'fecha', 13), formato: 'dd/mm/yyyy' }, c('numero', 'Documento', 'texto', 26),
  c('contraparte', 'Cliente / proveedor', 'texto', 34), c('cedula', 'Identificación', 'texto', 18),
  c('moneda', 'Moneda', 'texto', 10)
];
const contextoEmpresa = (mes) => mes.empresa
  ? `${[...new Set([mes.empresa.nombre_comercial, mes.empresa.nombre].filter(Boolean))].join(' · ')} · Cédula ${mes.empresa.identificacion}`
  : 'Empresa sin configurar: completar su identificación en Configuración';

function agregarPortada(libro, mes, pendientes) {
  const valores = [], filas = {}, alturas = {}, merges = [];
  function fila(celdas, rol, alto, unir = false) {
    const n = valores.push([...celdas, ...Array(Math.max(0, 4 - celdas.length)).fill('')]);
    if (rol) filas[n] = rol;
    if (alto) alturas[n] = alto;
    if (unir) merges.push(XLSX.utils.decode_range(`A${n}:D${n}`));
  }
  fila([`REPORTE MENSUAL · ${mes.etiqueta}`], 'titulo', 44, true);
  fila([contextoEmpresa(mes)], 'subtitulo', 30, true);
  fila([`Del ${mes.desde} al ${mes.hasta} · Generado ${hoyEnCostaRica()} (Costa Rica)`], 'ayuda', 26, true);
  fila([mes.finalizado ? 'Mes finalizado · Documentos según fecha de emisión' : 'MES EN CURSO · Cifras provisionales'], mes.finalizado ? 'ayuda' : 'alerta', 28, true);
  fila(['']);
  for (const moneda of [...new Set([...mes.documentos, ...mes.gastos].map(d => d.moneda))].sort()) {
    fila([`${moneda} · ${moneda === 'CRC' ? 'Colones costarricenses' : moneda === 'USD' ? 'Dólares estadounidenses' : 'Moneda original'}`], 'seccion', 32, true);
    fila(['Concepto', 'Documentos', `Importe ${moneda}`, 'Lectura contable'], 'cabecera', 32);
    for (const datos of resumenMoneda(mes, moneda)) {
      const rol = datos[0] === 'VENTAS NETAS' ? 'total' : datos[0] === 'Gastos por revisar' && datos[1] ? 'alerta' : undefined;
      fila(datos, rol, 38);
    }
    fila(['']);
  }
  if (!mes.documentos.length && !mes.gastos.length) fila(['Sin movimientos registrados en este mes.'], 'ayuda', 36, true);
  fila(['CONTROL DEL CIERRE'], 'seccion', 30, true);
  fila(['Documentos por revisar', pendientes.length, '', 'Ver hoja Pendientes. Un documento aparece una vez con todos sus motivos.'], pendientes.length ? 'alerta' : 'exito', 40);
  fila(['Anulados de gastos', mes.gastos.filter(g => g.revision === 'Anulado').length, '', 'Conservados en Gastos operativos, fuera de los totales.'], 'ayuda', 36);
  fila(['No se mezclan monedas ni se calcula automáticamente el impuesto a pagar.'], 'ayuda', 34, true);
  fila(['Los pagos manuales que no tienen un comprobante registrado como gasto operativo no se incluyen en este libro.'], 'ayuda', 38, true);
  fila(['HOJAS DEL LIBRO'], 'seccion', 30, true);
  for (const [nombre, texto] of [
    ['Ventas', 'Facturas y notas de crédito emitidas.'], ['Compras', 'Mercadería y notas de proveedores.'],
    ['Gastos operativos', 'Combustible, alimentación y viáticos; tratamiento fiscal revisado.'],
    ['Pendientes', 'Lo que requiere revisión antes del cierre.'], ['Impuestos de ventas', 'Bases e impuestos de ventas por tarifa registrada, restando sus notas.'],
    ['Detalle comercial', 'Productos y tarifas registradas, para conciliar diferencias.'],
    ['Soporte documental', 'Claves completas, referencias, respaldo y pagos de gastos.'], ['Guía', 'Alcance de las cifras y fuentes de Hacienda.']
  ]) fila([nombre, '', '', texto], 'cuerpo', 32);
  const hoja = XLSX.utils.aoa_to_sheet(valores);
  hoja['!cols'] = [42, 14, 24, 66].map(wch => ({ wch }));
  hoja['!merges'] = merges;
  valores.forEach((datos, r) => {
    datos.forEach((valor, col) => {
      const celda = hoja[XLSX.utils.encode_cell({ r, c: col })];
      if (typeof valor === 'number') celda.z = col === 1 ? '0' : '#,##0.00;[Red]-#,##0.00';
    });
    if (['Ventas', 'Compras', 'Gastos operativos', 'Pendientes', 'Impuestos de ventas', 'Detalle comercial', 'Soporte documental', 'Guía'].includes(datos[0])) {
      hoja[`A${r + 1}`].l = { Target: `#'${datos[0]}'!A1` };
    }
  });
  XLSX.utils.book_append_sheet(libro, hoja, 'Resumen');
  return { nombre: 'Resumen', encabezado: 4, portada: true, filas, alturas };
}

function agregarGuia(mes, tabla) {
  tabla('Guía', 'Cómo revisar este libro', 'Criterios del reporte y documentación de consulta.', [c('tema', 'Tema', 'texto', 30), c('explicacion', 'Explicación', 'texto', 115)], [
    ['Período', 'Documentos por fecha de emisión; no por fecha de pago.'],
    ['Importes', 'Dos decimales de presentación. El valor numérico conserva la precisión original. Vacío significa dato no guardado o importe fiscal todavía no aprobado.'],
    ['Ventas netas', 'Total de ventas emitidas menos notas de crédito de ventas del mes. Cada nota conserva su importe positivo en la hoja Ventas.'],
    ['Compras y notas de proveedor', 'Las notas se muestran separadas; confirmar contra el original si ajustan mercadería o gastos. No se rebaja automáticamente su importe del IVA aprobado de gastos.'],
    ['Base e impuestos', 'En ventas/compras provienen del detalle guardado. Impuestos de ventas agrupa las líneas por tarifa registrada y resta las notas. Un documento con varias tarifas cuenta en cada grupo. 0 % no clasifica por sí solo una exención. El total del comprobante manda; Pendientes avisa diferencias. No se deduce una tarifa de compra dividiendo impuesto entre base.'],
    ['Gastos operativos', 'El subtotal y los descuentos son los originales del comprobante. Incluye pendientes de revisión; anulados se conservan sin totalizarlos.'],
    ['Renta e IVA', 'Deducción e IVA acreditable son las decisiones guardadas al revisar el gasto. No todo impuesto es IVA ni todo IVA es acreditable. No se calcula la declaración ni el impuesto final a pagar.'],
    ['Monedas', 'Se conserva cada moneda, sin sumar CRC y USD ni inventar un tipo de cambio.'],
    ['Respaldos', 'Soporte documental conserva claves como texto, sin pérdida de ceros. Los nombres gasto-ID.xml/pdf corresponden al ZIP de comprobantes que se descarga/envía con el reporte.'],
    ['Pagos', 'Pagado/saldo/métodos de gastos describen el estado actual al generar el libro, no sólo movimientos bancarios del mes. No sustituyen la conciliación bancaria.'],
    ['Alcance', 'Ventas/notas emitidas, compras vigentes, notas de proveedor no eliminadas y gastos operativos. Pagos manuales sin comprobante de gasto operativo no incluidos. Reportes guardados antiguos mantienen su formato.'],
    ['Comprobantes electrónicos', 'Referencia de campos: Hacienda, Anexos y Estructuras v4.4 (documento consultado el 21/10/2026). https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf'],
    ['Crédito fiscal', 'Referencia: Hacienda, Crédito Fiscal del IVA, condiciones y límites. https://www.hacienda.go.cr/docs/CreditosFiscales.pdf'],
    ['Fuente', 'Datos propios del sistema, consultados en una sola transacción de lectura; exportar no modifica documentos.'],
    ['Huella del reporte', mes.huella]
  ].map(([tema, explicacion]) => ({ tema, explicacion })), { columnasFijas: 0, alturas: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 7, 62])) });
}

function excelMensual(mes) {
  const libro = XLSX.utils.book_new();
  libro.Props = { Title: `Reporte Contador ${mes.etiqueta}`, Subject: contextoEmpresa(mes), Author: 'Sistema de facturas', Company: mes.empresa?.nombre || '' };
  const gastos = gastosExcel(mes.gastos), pendientes = pendientesExcel(mes.documentos, gastos);
  const presentacion = [agregarPortada(libro, mes, pendientes)];
  function tabla(nombre, titulo, nota, columnas, registros, opciones = {}) {
    const encabezado = [[titulo], [`${contextoEmpresa(mes)} · ${mes.etiqueta}`], [nota], ['← Volver al resumen'], []];
    const hoja = agregarTablaExcel(libro, { nombre, columnas, filas: registros, encabezado });
    hoja['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: columnas.length - 1 } }));
    hoja['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } });
    hoja.A4.l = { Target: "#'Resumen'!A1" };
    if (!registros.length) {
      XLSX.utils.sheet_add_aoa(hoja, [['Sin movimientos para este período.']], { origin: 'A7' });
      hoja['!merges'].push(XLSX.utils.decode_range(`A7:${XLSX.utils.encode_col(columnas.length - 1)}7`));
    }
    presentacion.push({ nombre, ...opciones });
  }
  const columnasComerciales = [...identificacion,
    importe('base', 'Base del detalle'), importe('impuestos', 'Impuestos del detalle'), importe('total', 'Total comprobante'),
    c('tipo', 'Tipo de documento', 'texto', 28), c('documento_asociado', 'Documento ajustado', 'texto', 30)];
  tabla('Ventas', 'VENTAS DEL MES', 'Importes originales positivos. Las notas se restan únicamente en Ventas netas del Resumen.', columnasComerciales,
    mes.documentos.filter(d => ['Venta', 'Nota de crédito'].includes(d.tipo)));
  tabla('Compras', 'COMPRAS Y NOTAS DE PROVEEDORES', 'Mercadería sin gastos operativos duplicados. Impuestos sin desglose en notas quedan vacíos.', columnasComerciales,
    mes.documentos.filter(d => ['Compra', 'Nota de crédito proveedor'].includes(d.tipo)));
  tabla('Gastos operativos', 'GASTOS OPERATIVOS DEL MES', 'Deducción e IVA vacíos: sin aprobar. Anulados visibles y fuera de los totales del Resumen.', [
    ...identificacion.slice(0, 3), c('categoria_texto', 'Categoría', 'texto', 24), c('descripcion', 'Concepto del gasto', 'texto', 38), identificacion[4],
    importe('subtotal_original', 'Subtotal original'), importe('descuentos_originales', 'Descuentos originales'), importe('impuestos_originales', 'Impuestos originales'),
    importe('total', 'Total comprobante'), c('revision', 'Revisión'), importe('gasto_deducible', 'Gasto deducible revisado'), importe('iva_credito', 'IVA acreditable revisado')
  ], gastos, { color: 'exito', celdas: Object.fromEntries(gastos.map((g, i) => [`K${i + 7}`, g.revision === 'Revisado' ? 'exito' : g.revision === 'Anulado' ? 'peligro' : 'alerta'])) });
  tabla('Pendientes', 'PENDIENTES DEL CIERRE', 'Un documento por fila con sus motivos. Resolverlos desde el módulo correspondiente.', [
    ...identificacion, c('tipo', 'Tipo', 'texto', 28), importe('total', 'Total comprobante'), c('observacion', 'Qué revisar', 'texto', 95)
  ], pendientes, { color: 'alerta' });
  tabla('Impuestos de ventas', 'IMPUESTOS DE VENTAS POR TARIFA', 'Sólo líneas de ventas y sus notas. Documentos con varias tarifas cuentan en cada grupo. No es una declaración.', [
    identificacion[4], c('tarifa', 'Tarifa registrada', 'texto', 24), c('documentos', 'Documentos', 'numero', 16), c('lineas', 'Líneas', 'numero', 13),
    importe('base_neta', 'Base neta'), importe('impuestos_ventas', 'Impuestos de ventas'), importe('impuestos_notas', 'Impuestos de notas'), importe('impuestos_netos', 'Impuestos netos')
  ], ventasPorTarifa(mes.documentos), { color: 'nota' });
  tabla('Detalle comercial', 'DETALLE PARA CONCILIACIÓN', 'Tarifa original sólo cuando está guardada. Compras sin tarifa no se reclasifican automáticamente.', [
    c('identidad', 'Referencia interna', 'texto', 24), ...identificacion.slice(0, 3), identificacion[4], c('descripcion', 'Descripción', 'texto', 50),
    c('cantidad', 'Cantidad', 'numero', 14), importe('precio', 'Precio unitario'), importe('descuento', 'Descuento'), importe('base', 'Base del detalle'),
    c('tarifa', 'Tarifa registrada (%)', 'numero', 18), importe('impuestos', 'Impuestos'), importe('total', 'Total línea'), c('tipo', 'Tipo', 'texto', 28)
  ], mes.documentos.flatMap(d => d.lineas.map(l => ({ ...d, ...l }))), { color: 'neutro' });
  tabla('Soporte documental', 'REFERENCIAS Y RESPALDOS', 'Claves completas y datos de revisión. Pagos de gastos: estado actual, no flujo de caja del mes.', [
    c('identidad', 'Referencia interna', 'texto', 24), ...identificacion, c('tipo', 'Tipo', 'texto', 28), c('clave', 'Clave electrónica', 'texto', 54),
    c('documento_asociado', 'Documento ajustado', 'texto', 54), c('xml', 'XML en ZIP', 'texto', 25), c('pdf', 'PDF en ZIP', 'texto', 25),
    c('renta_texto', 'Tratamiento renta'), c('iva_texto', 'Tratamiento IVA'), c('respuesta_texto', 'Respuesta decidida'),
    c('hacienda_texto', 'Respuesta de Hacienda', 'texto', 26), c('motivo_fiscal', 'Justificación fiscal', 'texto', 50),
    c('validacion', 'Validación local'), c('motivo_validacion', 'Observación local', 'texto', 50),
    c('pago_texto', 'Pago actual', 'texto', 25), importe('pagado', 'Pagado actual'), importe('saldo', 'Saldo actual'),
    c('metodos', 'Métodos de pago', 'texto', 30), c('empleado', 'Responsable', 'texto', 30), c('placa', 'Placa')
  ], [...mes.documentos, ...gastos], { color: 'neutro' });
  agregarGuia(mes, tabla);
  return escribirExcel(libro, { prefijo: `contador-${mes.anio}-${String(mes.mes).padStart(2, '0')}`, presentacion });
}
module.exports = { excelMensual };
