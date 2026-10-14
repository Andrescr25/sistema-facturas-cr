/** Órdenes persistentes y reservas: PostgreSQL propio, nunca datos compartidos. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const activo=process.env.PROBAR_BASE_LOCAL==='1';
let c,pool,s,rutas,clientes,proveedor,ruta,otra,cliente,actual,proximo,producto,segundo,docs;
const zz=n=>`ZZ órdenes ${n} ${randomUUID().slice(0,8)}`;
const caso=(n,f)=>test(n,{skip:!activo},async()=>{
  await c.query('SAVEPOINT caso_orden');try{await f()}finally{await c.query('ROLLBACK TO SAVEPOINT caso_orden')}
});
if(activo){
  require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
  const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});
  let nivel=0;const q=(sql,p)=>c.query(sql,p);
  const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{pool:{query:q,connect:async()=>{
    const sp=`oc_${++nivel}`;return {query:(sql,p)=>sql==='BEGIN'?q(`SAVEPOINT ${sp}`):sql==='COMMIT'?q(`RELEASE SAVEPOINT ${sp}`):sql==='ROLLBACK'?q(`ROLLBACK TO SAVEPOINT ${sp}`):q(sql,p),release(){}}
  }}}};
  s=require('../src/modules/orders-whatsapp/ordenesCiclo.service');rutas=require('../src/modules/rutas/rutas.service');clientes=require('../src/modules/clientes/clientes.service');
  before(async()=>{
    c=await pool.connect();await c.query('BEGIN');
    ruta=await rutas.crearRuta({nombre:zz('ruta')});otra=await rutas.crearRuta({nombre:zz('otra')});
    cliente=await clientes.crearCliente({nombre:zz('cliente'),ruta_id:ruta.id});
    actual=await rutas.crearCiclo(ruta.id,{semana:'2026-10-12'});proximo=await rutas.crearCiclo(ruta.id,{semana:'2026-10-19'});
    proveedor=(await c.query('INSERT INTO proveedor(nombre,identificacion) VALUES($1,$2) RETURNING *',[zz('proveedor'),randomUUID().slice(0,18)])).rows[0];
    producto=(await c.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id',[zz('A'),'ZZ-COD-REPETIDO'])).rows[0].id;
    segundo=(await c.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id',[zz('B'),'ZZ-COD-REPETIDO'])).rows[0].id;
    docs=[];
    for(const [cy,p,q] of [[actual,producto,6],[actual,producto,4],[proximo,producto,4],[null,producto,2],[actual,segundo,3]]){
      const rc=cy?(await c.query('SELECT id FROM ciclo_ruta_cliente WHERE ciclo_id=$1 AND cliente_id=$2',[cy.id,cliente.id])).rows[0].id:null;
      const f=(await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,preventa_anticipada)
        VALUES($1,'emitida','2026-10-05',$2,$3,$4,$5) RETURNING id`,[zz('FAC'),cliente.id,cliente.nombre,rc,cy?.id===proximo.id])).rows[0].id;
      await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
        VALUES($1,1,$2,'ZZ Pedido',$3::numeric,1,$3::numeric)`,[f,p,q]);
      const id=(await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula)
        VALUES($1,$2,$3,'parcial','pendiente',$4,$5) RETURNING id`,[f,p,q,proveedor.nombre,proveedor.identificacion])).rows[0].id;
      docs.push({id,f,p,q});
    }
  });
  after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
const crear=(q=10,extra={})=>s.crear({proveedorId:proveedor.id,cicloId:actual.id,clave:randomUUID(),lineas:[{productoId:producto,cantidadProveedor:q}],...extra});
const sugerir=(cicloId=actual.id)=>s.sugerir({proveedorId:proveedor.id,cicloId});
caso('sugerencia es lectura y separa semanas e históricos sin deducir ruta',async()=>{
  const huella=async()=>(await c.query("SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) h FROM faltantes f")).rows[0].h,antes=await huella();
  const a=await sugerir(),b=await sugerir(proximo.id),v=await sugerir('sin-ciclo');
  assert.equal(a.productos.find(p=>p.productoId===producto).disponible,10);assert.equal(b.productos[0].disponible,4);assert.equal(v.productos[0].disponible,2);
  assert.equal(v.ciclo,null);assert.equal(await huella(),antes);
  await assert.rejects(sugerir(''),e=>e.status===400);
});
caso('orden guarda origen por factura y no cambia al mover cliente/ruta/proveedor',async()=>{
  const o=await crear();assert.equal(o.estado,'borrador');assert.equal(o.lineas[0].cantidad_propia,10);
  assert.deepEqual(o.lineas[0].origenes.map(r=>r.factura_id),[docs[0].f,docs[1].f]);
  await clientes.editarCliente(cliente.id,{ruta_id:otra.id});await c.query('UPDATE proveedor SET nombre=$2 WHERE id=$1',[proveedor.id,zz('renombrado')]);
  const n=await s.obtener(o.id);assert.equal(n.proveedor_nombre,proveedor.nombre);assert.equal(n.ciclo.rutaNombre,ruta.nombre);assert.equal(n.ciclo.semana,'2026-10-12');
  assert.ok(n.lineas[0].origenes.every(r=>r.cliente_nombre===cliente.nombre));
});
caso('dos códigos iguales se guardan como dos productos propios',async()=>{
  const o=await crear(10,{lineas:[{productoId:producto,cantidadProveedor:10},{productoId:segundo,cantidadProveedor:3}]});
  assert.equal(o.lineas.length,2);assert.deepEqual(new Set(o.lineas.map(l=>l.producto_id)),new Set([producto,segundo]));
});
caso('reintento de creación conserva id; misma clave con otra cantidad rechaza',async()=>{
  const datos={proveedorId:proveedor.id,cicloId:actual.id,clave:randomUUID(),lineas:[{productoId:producto,cantidadProveedor:10}]};
  const a=await s.crear(datos),b=await s.crear(datos);assert.equal(a.id,b.id);
  await assert.rejects(s.crear({...datos,lineas:[{productoId:producto,cantidadProveedor:11}]}),e=>e.status===409);
});
caso('reserva de 10 evita otro borrador de 10; necesidad nueva propone solo 3',async()=>{
  const o=await crear();assert.equal((await sugerir()).productos.find(p=>p.productoId===producto).disponible,0);
  await assert.rejects(crear(),e=>e.status===409);
  await c.query('UPDATE faltantes SET cantidad_faltante=cantidad_faltante+3 WHERE id=$1',[docs[1].id]);
  const p=(await sugerir()).productos.find(p=>p.productoId===producto);assert.equal(p.reservada,10);assert.equal(p.disponible,3);assert.equal(p.cantidadSugerida,3);
  const nueva=await crear(3);assert.notEqual(nueva.id,o.id);assert.equal((await s.obtener(o.id)).lineas[0].cantidad_proveedor,10);
  assert.equal(nueva.lineas[0].origenes[0].cantidad,3);
});
caso('guardar revisión reduce reserva; añade/quita productos dentro del mismo ciclo',async()=>{
  const o=await crear();const n=await s.editar(o.id,{version:o.version,lineas:[{productoId:producto,cantidadProveedor:7},{productoId:segundo,cantidadProveedor:3}]});
  assert.equal(n.version,2);assert.equal(n.lineas.length,2);
  assert.equal((await sugerir()).productos.find(p=>p.productoId===producto).disponible,3);
  const fin=await s.editar(n.id,{version:n.version,lineas:[{productoId:segundo,cantidadProveedor:3}]});assert.equal(fin.lineas.length,1);
  assert.equal((await sugerir()).productos.find(p=>p.productoId===producto).disponible,10);
});
caso('revisión obsoleta no pisa cambios ni reservas',async()=>{
  const o=await crear();await s.editar(o.id,{version:o.version,lineas:[{productoId:producto,cantidadProveedor:8}]});
  await assert.rejects(s.editar(o.id,{version:o.version,lineas:[{productoId:producto,cantidadProveedor:6}]}),e=>e.status===409);
  assert.equal((await s.obtener(o.id)).lineas[0].cantidad_proveedor,8);
});
caso('pendiente no es enviada; bloquea líneas en API y SQL hasta volver a borrador',async()=>{
  const o=await crear(),p=await s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'});assert.equal(p.estado,'pendiente_enviar');
  await assert.rejects(s.editar(p.id,{version:p.version,lineas:[{productoId:producto,cantidadProveedor:3}]}),e=>e.status===409);
  await c.query('SAVEPOINT sql_protegido');await assert.rejects(c.query('UPDATE orden_compra_ciclo_linea SET cantidad_proveedor=3 WHERE orden_id=$1',[o.id]),/borrador/);await c.query('ROLLBACK TO SAVEPOINT sql_protegido');
  await assert.rejects(s.cambiarEstado(p.id,{version:p.version,estado:'enviada'}),e=>e.status===400);
  const b=await s.cambiarEstado(p.id,{version:p.version,estado:'borrador'});assert.equal(b.estado,'borrador');
  assert.equal((await s.editar(b.id,{version:b.version,lineas:[{productoId:producto,cantidadProveedor:9}]})).lineas[0].cantidad_proveedor,9);
});
caso('bodega corrige faltante y revisión detecta necesidad disminuida',async()=>{
  const o=await crear();await c.query('UPDATE faltantes SET cantidad_faltante=2 WHERE id=$1',[docs[0].id]);
  await assert.rejects(s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'}),e=>e.status===409);
  assert.equal((await s.obtener(o.id)).estado,'borrador');
  const n=await s.editar(o.id,{version:o.version,lineas:[{productoId:producto,cantidadProveedor:6}]});
  assert.equal((await s.cambiarEstado(n.id,{version:n.version,estado:'pendiente_enviar'})).estado,'pendiente_enviar');
});
caso('anular factura obliga a revisar el borrador',async()=>{
  const o=await crear();await c.query("UPDATE factura SET estado='anulada' WHERE id=$1",[docs[0].f]);
  await assert.rejects(s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'}),e=>e.status===409);
});
caso('reasignar proveedor no vuelve a ofrecer cantidades reservadas ni libera la orden anterior',async()=>{
  const o=await crear();const p=(await c.query('INSERT INTO proveedor(nombre,identificacion) VALUES($1,$2) RETURNING *',[zz('otro proveedor'),randomUUID().slice(0,18)])).rows[0];
  await c.query('UPDATE faltantes SET proveedor_asignado=$2,proveedor_cedula=$3 WHERE id=ANY($1)',[[docs[0].id,docs[1].id],p.nombre,p.identificacion]);
  const r=await s.sugerir({proveedorId:p.id,cicloId:actual.id});assert.equal(r.productos[0].disponible,0);assert.equal(r.productos[0].reservada,10);
  await assert.rejects(crear(10,{proveedorId:p.id}),e=>e.status===409);
  await assert.rejects(s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'}),e=>e.status===409);
});
caso('cerrar sin enviar libera reserva con motivo y conserva líneas/procedencia',async()=>{
  const o=await crear();await assert.rejects(s.cambiarEstado(o.id,{version:o.version,estado:'cerrada'}),e=>e.status===400);
  const fin=await s.cambiarEstado(o.id,{version:o.version,estado:'cerrada',motivo:'ZZ Cambio de plan'});assert.equal(fin.lineas.length,1);assert.ok(fin.cerrada_en);
  assert.equal((await sugerir()).productos.find(p=>p.productoId===producto).disponible,10);
  assert.equal((await s.listar({cicloId:actual.id,proveedorId:proveedor.id})).length,0);
  assert.equal((await s.listar({cicloId:actual.id,proveedorId:proveedor.id,vista:'historial'}))[0].id,o.id);
  await assert.rejects(s.cambiarEstado(fin.id,{version:fin.version,estado:'borrador'}),e=>e.status===409);
});
caso('factor 0,02 convierte sin duplicar unidades y conserva snapshot al editar',async()=>{
  await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,$3,'ZZ-PACK','ZZ Caja','','',$4,$5,0.02)`,[randomUUID(),proveedor.nombre,proveedor.identificacion,producto,proveedor.id]);
  assert.equal((await sugerir()).productos.find(p=>p.productoId===producto).cantidadSugerida,500);
  const o=await crear(125);assert.equal(o.lineas[0].cantidad_propia,2.5);assert.equal(o.lineas[0].origenes[0].cantidad,2.5);
  await c.query('UPDATE supplier_product_mapping SET factor_conversion=12 WHERE producto_id=$1',[producto]);
  const n=await s.editar(o.id,{version:o.version,lineas:[{productoId:producto,cantidadProveedor:200}]});assert.equal(n.lineas[0].cantidad_propia,4);assert.equal(n.lineas[0].factor_conversion,0.02);
  await c.query('DELETE FROM supplier_product_mapping WHERE producto_id=$1',[producto]);
  const fin=await s.editar(n.id,{version:n.version,lineas:[{productoId:producto,cantidadProveedor:250}]});
  assert.equal(fin.lineas[0].cantidad_propia,5);assert.equal(fin.lineas[0].codigo_proveedor,'ZZ-PACK');assert.equal(fin.lineas[0].mapping_id,n.lineas[0].mapping_id);
});
caso('cajas redondean hacia arriba; el excedente no cubre otra semana',async()=>{
  await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,$3,'ZZ-PACK','ZZ Caja','','',$4,$5,6)`,[randomUUID(),proveedor.nombre,proveedor.identificacion,producto,proveedor.id]);
  assert.equal((await sugerir()).productos.find(p=>p.productoId===producto).cantidadSugerida,2);
  const o=await crear(2);assert.equal(o.lineas[0].cantidad_propia,12);assert.equal(o.lineas[0].origenes.reduce((s,r)=>s+r.cantidad,0),10);
  assert.equal((await sugerir(proximo.id)).productos[0].disponible,4);
});
caso('producto sin necesidad, ids/cantidades inválidos y ciclos cerrados rechazan sin residuos',async()=>{
  for(const q of [true,0,-1,1.5,[],1000001]) await assert.rejects(crear(q),e=>e.status===400);
  await assert.rejects(crear(10,{lineas:[{productoId:producto,cantidadProveedor:10},{productoId:producto,cantidadProveedor:1}]}),e=>e.status===400);
  await assert.rejects(crear(1,{lineas:[{productoId:999999999,cantidadProveedor:1}]}),e=>e.status===409);
  await rutas.cambiarEstadoCiclo(actual.id,{estado:'cancelado',estadoAnterior:'preventa'});
  await assert.rejects(crear(),e=>e.status===409);
  assert.equal((await s.listar({proveedorId:proveedor.id})).length,0);
});
caso('listado filtra por ruta/semana/Sin ciclo y combinaciones incompatibles',async()=>{
  const a=await crear(),b=await crear(4,{cicloId:proximo.id}),v=await crear(2,{cicloId:'sin-ciclo'});
  assert.equal((await s.listar({cicloId:actual.id}))[0].id,a.id);
  assert.equal((await s.listar({cicloId:proximo.id}))[0].id,b.id);
  assert.equal((await s.listar({cicloId:'sin-ciclo'}))[0].id,v.id);
  assert.equal((await s.listar({rutaId:ruta.id,proveedorId:proveedor.id})).length,2);
  assert.deepEqual(await s.listar({rutaId:ruta.id,cicloId:'sin-ciclo'}),[]);
  for(const id of ['1 OR 1=1',{},[],true])await assert.rejects(s.listar({cicloId:id}),e=>e.status===400);
});
caso('SQL conserva identidad/capacidad y admite procedencia de otra semana sin reclasificar la orden',async()=>{
  const o=await crear();
  for(const sql of ['UPDATE orden_compra_ciclo SET ciclo_id=$2,version=version+1 WHERE id=$1','DELETE FROM orden_compra_ciclo WHERE id=$1']){
    await c.query('SAVEPOINT sql_invalido');await assert.rejects(c.query(sql,sql.includes('$2')?[o.id,proximo.id]:[o.id]));await c.query('ROLLBACK TO SAVEPOINT sql_invalido');
  }
  await c.query('SAVEPOINT sql_invalido');await assert.rejects(c.query(`INSERT INTO orden_compra_ciclo_origen(linea_id,faltante_id,factura_id,factura_numero,cliente_id,cliente_nombre,anticipado,cantidad)
    VALUES($1,$2,$3,'ZZ inválida',$4,'ZZ',false,1)`,[o.lineas[0].id,docs[2].id,docs[2].f,cliente.id]),/procedencia supera la cantidad propia/);await c.query('ROLLBACK TO SAVEPOINT sql_invalido');
  // La semana no es una restricción comercial; con capacidad e identidad
  // correctas el origen nuevo entra sin cambiar la cabecera histórica.
  await c.query('DELETE FROM orden_compra_ciclo_origen WHERE id=$1',[o.lineas[0].origenes[0].id]);
  await c.query('SAVEPOINT sql_invalido');await assert.rejects(c.query(`INSERT INTO orden_compra_ciclo_origen(linea_id,faltante_id,factura_id,factura_numero,cliente_id,cliente_nombre,anticipado,cantidad)
    VALUES($1,$2,$3,'ZZ identidad equivocada',$4,'ZZ',false,1)`,[o.lineas[0].id,docs[2].id,docs[0].f,cliente.id]),/producto\/factura\/cliente/);await c.query('ROLLBACK TO SAVEPOINT sql_invalido');
  await c.query(`INSERT INTO orden_compra_ciclo_origen(linea_id,faltante_id,factura_id,factura_numero,cliente_id,cliente_nombre,anticipado,cantidad)
    VALUES($1,$2,$3,'ZZ otra semana',$4,'ZZ',true,1)`,[o.lineas[0].id,docs[2].id,docs[2].f,cliente.id]);
  const n=await s.obtener(o.id);assert.equal(n.ciclo.id,actual.id);assert.equal(n.lineas[0].origenes.length,2);assert.ok(n.lineas[0].origenes.some(r=>r.faltante_id===docs[2].id));
});
caso('fallo de una segunda línea revierte líneas, reservas y bitácora de la revisión',async()=>{
  const o=await crear(),antes=await s.obtener(o.id);
  await assert.rejects(s.editar(o.id,{version:o.version,lineas:[{productoId:producto,cantidadProveedor:7},{productoId:999999999,cantidadProveedor:1}]}),e=>e.status===409);
  assert.deepEqual(await s.obtener(o.id),antes);
});
caso('un resto de una millonésima requiere una caja; no se pierde por redondear el cociente',async()=>{
  const m=randomUUID();
  await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,$3,'ZZ-PACK','ZZ Caja','','',$4,$5,3.333333)`,[m,proveedor.nombre,proveedor.identificacion,producto,proveedor.id]);
  await crear(3);await c.query('UPDATE supplier_product_mapping SET factor_conversion=1000000 WHERE id=$1',[m]);
  const p=(await sugerir()).productos.find(p=>p.productoId===producto);assert.equal(p.cantidadSugerida,1);
  const n=await crear(1);assert.equal(n.lineas[0].origenes.length,1);assert.equal(n.lineas[0].origenes[0].cantidad,0.000001);
});
// Las dos conexiones necesitan ver las mismas filas COMMIT. Solo se crean
// fixtures ZZ en la base tachi_codex_*; se retira la base completa al cerrar.
async function conDosConexiones(f) {
  const seed=await pool.connect();let proveedorId,cicloId,pid;
  try{
    await seed.query('BEGIN');
    const rid=(await seed.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING id',[zz('concurrente')])).rows[0].id;
    const cid=(await seed.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING id',[zz('concurrente')])).rows[0].id;
    cicloId=(await seed.query("INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) SELECT id,nombre,'2026-10-26' FROM ruta_cliente WHERE id=$1 RETURNING id",[rid])).rows[0].id;
    const rc=(await seed.query("INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,1,'ZZ Concurrente') RETURNING id",[cicloId,cid])).rows[0].id;
    await seed.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[cicloId]);
    const p=(await seed.query('INSERT INTO proveedor(nombre,identificacion) VALUES($1,$2) RETURNING *',[zz('concurrente'),randomUUID().slice(0,18)])).rows[0];proveedorId=p.id;
    pid=(await seed.query('INSERT INTO producto(nombre) VALUES($1) RETURNING id',[zz('concurrente')])).rows[0].id;
    const fid=(await seed.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id) VALUES($1,'emitida','2026-10-05',$2,'ZZ concurrente',$3) RETURNING id",[zz('concurrente'),cid,rc])).rows[0].id;
    await seed.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ',10,1,10)",[fid,pid]);
    await seed.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula) VALUES($1,$2,10,'parcial','pendiente',$3,$4)",[fid,pid,p.nombre,p.identificacion]);
    await seed.query('COMMIT');
  }catch(e){await seed.query('ROLLBACK');throw e}finally{seed.release()}
  const pathDb=require.resolve('../config/database'),pathS=require.resolve('../src/modules/orders-whatsapp/ordenesCiclo.service'),antesDb=require.cache[pathDb],antesS=require.cache[pathS];
  require.cache[pathDb]={id:pathDb,filename:pathDb,loaded:true,exports:{pool}};delete require.cache[pathS];
  try{const n=require(pathS);await f(n,{proveedorId,cicloId,lineas:[{productoId:pid,cantidadProveedor:10}]})}
  finally{require.cache[pathDb]=antesDb;require.cache[pathS]=antesS}
}
caso('dos operadores compiten por 10: solo un borrador reserva el faltante',async()=>conDosConexiones(async(n,datos)=>{
  const resultados=await Promise.allSettled([n.crear({...datos,clave:randomUUID()}),n.crear({...datos,clave:randomUUID()})]);
  assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);assert.equal(resultados.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await n.listar({proveedorId:datos.proveedorId})).length,1);
}));
caso('dos reintentos simultáneos con la misma clave devuelven la misma orden',async()=>conDosConexiones(async(n,datos)=>{
  const cuerpo={...datos,clave:randomUUID()},[a,b]=await Promise.all([n.crear(cuerpo),n.crear(cuerpo)]);assert.equal(a.id,b.id);
  assert.equal((await n.listar({proveedorId:datos.proveedorId})).length,1);
}));
