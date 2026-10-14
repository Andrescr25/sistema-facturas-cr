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
  const ids = ['clienteId', 'facturaId'].map(nombre => {
    const valor = filtros[nombre];
    if (valor == null || valor === '') return null;
    if (!((typeof valor === 'string' && /^[1-9]\d*$/.test(valor)) ||
      (typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0)) || Number(valor) > 2147483647) {
      throw Object.assign(new Error(`Filtro ${nombre} inválido.`), { status: 400 });
    }
    return Number(valor);
  });
  if (!Array.isArray(proveedores) || proveedores.some(p => typeof p !== 'string')) {
    throw Object.assign(new Error('Filtro proveedores inválido.'), { status: 400 });
  }
  const seleccionados = new Set(proveedores);
  return clientes.filter(c => {
    const productos = c.facturas_con_faltantes.flatMap(f => f.productos_faltantes).filter(p => Number(p.cantidad_faltante) > 0);
    return (!ids[0] || c.id === ids[0]) && (!ids[1] || c.facturas_con_faltantes.some(f => f.factura_id === ids[1]))
      && (!exacto || c.nombre === exacto) && (!cliente || normalizar(c.nombre).includes(cliente))
      && (!palabras.length || productos.some(p => palabras.every(w => normalizar(`${p.nombre || ''} ${p.codigo || ''}`).includes(w))))
      && (!seleccionados.size || productos.some(p => seleccionados.has(p.proveedor_asignado || p.proveedor)));
  });
}

const col = (clave, titulo, tipo = 'texto', ancho) => ({ clave, titulo, tipo, ancho });
const contexto = [col('ruta', 'Ruta', 'texto', 30), col('semana', 'Semana', 'fecha'), col('cicloId', 'ID ciclo', 'numero'), col('orden', 'Orden de entrega', 'numero'), col('anticipado', 'Preventa anticipada')];
const producto = [col('productoId', 'ID producto', 'numero'), col('codigo', 'Código'), col('producto', 'Producto', 'texto', 45)];
function comprobar(r) {
  if (!r.success) throw Object.assign(new Error(r.error || 'No se pudo leer el reporte.'), { status: r.status });
  return r.data;
}

async function exportarProveedores(filtros = {}) {
  const desde = texto(filtros.fecha_inicio, 'fecha_inicio');
  if (desde && !fechaValida(desde)) {
    throw Object.assign(new Error('Fecha inicial inválida.'), { status: 400 });
  }
  const buscar = texto(filtros.buscar, 'buscar').toLowerCase();
  const id = texto(filtros.proveedor, 'proveedor');
  const datos = comprobar(await new ReportService().getMissingItemsBySupplier(desde || null, { ...filtros, asignarProveedores: false, incluirEnviadas: false }));
  const proveedores = datos.filter(p => (!id || p.id === id) && p.nombre.toLowerCase().includes(buscar));
  return generarExcel({
    titulo: 'Faltantes por proveedor', prefijo: 'faltantes-proveedores',
    informacion: [['Ruta ID', filtros.rutaId || 'Todas'], ['Ciclo ID', filtros.cicloId || 'Todos'], ['Desde', desde || 'Todas las fechas'], ['Proveedor', id || 'Todos'], ['Buscar proveedor', buscar],
      ['Cantidades', 'Faltantes registrados; las cantidades editadas para una orden no modifican este reporte.']],
    hojas: [{ nombre: 'Faltantes', columnas: [col('proveedor', 'Proveedor', 'texto', 35), col('cedula', 'Cédula proveedor'), ...producto,
      col('codigoProveedor', 'Código proveedor'), col('nombreProveedor', 'Nombre del proveedor', 'texto', 45),
      col('cantidad', 'Cantidad faltante', 'numero'), col('facturas', 'Facturas afectadas', 'numero'),
      col('clientes', 'Clientes afectados', 'texto', 45), col('descripcion', 'Descripción en factura', 'texto', 50)],
    filas: proveedores.flatMap(p => p.productos_faltantes.map(f => ({ proveedor: p.nombre, cedula: p.cedula,
      productoId: f.producto_id, codigo: f.codigo, producto: f.nombre, codigoProveedor: f.codigo_proveedor,
      nombreProveedor: f.nombre_proveedor, cantidad: f.cantidad_faltante, facturas: f.facturas_afectadas,
      clientes: f.clientes_afectados, descripcion: f.descripcion_factura }))) },
      { nombre: 'Procedencia', columnas: [col('proveedor', 'Proveedor'), ...producto, ...contexto,
        col('faltanteId', 'ID faltante', 'numero'), col('facturaId', 'ID factura', 'numero'), col('factura', 'Factura'),
        col('cliente', 'Cliente'), col('cantidad', 'Cantidad faltante', 'numero')],
        filas: proveedores.flatMap(p => p.productos_faltantes.flatMap(f => f.origenes.map(o => ({
          proveedor: p.nombre, productoId: f.producto_id, codigo: f.codigo, producto: f.nombre,
          ruta: o.rutaNombre || 'Sin ciclo', semana: o.semana, cicloId: o.cicloId, orden: o.orden,
          anticipado: o.anticipado ? 'Sí' : 'No', faltanteId: o.faltanteId,
          facturaId: o.facturaId, factura: o.factura, cliente: o.cliente, cantidad: Number(o.cantidad) })))) }]
  });
}

async function exportarClientes(filtros = {}) {
  // Validar antes de consultar: un filtro mal formado no descarga el total
  // del reporte silenciosamente. La selección por producto es por cliente.
  filtrarClientes([], filtros);
  const datos = comprobar(await new ReportService().getMissingItemsByClient({ ...filtros, asignarProveedores: false, incluirEnviadas: false }));
  const clientes = filtrarClientes(datos, filtros);
  return generarExcel({
    titulo: 'Faltantes por cliente', prefijo: 'faltantes-clientes',
    informacion: [['Ruta del cliente ID', filtros.rutaId || 'Todas'], ['Cliente ID', filtros.clienteId || 'Todos'], ['Factura ID', filtros.facturaId || 'Todas'], ['Cliente', filtros.cliente_nombre || filtros.cliente || 'Todos'], ['Buscar producto', filtros.producto || 'Todos'],
      ['Proveedores', (filtros.proveedores || []).join(', ') || 'Todos'], ['Selección', 'Todos los faltantes de los clientes que coinciden con los filtros.']],
    hojas: [{ nombre: 'Faltantes', columnas: [col('cliente', 'Cliente', 'texto', 35), col('clienteId', 'ID cliente', 'numero'),
      col('rutaCliente', 'Ruta del cliente', 'texto', 30), col('rotacionDias', 'Rotación (días)', 'numero'),
      col('ultimaAtencion', 'Última atención', 'fecha'), col('proximaVisita', 'Próxima visita', 'fecha'), col('visitaEstado', 'Estado de visita'),
      col('facturaId', 'ID factura', 'numero'),
      col('factura', 'Factura'), col('fecha', 'Fecha factura', 'fecha'), col('estadoFactura', 'Estado factura'),
      ...contexto.map(c => c.clave === 'ruta' ? { ...c, titulo: 'Ruta histórica del documento' } : c), ...producto, col('proveedor', 'Proveedor', 'texto', 35), col('faltante', 'Cantidad faltante', 'numero'),
      col('entregada', 'Cantidad entregada', 'numero'), col('respuesta', 'Respuesta de entrega'), col('revisado', 'Revisado'),
      col('observaciones', 'Observaciones', 'texto', 50)],
    filas: clientes.flatMap(c => c.facturas_con_faltantes.flatMap(f => f.productos_faltantes.map(p => ({ cliente: c.nombre, clienteId: c.id,
      rutaCliente: c.ruta?.nombre || 'Sin ruta asignada', rotacionDias: c.rotacion?.dias,
      ultimaAtencion: c.rotacion?.ultimaAtencion, proximaVisita: c.rotacion?.proximaVisita,
      visitaEstado: { atrasado: 'Atrasado', hoy: 'Le toca hoy', proximo: 'Próximo', sin_facturas: 'Sin facturas', sin_rotacion: 'Sin rotación' }[c.rotacion?.estado] || 'Sin rotación',
      ruta: f.ciclo?.rutaNombre || 'Sin ciclo', semana: f.ciclo?.semana, cicloId: f.ciclo?.id, orden: f.ciclo?.orden, anticipado: f.anticipado ? 'Sí' : 'No',
      facturaId: f.factura_id, factura: f.numero_factura, fecha: f.fecha_emision,
      estadoFactura: f.estado_procesamiento === 'procesado' ? 'Procesada' : f.en_cola_impresion ? 'En impresión' : 'Pendiente',
      productoId: p.producto_id, codigo: p.codigo, producto: p.nombre, proveedor: p.proveedor_asignado || p.proveedor,
      faltante: p.cantidad_faltante, entregada: p.cantidad_entregada, respuesta: p.ajuste_estado,
      revisado: p.ajuste_revisado ? 'Sí' : 'No', observaciones: p.observaciones })))) }]
  });
}

module.exports = { exportarProveedores, exportarClientes, filtrarClientes };
