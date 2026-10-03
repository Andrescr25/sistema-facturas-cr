const ReportService = require('./report.service');
const { generarExcel, fechaValida } = require('../../utils/exportarExcel');

const normalizar = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function texto(v, nombre) {
  if (v === undefined) return '';
  if (typeof v !== 'string') throw Object.assign(new Error(`Filtro ${nombre} inválido.`), { status: 400 });
  return v;
}

/** La búsqueda selecciona clientes completos, igual que las tarjetas de la pantalla. */
function filtrarClientes(clientes, filtros) {
  const cliente = normalizar(texto(filtros.cliente, 'cliente'));
  const exacto = texto(filtros.cliente_nombre, 'cliente_nombre');
  const palabras = normalizar(texto(filtros.producto, 'producto')).split(/\s+/).filter(Boolean);
  const proveedores = filtros.proveedores || [];
  if (!Array.isArray(proveedores) || proveedores.some(p => typeof p !== 'string')) {
    throw Object.assign(new Error('Filtro proveedores inválido.'), { status: 400 });
  }
  const seleccionados = new Set(proveedores);
  return clientes.filter(c => {
    const productos = c.facturas_con_faltantes.flatMap(f => f.productos_faltantes).filter(p => Number(p.cantidad_faltante) > 0);
    return (!exacto || c.nombre === exacto) && (!cliente || normalizar(c.nombre).includes(cliente))
      && (!palabras.length || productos.some(p => palabras.every(w => normalizar(`${p.nombre || ''} ${p.codigo || ''}`).includes(w))))
      && (!seleccionados.size || productos.some(p => seleccionados.has(p.proveedor_asignado || p.proveedor)));
  });
}

const col = (clave, titulo, tipo = 'texto', ancho) => ({ clave, titulo, tipo, ancho });
const producto = [col('productoId', 'ID producto', 'numero'), col('codigo', 'Código'), col('producto', 'Producto', 'texto', 45)];
function comprobar(r) {
  if (!r.success) throw new Error(r.error || 'No se pudo leer el reporte.');
  return r.data;
}

async function exportarProveedores(filtros = {}) {
  const desde = texto(filtros.fecha_inicio, 'fecha_inicio');
  if (desde && !fechaValida(desde)) {
    throw Object.assign(new Error('Fecha inicial inválida.'), { status: 400 });
  }
  const buscar = texto(filtros.buscar, 'buscar').toLowerCase();
  const id = texto(filtros.proveedor, 'proveedor');
  const datos = comprobar(await new ReportService().getMissingItemsBySupplier(desde || null, { asignarProveedores: false }));
  const proveedores = datos.filter(p => (!id || p.id === id) && p.nombre.toLowerCase().includes(buscar));
  return generarExcel({
    titulo: 'Faltantes por proveedor', prefijo: 'faltantes-proveedores',
    informacion: [['Desde', desde || 'Todas las fechas'], ['Proveedor', id || 'Todos'], ['Buscar proveedor', buscar],
      ['Cantidades', 'Faltantes registrados; las cantidades editadas para una orden no modifican este reporte.']],
    hojas: [{ nombre: 'Faltantes', columnas: [col('proveedor', 'Proveedor', 'texto', 35), col('cedula', 'Cédula proveedor'), ...producto,
      col('codigoProveedor', 'Código proveedor'), col('nombreProveedor', 'Nombre del proveedor', 'texto', 45),
      col('cantidad', 'Cantidad faltante', 'numero'), col('facturas', 'Facturas afectadas', 'numero'),
      col('clientes', 'Clientes afectados', 'texto', 45), col('descripcion', 'Descripción en factura', 'texto', 50)],
    filas: proveedores.flatMap(p => p.productos_faltantes.map(f => ({ proveedor: p.nombre, cedula: p.cedula,
      productoId: f.producto_id, codigo: f.codigo, producto: f.nombre, codigoProveedor: f.codigo_proveedor,
      nombreProveedor: f.nombre_proveedor, cantidad: f.cantidad_faltante, facturas: f.facturas_afectadas,
      clientes: f.clientes_afectados, descripcion: f.descripcion_factura }))) }]
  });
}

async function exportarClientes(filtros = {}) {
  // Validar antes de consultar: un filtro mal formado no descarga el total
  // del reporte silenciosamente. La selección por producto es por cliente.
  filtrarClientes([], filtros);
  const datos = comprobar(await new ReportService().getMissingItemsByClient({ asignarProveedores: false }));
  const clientes = filtrarClientes(datos, filtros);
  return generarExcel({
    titulo: 'Faltantes por cliente', prefijo: 'faltantes-clientes',
    informacion: [['Cliente', filtros.cliente_nombre || filtros.cliente || 'Todos'], ['Buscar producto', filtros.producto || 'Todos'],
      ['Proveedores', (filtros.proveedores || []).join(', ') || 'Todos'], ['Selección', 'Todos los faltantes de los clientes que coinciden con los filtros.']],
    hojas: [{ nombre: 'Faltantes', columnas: [col('cliente', 'Cliente', 'texto', 35), col('facturaId', 'ID factura', 'numero'),
      col('factura', 'Factura'), col('fecha', 'Fecha factura', 'fecha'), col('estadoFactura', 'Estado factura'),
      ...producto, col('proveedor', 'Proveedor', 'texto', 35), col('faltante', 'Cantidad faltante', 'numero'),
      col('entregada', 'Cantidad entregada', 'numero'), col('respuesta', 'Respuesta de entrega'), col('revisado', 'Revisado'),
      col('observaciones', 'Observaciones', 'texto', 50)],
    filas: clientes.flatMap(c => c.facturas_con_faltantes.flatMap(f => f.productos_faltantes.map(p => ({ cliente: c.nombre,
      facturaId: f.factura_id, factura: f.numero_factura, fecha: f.fecha_emision,
      estadoFactura: f.estado_procesamiento === 'procesado' ? 'Procesada' : f.en_cola_impresion ? 'En impresión' : 'Pendiente',
      productoId: p.producto_id, codigo: p.codigo, producto: p.nombre, proveedor: p.proveedor_asignado || p.proveedor,
      faltante: p.cantidad_faltante, entregada: p.cantidad_entregada, respuesta: p.ajuste_estado,
      revisado: p.ajuste_revisado ? 'Sí' : 'No', observaciones: p.observaciones })))) }]
  });
}

module.exports = { exportarProveedores, exportarClientes, filtrarClientes };
