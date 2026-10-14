const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const frente = path.join(__dirname, '../../frontend/src');
const leer = archivo => fs.readFileSync(path.join(frente, archivo), 'utf8');
const cargar = (archivo, nombres) => new Function(leer(`utils/${archivo}`).replace(/^export /gm, '') + `\nreturn {${nombres}}`)();
const vista = cargar('proveedoresVista.js', 'proveedorEnviado,ordenarFaltantesProveedores,indicacionFacturacion,cuerpoEnvioProveedor,resultadoEnvioProveedor,notasDelProveedor,intentoSeparadoDelProveedor');
const { construirProductosParaOrden, claveProductoReporte, keyProductoProveedor, clavesProductoProveedor, getCantidadFinal, productoAgregadoGuardado, agregarProductoManual, cantidadProveedorExacta, cantidadEnteraValida, construirCantidadGuardada, proveedoresConRevisionCambiada, temporalVigenteProveedor, retirarEdicionesDeProveedores } = cargar('reporteProveedoresUtils.js', 'construirProductosParaOrden,claveProductoReporte,keyProductoProveedor,clavesProductoProveedor,getCantidadFinal,productoAgregadoGuardado,agregarProductoManual,cantidadProveedorExacta,cantidadEnteraValida,construirCantidadGuardada,proveedoresConRevisionCambiada,temporalVigenteProveedor,retirarEdicionesDeProveedores');
const { fechaHoraEnCostaRica } = cargar('fechaCR.js', 'fechaHoraEnCostaRica');
const proveedor = { id: 'p-1', proveedor_id: 1, nombre: 'zz-Proveedor', cedula: 'zz-cedula', revisionReporte: 'revision-1' };
const producto = { productoId: 7, codigoInterno: 'zz-A', nombreInterno: 'zz-Producto A', cantidadOriginal: 3, cantidad: 2, factorConversion: 2 };

test('una nueva compra pendiente aparece arriba de las enviadas del mismo proveedor', () => {
  const antiguo = { ...proveedor, id: 'orden-1', orden_id: 1, enviada: true, enviada_en: '2026-10-13T18:00:00Z' };
  const reciente = { ...antiguo, id: 'orden-2', orden_id: 2, enviada_en: '2026-10-14T18:00:00Z' };
  const pendientes = { ...proveedor, id: 'p-2' };
  const originales = [antiguo, pendientes, reciente];
  assert.deepEqual(vista.ordenarFaltantesProveedores(originales).map(p => p.id), ['p-2', 'orden-2', 'orden-1']);
  assert.deepEqual(originales.map(p => p.id), ['orden-1', 'p-2', 'orden-2']);
  assert.equal(vista.proveedorEnviado(pendientes), false);
  assert.equal(vista.proveedorEnviado({ ...antiguo, estado_envio: 'incierto' }), true);
});

test('la fecha de la tarjeta enviada muestra Costa Rica, incluso cerca de medianoche UTC', () => {
  const fecha = fechaHoraEnCostaRica('2026-10-14T02:30:00.000Z');
  assert.match(fecha, /13/); assert.match(fecha, /2026/); assert.match(fecha, /8:30/);
  assert.equal(fechaHoraEnCostaRica(null), '—'); assert.equal(fechaHoraEnCostaRica('inválida'), '—');
});

test('no inventa faltantes facturados antes de terminar la revisión de precios', () => {
  assert.equal(vista.indicacionFacturacion({ estado: 'sin_revisar' }), null);
  assert.equal(vista.indicacionFacturacion(null), null);
  assert.equal(vista.indicacionFacturacion({ estado: 'facturado', cantidadFacturada: 10 }).texto, 'Facturado');
  assert.equal(vista.indicacionFacturacion({ estado: 'parcial', cantidadFacturada: 3 }).texto, 'Facturado parcialmente · 3');
  assert.equal(vista.indicacionFacturacion({ estado: 'no_facturado' }).texto, 'No facturado');
  assert.equal(vista.indicacionFacturacion({ estado: 'por_identificar' }).texto, 'Por identificar');
});

test('mismo producto con dos proveedores: las notas y clientes solo pertenecen a la factura del faltante mostrado', () => {
  const notas = { 7: [
    { nota: 'Azul', veces: 1, clientes: ['zz-Cliente A'], origenes: [{ facturaId: 10, clienteId: 1, cliente: 'zz-Cliente A' }] },
    { nota: 'Rojo', veces: 1, clientes: ['zz-Cliente B'], origenes: [{ facturaId: 20, clienteId: 2, cliente: 'zz-Cliente B' }] },
    { nota: 'Caja', veces: 2, clientes: ['zz-Cliente A', 'zz-Cliente B'], origenes: [{ facturaId: 10, clienteId: 1, cliente: 'zz-Cliente A' }, { facturaId: 20, clienteId: 2, cliente: 'zz-Cliente B' }] }
  ] };
  const b = { productos_faltantes: [{ producto_id: 7, origenes: [{ facturaId: 20 }] }] };
  const filtradas = vista.notasDelProveedor(b, notas)[7];
  assert.deepEqual(filtradas.map(n => n.nota), ['Rojo', 'Caja']);
  assert.deepEqual(filtradas.map(n => n.clientes), [['zz-Cliente B'], ['zz-Cliente B']]);
  assert.deepEqual(filtradas.map(n => n.veces), [1, 1]);
  assert.deepEqual(vista.notasDelProveedor({ productos_faltantes: [{ producto_id: 7 }] }, notas)[7], []);
  assert.deepEqual(vista.notasDelProveedor(b, { 7: [{ nota: 'Legada sin origen', clientes: ['zz-Cliente A'] }] })[7], []);
  assert.equal(notas[7][2].veces, 2, 'la lectura no modifica el resumen de otro proveedor');
});

test('el envío toma la cantidad revisada en pantalla y conserva conversión e identidad propias', () => {
  const p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Producto A', cantidad_faltante: 6, factor_conversion: 2 }] };
  const productos = construirProductosParaOrden(p, { productosEliminados: new Set(), cantidadesModificadas: new Map([['zz-Proveedor-zz-A', 3]]), cantidadesGuardadas: new Map(), productosAgregados: new Map([['zz-Proveedor', [{ productoId: 9, codigo: 'zz-B', nombre: 'zz-Extra', cantidad: 4 }]]]) });
  const cuerpo = vista.cuerpoEnvioProveedor(p, productos, true);
  assert.equal(cuerpo.revisionReporte, 'revision-1');
  assert.equal(cuerpo.proveedorId, 1);
  assert.equal(cuerpo.fechaInicio, null);
  assert.equal(vista.cuerpoEnvioProveedor({ ...p, fechaInicio: '2026-10-14' }, productos, true).fechaInicio, '2026-10-14');
  assert.equal(cuerpo.productos[0].productoId, 7);
  assert.equal(cuerpo.productos[0].cantidadOriginal, 3);
  assert.equal(cuerpo.productos[0].cantidad, 2);
  assert.equal(cuerpo.productos[0].factorConversion, 2);
  assert.equal(cuerpo.productos[1].productoId, 9);
  assert.equal(cuerpo.productos[1].agregadoManual, true);
  assert.equal(cuerpo.productos[1].cantidadOriginal, 4);
  assert.equal(Object.hasOwn(cuerpo.productos[1], 'factorConversion'), false, 'el factor de un extra no se adivina como 1');
});

test('una compra enviada no usa las cantidades editadas de una compra nueva', () => {
  assert.throws(() => vista.cuerpoEnvioProveedor({ ...proveedor, enviada: true }, [producto], true), /otro envío/);
  assert.throws(() => vista.cuerpoEnvioProveedor({ ...proveedor, revisionReporte: null }, [producto], true), /Actualizá/);
  assert.throws(() => vista.cuerpoEnvioProveedor(proveedor, [], true), /No hay productos/);
  for (const cantidad of [0, -3, NaN, Infinity]) assert.throws(() => vista.cuerpoEnvioProveedor(proveedor, [{ ...producto, cantidad }], true), /cantidades/);
  for (const estado of ['incierto', 'enviando']) assert.equal(vista.resultadoEnvioProveedor({ envioEstado: estado }), 'incierto');
  assert.equal(vista.resultadoEnvioProveedor({ envioEstado: 'confirmado' }), 'confirmado');
  assert.equal(vista.resultadoEnvioProveedor({ envioEstado: 'no_enviado' }), 'no_enviado');
});

test('referencias repetidas: editar, eliminar y seleccionar un id propio conserva independiente el otro producto', () => {
  const productos = [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad_faltante: 6 }, { producto_id: 8, codigo: 'zz-A', nombre: 'zz-Perno', cantidad_faltante: 9 }];
  const p = { ...proveedor, productos_faltantes: productos };
  const guardadas = new Map([['zz-Proveedor-zz-A', { cantidad_modificada: 99 }]]);
  const modificadas = new Map([['zz-Proveedor-id:7', 3]]);
  assert.equal(getCantidadFinal(p.nombre, productos[0], 6, modificadas, guardadas, productos), 3);
  assert.equal(getCantidadFinal(p.nombre, productos[1], 9, modificadas, guardadas, productos), 9);
  const opciones = { cantidadesModificadas: modificadas, cantidadesGuardadas: guardadas, productosEliminados: new Set(['zz-Proveedor-zz-A']), productosAgregados: new Map() };
  assert.deepEqual(construirProductosParaOrden(p, opciones).map(x => [x.productoId, x.cantidadOriginal]), [[7, 3], [8, 9]], 'se ignora la eliminación legada ambigua');
  opciones.productosEliminados = new Set(['zz-Proveedor-id:7']);
  assert.deepEqual(construirProductosParaOrden(p, opciones).map(x => x.productoId), [8]);
  const seleccionados = new Set([keyProductoProveedor(p.nombre, productos[0])]);
  assert.equal(seleccionados.has(keyProductoProveedor(p.nombre, productos[1])), false);
  assert.equal(seleccionados.has(keyProductoProveedor('zz-Otro proveedor', productos[0])), false);
});

test('temporales legados sólo aplican por una referencia única y los cambios nuevos por id tienen prioridad', () => {
  const p = { producto_id: 7, codigo: 'zz-A' }, productos = [p];
  const antigua = new Map([['zz-Proveedor-zz-A', { cantidad_modificada: 4 }]]);
  assert.equal(getCantidadFinal(proveedor.nombre, p, 6, new Map(), antigua, productos), 4);
  antigua.set('zz-Proveedor-id:7', { cantidad_modificada: 2 });
  assert.equal(getCantidadFinal(proveedor.nombre, p, 6, new Map(), antigua, productos), 2);
  assert.deepEqual(clavesProductoProveedor(proveedor.nombre, p, productos), ['zz-Proveedor-id:7', 'zz-Proveedor-zz-A']);
  assert.equal(claveProductoReporte({ producto_id: 8, codigo: 'zz-A' }), 'id:8');
});

test('extras con la misma referencia conservan ids distintos y recargar conserva identidad y código visible', () => {
  const a = { productoId: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad: 2 };
  const b = { productoId: 8, codigo: 'zz-A', nombre: 'zz-Perno', cantidad: 3 };
  const lista = agregarProductoManual(agregarProductoManual([], a), b);
  assert.equal(lista.length, 2);
  const aumentada = agregarProductoManual(lista, { ...a, cantidad: 1 });
  assert.deepEqual(aumentada.map(p => [p.productoId, p.cantidad]), [[7, 3], [8, 3]]);
  assert.equal(lista[0].cantidad, 2);
  const recuperado = productoAgregadoGuardado({ producto_codigo: 'id:7', producto_id: 7, clave_producto: 'id:7', producto_nombre: 'zz-Tornillo', cantidad_modificada: 3, codigo_interno: 'zz-A' });
  assert.equal(recuperado.productoId, 7); assert.equal(recuperado.claveAlmacenada, 'id:7'); assert.equal(recuperado.codigo, 'zz-A');
  assert.equal(productoAgregadoGuardado({ producto_codigo: 'id:8', producto_nombre: 'zz-Perno', cantidad_modificada: 3 }).codigo, '', 'el id interno nunca se presenta como referencia');
  assert.equal(productoAgregadoGuardado({ producto_codigo: 'zz-A', producto_nombre: 'zz-Tornillo', cantidad_modificada: 3 }).claveAlmacenada, 'zz-A');
});

test('sólo ediciones y extras enteros: no truncar .07, vacío, booleanos o NaN; el saldo calculado conserva sus decimales', () => {
  for (const invalida of [0.07, NaN, Infinity, '', null, false, '3.2', 'NaN']) assert.equal(cantidadEnteraValida(invalida), false);
  for (const valida of [0, 1, 7, '7']) assert.equal(cantidadEnteraValida(valida), true);
  assert.equal(cantidadEnteraValida(0, 1), false);
  const p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Saldo', cantidad_faltante: 0.07, factor_conversion: 0.01 }] };
  const opciones = { productosEliminados: new Set(), cantidadesModificadas: new Map(), cantidadesGuardadas: new Map(), productosAgregados: new Map() };
  assert.equal(construirProductosParaOrden(p, opciones)[0].cantidad, 7);
  opciones.cantidadesGuardadas.set('zz-Proveedor-id:7', { cantidad_modificada: 0.07 });
  assert.equal(getCantidadFinal(p.nombre, p.productos_faltantes[0], 0.07, opciones.cantidadesModificadas, opciones.cantidadesGuardadas, p.productos_faltantes), '');
  assert.throws(() => construirProductosParaOrden(p, opciones), /enteros/);
  assert.throws(() => agregarProductoManual([], { productoId: 9, cantidad: 0.07 }), /entero/);
});

test('original más extra del mismo id produce una sola línea; producto distinto con el mismo código sigue independiente', () => {
  const p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad_faltante: 10, factor_conversion: 2 }] };
  const opciones = { productosEliminados: new Set(), cantidadesModificadas: new Map([['zz-Proveedor-id:7', 7]]), cantidadesGuardadas: new Map(), productosAgregados: new Map([[p.nombre, [{ productoId: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad: 3 }, { productoId: 8, codigo: 'zz-A', nombre: 'zz-Perno', cantidad: 2 }]]]) };
  const lineas = construirProductosParaOrden(p, opciones);
  assert.deepEqual(lineas.map(l => [l.productoId, l.cantidadOriginal, l.cantidad]), [[7, 10, 5], [8, 2, 2]]);
  assert.equal(lineas[0].agregadoManual, undefined);
  assert.equal(lineas[1].agregadoManual, true);
  opciones.productosEliminados.add('zz-Proveedor-id:7');
  const excluidas = construirProductosParaOrden(p, opciones);
  assert.equal(excluidas[0].agregadoManual, true); assert.equal(excluidas[0].cantidadOriginal, 3);
  assert.equal(Object.hasOwn(excluidas[0], 'descripcionFactura'), false, 'el manual no hereda los orígenes del producto excluido');
});

test('guardar 7 más extra3 y recargar conserva 10; excluir 0 conserva extra manual en otra clave', () => {
  const original = { producto_id: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad_faltante: 10, factor_conversion: 2 };
  const p = { ...proveedor, productos_faltantes: [original] };
  const extras = new Map([[p.nombre, [{ productoId: 7, claveAlmacenada: 'id:7', codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad: 3, actualizado: '2026-10-14 12:00:00.123456+00' }]]]);
  const cambio = construirCantidadGuardada(p, original, 7, extras, new Set());
  assert.equal(cambio.producto_id, 7); assert.equal(cambio.cantidad_modificada, 10); assert.deepEqual(cambio.extras_sustituidos, ['id:7']);
  assert.equal(cambio.revisionReporte, 'revision-1'); assert.equal(cambio.fechaInicio, null);
  assert.deepEqual(cambio.extras_revisados, [{ codigo: 'id:7', actualizado: '2026-10-14 12:00:00.123456+00', cantidad: 3 }]);
  const guardadas = new Map([['zz-Proveedor-id:7', { cantidad_modificada: cambio.cantidad_modificada }]]);
  assert.equal(construirProductosParaOrden(p, { cantidadesModificadas: new Map(), cantidadesGuardadas: guardadas, productosAgregados: new Map(), productosEliminados: new Set() })[0].cantidadOriginal, 10);
  const excluido = construirCantidadGuardada(p, original, 0, extras, new Set());
  assert.equal(excluido.cantidad_modificada, 0);
  assert.deepEqual(excluido.extra_conservado, { cantidad: 3, productoCodigo: 'extra:id:7', clavesOrigen: ['id:7'] });
  assert.throws(() => construirCantidadGuardada(p, original, 0.07, extras, new Set()), /enteros/);
});

test('un saldo calculado 1.7 más extra3 entero conserva 4.7 con procedencia y cantidadAdicional verificable', () => {
  const p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Saldo', cantidad_faltante: 1.7, factor_conversion: 0.01 }] };
  const opciones = { productosEliminados: new Set(), cantidadesModificadas: new Map(), cantidadesGuardadas: new Map(), productosAgregados: new Map([[p.nombre, [{ productoId: 7, codigo: 'zz-A', nombre: 'zz-Saldo', cantidad: 3 }]]]) };
  const lineas = construirProductosParaOrden(p, opciones);
  assert.equal(lineas.length, 1); assert.equal(lineas[0].cantidadOriginal, 4.7); assert.equal(lineas[0].cantidad, 470);
  assert.equal(lineas[0].cantidadAdicional, 3); assert.equal(lineas[0].agregadoManual, undefined);
});

test('el GET valida la identidad legada: prefijo id literal nunca implica escoger otro producto', () => {
  const a = { producto_id: 1, codigo: 'id:2', cantidad_faltante: 10 }, b = { producto_id: 2, codigo: 'zz-B', cantidad_faltante: 20 };
  const editadas = new Map([['zz-Proveedor-id:2', 5]]);
  assert.equal(getCantidadFinal(proveedor.nombre, a, 10, editadas, new Map(), [a, b]), 10);
  assert.equal(getCantidadFinal(proveedor.nombre, b, 20, editadas, new Map(), [a, b]), 5);
  const ambiguo = productoAgregadoGuardado({ producto_codigo: 'id:2', producto_nombre: 'zz-Antiguo', cantidad_modificada: 3, producto_id: null });
  assert.equal(ambiguo.productoId, null);
  const p = { ...proveedor, productos_faltantes: [] };
  assert.throws(() => construirProductosParaOrden(p, { cantidadesModificadas: new Map(), cantidadesGuardadas: new Map(), productosEliminados: new Set(), productosAgregados: new Map([[p.nombre, [ambiguo]]]) }), /catálogo/);
});

test('incierto anterior filtrado por fecha se comprueba con DTO propio y UUID exacta, nunca con una respuesta desconocida', () => {
  const intento = { estado: 'incierto', ordenId: 22, cuerpo: { revisionReporte: 'vieja', clave: 'uuid-22' } };
  const actual = { ...proveedor, comprobacionEnvios: [{ orden_id: 22, envio_id: 'uuid-22', enviada: true, estado_envio: 'incierto' }] };
  assert.equal(vista.intentoSeparadoDelProveedor(intento, actual, []), true);
  actual.comprobacionEnvios[0].envio_id = 'otra-uuid';
  assert.equal(vista.intentoSeparadoDelProveedor(intento, actual, [{ orden_id: 22, enviada: true, estado_envio: 'incierto' }]), false);
  actual.comprobacionEnvios[0].envio_id = 'uuid-22';
  assert.equal(vista.intentoSeparadoDelProveedor({ ...intento, estado: 'por_verificar' }, actual, []), false);
});

test('paquetes con seis decimales exactos: .07/.01 pide siete y una conversión inválida nunca se envía', () => {
  assert.equal(cantidadProveedorExacta(0.07, 0.01), 7);
  assert.equal(cantidadProveedorExacta('0.0700000', '0.0100000'), 7);
  assert.equal(cantidadProveedorExacta(0.07, 1), 1);
  assert.equal(cantidadProveedorExacta(0.08, 0.03), 3);
  assert.equal(cantidadProveedorExacta(0.000001, 0.000001), 1);
  for (const invalido of [false, true, null, 0, -1, NaN, Infinity, 0.0000001]) {
    assert.throws(() => cantidadProveedorExacta(invalido, 1));
    assert.throws(() => cantidadProveedorExacta(1, invalido));
  }
  const p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Pequeño', cantidad_faltante: 0.07, factor_conversion: 0.01 }] };
  const opciones = { productosEliminados: new Set(), cantidadesModificadas: new Map(), cantidadesGuardadas: new Map(), productosAgregados: new Map() };
  assert.equal(construirProductosParaOrden(p, opciones)[0].cantidad, 7);
  opciones.cantidadesModificadas.set('zz-Proveedor-id:7', 0);
  assert.equal(construirProductosParaOrden(p, opciones).length, 0, 'cero mantiene la exclusión explícita de una línea');
  const a = { productoId: 7, cantidad: 0.1 };
  assert.throws(() => agregarProductoManual([a], { productoId: 7, cantidad: 0.2 }), /entero/);
});

/** Se ejecuta el gancho real con estado React y API controlados. No hay
 * navegador, mensajes ni base: interesa no crear otro envío al perder la
 * respuesta, incluso recreando el gancho con la misma sesión de la pestaña. */
function montar(api, almacen = new Map()) {
  const slots = [], efectos = [];
  let indice = 0, serial = 0;
  const useState = inicial => {
    const i = indice++;
    slots[i] ??= { valor: inicial };
    return [slots[i].valor, nuevo => { slots[i].valor = typeof nuevo === 'function' ? nuevo(slots[i].valor) : nuevo; }];
  };
  const useRef = inicial => { const i = indice++; return slots[i] ??= { current: inicial }; };
  const useEffect = (efecto, deps) => {
    const i = indice++, previo = slots[i];
    if (!previo || deps.some((d, n) => !Object.is(d, previo.deps[n]))) efectos.push(() => { previo?.limpiar?.(); slots[i] = { deps, limpiar: efecto() }; });
  };
  const sessionStorage = { getItem: clave => almacen.get(clave) || null, setItem: (clave, valor) => almacen.set(clave, valor), removeItem: clave => almacen.delete(clave) };
  const codigo = leer('hooks/useEnvioOrdenProveedor.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const hook = new Function('useState', 'useRef', 'useEffect', 'api', 'useAuth', 'sessionStorage', 'crypto', 'cuerpoEnvioProveedor', 'resultadoEnvioProveedor', 'intentoSeparadoDelProveedor', codigo + '\nreturn useEnvioOrdenProveedor')(
    useState, useRef, useEffect, api, () => ({ usuario: { id: 50 } }), sessionStorage, { randomUUID: () => `clave-${++serial}` }, vista.cuerpoEnvioProveedor, vista.resultadoEnvioProveedor, vista.intentoSeparadoDelProveedor);
  const render = (datos = {}) => {
    indice = 0;
    const resultado = hook({ proveedor, productos: [producto], preferirDatosProveedor: true, onEnviada: async () => {}, showToast() {}, ...datos });
    while (efectos.length) efectos.shift()();
    return resultado;
  };
  return { render, almacen };
}

test('el doble clic hace un solo POST y el envío confirmado deja libre la siguiente compra', async () => {
  const llamadas = []; let resolver;
  const api = { post: (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); return new Promise(r => { resolver = r; }); } };
  const m = montar(api);
  const envio = m.render();
  const primero = envio.enviar();
  await envio.enviar();
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].ruta, '/orden-compra/proveedor/enviar');
  assert.equal(m.render().enviando, true);
  resolver({ data: { success: true, data: { envioEstado: 'confirmado' } } });
  await primero;
  assert.equal(m.render().estado, 'confirmado');
  assert.equal(m.almacen.size, 0);
  m.render({ proveedor: { ...proveedor, revisionReporte: 'revision-2' } });
  assert.equal(m.render({ proveedor: { ...proveedor, revisionReporte: 'revision-2' } }).estado, 'pendiente');
});

test('respuesta 503: al recargar consulta con la misma clave y el cuerpo original aunque cambien las cantidades', async () => {
  const llamadas = [];
  const api = { post: async (ruta, cuerpo) => { llamadas.push(structuredClone(cuerpo)); throw { response: { status: 503, data: { message: 'Respuesta perdida' } } }; } };
  const antes = montar(api);
  await antes.render().enviar();
  assert.equal(antes.render().estado, 'por_verificar');
  const despues = montar({ post: async (ruta, cuerpo) => { llamadas.push(structuredClone(cuerpo)); return { data: { success: true, data: { envioEstado: 'confirmado' } } }; } }, antes.almacen);
  const nueva = { productos: [{ ...producto, cantidadOriginal: 20, cantidad: 10 }], proveedor: { ...proveedor, revisionReporte: 'nueva-revision' }, comprasEnviadas: [{ enviada: true, orden_id: 22, estado_envio: 'incierto' }] };
  despues.render(nueva);
  await despues.render(nueva).enviar();
  assert.deepEqual(llamadas[1], llamadas[0]);
  assert.equal(despues.almacen.size, 0);
});

test('resultado incierto bloquea otro POST y conserva la solicitud para volver a abrir la pantalla', async () => {
  let llamadas = 0;
  const api = { post: async () => { llamadas++; return { data: { success: true, data: { envioEstado: 'incierto' } } }; } };
  const m = montar(api);
  await m.render().enviar();
  assert.equal(m.render().estado, 'incierto');
  await m.render().enviar();
  assert.equal(llamadas, 1);
  const recarga = montar(api, m.almacen);
  recarga.render();
  await recarga.render().enviar();
  assert.equal(llamadas, 1);
});

test('una revisión rechazada antes del transporte se puede corregir y enviar con un cuerpo nuevo', async () => {
  const m = montar({ post: async () => { throw { response: { status: 409, data: { message: 'El reporte cambió' } } }; } });
  await m.render().enviar();
  assert.equal(m.render().estado, 'pendiente');
  assert.equal(m.render().error, 'El reporte cambió');
  assert.equal(m.almacen.size, 0);
});

test('no_enviado permite otro clic explícito con clave nueva sin retirar cantidades de la compra', async () => {
  const cuerpos = []; let refrescos = 0;
  const api = { post: async (ruta, cuerpo) => { cuerpos.push(cuerpo); return { data: { success: true, data: { envioEstado: cuerpos.length === 1 ? 'no_enviado' : 'confirmado' } } }; } };
  const m = montar(api), datos = { onEnviada: async () => { refrescos++; } };
  await m.render(datos).enviar();
  assert.equal(m.render(datos).estado, 'pendiente'); assert.equal(m.almacen.size, 0); assert.equal(refrescos, 0);
  await m.render(datos).enviar();
  assert.notEqual(cuerpos[1].clave, cuerpos[0].clave);
  assert.deepEqual(cuerpos[1].productos, cuerpos[0].productos); assert.equal(refrescos, 1);
});

test('un cálculo inválido se informa al pulsar enviar y permite corregir sin romper el render ni hacer POST', async () => {
  let llamadas = 0;
  const m = montar({ post: async () => { llamadas++; } });
  const datos = { productos: () => { throw new Error('Conversión inválida'); } };
  const inicial = m.render(datos);
  assert.equal(inicial.estado, 'pendiente');
  await inicial.enviar();
  assert.equal(m.render(datos).estado, 'pendiente'); assert.equal(m.render(datos).error, 'Conversión inválida');
  assert.equal(llamadas, 0); assert.equal(m.almacen.size, 0);
});

test('un intento guardado ilegible no se descarta ni genera un segundo envío', async () => {
  let llamadas = 0;
  const almacen = new Map([['orden-proveedor:50:1', '{roto']]);
  const m = montar({ post: async () => { llamadas++; } }, almacen);
  m.render(); await m.render().enviar();
  assert.equal(m.render().estado, 'por_verificar'); assert.equal(llamadas, 0);
  assert.equal(almacen.get('orden-proveedor:50:1'), '{roto');
});

test('incierto conocido con snapshot independiente permite la compra nueva y conserva el cuerpo anterior en historial', async () => {
  const cuerpos = [];
  const m = montar({ post: async (ruta, cuerpo) => { cuerpos.push(cuerpo); return { data: { success: true, data: { envioEstado: cuerpos.length === 1 ? 'incierto' : 'confirmado', orden: { id: 22 } } } }; } });
  await m.render().enviar();
  assert.equal(m.render().estado, 'incierto');
  const nueva = { proveedor: { ...proveedor, revisionReporte: 'nueva-revision' }, productos: [{ ...producto, cantidadOriginal: 8, cantidad: 4 }], comprasEnviadas: [{ enviada: true, orden_id: 23, estado_envio: 'incierto' }] };
  m.render(nueva); await m.render(nueva).enviar();
  assert.equal(cuerpos.length, 1, 'otro snapshot no prueba la separación de este intento');
  nueva.comprasEnviadas = [{ enviada: true, orden_id: 22, estado_envio: 'incierto' }];
  m.render(nueva); await m.render(nueva).enviar();
  assert.equal(cuerpos.length, 2); assert.notEqual(cuerpos[1].clave, cuerpos[0].clave);
  assert.equal(cuerpos[1].revisionReporte, 'nueva-revision'); assert.equal(cuerpos[1].productos[0].cantidadOriginal, 8);
  assert.deepEqual(JSON.parse([...m.almacen.values()][0]).cuerpo, cuerpos[0]);
  assert.match([...m.almacen.keys()][0], /historial:clave-1$/);
});

function montarEdicion(api, datos = {}) {
  const slots = [], avisos = [];
  let indice = 0, modificadas = datos.cantidadesModificadas || new Map();
  const useState = inicial => {
    const i = indice++;
    slots[i] ??= { valor: inicial };
    return [slots[i].valor, nuevo => { slots[i].valor = typeof nuevo === 'function' ? nuevo(slots[i].valor) : nuevo; }];
  };
  const utils = cargar('reporteProveedoresUtils.js', 'claveProductoReporte,claveTemporalProducto,agregarProductoManual,cantidadEnteraValida,clavesProductoProveedor,keyProductoProveedor,getCantidadFinal,edicionCantidadProducto,construirCantidadGuardada,contextoEdicionProveedor');
  const codigo = leer('hooks/useEdicionFaltantesProveedor.js').replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const hook = new Function('useState', 'useCallback', 'api', ...Object.keys(utils), codigo + '\nreturn useEdicionFaltantesProveedor')(useState, fn => fn, api, ...Object.values(utils));
  const render = (otros = {}) => {
    indice = 0;
    return hook({ proveedores: [{ ...proveedor, productos_faltantes: [] }], prompt: async () => datos.respuestaPrompt || '3', showToast: texto => avisos.push(texto), cantidadesGuardadas: new Map(), ...datos, cantidadesModificadas: modificadas, setCantidadesModificadas: nuevo => { modificadas = typeof nuevo === 'function' ? nuevo(modificadas) : nuevo; }, ...otros });
  };
  return { render, avisos, modificadas: () => modificadas };
}

test('gancho: cantidad revisada7 más nuevo agregado3 se guarda como modificado10 y recarga sin duplicar', async () => {
  const llamadas = [], p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad_faltante: 10, factor_conversion: 2 }] };
  const m = montarEdicion({ post: async (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); return { data: { success: true } }; } }, { proveedores: [p], cantidadesGuardadas: new Map([['zz-Proveedor-id:7', { cantidad_modificada: 7 }]]) });
  m.render().abrirModalAgregarProducto(p);
  await m.render().solicitarCantidadYAgregar({ id: 7, name: 'zz-Tornillo' }, 'zz-A');
  assert.equal(llamadas.length, 1); assert.equal(llamadas[0].ruta, '/orden-compra/cantidades');
  const guardada = llamadas[0].cuerpo.cantidades[0];
  assert.equal(guardada.producto_id, 7); assert.equal(guardada.cantidad_modificada, 10); assert.deepEqual(guardada.extras_sustituidos, []);
  assert.equal(m.modificadas().get('zz-Proveedor-id:7'), 10); assert.deepEqual(m.render().productosAgregados.get(p.nombre), []);
  const opciones = { productosEliminados: new Set(), cantidadesGuardadas: new Map([['zz-Proveedor-id:7', guardada]]), cantidadesModificadas: new Map(), productosAgregados: new Map() };
  assert.deepEqual(construirProductosParaOrden(p, opciones).map(l => [l.productoId, l.cantidadOriginal]), [[7, 10]]);
});

test('gancho: agregado entero de un producto excluido usa clave separada y nunca revive sus orígenes', async () => {
  const llamadas = [], p = { ...proveedor, productos_faltantes: [{ producto_id: 7, codigo: 'zz-A', nombre: 'zz-Tornillo', cantidad_faltante: 10, factor_conversion: 2, origenes: [{ facturaId: 99, cliente: 'zz-Cliente original' }] }] };
  const m = montarEdicion({ post: async (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); return { data: { success: true } }; } }, { proveedores: [p] });
  m.render().setProductosEliminados(new Set(['zz-Proveedor-id:7'])); m.render().abrirModalAgregarProducto(p);
  await m.render().solicitarCantidadYAgregar({ id: 7, name: 'zz-Tornillo' }, 'zz-A');
  assert.equal(llamadas[0].ruta, '/orden-compra/producto-agregado'); assert.equal(llamadas[0].cuerpo.productoCodigo, 'extra:id:7'); assert.equal(llamadas[0].cuerpo.producto_id, 7);
  assert.equal(llamadas[0].cuerpo.revisionReporte, p.revisionReporte); assert.equal(llamadas[0].cuerpo.fechaInicio, null);
  const extra = productoAgregadoGuardado({ producto_codigo: 'extra:id:7', clave_producto: 'id:7', producto_id: 7, codigo_interno: 'zz-A', producto_nombre: 'zz-Tornillo', cantidad_modificada: 3 });
  const lineas = construirProductosParaOrden(p, { productosEliminados: new Set(['zz-Proveedor-id:7']), productosAgregados: new Map([[p.nombre, [extra]]]), cantidadesGuardadas: new Map(), cantidadesModificadas: new Map() });
  assert.equal(lineas.length, 1); assert.equal(lineas[0].agregadoManual, true); assert.equal(lineas[0].cantidadOriginal, 3); assert.equal(Object.hasOwn(lineas[0], 'descripcionFactura'), false);
});

test('gancho: prompt decimal o ilegible no agrega, no guarda y explica que se requieren enteros', async () => {
  let llamadas = 0;
  for (const respuestaPrompt of ['0.07', 'NaN', '', '2.5', '-1']) {
    const m = montarEdicion({ post: async () => { llamadas++; } }, { respuestaPrompt });
    m.render().abrirModalAgregarProducto({ ...proveedor, productos_faltantes: [] });
    await m.render({ prompt: async () => respuestaPrompt }).solicitarCantidadYAgregar({ id: 7, name: 'zz-Tornillo' }, 'zz-A');
    assert.equal(m.render().productosAgregados.size, 0); assert.match(m.avisos[0], /entera/);
  }
  assert.equal(llamadas, 0);
});

test('revisión cambiada o proveedor desaparecido retira buffers; GET no aplica temporales de otra revisión o fecha', () => {
  const a = { ...proveedor, nombre: 'zz-A' }, b = { ...proveedor, nombre: 'zz-A-B' };
  const siguientes = [{ ...a, revisionReporte: 'nueva' }, { ...b }];
  const nombres = proveedoresConRevisionCambiada([a, b], siguientes);
  assert.deepEqual([...nombres], ['zz-A']);
  assert.deepEqual([...retirarEdicionesDeProveedores(new Map([['zz-A-id:7', 99], ['zz-A-B-id:7', 3]]), nombres, [a, b])], [['zz-A-B-id:7', 3]]);
  assert.deepEqual([...retirarEdicionesDeProveedores(new Set(['zz-A-id:7', 'zz-A-B-id:7']), nombres, [a, b])], ['zz-A-B-id:7']);
  assert.deepEqual([...proveedoresConRevisionCambiada([a, b], [])], ['zz-A', 'zz-A-B']);
  assert.equal(temporalVigenteProveedor({ proveedor_nombre: a.nombre, revision_reporte: a.revisionReporte }, siguientes), false);
  assert.equal(temporalVigenteProveedor({ proveedor_nombre: a.nombre }, siguientes), true, 'compatibilidad sin tag no inventa una revisión');
  assert.equal(temporalVigenteProveedor({ proveedor_nombre: a.nombre, revision_reporte: 'nueva', fecha_inicio: '2026-10-14' }, siguientes), false);
  assert.equal(temporalVigenteProveedor({ proveedor_nombre: a.nombre, revision_reporte: 'nueva', fecha_inicio: null }, siguientes), true);
  assert.equal(temporalVigenteProveedor({ proveedor_nombre: a.nombre }, [{ ...a, enviada: true }]), false);
});

test('gancho: exclusión legada con referencia literal id:2 se restaura por su clave almacenada e identidad validada1', async () => {
  const llamadas = [], p = { ...proveedor, productos_faltantes: [{ producto_id: 1, codigo: 'id:2', nombre: 'zz-Literal', cantidad_faltante: 1 }] };
  const m = montarEdicion({ delete: async (ruta, cuerpo) => { llamadas.push({ ruta, cuerpo }); } }, { proveedores: [p] });
  m.render().setClavesEliminadasGuardadas(new Map([['zz-Proveedor-id:1', 'id:2']]));
  m.render().setProductosEliminados(new Set(['zz-Proveedor-id:1']));
  await m.render().restaurarProducto(p.nombre, ['id:1'], 1);
  assert.equal(llamadas[0].cuerpo.data.productoCodigo, 'id:2'); assert.equal(llamadas[0].cuerpo.data.producto_id, 1); assert.equal(llamadas[0].cuerpo.data.revisionReporte, p.revisionReporte);
  assert.equal(m.render().productosEliminados.size, 0);
});

test('gancho: conflicto409 al agregar retira el cambio optimista y actualiza el proveedor, sin guardar con revisión nueva', async () => {
  let rechazados = 0;
  const p = { ...proveedor, productos_faltantes: [] };
  const m = montarEdicion({ post: async () => { throw { response: { status: 409, data: { message: 'Cambió el reporte' } } }; } }, { proveedores: [p], onRevisionInvalida: () => { rechazados++; } });
  m.render().abrirModalAgregarProducto(p); await m.render().solicitarCantidadYAgregar({ id: 7, name: 'zz-Tornillo' }, 'zz-A');
  assert.equal(rechazados, 1); assert.equal(m.render().productosAgregados.size, 0); assert.match(m.avisos[0], /reporte cambió/);
});
