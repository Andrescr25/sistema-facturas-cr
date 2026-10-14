/** Destino/mensaje exactos antes de confirmar; PostgreSQL local y transporte simulado. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {sembrar}=require('./dobles/ordenesAutomaticas');
const {baseEnTransaccion}=require('./dobles/buzonEnTransaccion');
const activo=process.env.PROBAR_BASE_LOCAL==='1';
let pool,c,f,s,motor,env,wa,reportes,db,transportes,salidaBloqueada=false,ultimo;
const caso=(nombre,fn)=>test(nombre,{skip:!activo},async()=>{
 await c.query('SAVEPOINT confirmar_caso');transportes=0;salidaBloqueada=false;
 wa.enviarDocumento=async d=>{transportes++;ultimo=d;return{enviado:true,numero:d.telefono,via:'interno'}};
 try{await fn()}finally{await c.query('ROLLBACK TO SAVEPOINT confirmar_caso')}
});
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 before(async()=>{
  pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL});c=await pool.connect();await c.query('BEGIN');f=await sembrar(c);
  db=baseEnTransaccion(c,'confirmar');const connect=db.pool.connect;
  db.pool.connect=async()=>{const cl=await connect(),q=cl.query;cl.query=(sql,p)=>sql.startsWith('SET TRANSACTION')?Promise.resolve({rows:[]}):q(sql,p);return cl};
  const ruta=require.resolve('../config/database');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:db};
  require('../config/aislado').salidasBloqueadas=()=>salidaBloqueada;
  s=require('../src/modules/orders-whatsapp/envioDesdeReporte.service');motor=require('../src/modules/orders-whatsapp/ordenesCiclo.service');env=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');wa=require('../src/integrations/whatsapp');
  reportes=new(require('../src/modules/reports/report.service'))();
 });
 after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
}
async function faltante(q,n=0){return require('../src/modules/warehouse/bodegaPropia').registrarFaltantes(f.facturas[n],[{producto_id:f.productos[0],cantidad_faltante:q,tipo_faltante:'parcial'}])}
async function pedido(){const r=await reportes.getMissingItemsBySupplier(null,{db,incluirEnviadas:false});assert.equal(r.success,true,r.error);const p=r.data.find(p=>p.cedula===f.p.identificacion);
 return{clave:randomUUID(),cedula:p.cedula,nombre:p.nombre,revisionReporte:p.revisionReporte,fechaInicio:null,
  productos:p.productos_faltantes.map(l=>({productoId:l.producto_id,cantidad:Number(l.cantidad_faltante),cantidadOriginal:Number(l.cantidad_faltante),factorConversion:1}))};}
caso('abrir y cancelar sólo prepara; el modal recibe destino y mensaje reales sin transporte',async()=>{
 await faltante(10);const datos=await pedido(),r=await s.revisarEnvio(datos),copia=r.orden.envios.find(e=>e.id===datos.clave);
 assert.equal(transportes,0);assert.equal(r.envioEstado,'revisado');assert.equal(r.orden.envio_id,null);assert.equal(r.orden.enviada_en,null);
 assert.deepEqual(r.destino,{telefono:'50688888888',mensaje:'Hola buenas, adjunto pedido\ngracias'});
 assert.equal(copia.numero,r.destino.telefono);assert.equal(copia.mensaje,r.destino.mensaje);assert.ok((await env.descargar(r.orden.id,datos.clave)).pdf.length>0);
 const actual=await reportes.getMissingItemsBySupplier(null,{db,incluirEnviadas:false});assert.equal(actual.data.find(p=>p.cedula===f.p.identificacion).productos_faltantes[0].cantidad_faltante,10);
 assert.equal((await c.query('SELECT COUNT(*)::int n FROM envio_whatsapp WHERE referencia=$1',[r.orden.referencia])).rows[0].n,0);
});
caso('confirmar reutiliza exactamente número, mensaje, PDF y clave mostrados; respuesta perdida no duplica',async()=>{
 await faltante(10);const datos=await pedido(),r=await s.revisarEnvio(datos),pdf=await env.descargar(r.orden.id,datos.clave);
 await c.query("UPDATE proveedor SET telefono_whatsapp='87777777' WHERE id=$1",[f.p.id]);
 const enviada=await s.enviar(datos);assert.equal(enviada.envioEstado,'confirmado');assert.equal(transportes,1);
 assert.equal(ultimo.telefono,r.destino.telefono);assert.equal(ultimo.mensaje,r.destino.mensaje);assert.deepEqual(ultimo.pdf,pdf.pdf);
 assert.deepEqual(await s.enviar(datos),enviada);assert.equal(transportes,1);
 await assert.rejects(s.enviar({...datos,productos:[{...datos.productos[0],cantidad:3,cantidadOriginal:3}]}),e=>e.status===409);assert.equal(transportes,1);
});
caso('repetir preparación no genera otra copia ni altera la revisión; cancelación permite otra revisión',async()=>{
 await faltante(10);const datos=await pedido(),r=await s.revisarEnvio(datos);
 assert.deepEqual(await s.revisarEnvio(datos),r);assert.equal(transportes,0);
 const segunda=await s.revisarEnvio({...datos,clave:randomUUID()}),antes=await env.descargar(r.orden.id,datos.clave);
 assert.equal(segunda.orden.id,r.orden.id);assert.equal(segunda.orden.envios.length,2);assert.equal(transportes,0);
 await assert.rejects(s.enviar(datos),e=>e.status===409);assert.equal(transportes,0);assert.deepEqual((await env.descargar(r.orden.id,datos.clave)).pdf,antes.pdf);
});
caso('preparación local funciona con salidas bloqueadas pero confirmar no reclama el canal',async()=>{
 await faltante(10);salidaBloqueada=true;const datos=await pedido(),r=await s.revisarEnvio(datos);
 assert.equal(transportes,0);await assert.rejects(s.enviar(datos),e=>e.code==='SALIDA_BLOQUEADA');assert.equal(transportes,0);assert.deepEqual(await motor.obtener(r.orden.id),r.orden);
});
caso('una respuesta final del cliente invalida la confirmación antes del transporte',async()=>{
 await faltante(10);const datos=await pedido(),r=await s.revisarEnvio(datos);
 await c.query("UPDATE faltantes SET estado='procesado' WHERE factura_propia_id=$1",[f.facturas[0]]);
 await assert.rejects(s.enviar(datos),e=>e.status===409);assert.equal(transportes,0);assert.equal((await motor.obtener(r.orden.id)).envio_id,null);
});
caso('un faltante nuevo que cambia el borrador exige volver a revisar sin alterar el PDF anterior',async()=>{
 await faltante(10);const datos=await pedido(),r=await s.revisarEnvio(datos);await faltante(3,1);
 const antes=await env.descargar(r.orden.id,datos.clave);
 await assert.rejects(s.enviar(datos),e=>e.status===409);assert.equal(transportes,0);assert.deepEqual((await env.descargar(r.orden.id,datos.clave)).pdf,antes.pdf);
 const nueva=await pedido(),revision=await s.revisarEnvio(nueva);assert.equal(revision.orden.lineas[0].cantidad_proveedor,13);
 const enviada=await s.enviar(nueva);assert.equal(transportes,1);assert.equal(enviada.orden.lineas[0].cantidad_proveedor,13);
});
caso('HTTP de revisar-envio exige permiso Reporte Proveedores y no manda WhatsApp',async()=>{
 await faltante(10);const datos=await pedido();
 const express=require('express'),app=express();app.use(express.json());app.use((req,res,next)=>{req.usuario={id:21};next()});
 const ruta=require.resolve('../src/modules/usuarios/usuarios.service');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:{permisosDe:async()=>({esAdmin:false,modulos:new Set()})}};
 delete require.cache[require.resolve('../src/modules/usuarios/permisos.middleware')];app.use('/api',require('../src/modules/usuarios/permisos.middleware').requirePermiso);
 app.use('/api/orden-compra',require('../src/modules/orders-whatsapp/orders-whatsapp.routes'));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/orden-compra/proveedor/revisar-envio`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(datos)});assert.equal(res.status,403);assert.equal(transportes,0)}finally{await new Promise(r=>server.close(r))}
});
