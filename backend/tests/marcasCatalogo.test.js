const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const cargar = nombre => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils', nombre)));

test('marcas: foto común y orden natural sin mutar presentaciones', async () => {
  const { agruparMarcasCatalogo } = await cargar('marcasCatalogo.js');
  const marca = { id:1,nombre:'Tricicle',imagen:{url:'/archivos/marcas/1.webp'} };
  const productos = [{id:1,name:'Candado 100 mm',marca},{id:2,name:'Candado 25 mm',marca},{id:3,name:'Suelto'}];
  const copia = JSON.stringify(productos);
  const grupos = agruparMarcasCatalogo(productos);
  assert.equal(grupos.length,2);
  assert.equal(grupos[0].marca.imagen.url,marca.imagen.url);
  assert.deepEqual(grupos[0].presentaciones.map(p=>p.id),[2,1]);
  assert.equal(grupos[1],productos[2]);
  assert.equal(JSON.stringify(productos),copia);
});

test('misma marca en distintas subcategorías no se mezcla ni recupera productos filtrados', async () => {
  const { agruparMarcasCatalogo } = await cargar('marcasCatalogo.js');
  const grupos = agruparMarcasCatalogo([{id:1,name:'Candado 32 mm',marca:{id:1,nombre:'Tricicle'}},{id:2,name:'Otra familia',marca:{id:2,nombre:'Tricicle'}}]);
  assert.equal(grupos.length,2);
  assert.deepEqual(grupos.flatMap(g=>g.presentaciones.map(p=>p.id)),[1,2]);
});

test('IVA real y ofertas: no se descuenta dos veces una baja de precio', async () => {
  const { precioCatalogoAgente } = await cargar('precioCatalogoAgente.js');
  for (const tarifa of [0,1,2,4,8,13]) {
    const p={price:[{price:100}],tax:[{percentage:tarifa}]};
    assert.equal(precioCatalogoAgente(p).final,100*(1+tarifa/100));
    assert.equal(precioCatalogoAgente({...p,precioAntes:200}).final,precioCatalogoAgente(p).final);
    assert.equal(precioCatalogoAgente({...p,descuentoPorcentaje:10,precioAntes:200}).final,100*(1+tarifa/100)*.9);
  }
});

test('buscar por marca encuentra productos que no la dicen en el nombre', async () => {
  const { buscarProductos } = await cargar('buscarCatalogoAgente.js');
  const p=[{id:1,name:'Candado 32 mm',reference:'A',marca:{nombre:'Tricicle'}},{id:2,name:'Candado 25 mm',reference:'B'}];
  assert.deepEqual(buscarProductos(p,'tricicle').map(x=>x.id),[1]);
  assert.deepEqual(buscarProductos(p,'tricicle 32').map(x=>x.id),[1]);
  assert.equal(buscarProductos(p,'B')[0].id,2);
});

test('sin conexión: foto de marca y de cada producto deduplicadas', async () => {
  const { fotosEnOrden } = await cargar('cacheImagenesCatalogo.js');
  const marca={id:1,imagen:{url:'/archivos/marcas/1.webp'}};
  const p=[{marca,images:[{url:'/archivos/productos/1.jpg'}]},{marca,images:[{url:'/archivos/productos/2.jpg'}]}];
  const fotos=fotosEnOrden(p,r=>r?'https://local.test'+r:null);
  assert.equal(fotos.size,3);
  assert.ok(fotos.has('https://local.test/archivos/marcas/1.webp'));
  assert.ok(fotos.has('https://local.test/archivos/productos/2.jpg'));
});
