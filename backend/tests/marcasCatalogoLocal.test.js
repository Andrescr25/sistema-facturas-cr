/** PostgreSQL y disco desechables. Ninguna escritura fuera de BEGIN/ROLLBACK. */
const { describe,test,before,after,beforeEach,afterEach }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';

describe('marcas con PostgreSQL y archivos locales',{skip:!activo},()=>{
  let pool,c,servicio,imagenes,agente,taxonomia,carpeta,cat,sub,sub2,ids,foto;
  before(async()=>{
    const url=new URL(process.env.DATABASE_URL);
    assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
    assert.match(url.pathname,/^\/tachi_codex_[a-z0-9_]+$/);
    carpeta=await fs.mkdtemp('/private/tmp/codex-marcas-local-');
    process.env.ALMACENAMIENTO_DIR=carpeta;
    pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:1});
    c=await pool.connect();await c.query('BEGIN');
    const db=require.resolve('../config/database');
    require.cache[db]={id:db,filename:db,loaded:true,exports:baseEnTransaccion(c,'marca')};
    servicio=require('../src/modules/productos/marcas.service');
    imagenes=require('../src/modules/productos/marcas.imagenes');
    agente=require('../src/modules/catalogo-agente/catalogo-agente.service');
    taxonomia=require('../src/modules/productos/taxonomia.service');
    cat=(await c.query("INSERT INTO categoria_producto(nombre) VALUES('ZZ marcas prueba') RETURNING id")).rows[0].id;
    sub=(await c.query("INSERT INTO subcategoria(categoria,nombre) VALUES('ZZ marcas prueba','ZZ Candados') RETURNING id")).rows[0].id;
    sub2=(await c.query("INSERT INTO subcategoria(categoria,nombre) VALUES('ZZ marcas prueba','ZZ Otros') RETURNING id")).rows[0].id;
    ids=[];
    for(const mm of [25,32,38]) ids.push((await c.query(`INSERT INTO producto(nombre,referencia,categoria_id,subcategoria_id,precio_sin_iva,costo_con_iva,imagen_url)
      VALUES($1,$2,$3,$4,100,70,$5) RETURNING id`,['ZZ Candado '+mm+' mm','ZZ-MARCA-'+mm,cat,sub,'/archivos/productos/zz-'+mm+'.jpg'])).rows[0].id);
    foto=await sharp({create:{width:1600,height:900,channels:3,background:'white'}}).png().toBuffer();
  });
  beforeEach(async()=>{await c.query('SAVEPOINT caso_marca');});
  afterEach(async()=>{await c.query('ROLLBACK TO SAVEPOINT caso_marca');await fs.rm(path.join(carpeta,'marcas'),{recursive:true,force:true});});
  after(async()=>{if(c){await c.query('ROLLBACK');c.release();}await pool?.end();if(carpeta)await fs.rm(carpeta,{recursive:true,force:true});});
  const crear=()=>servicio.guardar(sub,null,{nombre:'Tricicle',productoIds:ids});

  test('clasifica existentes sin alterar nombre, precio, impuesto ni foto; registra bitácora',async()=>{
    const antes=(await c.query('SELECT id,nombre,referencia,precio_sin_iva,costo_con_iva,imagen_url FROM producto WHERE id=ANY($1) ORDER BY id',[ids])).rows;
    const m=await crear(),lista=await servicio.listar(sub);
    assert.equal(lista.marcas[0].productos,3);
    assert.ok(lista.productos.every(p=>p.marca_catalogo_id===m.id));
    assert.deepEqual((await c.query('SELECT id,nombre,referencia,precio_sin_iva,costo_con_iva,imagen_url FROM producto WHERE id=ANY($1) ORDER BY id',[ids])).rows,antes);
    assert.equal((await c.query("SELECT COUNT(*)::int n FROM bitacora_cambio WHERE entidad='marca_catalogo' AND entidad_id=$1",[String(m.id)])).rows[0].n,1);
  });
  test('no acepta otra subcategoría y el rechazo revierte todo',async()=>{
    await c.query('UPDATE producto SET subcategoria_id=$1 WHERE id=$2',[sub2,ids[1]]);
    await assert.rejects(crear(),e=>e.status===409);
    assert.equal((await servicio.listar(sub)).marcas.length,0);
  });
  test('nombres duplicados se rechazan y las marcas se pueden reutilizar en otra subcategoría',async()=>{
    await crear();
    await assert.rejects(servicio.guardar(sub,null,{nombre:' tricicle ',productoIds:[]}),e=>e.status===409);
    assert.ok((await servicio.guardar(sub2,null,{nombre:'Tricicle',productoIds:[]})).id);
  });
  test('reasignar explícitamente y desmarcar conserva un único grupo por producto',async()=>{
    const m=await crear();
    const otra=await servicio.guardar(sub,null,{nombre:'Otra',productoIds:[ids[1]]});
    assert.equal((await servicio.listar(sub)).productos.find(p=>p.id===ids[1]).marca_catalogo_id,otra.id);
    await servicio.guardar(sub,m.id,{nombre:'Tricicle',productoIds:[ids[0]]});
    assert.equal((await servicio.listar(sub)).productos.find(p=>p.id===ids[2]).marca_catalogo_id,null);
  });
  test('lotes existentes y edición directa no dejan una marca de otra categoría/subcategoría',async()=>{
    await crear();
    await taxonomia.asignarSubcategoria({productoIds:[ids[0]],subcategoriaId:sub2});
    assert.equal((await c.query('SELECT marca_catalogo_id FROM producto WHERE id=$1',[ids[0]])).rows[0].marca_catalogo_id,null);
    const otraCat=(await c.query("INSERT INTO categoria_producto(nombre) VALUES('ZZ otra categoría marcas') RETURNING id")).rows[0].id;
    await taxonomia.cambiarCategoria({productoIds:[ids[1]],categoriaId:otraCat});
    assert.equal((await c.query('SELECT marca_catalogo_id FROM producto WHERE id=$1',[ids[1]])).rows[0].marca_catalogo_id,null);
  });
  test('rechaza una asignación incompatible aun por SQL',async()=>{
    const m=await crear();
    await c.query('SAVEPOINT incompatible');
    await c.query('UPDATE producto SET subcategoria_id=$1,marca_catalogo_id=$2 WHERE id=$3',[sub2,m.id,ids[0]]);
    assert.equal((await c.query('SELECT marca_catalogo_id FROM producto WHERE id=$1',[ids[0]])).rows[0].marca_catalogo_id,null);
    // Cambiar subcategoría conservando marca anterior sí la suelta; asignar
    // una marca AJENA explícita se rechaza, incluso si no pasa por la API.
    await c.query('ROLLBACK TO SAVEPOINT incompatible');
    const otra=await servicio.guardar(sub2,null,{nombre:'Ajena',productoIds:[]});
    await assert.rejects(c.query('UPDATE producto SET marca_catalogo_id=$1 WHERE id=$2',[otra.id,ids[0]]),e=>e.code==='23514');
  });
  test('foto nítida sin recorte, archivos propios y ruta pública sin costo',async()=>{
    const m=await crear(),r=await imagenes.asignar(m.id,{buffer:foto});
    assert.match(r.imagen.url,/^\/archivos\/marcas\/.+\.webp$/);
    const meta=await sharp(await fs.readFile(path.join(carpeta,r.imagen.url.replace('/archivos/','')))).metadata();
    assert.equal(meta.width,1000);assert.equal(meta.height,563);
    await c.query('UPDATE marca_catalogo SET imagen=imagen || $2::jsonb WHERE id=$1',[m.id,JSON.stringify({costo:99,secreto:'ZZ'})]);
    const {products}=await agente.listarProductos({limit:30,start:0});
    // La muestra de página puede no incluir ZZ: se ubica por nombre al final.
    const total=(await c.query("SELECT COUNT(*)::int n FROM producto p WHERE p.activo AND NOT p.oculto AND p.precio_sin_iva>0 AND p.nombre < 'ZZ Candado 25 mm'")).rows[0].n;
    const p=(await agente.listarProductos({start:total,limit:30})).products.find(p=>p.productoId===ids[0]);
    assert.ok(p?.marca);assert.equal(p.images[0].url,'/archivos/productos/zz-25.jpg');
    assert.equal(p.marca.imagen.costo,undefined);assert.equal(p.marca.imagen.secreto,undefined);
    assert.ok(products.length);
    await imagenes.quitar(m.id);
    assert.deepEqual(await fs.readdir(path.join(carpeta,'marcas')),[]);
  });
  test('subida corrupta no cambia la foto anterior; fallo de bitácora revierte y limpia',async()=>{
    const m=await crear(),primera=await imagenes.asignar(m.id,{buffer:foto});
    await assert.rejects(imagenes.asignar(m.id,{buffer:Buffer.from('<html>no</html>')}),e=>e.status===400);
    await c.query(`CREATE FUNCTION pg_temp.zz_fallo_marca() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ZZ fallo marca'; END $$`);
    await c.query(`CREATE TRIGGER zz_fallo_marca BEFORE INSERT ON bitacora_cambio FOR EACH ROW WHEN (NEW.entidad='marca_catalogo') EXECUTE FUNCTION pg_temp.zz_fallo_marca()`);
    await assert.rejects(imagenes.asignar(m.id,{buffer:foto}),/ZZ fallo marca/);
    assert.deepEqual((await servicio.listar(sub)).marcas[0].imagen,primera.imagen);
    assert.equal((await fs.readdir(path.join(carpeta,'marcas'))).length,1);
  });
  test('retirar marca conserva sus productos, con clasificación liberada',async()=>{
    const m=await crear();await servicio.eliminar(m.id);
    const lista=await servicio.listar(sub);
    assert.equal(lista.productos.length,3);assert.ok(lista.productos.every(p=>p.marca_catalogo_id===null));
  });
  test('migración repetible conserva productos y agrupaciones',async()=>{
    const m=await crear();
    const sql=(await fs.readFile(path.resolve(__dirname,'../migrations/independencia/064_marcas_catalogo.sql'),'utf8')).replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
    await c.query(sql);await c.query(sql);
    assert.equal((await servicio.listar(sub)).marcas[0].id,m.id);
  });
});
