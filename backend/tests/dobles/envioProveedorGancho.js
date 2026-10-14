const fs = require('node:fs');
const path = require('node:path');
const frente = path.join(__dirname, '../../../frontend/src');
const leer = archivo => fs.readFileSync(path.join(frente, archivo), 'utf8');
const cargar = (archivo, nombres) => new Function(leer(`utils/${archivo}`).replace(/^export /gm, '') + `\nreturn {${nombres}}`)();
const vista = cargar('proveedoresVista.js', 'cuerpoEnvioProveedor,resultadoEnvioProveedor,intentoSeparadoDelProveedor');
const telefonos = cargar('telefonosProveedor.js', 'revisarTelefonoProveedor');
const proveedor = { id: 'p-1', proveedor_id: 1, nombre: 'zz-Proveedor', cedula: 'zz-cedula', revisionReporte: 'revision-1' };
const producto = { productoId: 7, codigoInterno: 'zz-A', nombreInterno: 'zz-Producto A', cantidadOriginal: 3, cantidad: 2, factorConversion: 2 };

/** Se ejecuta el gancho real con estado React y API controlados. No hay
 * navegador, mensajes ni base: interesa no crear otro envío al perder la
 * respuesta, incluso recreando el gancho con la misma sesión de la pestaña. */
function montar(api, almacen = new Map()) {
  api = { get:async()=>({data:{success:true,data:{telefono:'50688888888',telefonos:[],mensaje:'Hola buenas, adjunto pedido\ngracias'}}}), ...api };
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
  const hook = new Function('useState', 'useRef', 'useEffect', 'api', 'useAuth', 'sessionStorage', 'crypto', 'cuerpoEnvioProveedor', 'resultadoEnvioProveedor', 'intentoSeparadoDelProveedor', 'revisarTelefonoProveedor', codigo + '\nreturn useEnvioOrdenProveedor')(
    useState, useRef, useEffect, api, () => ({ usuario: { id: 50 } }), sessionStorage, { randomUUID: () => `clave-${++serial}` }, vista.cuerpoEnvioProveedor, vista.resultadoEnvioProveedor, vista.intentoSeparadoDelProveedor, telefonos.revisarTelefonoProveedor);
  const render = (datos = {}) => {
    indice = 0;
    const resultado = hook({ proveedor, productos: [producto], preferirDatosProveedor: true, onEnviada: async () => {}, showToast() {}, ...datos });
    while (efectos.length) efectos.shift()();
    return resultado;
  };
  return { render, almacen };
}

module.exports = { montar, proveedor, producto };
