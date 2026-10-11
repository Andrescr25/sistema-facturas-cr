const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Manejadores reales con estado React simulado y respuestas controladas.
// Las pruebas resuelven/fallan cada POST a voluntad, sin base ni red.
async function montar({ inicial, guardar, eliminar = async () => {}, enviar = async () => {}, confirmar = async () => true }) {
  const src = path.resolve(__dirname, '../../frontend/src');
  const utils = await import(pathToFileURL(path.join(src, 'utils/reporteClientesUtils.js')));
  const fuente = fs.readFileSync(path.join(src, 'hooks/useReporteClientes.js'), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\n/gm, '')
    .replace('export function useReporteClientes', 'function useReporteClientes');
  const estados = []; let indice = 0;
  const useState = valor => {
    const i = indice++;
    if (!(i in estados)) estados[i] = typeof valor === 'function' ? valor() : valor;
    return [estados[i], nuevo => { estados[i] = typeof nuevo === 'function' ? nuevo(estados[i]) : nuevo; }];
  };
  const useRef = valor => {
    const i = indice++;
    if (!(i in estados)) estados[i] = { current: valor };
    return estados[i];
  };
  let seleccion = 0;
  const contexto = () => {
    const capturada = seleccion;
    return { vigente:true, esActual:()=>seleccion===capturada, confirmar:()=>{} };
  };
  const avisos = [];
  const nombres = ['useState','useRef','useCallback','useEffect','useContextoConsulta','useFiltroCicloOperacion',
    'useDialog','useToast','alegraService','colaImpresionService',...Object.keys(utils)];
  const valores = [useState,useRef,f => f,() => {},contexto,
    () => ({ params: {} }),() => ({ confirm: confirmar }),
    () => ({ toasts: avisos, showToast: (texto,tipo) => avisos.push({ texto,tipo }), removeToast() {} }),
    { getReporteFaltantesCliente: async () => ({ success: true, data: [{ nombre:'ZZ cliente',facturas_con_faltantes:[inicial] }] }),
      guardarAjusteFaltante: guardar, eliminarAjusteFaltante: eliminar },
    { enviarDesdeReporte: enviar },...Object.values(utils)];
  const hook = new Function(...nombres,`${fuente}\nreturn useReporteClientes;`)(...valores);
  const render = () => { indice = 0; return hook(); };
  await render().loadReporte();
  return { render, utils, cambiarSeleccion:()=>{seleccion++;} };
}

const turno = () => new Promise(resolve => setImmediate(resolve));
const diferida = () => {
  let resolve, reject;
  const promise = new Promise((r,j) => { resolve = r; reject = j; });
  return { promise,resolve,reject };
};
const producto = id => ({ faltante_id:id, cantidad_faltante:3, nombre:`ZZ-${id}`, ajuste_estado:'pendiente' });
const factura = productos => ({ factura_id:901, numero_factura:'ZZ-901', productos_faltantes:productos });

test('el fallo de una línea no borra la respuesta que se guardó en otra', async () => {
  const [a,b] = [producto(41),producto(42)], f = factura([a,b]);
  const respuestas = new Map([[41,diferida()],[42,diferida()]]);
  const { render,utils } = await montar({ inicial:f,guardar: p => respuestas.get(p.faltanteId).promise });
  const pa = render().handleNoLlegoNada(utils.getProductKey(f,a),a);
  const pb = render().handleNoLlegoNada(utils.getProductKey(f,b),b);
  respuestas.get(42).resolve(); await pb;
  respuestas.get(41).reject(new Error('ZZ falla A')); await pa;
  assert.equal(render().entregasAjustadas.has(utils.getProductKey(f,a)),false);
  assert.equal(render().entregasAjustadas.get(utils.getProductKey(f,b))?.estado,'no_llego');
});

test('dos decisiones de la misma línea se guardan en orden, sin que la primera termine pisando la segunda', async () => {
  const a = producto(41), f = factura([a]), llamadas=[];
  const { render,utils } = await montar({ inicial:f,guardar: p => { const d=diferida(); llamadas.push({ ...d,p }); return d.promise; } });
  const key = utils.getProductKey(f,a);
  const primera = render().handleNoLlegoNada(key,a);
  const segunda = render().handleMarcarCompleto(key,a);
  await turno();
  assert.equal(llamadas.length,1);
  assert.equal(llamadas[0].p.estado,'no_llego');
  llamadas[0].resolve(); await primera; await turno();
  assert.equal(llamadas.length,2);
  assert.equal(llamadas[1].p.estado,'completo');
  llamadas[1].resolve(); await segunda;
  assert.equal(render().entregasAjustadas.get(key).estado,'completo');
});

test('enviar a Impresión espera tanto la respuesta como su confirmación de revisión', async () => {
  const a=producto(41),f=factura([a]),llamadas=[];let enviados=0;
  const { render,utils }=await montar({ inicial:f,guardar:p=>{const d=diferida();llamadas.push({...d,p});return d.promise;},enviar:async()=>{enviados++;} });
  const key=utils.getProductKey(f,a);
  const respuesta=render().handleNoLlegoNada(key,a);
  const revision=render().handleMarcarRevisado(key,a);
  const envio=render().handleFacturaLista('ZZ cliente',f);
  await turno(); assert.equal(enviados,0);
  llamadas[0].resolve();await respuesta;await turno();
  assert.equal(enviados,0);
  assert.equal(llamadas[1].p.revisado,true);
  llamadas[1].resolve();await revision;await envio;
  assert.equal(enviados,1);
});

test('una revisión masiva con un fallo conserva las líneas que sí se confirmaron', async () => {
  const [a,b]=[producto(41),producto(42)].map(p=>({...p,ajuste_estado:'no_llego',ajuste_revisado:false}));
  const f=factura([a,b]),respuestas=new Map([[41,diferida()],[42,diferida()]]);
  const {render,utils}=await montar({inicial:f,guardar:p=>respuestas.get(p.faltanteId).promise});
  const revision=render().handleMarcarFacturaRevisada(f);
  respuestas.get(41).resolve();respuestas.get(42).reject(new Error('ZZ falla B'));
  await revision;
  assert.equal(render().entregasAjustadas.get(utils.getProductKey(f,a)).revisado,true);
  assert.equal(render().entregasAjustadas.get(utils.getProductKey(f,b)).revisado,false);
});

test('si fallan dos decisiones consecutivas se recupera lo persistido, no el primer intento fallido', async () => {
  const a=producto(41),f=factura([a]),llamadas=[];
  const {render,utils}=await montar({inicial:f,guardar:()=>{const d=diferida();llamadas.push(d);return d.promise;}});
  const key=utils.getProductKey(f,a);
  const primera=render().handleNoLlegoNada(key,a);
  const segunda=render().handleMarcarCompleto(key,a);
  await turno();llamadas[0].reject(new Error('ZZ falla primera'));await primera;await turno();
  assert.equal(render().entregasAjustadas.get(key).estado,'completo');
  llamadas[1].reject(new Error('ZZ falla segunda'));await segunda;
  assert.equal(render().entregasAjustadas.has(key),false);
});

test('borrar una respuesta espera al guardado anterior y no reaparece al terminarlo', async () => {
  const a=producto(41),f=factura([a]),guardado=diferida(),borrado=diferida();let eliminados=0;
  const {render,utils}=await montar({inicial:f,guardar:()=>guardado.promise,eliminar:()=>{eliminados++;return borrado.promise;}});
  const key=utils.getProductKey(f,a);
  const respuesta=render().handleNoLlegoNada(key,a);
  const quitar=render().handleQuitarRespuesta(key,a);
  await turno();assert.equal(eliminados,0);
  guardado.resolve();await respuesta;await turno();assert.equal(eliminados,1);
  borrado.resolve();await quitar;
  assert.equal(render().entregasAjustadas.has(key),false);
});

test('un fallo al confirmar la revisión impide enviar a Impresión', async () => {
  const a={...producto(41),ajuste_estado:'no_llego',ajuste_revisado:false},f=factura([a]),guardado=diferida();let enviados=0;
  const {render,utils}=await montar({inicial:f,guardar:()=>guardado.promise,enviar:async()=>{enviados++;}});
  const revision=render().handleMarcarRevisado(utils.getProductKey(f,a),a);
  const envio=render().handleFacturaLista('ZZ cliente',f);
  await turno();guardado.reject(new Error('ZZ revisión fallida'));await revision;await envio;
  assert.equal(enviados,0);
  assert.equal(render().entregasAjustadas.get(utils.getProductKey(f,a)).revisado,false);
});

test('reabrir la revisión mientras está la confirmación abierta impide enviar la factura', async () => {
  const a={...producto(41),ajuste_estado:'no_llego',ajuste_revisado:true},f=factura([a]),dialogo=diferida();let enviados=0;
  const {render,utils}=await montar({inicial:f,guardar:async()=>{},confirmar:()=>dialogo.promise,enviar:async()=>{enviados++;}});
  const envio=render().handleFacturaLista('ZZ cliente',f);
  await turno();await render().handleReabrirRevision(utils.getProductKey(f,a),a);
  dialogo.resolve(true);await envio;
  assert.equal(enviados,0);
});

test('un fallo de la selección anterior no revierte la entrega recién cargada', async () => {
  const a=producto(41),f=factura([a]),guardado=diferida();
  const {render,utils,cambiarSeleccion}=await montar({inicial:f,guardar:()=>guardado.promise});
  const key=utils.getProductKey(f,a);
  const pendiente=render().handleNoLlegoNada(key,a);
  await turno();cambiarSeleccion();
  a.ajuste_estado='completo';a.cantidad_entregada=3;a.ajuste_revisado=true;
  await render().loadReporte();
  guardado.reject(new Error('ZZ fallo de otra selección'));await pendiente;
  assert.equal(render().entregasAjustadas.get(key).estado,'completo');
  assert.equal(render().entregasAjustadas.get(key).revisado,true);
  assert.equal(render().error,null);
});

test('cambiar de selección cancela los guardados todavía no enviados de esa selección', async () => {
  const a=producto(41),f=factura([a]),guardado=diferida();let llamadas=0;
  const {render,utils,cambiarSeleccion}=await montar({inicial:f,guardar:()=>{llamadas++;return guardado.promise;}});
  const key=utils.getProductKey(f,a);
  const primera=render().handleNoLlegoNada(key,a);
  const segunda=render().handleMarcarCompleto(key,a);
  await turno();cambiarSeleccion();await render().loadReporte();
  guardado.resolve();await primera;await segunda;
  assert.equal(llamadas,1);
  assert.equal(render().entregasAjustadas.has(key),false);
});
