const XLSX = require('xlsx');
const { escribirExcel } = require('../../utils/exportarExcel');
const { resumenExcel, sumarFilas } = require('./contador.excelDatos');

const CAMPOS = ['concepto', 'subtotal', 'descuento', 'impuestos', 'total'];
const FORMATO = '#,##0.00;[Red]-#,##0.00';
const fecha = dia => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** Resúmenes por clase, con ventas electrónicas aparte y gastos conservados. */
function excelMensual(mes) {
  const libro = XLSX.utils.book_new(), presentacion = [];
  const empresa = [...new Set([mes.empresa?.nombre_comercial, mes.empresa?.nombre].filter(Boolean))].join(' · ');
  libro.Props = { Title: `Reporte Contador ${mes.etiqueta}`, Author: 'Sistema de facturas', Company: mes.empresa?.nombre || '' };
  for (const { nombre, filas, notas } of resumenExcel(mes)) {
    const valores = [], roles = {}, merges = [];
    const agregar = (datos, rol, unir = false) => {
      const fila = valores.push([...datos, ...Array(Math.max(0, 5 - datos.length)).fill('')]);
      if (rol) roles[fila] = rol;
      if (unir) merges.push({ s: { r: fila - 1, c: 0 }, e: { r: fila - 1, c: 4 } });
    };
    agregar([`Reporte: ${nombre}`], 'titulo', true);
    agregar([`${empresa}${mes.empresa?.identificacion ? ` · Cédula ${mes.empresa.identificacion}` : ''}`], 'subtitulo', true);
    agregar([`Período: ${fecha(mes.desde)} / ${fecha(mes.hasta)}`], 'ayuda', true);
    const monedas = [...new Set([...filas, ...notas].map(f => f.moneda))].sort();
    if (!monedas.length) monedas.push('CRC');
    for (const [i, moneda] of monedas.entries()) {
      if (i) agregar(['']);
      agregar([`Moneda: ${moneda}`], 'subtitulo', true);
      agregar(['']);
      agregar([nombre === 'Gastos operativos' ? 'Concepto' : 'Tipo de impuesto', 'Subtotal', 'Descuento', 'Impuestos', 'Total'], 'cabecera');
      const grupo = filas.filter(f => f.moneda === moneda);
      const totales = sumarFilas(grupo);
      for (const f of grupo) agregar(CAMPOS.map(c => f[c]));
      if (!grupo.length) agregar(['Sin movimientos', 0, 0, 0, 0], 'ayuda');
      agregar(CAMPOS.map(c => c === 'concepto' ? 'TOTAL' : totales[c]), 'total');
      for (const nota of notas.filter(f => f.moneda === moneda)) {
        agregar(['']);
        agregar(CAMPOS.map(c => nota[c]), 'ayuda');
      }
    }
    const hoja = XLSX.utils.aoa_to_sheet(valores);
    hoja['!cols'] = [{ wch: 43 }, ...Array.from({ length: 4 }, () => ({ wch: 23 }))];
    hoja['!merges'] = merges;
    for (const [direccion, celda] of Object.entries(hoja)) if (!direccion.startsWith('!') && celda.t === 'n') celda.z = FORMATO;
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
    presentacion.push({ nombre, encabezado: 6, columnasFijas: 0, filas: roles, color: 'primario', paginasAlto: 1, centrarTabla: true });
  }
  return escribirExcel(libro, { prefijo: `contador-${mes.anio}-${String(mes.mes).padStart(2, '0')}`, presentacion });
}
module.exports = { excelMensual };
