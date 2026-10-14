const {describe,test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {sembrar}=require('./dobles/ordenesAutomaticas');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';

describe('Proveedores simplificado — faltantes originales y órdenes por proveedor',{skip:!activo},()=>{
 let pool,c,f,ordenes,env,reporte,servicio,servidor,url,actor;
 const filtro=()=>({cedula:f.p.identificacion,nombre:f.p.nombre});
 const faltante=(i,q,n=0)=>require('../src/modules/warehouse/bodegaPropia').registrarFaltantes(f.facturas[n],[{producto_id:f.productos[i],cantidad_faltante:q,tipo_faltante:'parcial'}],null,actor);
 const lista=async()=>(await servicio.consultar(filtro())).ordenes;
 const datosReporte=async()=>{const r=await reporte.getMissingItemsBySupplier(null,{asignarProveedores:false});assert.equal(r.success,true);return r.data.find(p=>p.cedula===f.p.identificacion)};
 before(async()=>{
  require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
  pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL});c=await pool.connect();await c.query('BEGIN');f=await sembrar(c);
  actor=(await c.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ simple','ZZ sin login') RETURNING id",['zz-'+randomUUID()])).rows[0].id;
  const db=baseEnTransaccion(c,'simple'),conectar=db.pool.connect;
  db.pool.connect=async()=>{const cl=await conectar(),q=cl.query;cl.query=(sql,p)=>sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'?Promise.resolve({rows:[]}):q(sql,p);return cl};
  const ruta=require.resolve('../config/database');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:db};
  ordenes=require('../src/modules/orders-whatsapp/ordenesCiclo.service');servicio=require('../src/modules/orders-whatsapp/ordenesProveedor.service');
  reporte=new (require('../src/modules/reports/report.service'))();require('../config/aislado').salidasBloqueadas=()=>false;env=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');
  require('../src/integrations/whatsapp').enviarDocumento=async d=>({enviado:true,numero:d.telefono,via:'interno'});require('../config/aislado').salidasBloqueadas=()=>false;
  const app=require('express')();app.use(require('express').json());
  app.use('/api',require('../src/modules/auth/auth.middleware').requireAuth);app.use('/api',require('../src/modules/usuarios/permisos.middleware').requirePermiso);
  app.use('/api/orden-compra',require('../src/modules/orders-whatsapp/orders-whatsapp.routes'));
  servidor=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});url=`http://127.0.0.1:${servidor.address().port}/api/orden-compra/proveedor`;
 });
 after(async()=>{if(servidor)await new Promise(r=>servidor.close(r));if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
 test('semana histórica cerrada no impide preparar y la orden no tiene ciclo',async()=>{
  await c.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE id=$1",[f.ciclo]);await faltante(0,10);
  const [o]=await lista();assert.equal(o.ciclo,null);assert.equal(o.solicitud.sinCiclos,true);assert.equal(o.estado,'borrador');assert.equal((await ordenes.obtener(o.id)).lineas[0].cantidad_proveedor,10);
 });
 test('faltantes y cantidades mantienen el reporte global de main',async()=>{
  const p=await datosReporte();assert.equal(p.nombre,f.p.nombre);assert.equal(p.total_productos,1);assert.equal(p.total_cantidad,10);
  const a=p.productos_faltantes[0];assert.equal(a.producto_id,f.productos[0]);assert.equal(a.cantidad_faltante,10);assert.equal(a.origenes[0].facturaId,f.facturas[0]);assert.equal(a.origenes[0].cicloId,f.ciclo);
 });
 test('enviada10 → nueva factura faltante3 crea otra; anterior/PDF idénticos',async()=>{
  let original=await ordenes.obtener((await lista())[0].id);original=await ordenes.cambiarEstado(original.id,{version:original.version,estado:'pendiente_enviar'},actor);
  original=await env.preparar(original.id,{version:original.version,clave:randomUUID(),telefono:'88888888',mensaje:`ZZ compra simple ${original.referencia}`},actor);
  const enviada=await env.enviar(original.id,original.envios[0].id,{confirmar:true},actor),pdf=(await env.descargar(enviada.id,enviada.envio_id)).pdf;
  await faltante(0,3,1);const ls=await lista();assert.equal(ls.length,2);assert.notEqual(ls[0].id,enviada.id);
  const nueva=await ordenes.obtener(ls[0].id);assert.equal(nueva.lineas[0].cantidad_proveedor,3);assert.equal(nueva.ciclo,null);
  assert.deepEqual(await ordenes.obtener(enviada.id),enviada);assert.deepEqual((await env.descargar(enviada.id,enviada.envio_id)).pdf,pdf);
  assert.equal((await datosReporte()).productos_faltantes[0].cantidad_faltante,13);
  const estado=(await servicio.estados()).find(p=>p.cedula===f.p.identificacion);assert.equal(estado.pendientes,1);assert.equal(estado.veces,1);
 });
 test('consultar/preparar repetidamente no duplican órdenes ni alteran faltantes',async()=>{
  const antes=await lista(),huella=async()=>(await c.query('SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) h FROM faltantes f')).rows[0].h,h=await huella();
  await servicio.consultar(filtro());await servicio.preparar(filtro(),actor);assert.equal((await lista())[0].id,antes[0].id);assert.equal((await lista()).length,2);assert.equal(await huella(),h);
 });
 test('sin ficha o nombre ambiguo rechaza sin inventar identidad',async()=>{
  await assert.rejects(servicio.preparar({nombre:'ZZ no existe'},actor),e=>e.status===409);
  await c.query('INSERT INTO proveedor(nombre) VALUES($1),($1)',['ZZ mismo nombre simple']);await assert.rejects(servicio.consultar({nombre:'ZZ mismo nombre simple'}),e=>e.status===409);
 });
 test('inactivo conserva historia consultable y bloquea preparar compra',async()=>{
  await c.query('UPDATE proveedor SET activo=false WHERE id=$1',[f.p.id]);assert.equal((await servicio.consultar(filtro())).ordenes.length,2);await assert.rejects(servicio.preparar(filtro(),actor),e=>e.status===409);await c.query('UPDATE proveedor SET activo=true WHERE id=$1',[f.p.id]);
 });
 test('rutas propias exigen permiso Reporte Proveedores con variantes Express',async()=>{
  const token=require('jsonwebtoken').sign({sub:actor},process.env.JWT_SECRET,{expiresIn:'5m'}),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const pedir=(ruta,method='GET')=>fetch(url+ruta,{method,headers,...(method==='POST'?{body:JSON.stringify(filtro())}:{})});
  assert.equal((await pedir('/ordenes?cedula='+f.p.identificacion)).status,403);await c.query("INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,'reporte-proveedores')",[actor]);
  assert.equal((await pedir('/ordenes?cedula='+f.p.identificacion)).status,200);assert.equal((await pedir('/estados')).status,200);assert.equal((await pedir('/preparar','POST')).status,200);
  assert.equal((await fetch(url.replace('/proveedor','/Proveedor')+'/Ordenes/?cedula='+f.p.identificacion,{headers})).status,200);
  await c.query('UPDATE usuario SET activo=false WHERE id=$1',[actor]);assert.equal((await pedir('/estados')).status,401);
 });
 test('una abierta previa con semana se reutiliza sin reclasificar sus datos históricos',async()=>{
  const g=await sembrar(c);
  await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula)
    VALUES($1,$2,10,'parcial','pendiente',$3,$4)`,[g.facturas[0],g.productos[0],g.p.nombre,g.p.identificacion]);
  const o=await ordenes.crear({clave:randomUUID(),proveedorId:g.p.id,cicloId:g.ciclo,lineas:[{productoId:g.productos[0],cantidadProveedor:10}]});
  await c.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE id=$1",[g.ciclo]);
  await require('../src/modules/warehouse/bodegaPropia').registrarFaltantes(g.facturas[1],[{producto_id:g.productos[0],cantidad_faltante:3,tipo_faltante:'parcial'}]);
  const nueva=await ordenes.obtener(o.id);assert.equal(nueva.lineas[0].cantidad_proveedor,13);assert.equal(nueva.ciclo.id,g.ciclo);
  assert.deepEqual(nueva.solicitud,o.solicitud);assert.equal((await ordenes.listar({proveedorId:g.p.id})).length,1);
  const preparada=await ordenes.cambiarEstado(nueva.id,{version:nueva.version,estado:'pendiente_enviar'});assert.equal(preparada.estado,'pendiente_enviar');
 });
 test('consulta nueva usa READ ONLY/REPEATABLE READ reales',async()=>{
  const rutas=['../config/database','../src/modules/orders-whatsapp/ordenesCiclo.service','../src/modules/orders-whatsapp/ordenesProveedor.service'].map(require.resolve),previos=rutas.map(p=>require.cache[p]);
  require.cache[rutas[0]]={id:rutas[0],filename:rutas[0],loaded:true,exports:{pool}};rutas.slice(1).forEach(p=>delete require.cache[p]);
  const primerId=(await pool.query('SELECT id FROM proveedor ORDER BY id LIMIT 1')).rows[0].id;
  const connect=pool.connect.bind(pool);let observado=false;
  pool.connect=async()=>{const db=await connect(),q=db.query.bind(db);db.query=async(sql,p)=>{const r=await q(sql,p);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'){
    assert.equal((await q('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');assert.equal((await q('SHOW transaction_isolation')).rows[0].transaction_isolation,'repeatable read');observado=true;
  }return r};const release=db.release.bind(db);db.release=()=>{db.query=q;db.release=release;release()};return db};
  try{const real=require(rutas[2]),r=await real.consultar({proveedorId:primerId});assert.ok(Array.isArray(r.ordenes));assert.equal(observado,true)}finally{pool.connect=connect;rutas.forEach((p,i)=>require.cache[p]=previos[i])}
 });
});
