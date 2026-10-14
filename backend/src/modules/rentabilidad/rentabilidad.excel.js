const servicio = require('./rentabilidad.service');
const { generarExcel } = require('../../utils/exportarExcel');

const c = (clave, titulo, tipo = 'numero', ancho) => ({ clave, titulo, tipo, ancho });
const columnasProducto = [c('productoId', 'ID producto'), c('referencia', 'Código', 'texto'), c('nombre', 'Producto', 'texto', 45),
  c('categoria', 'Categoría', 'texto', 25), c('subcategoria', 'Subcategoría', 'texto', 25), c('tarifa', 'IVA', 'porcentaje'),
  c('precio', 'Precio sin IVA', 'moneda'), c('precioConIva', 'Precio con IVA', 'moneda'), c('costoSinIva', 'Costo sin IVA', 'moneda'),
  c('origenCosto', 'Origen del costo', 'texto'), c('calidadCosto', 'Calidad del costo', 'texto'), c('margen', 'Margen de hoy', 'porcentaje'),
  c('clase', 'Rotación', 'texto'), c('unidadesMes', 'Promedio mensual · 3 meses completos', 'numero', 36),
  c('unidades', 'Unidades en 3 meses'), c('ventas', 'Ventas sin IVA · 3 meses', 'moneda', 25),
  c('ganancia', 'Ganancia estimada · 3 meses', 'moneda', 27), c('facturas', 'Facturas'), c('clientes', 'Clientes'),
  c('ultimaVenta', 'Última venta', 'fecha')];

function hojasSeries(series) {
  const valores = [c('unidades', 'Unidades'), c('ventas', 'Ventas sin IVA', 'moneda'), c('facturas', 'Facturas')];
  return [
    ['Semanas', 'semanas', [c('inicio', 'Semana desde', 'fecha')]],
    ['Meses', 'meses', [c('inicio', 'Mes desde', 'fecha')]],
    ['Años', 'anios', [c('anio', 'Año'), c('desde', 'Datos desde', 'fecha'), c('hasta', 'Datos hasta', 'fecha')]],
    ['Día del mes', 'diasDelMes', [c('dia', 'Día del mes')]],
    ['Día de semana', 'diasDeSemana', [c('diaSemana', 'Día (1 lunes - 7 domingo)')]],
    ['Mes del año', 'mesesDelAnio', [c('mes', 'Mes (1 enero - 12 diciembre)'), c('veces', 'Meses completos')]]
  ].map(([nombre, clave, columnas]) => ({ nombre, columnas: [...columnas, ...valores], filas: series[clave] || [] }));
}

async function exportar(filtros = {}) {
  for (const clave of ['buscar', 'categoria', 'clase', 'costo', 'orden']) {
    if (filtros[clave] !== undefined && typeof filtros[clave] !== 'string') {
      throw Object.assign(new Error(`Filtro ${clave} inválido.`), { status: 400 });
    }
  }
  const [productos, r] = await Promise.all([servicio.obtenerProductosFiltrados(filtros), servicio.obtenerResumen()]);
  return generarExcel({
    titulo: 'Rentabilidad', prefijo: 'rentabilidad',
    informacion: [['Buscar', filtros.buscar || 'Todos'], ['Categoría', filtros.categoria || 'Todas'], ['Rotación', filtros.clase || 'Todas'],
      ['Costo', filtros.costo || 'Todos'], ['Orden', filtros.orden || 'vendidos'], ['Productos exportados', productos.length],
      ['Alcance', 'Productos: todos los resultados filtrados, sin paginación. Resumen y series: negocio completo.'],
      ['Ganancia', 'Estimada con el costo de hoy; vacía cuando el costo no es confiable.'],
      ['Promedios', 'Día del mes y de semana: por día de calendario, últimos 12 meses. Mes del año: meses completos del historial.']],
    hojas: [
      { nombre: 'Resumen del negocio', columnas: [c('ventas', 'Ventas sin IVA · 3 meses', 'moneda', 25), c('ganancia', 'Ganancia estimada · 3 meses', 'moneda', 27),
        c('margenPonderado', 'Margen ponderado', 'porcentaje'), c('coberturaCosto', 'Cobertura del costo', 'porcentaje'),
        c('facturas', 'Facturas'), c('clientes', 'Clientes'), c('productos', 'Productos visibles'), c('sinCosto', 'Sin costo confiable'),
        c('margenNegativo', 'Margen negativo')], filas: [r] },
      { nombre: 'Productos', columnas: columnasProducto, filas: productos }, ...hojasSeries(r.series)
    ]
  });
}

async function exportarProducto(productoId) {
  const { producto, series } = await servicio.obtenerProducto(productoId);
  return generarExcel({
    titulo: `Rentabilidad de ${producto.nombre}`, prefijo: `rentabilidad-producto-${producto.productoId}`,
    informacion: [['Ganancia', 'Estimada con el costo de hoy; vacía cuando el costo no es confiable.'],
      ['Series', 'Ventas del producto. Las últimas tres hojas son promedios de calendario.']],
    hojas: [{ nombre: 'Producto', columnas: columnasProducto, filas: [producto] }, ...hojasSeries(series)]
  });
}

module.exports = { exportar, exportarProducto };
