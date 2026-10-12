/** SQL real, imágenes reales y archivos propios; solo clon desechable. */
const { describe,test,before,after,beforeEach,afterEach }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const sharp=require('sharp');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';

describe('imágenes de categorías — PostgreSQL y disco desechables',{skip:!activo},()=>{
  let pool,c,servicio,tablas,taxonomia,productos,agente,almacenamiento,carpeta,id,nombre,foto;
  const archivos=async()=>fs.readdir(path.join(carpeta,'categorias')).catch(()=>[]);
  before(async()=>{
    const url=new URL(process.env.DATABASE_URL);
    assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
    assert.match(url.pathname,/^\/tachi_codex_[a-z0-9_]+$/);
    carpeta=await fs.mkdtemp('/private/tmp/codex-imagen-categoria-');
    process.env.ALMACENAMIENTO_DIR=carpeta;
    pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:1});
    c=await pool.connect();await c.query('BEGIN');
    const db=require.resolve('../config/database');
    require.cache[db]={id:db,filename:db,loaded:true,exports:baseEnTransaccion(c,'imgcat')};
    servicio=require('../src/modules/productos/categorias.imagenes');
    tablas=require('../src/modules/productos/taxonomiaTablas');
    taxonomia=require('../src/modules/productos/taxonomia.service');
    productos=require('../src/modules/productos/productos.service');
    agente=require('../src/modules/catalogo-agente/catalogo-agente.service');
    almacenamiento=require('../src/integrations/almacenamiento');
    nombre='ZZ categoría visual '+randomUUID().slice(0,8);
    id=(await c.query('INSERT INTO categoria_producto(nombre) VALUES($1) RETURNING id',[nombre])).rows[0].id;
    await c.query('INSERT INTO categoria_config(categoria,nombre_visible,orden) VALUES($1,$2,7)',[nombre,'ZZ colección']);
    foto=await sharp({create:{width:1600,height:1000,channels:3,background:'#dc8a50'}}).png().toBuffer();
  });
  beforeEach(async()=>{await c.query('SAVEPOINT caso_imagen');});
  afterEach(async()=>{await c.query('ROLLBACK TO SAVEPOINT caso_imagen');await fs.rm(path.join(carpeta,'categorias'),{recursive:true,force:true});});
  after(async()=>{
    if(c){await c.query('ROLLBACK');c.release();}await pool?.end();
    if(carpeta){assert.match(carpeta,/\/codex-imagen-categoria-/);await fs.rm(carpeta,{recursive:true,force:true});}
  });

  test('prepara versiones estáticas WebP con resolución y peso acotados',async()=>{
    const r=await servicio.optimizarImagen(foto);
    for(const [k,maxAncho,maxBytes]of[['grande',960,180*1024],['movil',480,60*1024]]){
      const meta=await sharp(r[k].data).metadata();
      assert.equal(meta.format,'webp');assert.equal(meta.pages||1,1);
      assert.ok(meta.width<=maxAncho);assert.ok(r[k].data.length<=maxBytes);
      assert.equal(meta.width/meta.height,16/9);
    }
  });
  test('también limita el peso de una foto de mucho detalle',async()=>{
    const ruido=await sharp(randomBytes(1920*1080*3),{raw:{width:1920,height:1080,channels:3}}).jpeg({quality:90}).toBuffer();
    const r=await servicio.optimizarImagen(ruido);
    assert.ok(r.grande.data.length<=180*1024);
    assert.ok(r.movil.data.length<=60*1024);
  });
  test('no agranda una foto pequeña ni conserva sus metadatos',async()=>{
    const pequena=await sharp({create:{width:320,height:180,channels:3,background:'#e9501c'}})
      .withMetadata().jpeg().toBuffer();
    const r=await servicio.optimizarImagen(pequena);
    const meta=await sharp(r.grande.data).metadata();
    assert.equal(meta.width,320);assert.equal(meta.height,180);assert.equal(meta.exif,undefined);
  });
  for(const [etiqueta,buffer]of[['vacía',Buffer.alloc(0)],['HTML',Buffer.from('<html>no es foto</html>')],
    ['PNG corrupto',Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])],['mayor a 8 MB',Buffer.alloc(8*1024*1024+1)]]){
    test(`rechaza imagen ${etiqueta} sin archivos ni metadatos`,async()=>{
      await assert.rejects(servicio.asignarDesdeArchivo(id,{buffer}),e=>e.status===400);
      assert.deepEqual(await archivos(),[]);
      assert.equal((await c.query('SELECT imagen FROM categoria_config WHERE categoria=$1',[nombre])).rows[0].imagen,null);
    });
  }
  test('rechaza imágenes de demasiados píxeles',async()=>{
    const grande=await sharp({create:{width:6000,height:5000,channels:3,background:'#fff'}}).png().toBuffer();
    await assert.rejects(servicio.optimizarImagen(grande),e=>e.status===400);
  });
  test('guardar entrega la misma imagen al árbol y al agente, sin cambiar nombre u orden',async()=>{
    const r=await servicio.asignarDesdeArchivo(id,{buffer:foto});
    assert.match(r.imagen.url,new RegExp(`^/archivos/categorias/${id}-grande-.*\\.webp$`));
    assert.match(r.imagen.urlMovil,new RegExp(`^/archivos/categorias/${id}-movil-.*\\.webp$`));
    assert.equal((await archivos()).length,2);
    const arbol=(await taxonomia.arbol()).find(x=>x.id===id);
    const config=(await agente.obtenerConfigCatalogo()).categorias.find(x=>x.id===id);
    assert.deepEqual(arbol.imagen,r.imagen);assert.deepEqual(config.imagen,r.imagen);
    assert.equal(config.nombreVisible,'ZZ colección');assert.equal(config.orden,7);
    const registro=(await c.query("SELECT cambios FROM bitacora_cambio WHERE entidad='categoria_producto' AND entidad_id=$1",[String(id)])).rows[0];
    assert.deepEqual(registro.cambios.imagen,[null,r.imagen]);
  });
  test('renombrar la categoría real, el nombre visible y el orden conserva la imagen',async()=>{
    const {imagen}=await servicio.asignarDesdeArchivo(id,{buffer:foto});
    const nuevo='ZZ renombrada '+randomUUID().slice(0,8);
    await productos.editarCategoria(id,{nombre:nuevo});
    await tablas.renombrarCategoria(nuevo,'ZZ nombre visible nuevo');
    await tablas.reordenarCategorias([nuevo]);
    const r=(await tablas.categoriasEnOrden()).find(x=>x.id===id);
    assert.deepEqual(r.imagen,imagen);assert.equal(r.nombreVisible,'ZZ nombre visible nuevo');assert.equal(r.orden,0);
  });
  test('reemplazar y quitar limpia solo las versiones anteriores de esa categoría',async()=>{
    const primera=await servicio.asignarDesdeArchivo(id,{buffer:foto});
    const segunda=await servicio.asignarDesdeArchivo(id,{buffer:foto});
    assert.notEqual(primera.imagen.url,segunda.imagen.url);assert.equal((await archivos()).length,2);
    await servicio.quitarImagen(id);
    assert.deepEqual(await archivos(),[]);
    const r=(await tablas.categoriasEnOrden()).find(x=>x.id===id);
    assert.equal(r.imagen,undefined);assert.equal(r.orden,7);assert.equal(r.nombreVisible,'ZZ colección');
  });
  test('un fallo de bitácora revierte metadatos y borra las nuevas versiones, conservando la anterior',async()=>{
    const primera=await servicio.asignarDesdeArchivo(id,{buffer:foto});
    await c.query(`CREATE FUNCTION pg_temp.rechazo_imagen_categoria() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'ZZ fallo de bitácora'; END $$`);
    await c.query(`CREATE TRIGGER zz_rechazo_imagen_categoria BEFORE INSERT ON bitacora_cambio
      FOR EACH ROW WHEN (NEW.entidad='categoria_producto' AND NEW.entidad_id='${id}') EXECUTE FUNCTION pg_temp.rechazo_imagen_categoria()`);
    await assert.rejects(servicio.asignarDesdeArchivo(id,{buffer:foto}),/ZZ fallo de bitácora/);
    assert.equal((await archivos()).length,2);
    const r=(await tablas.categoriasEnOrden()).find(x=>x.id===id);
    assert.deepEqual(r.imagen,primera.imagen);
  });
  test('sin migración la lectura sigue disponible y subir falla sin dejar archivos',async()=>{
    await c.query('ALTER TABLE categoria_config DROP COLUMN imagen');
    assert.ok((await tablas.categoriasEnOrden()).find(x=>x.id===id));
    await assert.rejects(servicio.asignarDesdeArchivo(id,{buffer:foto}),e=>e.status===503);
    assert.deepEqual(await archivos(),[]);
  });
  test('ids inválidos/inexistentes no escriben archivos',async()=>{
    await assert.rejects(servicio.asignarDesdeArchivo('mal',{buffer:foto}),e=>e.status===400);
    await assert.rejects(servicio.asignarDesdeArchivo(2147483647,{buffer:foto}),e=>e.status===404);
    await assert.rejects(servicio.quitarImagen(2147483647),e=>e.status===404);
    assert.deepEqual(await archivos(),[]);
  });
  test('la migración es repetible y no cambia la configuración existente',async()=>{
    const sql=await fs.readFile(path.resolve(__dirname,'../migrations/independencia/055_imagen_categoria_catalogo.sql'),'utf8');
    const antes=(await c.query('SELECT * FROM categoria_config ORDER BY categoria')).rows;
    await c.query(sql);await c.query(sql);
    assert.deepEqual((await c.query('SELECT * FROM categoria_config ORDER BY categoria')).rows,antes);
  });
  test('el upload multipart funciona por la ruta de Gestión y respeta los permisos del módulo',async()=>{
    const {moduloDeRuta}=require('../src/modules/usuarios/modulos');
    assert.equal(moduloDeRuta(`/maestro/categorias/${id}/imagen`),'gestion-catalogo');
    const express=require('express');const app=express();
    app.use('/maestro',require('../src/modules/productos/productos.routes').routes);
    const servidor=app.listen(0,'127.0.0.1');await new Promise(resolve=>servidor.once('listening',resolve));
    try {
      const form=new FormData();form.append('imagen',new Blob([foto],{type:'image/png'}),'ZZ.png');
      const url=`http://127.0.0.1:${servidor.address().port}/maestro/categorias/${id}/imagen`;
      const res=await fetch(url,{method:'POST',body:form});assert.equal(res.status,200);
      const cuerpo=await res.json();assert.ok(cuerpo.data.imagen.urlMovil);
      const borrar=await fetch(url,{method:'DELETE'});assert.equal(borrar.status,200);
      assert.equal((await borrar.json()).data.imagen,null);
    } finally { await new Promise(resolve=>servidor.close(resolve)); }
  });
});
