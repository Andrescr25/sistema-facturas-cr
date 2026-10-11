/** PostgreSQL desechable, historial fijo y lectura sin cambios comerciales. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const activo=process.env.PROBAR_BASE_LOCAL==='1';
const caso=(nombre,fn)=>test(nombre,{skip:!activo},fn),zz=n=>`ZZ entregas ${n} ${randomUUID().slice(0,8)}`;
let pool,c,service,rutas,clientes,ruta,otra,actual,proximo,miembros,producto,docs,pedido,consultas=[];
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:1});let nivel=0;
 const query=async(sql,p)=>{consultas.push(String(sql));
  // El envoltorio exterior conserva los fixtures no confirmados. PostgreSQL
  // ejecuta todas las consultas; solo el sobre de lectura usa SAVEPOINT.
  if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')return{rows:[]};
  return c.query(sql,p);
 };
 const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{query,pool:{query,connect:async()=>{
  const sp=`entrega_${++nivel}`;return{query:(sql,p)=>sql==='BEGIN'?query(`SAVEPOINT ${sp}`):sql==='COMMIT'?query(`RELEASE SAVEPOINT ${sp}`):sql==='ROLLBACK'?query(`ROLLBACK TO SAVEPOINT ${sp}`):query(sql,p),release(){}};
 }}}};
 service=require('../src/modules/entregas/entregas.service');rutas=require('../src/modules/rutas/rutas.service');clientes=require('../src/modules/clientes/clientes.service');
 before(async()=>{
  c=await pool.connect();await c.query('BEGIN');ruta=await rutas.crearRuta({nombre:zz('Ruta')});otra=await rutas.crearRuta({nombre:zz('Otra')});miembros=[];
  for(const nombre of ['A','B','C','D'])miembros.push(await clientes.crearCliente({nombre:zz(nombre),ruta_id:ruta.id,ubicacion_maps:nombre==='A'?'https://maps.app.goo.gl/ZZPrueba':null}));
  actual=await rutas.crearCiclo(ruta.id,{semana:'2026-10-12'});proximo=await rutas.crearCiclo(ruta.id,{semana:'2026-10-19'});
  producto=(await c.query("INSERT INTO producto(nombre,referencia) VALUES($1,'ZZ-REF') RETURNING id",[zz('Producto')])).rows[0].id;
  docs=[];
  for(const [cy,idx,estado,anticipado]of [[actual,2,'pendiente',false],[actual,1,'procesado',false],[actual,0,'procesado',true],[actual,0,'pendiente',false],[proximo,0,'procesado',true],[actual,1,'pendiente',false],[null,0,'procesado',false],[null,null,'pendiente',false]]){
   const cl=idx==null?null:miembros[idx],rc=cy?cy.clientes.find(x=>x.cliente_id===cl.id).id:null;
   const f=(await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,preventa_anticipada,estado_bodega)
     VALUES($1,$2,'2000-01-01',$3,$4,$5,$6,$7) RETURNING id`,[zz('FAC'),docs.length===5?'anulada':'emitida',cl?.id||null,cl?.nombre||zz('Sin ficha'),rc,anticipado,estado])).rows[0].id;
   await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,referencia,descripcion,cantidad,precio_unitario,total)
     VALUES($1,1,$2,'ZZ Producto','ZZ-REF','ZZ nota',3,99,297)`,[f,producto]);docs.push(f);
  }
  await c.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado) VALUES($1,$2,1,'parcial','pendiente')",[docs[2],producto]);
  const rc=actual.clientes.find(x=>x.cliente_id===miembros[3].id).id;
  pedido=(await c.query(`INSERT INTO pedido_cliente(cliente_id,cliente_nombre,estado,ciclo_ruta_cliente_id,preventa_anticipada,origen)
    VALUES($1,$2,'pendiente',$3,TRUE,'agente') RETURNING id`,[miembros[3].id,miembros[3].nombre,rc])).rows[0].id;
  await c.query("INSERT INTO pedido_cliente_linea(pedido_id,producto_id,nombre_producto,referencia,cantidad,precio_unitario) VALUES($1,$2,'ZZ Pedido','ZZ-PED',2,77)",[pedido,producto]);
  const cp=(await c.query(`INSERT INTO cliente_portal(usuario,nombre,password_hash,cliente_id)
    VALUES($1,$2,'ZZ no login',$3) RETURNING id`,[zz('portal'),miembros[0].nombre,miembros[0].id])).rows[0].id;
  await c.query(`INSERT INTO pedido_cliente(cliente_id,cliente_nombre,estado,ciclo_ruta_cliente_id,origen,factura_id,cliente_portal_id)
    VALUES($1,$2,'facturado',$3,'portal',$4,$5),($1,$2,'rechazado',$3,'agente',NULL,NULL)`,[miembros[0].id,miembros[0].nombre,actual.clientes[0].id,docs[2],cp]);
  await clientes.editarCliente(miembros[0].id,{ruta_id:otra.id,nombre:zz('Nombre nuevo'),ubicacion_maps:'https://maps.app.goo.gl/ZZNuevo'});
 });
 after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
const plan=(extra={})=>service.plan({cicloId:actual.id,...extra});
caso('clientes/documentos siguen las paradas fijas aunque se creen en orden inverso',async()=>{
 const r=await plan();assert.deepEqual(r.paradas.map(x=>x.ciclo.orden),[1,2,3,4]);assert.equal(r.resumen.facturas,4);assert.equal(r.resumen.paradas,4);
 assert.equal(r.paradas[0].documentos.length,2);assert.equal(r.paradas[2].documentos[0].id,docs[0]);
});
caso('carga inversa solo incluye revisión de bodega, sin afirmar entrega ni carga',async()=>{
 const r=await plan();assert.deepEqual(r.carga.map(x=>x.ciclo.orden),[2,1]);assert.deepEqual(r.carga.map(x=>x.ordenCarga),[1,2]);
 assert.equal(r.carga[1].facturas.length,1);assert.equal(r.carga[1].facturas[0].id,docs[2]);assert.equal(r.carga[1].facturas[0].faltantes,1);
 assert.ok(r.carga.every(x=>x.facturas.every(f=>f.revisionBodega)));assert.equal(r.resumen.revisadas,2);
});
caso('carga considera toda la ruta aunque se pagine por una parada',async()=>{
 const a=await plan({tamano:1,pagina:1}),b=await plan({tamano:1,pagina:2});assert.equal(a.paradas[0].ciclo.orden,1);assert.equal(b.paradas[0].ciclo.orden,2);
 assert.deepEqual(a.carga,b.carga);assert.deepEqual(a.carga.map(x=>x.pagina),[2,1]);assert.equal(a.paginacion.paginas,4);assert.equal((await plan({tamano:1,pagina:5})).paradas.length,0);
});
caso('cambiar ruta/nombre/Maps del maestro conserva el contexto del recorrido',async()=>{
 const r=await plan({rutaId:ruta.id}),p=r.paradas[0];assert.equal(p.clienteNombre,miembros[0].nombre);assert.equal(p.ubicacion_maps,'https://maps.app.goo.gl/ZZPrueba');
 assert.equal(p.ciclo.rutaId,ruta.id);assert.equal(p.ciclo.semana,'2026-10-12');assert.equal((await plan({rutaId:otra.id})).paradas.length,0);
});
caso('semanas actual/próxima de la misma ruta no mezclan pedidos ni carga',async()=>{
 const r=await service.plan({rutaId:ruta.id,cicloId:proximo.id});assert.equal(r.paradas.length,1);assert.equal(r.paradas[0].documentos[0].id,docs[4]);
 assert.equal(r.carga.length,1);assert.equal(r.resumen.facturas,1);assert.equal(r.resumen.pedidosSinFacturar,0);
 const a=await plan();assert.ok(a.paradas.every(p=>p.documentos.every(d=>d.id!==docs[4]||d.tipo!=='factura')));
});
caso('pedido anticipado pendiente aparece por facturar, nunca en sugerencia de carga',async()=>{
 const r=await plan(),p=r.paradas[3];assert.equal(r.resumen.pedidosSinFacturar,1);assert.equal(p.documentos[0].id,pedido);assert.equal(p.documentos[0].anticipado,true);
 assert.equal(p.documentos[0].revisionBodega,false);assert.equal(p.documentos[0].origen,'agente');assert.ok(r.carga.every(c=>c.clave!==p.clave));
 const d=await service.parada(p.clave,{cicloId:actual.id});assert.equal(d.documentos[0].lineas[0].cantidad,2);
});
caso('pedido ya facturado no duplica documento; rechazado/anulada no participan',async()=>{
 const r=await plan(),f=r.paradas[0].documentos.find(d=>d.id===docs[2]);assert.ok(f.pedidoId);assert.equal(f.origen,'portal');
 assert.equal(r.resumen.pedidosSinFacturar,1);assert.ok(r.paradas.every(p=>p.documentos.every(d=>d.tipo!=='factura'||d.id!==docs[5])));
});
caso('detalle solo abre la parada del ciclo seleccionado; ids ajenos dan 404',async()=>{
 const r=await plan(),d=await service.parada(r.paradas[0].clave,{cicloId:actual.id});assert.equal(d.documentos.length,2);assert.equal(d.documentos[0].lineas[0].nombre,'ZZ Producto');
 assert.equal(d.documentos[0].lineas[0].cantidad,3);assert.equal(d.documentos[0].lineas[0].descripcion,'ZZ nota');
 await assert.rejects(service.parada(r.paradas[0].clave,{cicloId:proximo.id}),e=>e.status===404);
 await assert.rejects(service.parada(r.paradas[0].clave,{cicloId:actual.id,rutaId:otra.id}),e=>e.status===404);
});
caso('Sin ciclo conserva históricos separados, sin deducir Maps ni carga del maestro',async()=>{
 const r=await service.plan({cicloId:'sin-ciclo'}),p=await service.parada(`cl-${miembros[0].id}`,{cicloId:'sin-ciclo'});
 assert.equal(p.ciclo,null);assert.equal(p.ubicacion_maps,null);assert.equal(r.carga.length,0);
 const anonimo=await service.parada(`f-${docs[7]}`,{cicloId:'sin-ciclo'});assert.equal(anonimo.documentos[0].id,docs[7]);
 assert.equal((await service.plan({cicloId:'sin-ciclo',rutaId:ruta.id})).paradas.length,0);
 await assert.rejects(service.parada(p.clave,{cicloId:actual.id}),e=>e.status===404);
});
caso('ciclo explícito obligatorio y filtros/paginación estrictos',async()=>{
 for(const datos of [{},{cicloId:''},{cicloId:'1e2'},{cicloId:2147483648},{cicloId:actual.id,rutaId:0},{cicloId:actual.id,pagina:'2x'},{cicloId:actual.id,pagina:true},{cicloId:actual.id,tamano:51}])await assert.rejects(service.plan(datos),e=>e.status===400);
 await assert.rejects(service.plan({cicloId:2147483647}),e=>e.status===404);
 for(const k of ['rc-0','rc-1x','cl-1;DELETE','rc-2147483648'])await assert.rejects(service.parada(k,{cicloId:actual.id}),e=>e.status===400);
});
caso('selector/plan/detalle no exponen precios, saldos, costos ni cuenta de portal',async()=>{
 const r=await plan(),d=await service.parada(r.paradas[0].clave,{cicloId:actual.id});
 for(const p of [...r.paradas,d])for(const doc of p.documentos){for(const campo of ['total','precio','costo','saldo','cliente_portal_id','correo'])assert.equal(doc[campo],undefined);for(const l of doc.lineas||[])assert.deepEqual(Object.keys(l).sort(),['cantidad','descripcion','nombre','productoId','referencia'].sort())}
});
caso('plan/detalle preservan doce tablas y no ejecutan escrituras',async()=>{
 const huellas=async()=>{const r={};for(const t of ['factura','factura_linea','pedido_cliente','pedido_cliente_linea','faltantes','faltantes_ajustes','inventario_saldo','movimiento_inventario','cliente','ciclo_ruta','ciclo_ruta_cliente','serie_consecutivo'])r[t]=(await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;return r};
 const antes=await huellas();consultas=[];const r=await plan();await service.parada(r.paradas[0].clave,{cicloId:actual.id});assert.deepEqual(await huellas(),antes);
 assert.ok(consultas.some(s=>/READ ONLY/.test(s)));assert.equal(consultas.some(s=>/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)/i.test(s)),false);
});
caso('ciclo cerrado conserva recorrido/documentos consultables',async()=>{
 await c.query('SAVEPOINT cerrado');try{await c.query("UPDATE ciclo_ruta SET estado='cerrado' WHERE id=$1",[actual.id]);const r=await plan();assert.equal(r.ciclo.estado,'cerrado');assert.equal(r.paradas.length,4)}finally{await c.query('ROLLBACK TO SAVEPOINT cerrado')}
});
test('prefijo de entrega, Maps y selector tienen permiso propio con variantes Express',()=>{
 const {moduloDeRuta,esCompartida}=require('../src/modules/usuarios/modulos');
 for(const p of ['/entregas/plan','/entregas/ciclos','/Entregas/Paradas/rc-1/']){assert.equal(moduloDeRuta(p),'entregas');assert.equal(esCompartida(p),false)}
});
