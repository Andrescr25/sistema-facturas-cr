const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const frente = path.join(__dirname, '../../frontend/src');
const leer = archivo => fs.readFileSync(path.join(frente, archivo), 'utf8');
const cargar = (archivo, nombres) => new Function(leer(`utils/${archivo}`).replace(/^export /gm, '') + `\nreturn {${nombres}}`)();
const vista = cargar('proveedoresVista.js', 'proveedorEnviado,ordenarFaltantesProveedores,indicacionFacturacion,cuerpoEnvioProveedor,resultadoEnvioProveedor,notasDelProveedor');
const { construirProductosParaOrden } = cargar('reporteProveedoresUtils.js', 'construirProductosParaOrden');
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
  const hook = new Function('useState', 'useRef', 'useEffect', 'api', 'useAuth', 'sessionStorage', 'crypto', 'cuerpoEnvioProveedor', 'resultadoEnvioProveedor', codigo + '\nreturn useEnvioOrdenProveedor')(
    useState, useRef, useEffect, api, () => ({ usuario: { id: 50 } }), sessionStorage, { randomUUID: () => `clave-${++serial}` }, vista.cuerpoEnvioProveedor, vista.resultadoEnvioProveedor);
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
  despues.render({ productos: [{ ...producto, cantidadOriginal: 20, cantidad: 10 }] });
  await despues.render({ productos: [{ ...producto, cantidadOriginal: 20, cantidad: 10 }] }).enviar();
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
