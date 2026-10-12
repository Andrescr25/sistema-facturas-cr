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

function observacion({ reducido=false,sinObservador=false }={}) {
  const instancias=[];
  class Observer {
    constructor(callback,opciones){this.callback=callback;this.opciones=opciones;this.activos=new Set();this.desconectado=false;instancias.push(this);}
    observe(e){this.activos.add(e);}
    unobserve(e){this.activos.delete(e);}
    disconnect(){this.desconectado=true;}
  }
  const fuente=fs.readFileSync(path.resolve(__dirname,'../../frontend/src/utils/entradaCategoria.js'),'utf8').replace(/^export /gm,'');
  const observar=new Function('IntersectionObserver','window',`${fuente}\nreturn observarEntradaCategoria;`)(
    sinObservador?undefined:Observer,{matchMedia:()=>({matches:reducido})});
  return {instancias,observar};
}

test('muchas categorías comparten un solo observador y cada entrada se retira al aparecer',()=>{
  const {instancias,observar}=observacion();
  const elementos=Array.from({length:50},()=>({dataset:{}}));
  const limpiar=elementos.map(observar);
  assert.equal(instancias.length,1);
  const o=instancias[0];
  o.callback([{target:elementos[0],isIntersecting:false}]);
  assert.equal(elementos[0].dataset.entrada,undefined);
  o.callback([{target:elementos[0],isIntersecting:true}]);
  assert.equal(elementos[0].dataset.entrada,'visible');
  assert.equal(o.activos.size,49);
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
