/** Excel de lectura: los importes siguen siendo números y los códigos texto. */
const XLSX = require('xlsx');
const { hoyEnCostaRica } = require('./fechaCR');

const MONEDA = '"₡" #,##0.00;[Red]-"₡" #,##0.00';
const FORMATOS = { numero: '#,##0.##', moneda: MONEDA, porcentaje: '0.0%', fecha: 'yyyy-mm-dd', texto: '@' };

function fechaValida(dia) {
  if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [anio, mes, fecha] = dia.split('-').map(Number);
  const d = new Date(`${dia}T00:00:00Z`);
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === fecha;
}

function celda(valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (tipo === 'texto') return String(valor);
  if (tipo === 'fecha') {
    // Una fecha de calendario no es un instante: nunca pasa por la zona
    // horaria de Node ni de Excel. El serial conserva el mismo día en ambos.
    const dia = String(valor).slice(0, 10);
    if (!fechaValida(dia)) throw new Error('Fecha inválida en el reporte.');
    const ms = Date.parse(`${dia}T00:00:00Z`);
    return (ms - Date.UTC(1899, 11, 30)) / 86400000;
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error('Número inválido en el reporte.');
  return tipo === 'porcentaje' ? numero / 100 : numero;
}

function generarExcel({ titulo, prefijo, informacion = [], hojas }) {
  const dia = hoyEnCostaRica();
  const libro = XLSX.utils.book_new();
  const info = XLSX.utils.aoa_to_sheet([
    ['Reporte', titulo], ['Generado (Costa Rica)', dia],
    ['Fuente', 'Datos guardados del sistema; descarga de solo lectura.'], ...informacion
  ]);
  info['!cols'] = [{ wch: 30 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(libro, info, 'Información');
  for (const { nombre, columnas, filas } of hojas) {
    const valores = [columnas.map(c => c.titulo), ...filas.map(f => columnas.map(c => celda(f[c.clave], c.tipo || 'texto')))];
    const hoja = XLSX.utils.aoa_to_sheet(valores);
    hoja['!cols'] = columnas.map(c => ({ wch: c.ancho || 18 }));
    hoja['!autofilter'] = { ref: hoja['!ref'] };
    for (let fila = 1; fila < valores.length; fila++) {
      columnas.forEach((c, columna) => {
        const direccion = XLSX.utils.encode_cell({ r: fila, c: columna });
        if (hoja[direccion]) hoja[direccion].z = c.formato || FORMATOS[c.tipo || 'texto'];
      });
    }
    // Los textos van como celdas de tipo string, incluso si empiezan con
    // '=' o '+'. Un nombre escrito por alguien nunca se vuelve una fórmula.
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  }
  return {
    buffer: XLSX.write(libro, { type: 'buffer', bookType: 'xlsx', compression: true }),
    nombre: `${prefijo}-${dia}.xlsx`
  };
}

function enviarExcel(res, { buffer, nombre }) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  // En desarrollo frontend y API usan puertos distintos. Sin exponer esta
  // cabecera el navegador recibe el archivo pero pierde su nombre sugerido.
  res.append('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(buffer);
}

module.exports = { generarExcel, enviarExcel, fechaValida };
