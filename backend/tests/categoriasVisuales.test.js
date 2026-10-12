const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('la imagen asignada gana; sin ella se usa la foto favorita de un producto visible', async () => {
  const { imagenDeCategoria } = await import(pathToFileURL(path.resolve(__dirname,'../../frontend/src/utils/imagenesCategoriaCatalogo.js')));
  const productos=[{ id:1 },{ id:2,images:[{url:'otra'},{url:'favorita',favorite:true}] }];
  const imagen={url:'/archivos/categorias/1-grande.webp',urlMovil:'/archivos/categorias/1-movil.webp'};
  assert.equal(imagenDeCategoria('Mascotas',{categorias:[{name:'Mascotas',imagen}]},productos),imagen);
  assert.deepEqual(imagenDeCategoria('Mascotas',null,productos),{url:'favorita',esProducto:true});
  assert.equal(imagenDeCategoria('Otros',{categorias:[]},[]),null);
  assert.deepEqual(imagenDeCategoria('Mascotas',{categorias:[{name:'Mascotas',imagen:null}]},productos),{url:'favorita',esProducto:true});
});

function observacion({ reducido=false,sinObservador=false,fallaObservador=false }={}) {
  const instancias=[];
  let reloj=1000;const entorno={scrollY:0,matchMedia:()=>({matches:reducido})};
  class Observer {
    constructor(callback,opciones){this.callback=entradas=>callback(entradas,this);this.opciones=opciones;this.activos=new Set();this.desconectado=false;instancias.push(this);}
    observe(e){if(fallaObservador) throw new Error('Sin soporte');this.activos.add(e);}
    unobserve(e){this.activos.delete(e);}
    disconnect(){this.desconectado=true;}
  }
  const fuente=fs.readFileSync(path.resolve(__dirname,'../../frontend/src/utils/entradaCategoria.js'),'utf8').replace(/^export /gm,'');
  const funciones=new Function('IntersectionObserver','window','performance',`${fuente}\nreturn {observar:observarEntradaCategoria,filas:observarFilasDelCatalogo,vigilar:vigilarColeccion};`)(
    sinObservador?undefined:Observer,entorno,{now:()=>reloj});
  return {instancias,...funciones,pasar:(ms,y)=>{reloj+=ms;entorno.scrollY=y;}};
}

test('cabeceras y cientos de filas comparten un solo observador y cada entrada se retira al aparecer',()=>{
  const {instancias,observar}=observacion();
  const elementos=Array.from({length:1000},()=>({dataset:{}}));
  const limpiar=elementos.map(e=>observar(e));
  assert.equal(instancias.length,1);
  const o=instancias[0];
  o.callback([{target:elementos[0],isIntersecting:false}]);
  assert.equal(elementos[0].dataset.entrada,'espera');
  o.callback([{target:elementos[0],isIntersecting:true}]);
  assert.equal(elementos[0].dataset.entrada,'visible');
  assert.equal(o.activos.size,999);
  limpiar.forEach(f=>f());
  assert.equal(o.desconectado,true);
});

test('las notificaciones tardías de una cabecera desmontada no tocan otra selección',()=>{
  const {instancias,observar}=observacion();
  const vieja={dataset:{}},nueva={dataset:{}};
  const quitar=observar(vieja);const primero=instancias[0];quitar();
  observar(nueva);const segundo=instancias[1];
  primero.callback([{target:vieja,isIntersecting:true}]);
  assert.equal(vieja.dataset.entrada,undefined);
  assert.equal(segundo.activos.size,1);
  segundo.callback([{target:nueva,isIntersecting:true}]);
  assert.equal(nueva.dataset.entrada,'visible');
  assert.equal(segundo.desconectado,true);
});

for(const opciones of [{reducido:true},{sinObservador:true}]) test(`sin animación también se navega: ${JSON.stringify(opciones)}`,()=>{
  const {instancias,observar}=observacion(opciones);
  const e={dataset:{}};const quitar=observar(e);quitar();
  assert.equal(instancias.length,0);
  assert.equal(e.dataset.entrada,undefined);
});

test('si observar falla los productos quedan visibles',()=>{
  const {instancias,observar}=observacion({fallaObservador:true});
  const e={dataset:{}};observar(e);
  assert.equal(e.dataset.entrada,undefined);
  assert.equal(instancias[0].desconectado,true);
});

test('una fila visitada no se anima de nuevo al actualizar su contenido',()=>{
  const {instancias,observar}=observacion();
  const e={dataset:{entrada:'visible'}};observar(e);
  assert.equal(instancias.length,0);
  assert.equal(e.dataset.entrada,'visible');
});


test('dos mil productos solo observan cuatro filas próximas por categoría',()=>{
  const {instancias,filas}=observacion();
  const elementos=Array.from({length:1000},()=>({dataset:{}}));
  const control=filas(elementos);
  const o=instancias[0];
  assert.equal(o.activos.size,4);
  assert.equal(elementos.filter(e=>e.dataset.entrada==='espera').length,4);
  o.callback([{target:elementos[0],isIntersecting:true},{target:elementos[1],isIntersecting:true}]);
  assert.equal(o.activos.size,4);
  assert.equal(elementos[4].dataset.entrada,'espera');
  assert.equal(elementos[5].dataset.entrada,'espera');
  assert.equal(elementos[900].dataset.entrada,undefined,'un salto rápido no encuentra fichas ocultas sin observación');
  control.preparar(900);
  assert.equal(elementos[2].dataset.entrada,undefined);
  assert.equal(elementos[900].dataset.entrada,'espera');
  control.limpiar();
  assert.equal(elementos.filter(e=>e.dataset.entrada==='espera').length,0);
  assert.equal(instancias.at(-1).desconectado,true);
});


test('una pasada rápida muestra fichas inmediatamente y conserva la entrada de categoría',()=>{
  const {instancias,observar,filas,pasar}=observacion();
  const cabecera={dataset:{}};observar(cabecera);
  const elementos=Array.from({length:8},()=>({dataset:{}}));const control=filas(elementos);
  const o=instancias[0];o.callback([{target:elementos[0],isIntersecting:true}]);
  assert.equal(elementos[0].dataset.entrada,'visible');
  pasar(16,300);
  o.callback([{target:elementos[1],isIntersecting:true},{target:cabecera,isIntersecting:true}]);
  assert.equal(elementos[1].dataset.entrada,'directa');
  assert.equal(cabecera.dataset.entrada,'visible');
  assert.equal(o.activos.size,4);
  control.limpiar();
});

test('un observador retirado no revela una fila registrada otra vez',()=>{
  const {instancias,observar}=observacion();
  const e={dataset:{}};observar(e)();
  const viejo=instancias[0];observar(e);
  viejo.callback([{target:e,isIntersecting:true}]);
  assert.equal(e.dataset.entrada,'espera');
  assert.equal(instancias[1].activos.size,1);
  instancias[1].callback([{target:e,isIntersecting:true}]);
  assert.equal(e.dataset.entrada,'visible');
});


test('el mismo observador activa y retira la colección sin esconder otras filas',()=>{
  const {instancias,vigilar,filas}=observacion();
  const coleccion={dataset:{}};const elementos=Array.from({length:1000},()=>({dataset:{}}));
  let control;const quitar=vigilar(coleccion,visible=>{if(visible)control=filas(elementos);else{control?.limpiar();control=null;}});
  const o=instancias[0];assert.equal(o.activos.size,1);
  o.callback([{target:coleccion,isIntersecting:true}]);
  assert.equal(o.activos.size,5);
  assert.equal(elementos.filter(e=>e.dataset.entrada==='espera').length,4);
  o.callback([{target:coleccion,isIntersecting:false}]);
  assert.equal(o.activos.size,1);
  assert.equal(elementos.filter(e=>e.dataset.entrada==='espera').length,0);
  quitar();assert.equal(o.desconectado,true);
});

test('la cuadrícula continua observa la primera ficha y revela toda su fila',()=>{
  const {instancias,filas}=observacion();
  const ficha={dataset:{}};
  const fila={dataset:{},querySelector:()=>ficha};
  const control=filas([fila]);
  assert.equal(instancias[0].activos.has(ficha),true);
  assert.equal(instancias[0].activos.has(fila),false);
  assert.equal(fila.dataset.entrada,'espera');
  instancias[0].callback([{target:ficha,isIntersecting:true}]);
  assert.equal(fila.dataset.entrada,'visible');
  assert.equal(ficha.dataset.entrada,undefined);
  control.limpiar();
});
