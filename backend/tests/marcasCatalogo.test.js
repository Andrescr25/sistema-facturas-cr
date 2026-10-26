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

test('presentaciones: fracciones, medidas mixtas, decimales y alfabeto español', async () => {
  const { compararPresentaciones, agruparMarcasCatalogo } = await cargar('marcasCatalogo.js');
  const medidas = ['2 1/2', '1 1/2', '1/2', '2', '3/4', '1 1/4', '1'];
  const lista = medidas.map((m, id) => ({ id, nombre: `Brocha ${m} · Pretul`, marca: { id: 1 } }));
  const copia = JSON.stringify(lista);
  assert.deepEqual(agruparMarcasCatalogo(lista)[0].presentaciones.map(p => p.nombre),
    ['1/2', '3/4', '1', '1 1/4', '1 1/2', '2', '2 1/2'].map(m => `Brocha ${m} · Pretul`));
  assert.equal(JSON.stringify(lista), copia);
  assert.ok(compararPresentaciones({ name: 'Nylon 0.70 mm' }, { nombre: 'Nylon 1.00 mm' }) < 0);
  assert.ok(compararPresentaciones({ nombre: 'Nylon 0,70 mm' }, { nombre: 'Nylon 0,80 mm' }) < 0);
  assert.ok(compararPresentaciones({ nombre: 'Ánzuelo 100' }, { nombre: 'Brocha 1' }) < 0);
  assert.ok(compararPresentaciones({ id: 2, nombre: 'Tornillo 3' }, { id: 10, nombre: 'Tornillo 3' }) < 0);
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

test('Gestión ordena dentro de cada marca conservando los lugares de otras marcas y sueltos', async () => {
  const { ordenarPresentacionesMarcadas } = await cargar('marcasCatalogo.js');
  const lista = [{ id: 1, name: 'Brocha 1 1/2', marca: { id: 1 } }, { id: 2, name: 'Suelto' },
    { id: 3, name: 'Candado 50', marca: { id: 2 } }, { id: 4, name: 'Brocha 1/2', marca: { id: 1 } },
    { id: 5, name: 'Candado 25', marca: { id: 2 } }];
  const copia = JSON.stringify(lista);
  assert.deepEqual(ordenarPresentacionesMarcadas(lista).map(p => p.id), [4, 2, 5, 1, 3]);
  assert.equal(JSON.stringify(lista), copia);
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
