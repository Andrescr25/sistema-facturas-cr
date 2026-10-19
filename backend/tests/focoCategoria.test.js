/**
 * El foco por categoría del catálogo del agente: oscuro → nombre y foto →
 * productos claros, siguiendo el scroll.
 *
 * 2026-10-18, el usuario: «cuando el cliente va por un cambio de categoría
 * la animación es muy brusca y se queda pegado». Medido en Chromium a tamaño
 * de tablet: el oscurecido saltaba de 0 a 1 en un cuadro, al tocar una
 * categoría la pantalla quedaba negra hasta seguir bajando, y detenerse a
 * medio camino la dejaba oscura. Estas pruebas cuidan que eso no vuelva.
 */
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

test('lo que se ve se acerca a lo que pide el scroll por tiempo, sin saltos', async () => {
  const { acercar } = await import(pathToFileURL(archivo));
  assert.ok(acercar(0, 1, 16) <= .15, 'un cuadro de 60 fps recorre como mucho el 15 % del salto');
  assert.ok(acercar(0, 1, 16) > .1, 'pero se mueve: no queda atrás del dedo');
  assert.ok(acercar(0, 1, 300) < .4, 'un cuadro lento (una foto que se decodifica) no se traduce en un salto');
  assert.equal(acercar(0, 1, 200), acercar(0, 1, 50));
  let v = 0; for (let i = 0; i < 60; i++) v = acercar(v, 1, 16);
  assert.equal(v, 1, 'en un segundo llega exacto, y entonces el cuadro siguiente ya no hace falta');
});

test('quieto a medio camino termina en un estado estable: la categoría entera o el catálogo claro', async () => {
  const { focoEnCategoria, alQuedarseQuieto } = await import(pathToFileURL(archivo));
  const ventana = 800, alto = 680;
  const quieto = p => alQuedarseQuieto(focoEnCategoria(ventana * .46 - p * (alto + ventana * .28), alto, ventana));
  for (const p of [.15, .22, .3, .5, .7]) assert.deepEqual([quieto(p).oscuridad, quieto(p).contenido], [1, 1], `progreso ${p}: la categoría se termina de mostrar`);
  for (const p of [.05, .1, .75, .85, .95]) assert.deepEqual([quieto(p).oscuridad, quieto(p).contenido], [0, 0], `progreso ${p}: vuelve a claro`);
  assert.equal(quieto(0).oscuridad, 0);
  assert.equal(quieto(1).oscuridad, 0);
});

test('la presentación al tocar una categoría: oscuro, nombre y foto, y claro', async () => {
  const { enPresentacion, PRESENTACION_MS } = await import(pathToFileURL(archivo));
  assert.deepEqual([enPresentacion(0).oscuridad, enPresentacion(0).contenido], [1, 0]);
  assert.deepEqual([enPresentacion(PRESENTACION_MS.categoria).oscuridad, enPresentacion(PRESENTACION_MS.categoria).contenido], [1, 1]);
  assert.deepEqual([enPresentacion(PRESENTACION_MS.aclarar).oscuridad, enPresentacion(PRESENTACION_MS.aclarar).contenido], [0, 0]);
  assert.ok(PRESENTACION_MS.aclarar <= 1500, 'es una pausa breve, no una espera');
});

function ensayo({ reducido = false, sinObservador = false, falla = false } = {}) {
  const listeners = new Map(), frames = new Map(), observadores = [];
  let contador = 0, ahora = 1000;
  const estilo = () => ({ setProperty(k,v) { this[k]=v; }, removeProperty(k) { delete this[k]; } });
  const velo = { style: estilo() };
  const raiz = { dataset: {}, querySelector: () => velo };
  const medio = { matches: reducido, addEventListener: (_e,f) => medio.cambiar=f, removeEventListener: () => { medio.cambiar=null; } };
  const ventana = { innerHeight: 800, scrollY: 0, matchMedia: () => medio,
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
  const modulo = new Function('window','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','performance',
    `${fuente}\nreturn { registrarFocoCategoria, entrarACategoria, oscuridadActual, QUIETO_MS, PRESENTACION_MS };`)(
    ventana,sinObservador?undefined:Observer,f=>{const id=contador++;frames.set(id,f);return id;},id=>frames.delete(id),{ now: () => ahora });
  const elemento = (top=-84) => ({ dataset:{},style:estilo(),lecturas:0,closest:()=>raiz,
    nextElementSibling: { desplazado: 0, scrollIntoView() { this.desplazado++; } },
    getBoundingClientRect() { this.lecturas++;return {top:this.top??top,height:680}; },
  });
  /** Un cuadro de `ms` milisegundos. */
  const avanzar = (ms = 16) => { ahora += ms; const pendientes=[...frames.values()];frames.clear();pendientes.forEach(f=>f()); };
  /** Cuadros hasta que no se pida otro; devuelve la oscuridad de cada uno. */
  const asentar = (ms = 16) => { const traza=[]; for(let i=0;i<400&&frames.size;i++){avanzar(ms);traza.push(Number(velo.style.opacity??0));} assert.equal(frames.size,0,'la animación tiene que detenerse sola'); return traza; };
  const scroll = () => listeners.get('scroll')?.forEach(f=>f());
  const documento = (separador) => ({ querySelector: s => s.includes('catalogo-oscurecer') ? velo : separador });
  const progreso = p => 800 * .46 - p * (680 + 800 * .28);
  return { raiz,velo,medio,listeners,frames,observadores,elemento,avanzar,asentar,scroll,ventana,documento,progreso,...modulo,
    registrar: modulo.registrarFocoCategoria };
}
const saltoMaximo = traza => traza.reduce((m, v, i) => i ? Math.max(m, Math.abs(v - traza[i - 1])) : m, 0);

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
  e.asentar();
  assert.equal(e.velo.style.opacity,'1.000');
  assert.equal(elementos[5].style['--foco-contenido'],'1.000');
  elementos[5].top=-800;e.scroll();e.asentar();
  assert.equal(e.raiz.dataset.focoCategoria,undefined);
  assert.equal(e.velo.style.opacity,undefined);
  quitar.forEach(f=>f());
  assert.equal(e.listeners.get('scroll').size,0);
  assert.equal(e.frames.size,0);
});

test('un gesto que salta de claro a la categoría se ve como un fundido, no de golpe',()=>{
  const e=ensayo(),n=e.elemento(e.progreso(-.2));e.registrar(n);
  e.observadores[0].callback([{target:n,isIntersecting:true}]);e.asentar();
  assert.equal(e.velo.style.opacity,undefined,'lejos del separador, claro');
  n.top=e.progreso(.5);e.scroll();
  const traza=e.asentar();
  assert.ok(saltoMaximo(traza)<=.16,`saltó ${saltoMaximo(traza).toFixed(2)} en un cuadro`);
  assert.ok(traza.every((v,i)=>!i||v>=traza[i-1]),'sube sin ir y volver');
  assert.equal(e.velo.style.opacity,'1.000');
  // Y una pasada que cruza el separador entero se apaga sola, sin corte seco.
  n.top=e.progreso(3);e.scroll();
  const salida=e.asentar();
  assert.ok(saltoMaximo(salida)<=.16);
  assert.equal(e.velo.style.opacity,undefined);
});

test('detenerse en lo oscuro no deja la pantalla negra: termina de mostrar la categoría',()=>{
  const e=ensayo(),n=e.elemento(e.progreso(.2));e.registrar(n);
  e.observadores[0].callback([{target:n,isIntersecting:true}]);e.scroll();
  for(let i=0;i<10;i++)e.avanzar();
  assert.ok(Number(e.velo.style.opacity)>.7,'mientras el dedo se mueve, oscurece');
  assert.ok(Number(n.style['--foco-contenido'])<.05,'y la categoría todavía no aparece');
  e.asentar();
  assert.equal(e.velo.style.opacity,'1.000');
  assert.equal(n.style['--foco-contenido'],'1.000','quieto, la categoría termina de aparecer sola');
  assert.equal(e.raiz.dataset.focoCategoria,'categoria');
});

for (const p of [.05,.85]) test(`detenerse apenas entrando o ya saliendo (${p}) vuelve solo a claro`,()=>{
  const e=ensayo(),n=e.elemento(e.progreso(p));e.registrar(n);
  e.observadores[0].callback([{target:n,isIntersecting:true}]);e.scroll();
  e.asentar();
  assert.equal(e.velo.style.opacity,undefined);
  assert.equal(n.dataset.foco,undefined);
  assert.equal(e.raiz.dataset.focoCategoria,undefined);
});

test('tocar una categoría lleva a sus productos y la presenta sola, hasta quedar claro',()=>{
  const e=ensayo(),n=e.elemento(-2000);e.registrar(n);
  assert.equal(e.entrarACategoria(0,e.documento(n)),true);
  assert.equal(n.nextElementSibling.desplazado,1,'la vista va a los productos de la categoría');
  e.avanzar();
  assert.equal(e.raiz.dataset.presentando,'true','termina sola: no dice «Seguí bajando»');
  const traza=e.asentar();
  assert.equal(e.raiz.dataset.presentando,undefined);
  assert.ok(saltoMaximo(traza)<=.16,`saltó ${saltoMaximo(traza).toFixed(2)} en un cuadro`);
  assert.ok(Math.max(...traza)>.99,'se oscurece del todo');
  assert.ok(traza.length*16<2600,'y en menos de tres segundos ya está claro');
  assert.equal(e.velo.style.opacity,undefined);
  assert.equal(n.dataset.foco,undefined);
  assert.equal(e.listeners.get('scroll').size,0,'sin separadores cerca, no queda nada escuchando');
});

test('tocar otra categoría con una escena a la vista no parpadea a claro',()=>{
  const e=ensayo(),n=e.elemento(-2000);e.registrar(n);
  e.velo.style.opacity='1.000';
  assert.equal(e.oscuridadActual(e.documento(n)),1);
  e.entrarACategoria(1,e.documento(n));e.avanzar();
  assert.ok(Number(e.velo.style.opacity)>.98,'sigue oscuro desde donde estaba');
});

test('mover el dedo durante la presentación le devuelve el mando al scroll',()=>{
  const e=ensayo(),n=e.elemento(-2000);e.registrar(n);
  e.entrarACategoria(0,e.documento(n));
  for(let i=0;i<20;i++)e.avanzar();
  assert.ok(Number(e.velo.style.opacity)>.9);
  e.ventana.scrollY=400;e.scroll();
  const traza=e.asentar();
  assert.ok(traza.length*16<1000,'se aclara enseguida, sin esperar el final de la presentación');
  assert.equal(e.velo.style.opacity,undefined);
});

test('buscar o cambiar de colección retira inmediatamente el oscurecimiento',()=>{
  const e=ensayo(),n=e.elemento();const quitar=e.registrar(n);
  const anterior=e.observadores[0];anterior.callback([{target:n,isIntersecting:true}]);e.asentar();
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
  assert.equal(e.entrarACategoria(0,e.documento(n)),false,'sin efecto, quien toca la categoría sube al principio');
  quitar();
});

test('activar movimiento reducido durante la escena recupera el catálogo claro',()=>{
  const e=ensayo(),n=e.elemento();e.registrar(n);e.observadores[0].callback([{target:n,isIntersecting:true}]);e.asentar();
  e.medio.matches=true;e.medio.cambiar();
  assert.equal(e.velo.style.opacity,undefined);
  assert.equal(n.dataset.inmersiva,undefined);
  assert.equal(e.listeners.get('scroll').size,0);
});

test('las imágenes se preparan solo al acercarse a su categoría, o al elegirla',()=>{
  const e=ensayo();const a=e.elemento(),b=e.elemento(),c=e.elemento();let fotosA=0,fotosB=0,fotosC=0;
  e.registrar(a,()=>fotosA++);e.registrar(b,()=>fotosB++);e.registrar(c,()=>fotosC++);
  assert.equal(fotosA+fotosB+fotosC,0);
  e.observadores[0].callback([{target:a,isIntersecting:true}]);
  assert.equal(fotosA,1);assert.equal(fotosB,0);
  e.observadores[0].callback([{target:a,isIntersecting:true}]);
  assert.equal(fotosA,1,'preparar una sola vez no vuelve a renderizar durante el recorrido');
  e.entrarACategoria(0,e.documento(c));
  assert.equal(fotosC,1,'la categoría elegida tiene su foto lista para la presentación');
});

test('cómo quedó conectado: la foto se muestra decodificada y las barras no desenfocan',()=>{
  const front = (...p) => fs.readFileSync(path.resolve(__dirname, '../../frontend/src', ...p), 'utf8');
  const intro = front('components','catalogo-agente','IntroduccionCategoria.jsx');
  assert.match(intro, /foto\.decode\(\)\.then\(lista, lista\)/);
  assert.match(intro, /onLoad=\{mostrarCuandoEsteLista\}/);
  assert.match(intro, /loading=\{cargarYa \? 'eager' : 'lazy'\}/);
  assert.match(front('components','catalogo-agente','TransicionCategoria.jsx'), /tituloDecorativo cargarYa \/>/);
  assert.match(front('components','catalogo-agente','introduccionCategoria.css'), /img:not\(\[data-lista\]\) \{ opacity: 0; \}/);
  const css = front('components','catalogo-agente','transicionCategoria.css');
  assert.match(css, /\[data-foco\] \.transicion-categoria__escena \{ visibility: visible; will-change: transform, opacity; \}/);
  assert.match(css, /will-change: opacity; \}/);
  assert.match(css, /\[data-presentando\] \.catalogo-oscurecer__seguir \{ visibility: hidden; \}/);
  for (const barra of ['BarraSuperior.jsx', 'BarraCategorias.jsx'])
    assert.doesNotMatch(front('components','catalogo-agente',barra), /backdrop-blur/, `${barra}: un desenfoque detrás de una barra fija se recalcula en cada cuadro del scroll`);
  const pagina = front('pages','CatalogoAgente.jsx');
  assert.match(pagina, /const previa = oscuridadActual\(\)\n\s+flushSync\(\(\) => setCategoria\(clave\)\)/);
  assert.match(pagina, /!entrarACategoria\(previa\)\) window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/);
});
