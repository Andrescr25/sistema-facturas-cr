const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const archivo = path.resolve(__dirname, '../../frontend/src/utils/focoCategoria.js');

test('el recorrido oscurece, presenta la categoría y vuelve a los productos claros', async () => {
  const { focoEnCategoria } = await import(pathToFileURL(archivo));
  const ventana = 800, alto = 680;
  const en = p => focoEnCategoria(ventana * .46 - p * (alto + ventana * .28), alto, ventana);
  assert.equal(en(0).oscuridad, 0);
  assert.equal(en(.22).oscuridad, 1);
  assert.equal(en(.22).contenido, 0, 'primero se oscurece, luego aparece la imagen');
  assert.equal(en(.5).oscuridad, 1);
  assert.equal(en(.5).contenido, 1);
  assert.equal(en(.5).fase, 'categoria');
  assert.equal(en(.85).fase, 'aclarar');
  assert.ok(en(.85).oscuridad > 0 && en(.85).oscuridad < 1);
  assert.equal(en(1).oscuridad, 0);
  assert.equal(en(1).contenido, 0);
  assert.equal(en(1).fase, 'claro');
  assert.equal(en(-2).oscuridad, 0);
  assert.equal(en(5).oscuridad, 0);
});

function ensayo({ reducido = false, sinObservador = false, falla = false } = {}) {
  const listeners = new Map(), frames = new Map(), observadores = [];
  let contador = 0;
  const estilo = () => ({ setProperty(k,v) { this[k]=v; }, removeProperty(k) { delete this[k]; } });
  const velo = { style: estilo() };
  const raiz = { dataset: {}, querySelector: () => velo };
  const medio = { matches: reducido, addEventListener: (_e,f) => medio.cambiar=f, removeEventListener: () => { medio.cambiar=null; } };
  const ventana = { innerHeight: 800, matchMedia: () => medio,
    addEventListener(e,f) { if (!listeners.has(e)) listeners.set(e,new Set()); listeners.get(e).add(f); },
    removeEventListener(e,f) { listeners.get(e)?.delete(f); },
  };
  class Observer {
    constructor(cb) { this.callback=es=>cb(es,this); this.activos=new Set(); observadores.push(this); }
    observe(e) { if(falla)throw Error('Observación fallida');this.activos.add(e); }
    unobserve(e) { this.activos.delete(e); }
    disconnect() { this.activos.clear(); }
  }
  const fuente = fs.readFileSync(archivo,'utf8').replace(/^export /gm,'');
  const registrar = new Function('window','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame',`${fuente}\nreturn registrarFocoCategoria;`)(
    ventana,sinObservador?undefined:Observer,f=>{const id=contador++;frames.set(id,f);return id;},id=>frames.delete(id));
  const elemento = (top=-84) => ({ dataset:{},style:estilo(),lecturas:0,closest:()=>raiz,
    getBoundingClientRect() { this.lecturas++;return {top:this.top??top,height:680}; },
  });
  const avanzar = () => { const pendientes=[...frames.values()];frames.clear();pendientes.forEach(f=>f()); };
  const scroll = () => listeners.get('scroll')?.forEach(f=>f());
  return { raiz,velo,medio,listeners,frames,observadores,registrar,elemento,avanzar,scroll };
}

test('solo se mide el separador próximo; múltiples eventos comparten un frame',()=>{
  const e=ensayo();const elementos=Array.from({length:30},()=>e.elemento());const quitar=elementos.map(n=>e.registrar(n));
  assert.equal(e.observadores.length,1);
  e.observadores[0].callback([{target:elementos[5],isIntersecting:true}]);
  for(let i=0;i<100;i++)e.scroll();
  assert.equal(e.frames.size,1);
  e.avanzar();
  assert.equal(elementos[5].lecturas,1);
  assert.ok(elementos.filter((_,i)=>i!==5).every(n=>n.lecturas===0));
  assert.equal(e.raiz.dataset.focoCategoria,'categoria');
  assert.equal(e.velo.style.opacity,'1.000');
  elementos[5].top=-800;e.scroll();e.avanzar();
  assert.equal(e.raiz.dataset.focoCategoria,undefined);
  quitar.forEach(f=>f());
  assert.equal(e.listeners.get('scroll').size,0);
  assert.equal(e.frames.size,0);
});

test('buscar o cambiar de colección retira inmediatamente el oscurecimiento',()=>{
  const e=ensayo(),n=e.elemento();const quitar=e.registrar(n);
  const anterior=e.observadores[0];anterior.callback([{target:n,isIntersecting:true}]);e.avanzar();
  assert.equal(e.velo.style.opacity,'1.000');
  e.scroll();quitar();
  assert.equal(e.frames.size,0);
  assert.equal(e.velo.style.opacity,undefined);
  assert.equal(n.dataset.inmersiva,undefined);
  assert.equal(n.dataset.foco,undefined);
  assert.equal(e.raiz.dataset.focoCategoria,undefined);
  e.registrar(n);
  anterior.callback([{target:n,isIntersecting:true}]);e.avanzar();
  assert.equal(e.velo.style.opacity,undefined,'un callback anterior no oscurece la vista nueva');
});

for(const opcion of [{reducido:true},{sinObservador:true},{falla:true}]) test(`respaldo compacto y claro: ${JSON.stringify(opcion)}`,()=>{
  const e=ensayo(opcion),n=e.elemento();const quitar=e.registrar(n);e.avanzar();
  assert.equal(n.dataset.inmersiva,undefined);
  assert.equal(e.velo.style.opacity,undefined);
  quitar();
});

test('activar movimiento reducido durante la escena recupera el catálogo claro',()=>{
  const e=ensayo(),n=e.elemento();e.registrar(n);e.observadores[0].callback([{target:n,isIntersecting:true}]);e.avanzar();
  e.medio.matches=true;e.medio.cambiar();
  assert.equal(e.velo.style.opacity,undefined);
  assert.equal(n.dataset.inmersiva,undefined);
  assert.equal(e.listeners.get('scroll').size,0);
});

test('las imágenes se preparan solo al acercarse a su categoría',()=>{
  const e=ensayo();const a=e.elemento(),b=e.elemento();let fotosA=0,fotosB=0;
  e.registrar(a,()=>fotosA++);e.registrar(b,()=>fotosB++);
  assert.equal(fotosA+fotosB,0);
  e.observadores[0].callback([{target:a,isIntersecting:true}]);
  assert.equal(fotosA,1);assert.equal(fotosB,0);
  e.observadores[0].callback([{target:a,isIntersecting:true}]);
  assert.equal(fotosA,1,'preparar una sola vez no vuelve a renderizar durante el recorrido');
});
