/** Bodega → compras, PostgreSQL desechable; transporte exclusivamente simulado. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1',zz=n=>`ZZ automático ${n} ${randomUUID().slice(0,8)}`;
let pool,c,bodega,s,auto,resumen,env,wa,f;
const caso=(n,fn)=>test(n,{skip:!activo},async()=>{await c.query('SAVEPOINT caso_auto');try{await fn()}finally{await c.query('ROLLBACK TO SAVEPOINT caso_auto')}});
async function sembrar(db){
 const p=(await db.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'88888888') RETURNING *",[zz('proveedor'),randomUUID().slice(0,18)])).rows[0];
 const r=(await db.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *',[zz('ruta')])).rows[0];
 const cl=(await db.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING *',[zz('cliente')])).rows[0];
 const ciclo=(await db.query("INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,$2,'2026-10-12') RETURNING id",[r.id,r.nombre])).rows[0].id;
 const rc=(await db.query('INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,1,$3) RETURNING id',[ciclo,cl.id,cl.nombre])).rows[0].id;
 await db.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[ciclo]);
 const productos=[],facturas=[];
 for(const nombre of ['A','B','C']){
  const id=(await db.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id',[zz(nombre),zz(nombre)])).rows[0].id;productos.push(id);
  await db.query(`INSERT INTO supplier_product_mapping(supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
   VALUES($1,$2,$3::text,$3::text,'','',$4,$5,1)`,[p.nombre,p.identificacion,`ZZ-${nombre}`,id,p.id]);
 }
 for(let n=0;n<2;n++){
  const id=(await db.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,total) VALUES($1,'emitida','2026-10-13',$2,$3,$4,100) RETURNING id",[zz('FAC'),cl.id,cl.nombre,rc])).rows[0].id;facturas.push(id);
  for(const [i,p] of productos.entries())await db.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,$2,$3,'ZZ',20,1,20)",[id,i+1,p]);
 }
 return{p,ciclo,productos,facturas};
}
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 const {Pool}=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:4});
 before(async()=>{
  c=await pool.connect();await c.query('BEGIN');const db=require.resolve('../config/database');
  const doble=baseEnTransaccion(c,'auto'),conectar=doble.pool.connect;
  doble.pool.connect=async()=>{const cliente=await conectar(),query=cliente.query;cliente.query=(sql,params)=>sql.startsWith('SET TRANSACTION')?Promise.resolve({rows:[]}):query(sql,params);return cliente};
  require.cache[db]={id:db,filename:db,loaded:true,exports:doble};
  bodega=require('../src/modules/warehouse/bodegaPropia');s=require('../src/modules/orders-whatsapp/ordenesCiclo.service');auto=require('../src/modules/orders-whatsapp/ordenesAutomaticas.service');resumen=require('../src/modules/orders-whatsapp/comprasProveedores.service');
  wa=require('../src/integrations/whatsapp');wa.enviarDocumento=async d=>({enviado:true,numero:d.telefono,via:'interno'});
  require('../config/aislado').salidasBloqueadas=()=>false;env=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');f=await sembrar(c);
 });
 after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
const guardar=(lineas,factura=f.facturas[0])=>bodega.registrarFaltantes(factura,lineas.map(([i,q])=>({producto_id:f.productos[i],cantidad_faltante:q,tipo_faltante:'parcial'})));
const lista=()=>s.listar({proveedorId:f.p.id,cicloId:f.ciclo});
const obtener=async()=>s.obtener((await lista())[0].id);
async function preparar(o){o=await s.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'});return env.preparar(o.id,{version:o.version,clave:randomUUID(),telefono:'88888888',mensaje:`Orden ${o.referencia}`})}
const enviar=async o=>{o=await preparar(o);return env.enviar(o.id,o.envios[0].id,{confirmar:true})};
caso('A10/B5 enviados → C8/A3 en nueva orden; anterior y PDF idénticos',async()=>{
 await guardar([[0,10],[1,5]]);const original=await obtener();assert.deepEqual(original.lineas.map(l=>l.cantidad_proveedor),[10,5]);
 const enviada=await enviar(original),pdf=await env.descargar(enviada.id,enviada.envio_id);
 await guardar([[2,8],[0,3]],f.facturas[1]);const nueva=await obtener();assert.notEqual(nueva.id,enviada.id);assert.equal((await lista()).length,2);
 assert.deepEqual(new Map(nueva.lineas.map(l=>[l.producto_id,l.cantidad_proveedor])),new Map([[f.productos[0],3],[f.productos[2],8]]));assert.deepEqual(await s.obtener(enviada.id),enviada);assert.deepEqual((await env.descargar(enviada.id,enviada.envio_id)).pdf,pdf.pdf);
 const [p]=await resumen.resumen({proveedorId:f.p.id,cicloId:f.ciclo}),a=p.productos.find(p=>p.id===f.productos[0]);assert.equal(a.pendienteEnviar,3);assert.equal(a.pendienteRecibir,10);assert.equal(a.sinOrden,0);
});
caso('borrador acumula nuevos productos y aumenta la cantidad del mismo producto',async()=>{
 await guardar([[0,10]]);const primera=await obtener();await guardar([[0,3],[2,8]],f.facturas[1]);const n=await obtener();assert.equal(n.id,primera.id);assert.equal((await lista()).length,1);assert.equal(n.lineas.find(l=>l.producto_id===f.productos[0]).cantidad_proveedor,13);assert.equal(n.lineas.length,2);
});
caso('pendiente acumula, mantiene estado e invalida la copia anterior conservando sus bytes',async()=>{
 await guardar([[0,10]]);const o=await preparar(await obtener()),copia=o.envios[0];await guardar([[2,8]],f.facturas[1]);const n=await obtener();assert.equal(n.id,o.id);assert.equal(n.estado,'pendiente_enviar');assert.ok(n.version>copia.version_orden);await assert.rejects(env.enviar(n.id,copia.id,{confirmar:true}),e=>e.status===409);assert.equal(n.envios[0].sha256,copia.sha256);
});
caso('faltante de 10 a 13 tras enviar genera solo 3; repetir no cambia ni duplica',async()=>{
 await guardar([[0,10]]);const enviada=await enviar(await obtener());await guardar([[0,13]]);const n=await obtener();assert.equal(n.lineas[0].cantidad_proveedor,3);await guardar([[0,13]]);assert.deepEqual(await obtener(),n);assert.equal((await lista()).length,2);assert.equal((await s.obtener(enviada.id)).lineas[0].cantidad_proveedor,10);
});
caso('revisión manual de 7 se respeta: aumento nuevo 3 deja 10, no repone exclusiones',async()=>{
 await guardar([[0,10]]);let o=await obtener();o=await s.editar(o.id,{version:o.version,lineas:[{productoId:f.productos[0],cantidadProveedor:7}]});await guardar([[0,10]]);assert.deepEqual(await obtener(),o);await guardar([[0,13]]);const n=await obtener();assert.equal(n.lineas[0].cantidad_proveedor,10);assert.equal(n.lineas[0].origenes.reduce((s,r)=>s+r.cantidad,0),10);
 const [p]=await resumen.resumen({proveedorId:f.p.id,cicloId:f.ciclo});assert.equal(p.productos[0].sinOrden,3);
});
caso('cajas aprovechan excedente en borrador; enviada conserva conversión y no cubre lo nuevo',async()=>{
 await c.query('UPDATE supplier_product_mapping SET factor_conversion=6 WHERE producto_id=$1',[f.productos[0]]);await guardar([[0,10]]);let o=await obtener();assert.equal(o.lineas[0].cantidad_proveedor,2);await guardar([[0,1]],f.facturas[1]);o=await obtener();assert.equal(o.lineas[0].cantidad_proveedor,2);assert.equal(o.lineas[0].origenes.reduce((s,r)=>s+r.cantidad,0),11);
 const enviada=await enviar(o);await c.query('UPDATE supplier_product_mapping SET factor_conversion=3 WHERE producto_id=$1',[f.productos[0]]);await guardar([[0,4]],f.facturas[1]);const n=await obtener();assert.equal(n.lineas[0].factor_conversion,3);assert.equal(n.lineas[0].cantidad_proveedor,1);assert.equal((await s.obtener(enviada.id)).lineas[0].factor_conversion,6);
});
caso('envío incierto permanece protegido; nuevos faltantes usan otra orden',async()=>{
 await guardar([[0,10]]);wa.enviarDocumento=async()=>{throw new Error('Simulación')};const incierta=await enviar(await obtener());wa.enviarDocumento=async d=>({enviado:true,numero:d.telefono,via:'interno'});assert.equal(incierta.envios[0].estado,'incierto');await guardar([[0,3]],f.facturas[1]);const n=await obtener();assert.notEqual(n.id,incierta.id);assert.equal(n.lineas[0].cantidad_proveedor,3);assert.deepEqual(await s.obtener(incierta.id),incierta);
});
caso('GET resumen no crea órdenes ni deshace revisión manual',async()=>{
 await guardar([[0,10]]);const o=await obtener();await s.editar(o.id,{version:o.version,lineas:[{productoId:f.productos[0],cantidadProveedor:7}]});const antes=await obtener();await resumen.resumen({cicloId:f.ciclo});await resumen.resumen({cicloId:f.ciclo});assert.deepEqual(await obtener(),antes);assert.equal((await lista()).length,1);
});
caso('sin proveedor guarda el faltante sin inventar la compra',async()=>{
 await c.query('DELETE FROM supplier_product_mapping WHERE producto_id=$1',[f.productos[0]]);await guardar([[0,10]]);assert.equal((await lista()).length,0);const p=await resumen.resumen({cicloId:f.ciclo});assert.equal(p.find(p=>!p.id).productos[0].sinOrden,10);
});
caso('cancelada conserva historia; el próximo faltante genera otra orden',async()=>{
 await guardar([[0,10]]);const o=await obtener();await s.cambiarEstado(o.id,{version:o.version,estado:'cerrada',motivo:'ZZ Cancelación solicitada'});await guardar([[0,3]],f.facturas[1]);const n=await obtener();assert.notEqual(n.id,o.id);assert.equal(n.lineas[0].cantidad_proveedor,3);assert.equal((await s.obtener(o.id)).estado,'cerrada');
});
caso('dos conexiones detectan el mismo faltante y crean una sola orden',async()=>{
 const seed=await pool.connect();let g;try{await seed.query('BEGIN');g=await sembrar(seed);await seed.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula) VALUES($1,$2,10,'parcial','pendiente',$3,$4)",[g.facturas[0],g.productos[0],g.p.nombre,g.p.identificacion]);await seed.query('COMMIT')}finally{seed.release()}
 const trabajar=async()=>{const db=await pool.connect();try{await db.query('BEGIN');const r=await auto.sincronizarEn(db,{proveedorId:g.p.id,cicloId:g.ciclo});await db.query('COMMIT');return r}finally{db.release()}};
 const r=await Promise.all([trabajar(),trabajar()]);assert.deepEqual(r.map(r=>r.ordenes.length).sort(),[0,1]);const filas=(await c.query('SELECT id FROM orden_compra_ciclo WHERE proveedor_id=$1',[g.p.id])).rows;assert.equal(filas.length,1);assert.equal((await c.query('SELECT cantidad_proveedor FROM orden_compra_ciclo_linea WHERE orden_id=$1',[filas[0].id])).rows[0].cantidad_proveedor,10);
});
caso('consulta con READ ONLY/REPEATABLE READ reales no cambia órdenes',async()=>{
 const rutaDb=require.resolve('../config/database'),rutaResumen=require.resolve('../src/modules/orders-whatsapp/comprasProveedores.service');
 const previaDb=require.cache[rutaDb],previaResumen=require.cache[rutaResumen];let verificada=false;
 const db={pool:{connect:async()=>{const cl=await pool.connect(),query=cl.query.bind(cl);return{release:()=>cl.release(),query:async(sql,params)=>{
  const r=await query(sql,params);if(sql.startsWith('SET TRANSACTION')){
   assert.equal((await query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');assert.equal((await query('SHOW transaction_isolation')).rows[0].transaction_isolation,'repeatable read');verificada=true;
  }return r;
 }}}}};
 require.cache[rutaDb]={id:rutaDb,filename:rutaDb,loaded:true,exports:db};delete require.cache[rutaResumen];
 try{const r=await require(rutaResumen).resumen({proveedorId:f.p.id,cicloId:f.ciclo});assert.deepEqual(r,[]);assert.equal(verificada,true)}finally{require.cache[rutaDb]=previaDb;require.cache[rutaResumen]=previaResumen}
});
caso('otra semana conserva su orden independiente, sin mezclar el borrador',async()=>{
 await guardar([[0,10]]);const primera=await obtener();
 const nueva=(await c.query("INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) SELECT ruta_id,ruta_nombre,'2026-10-19' FROM ciclo_ruta WHERE id=$1 RETURNING id",[f.ciclo])).rows[0].id;
 const rc=(await c.query("INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) SELECT $1,cliente_id,orden,cliente_nombre FROM ciclo_ruta_cliente WHERE ciclo_id=$2 RETURNING id",[nueva,f.ciclo])).rows[0].id;
 await c.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[nueva]);
 const factura=(await c.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id) SELECT $1,'emitida','2026-10-19',cliente_id,cliente_nombre,$2 FROM factura WHERE id=$3 RETURNING id",[zz('futura'),rc,f.facturas[0]])).rows[0].id;
 await guardar([[0,3]],factura);const otras=await s.listar({proveedorId:f.p.id,cicloId:nueva});assert.equal(otras.length,1);assert.notEqual(otras[0].id,primera.id);assert.equal((await s.obtener(otras[0].id)).lineas[0].cantidad_proveedor,3);assert.deepEqual(await s.obtener(primera.id),primera);
});
caso('fallo al preparar la orden revierte también faltante y asignación',async()=>{
 const query=c.query;
 c.query=function(sql,params){if(String(sql).includes('INSERT INTO orden_compra_ciclo_linea'))throw new Error('ZZ fallo controlado');return query.call(this,sql,params)};
 try{await assert.rejects(guardar([[0,10]]),/ZZ fallo controlado/)}finally{c.query=query}
 assert.equal((await c.query('SELECT id FROM faltantes WHERE factura_propia_id=$1',[f.facturas[0]])).rows.length,0);assert.equal((await lista()).length,0);
});
caso('asignar proveedor manualmente a un faltante prepara automáticamente su orden',async()=>{
 await c.query('DELETE FROM supplier_product_mapping WHERE producto_id=$1',[f.productos[0]]);await guardar([[0,10]]);assert.equal((await lista()).length,0);
 await require('../src/modules/proveedores/proveedores.asignacion.service').asignarProveedorAProducto({productoId:f.productos[0],proveedorId:f.p.id,cicloId:f.ciclo});
 const o=await obtener();assert.equal(o.lineas[0].cantidad_proveedor,10);assert.equal(o.proveedor_id,f.p.id);
});
