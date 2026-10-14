/** Compra revisada en pantalla; PostgreSQL con ROLLBACK y WhatsApp simulado. */
const { test,before,after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool,c,f,s,bodega,reportes,wa,env,motor,db,envios,ultimo;
const caso = (nombre,fn) => test(nombre,{ skip:!activo },async () => {
  await c.query('SAVEPOINT envio_reporte_caso'); envios=0;
  wa.enviarDocumento=async d=>{envios++;ultimo=d;return {enviado:true,numero:d.telefono,via:'interno'}};
  try { await fn() } finally { await c.query('ROLLBACK TO SAVEPOINT envio_reporte_caso') }
});
if(activo) {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
  before(async()=>{
    pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL});c=await pool.connect();await c.query('BEGIN');f=await sembrar(c);
    db=baseEnTransaccion(c,'envio_reporte');const conectar=db.pool.connect;
    db.pool.connect=async()=>{const cl=await conectar(),q=cl.query;cl.query=(sql,p)=>sql.startsWith('SET TRANSACTION')?Promise.resolve({rows:[]}):q(sql,p);return cl};
    const ruta=require.resolve('../config/database');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:db};
    require('../config/aislado').salidasBloqueadas=()=>false;
    wa=require('../src/integrations/whatsapp');bodega=require('../src/modules/warehouse/bodegaPropia');
    s=require('../src/modules/orders-whatsapp/envioDesdeReporte.service');env=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');motor=require('../src/modules/orders-whatsapp/ordenesCiclo.service');
    reportes=new(require('../src/modules/reports/report.service'))();
  });
  after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
}
const guardar=(i,q,n=0)=>bodega.registrarFaltantes(f.facturas[n],[{producto_id:f.productos[i],cantidad_faltante:q,tipo_faltante:'parcial'}]);
async function reporte(fechaInicio=null){const r=await reportes.getMissingItemsBySupplier(fechaInicio,{db,incluirEnviadas:false});assert.equal(r.success,true,r.error);return r.data.find(p=>p.cedula===f.p.identificacion)}
async function pedido(fechaInicio=null){const p=await reporte(fechaInicio);return {fechaInicio,clave:randomUUID(),proveedorId:f.p.id,cedula:p.cedula,nombre:p.nombre,revisionReporte:p.revisionReporte,preferirDatosProveedor:true,
  productos:p.productos_faltantes.map(l=>({productoId:l.producto_id,cantidad:Math.ceil(l.cantidad_faltante/Number(l.factor_conversion)),cantidadOriginal:l.cantidad_faltante,factorConversion:Number(l.factor_conversion)}))}}
caso('persiste PDF revisado y manda al WhatsApp de ficha con mensaje predeterminado',async()=>{
  await guardar(0,10);const datos=await pedido();datos.productos[0].cantidad=7;datos.productos[0].cantidadOriginal=7;
  const r=await s.enviar(datos);assert.equal(r.envioEstado,'confirmado');assert.equal(envios,1);assert.equal(ultimo.telefono,'50688888888');
  assert.match(ultimo.mensaje,new RegExp(r.orden.referencia));assert.match(ultimo.mensaje,/productos, cantidades y disponibilidad/);
  assert.equal(r.orden.lineas[0].cantidad_proveedor,7);assert.equal(r.orden.lineas[0].origenes.reduce((t,o)=>t+Number(o.cantidad),0),7);
  assert.deepEqual(ultimo.pdf,(await env.descargar(r.orden.id,datos.clave)).pdf);
});
caso('misma clave tras respuesta perdida no reenvía; distinto cuerpo con esa clave se rechaza',async()=>{
  await guardar(0,10);const datos=await pedido(),r=await s.enviar(datos);const copia=await env.descargar(r.orden.id,datos.clave);
  assert.deepEqual(await s.enviar(datos),r);assert.equal(envios,1);
  await assert.rejects(s.enviar({...datos,productos:[{...datos.productos[0],cantidad:3,cantidadOriginal:3}]}),e=>e.status===409);
  assert.deepEqual((await env.descargar(r.orden.id,datos.clave)).pdf,copia.pdf);assert.equal(envios,1);
});
caso('A10 enviada y nuevo A3: reporte3 y otra orden; fotografía/PDF anteriores idénticos',async()=>{
  await guardar(0,10);const primera=await s.enviar(await pedido()),pdf=await env.descargar(primera.orden.id,primera.orden.envio_id);
  await guardar(0,3,1);assert.equal((await reporte()).productos_faltantes[0].cantidad_faltante,3);
  const segunda=await s.enviar(await pedido());assert.notEqual(segunda.orden.id,primera.orden.id);assert.equal(segunda.orden.lineas[0].cantidad_proveedor,3);
  assert.deepEqual(await motor.obtener(primera.orden.id),primera.orden);assert.deepEqual((await env.descargar(primera.orden.id,primera.orden.envio_id)).pdf,pdf.pdf);assert.equal(envios,2);
});
caso('transporte incierto bloquea reintento; nueva factura conserva orden independiente',async()=>{
  await guardar(0,10);const datos=await pedido();wa.enviarDocumento=async()=>{envios++;throw Error('ZZ respuesta perdida')};
  const r=await s.enviar(datos);assert.equal(r.envioEstado,'incierto');assert.equal((await s.enviar(datos)).envioEstado,'incierto');assert.equal(envios,1);
  await guardar(0,3,1);assert.equal((await reporte()).productos_faltantes[0].cantidad_faltante,3);
  wa.enviarDocumento=async d=>{envios++;return {enviado:true,numero:d.telefono,via:'interno'}};
  const n=await s.enviar(await pedido());assert.notEqual(n.orden.id,r.orden.id);assert.equal(n.orden.lineas[0].cantidad_proveedor,3);assert.equal(envios,2);
});
caso('reporte o conversión cambiados se rechazan antes de preparar/envíar',async()=>{
  await guardar(0,10);const datos=await pedido(),antes=await motor.listar({proveedorId:f.p.id});await guardar(1,5);
  await assert.rejects(s.enviar(datos),e=>e.status===409);assert.equal(envios,0);
  const actual=await pedido(),o=await motor.obtener(antes[0].id);actual.productos[0].factorConversion=6;
  await assert.rejects(s.enviar(actual),e=>e.status===409);assert.deepEqual(await motor.obtener(o.id),o);assert.equal(envios,0);
});
caso('sin teléfono único se rechaza sin preparar PDF ni alterar borrador',async()=>{
  await guardar(0,10);const datos=await pedido(),antes=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id);
  await c.query("UPDATE proveedor SET telefono_whatsapp='88888888 / 87777777' WHERE id=$1",[f.p.id]);
  await assert.rejects(s.enviar(datos),e=>e.status===409);assert.deepEqual(await motor.obtener(antes.id),antes);assert.equal(envios,0);
});
caso('extra manual deriva conversión del proveedor sin inventar cliente/origen',async()=>{
  await guardar(0,10);await c.query('UPDATE supplier_product_mapping SET factor_conversion=6 WHERE producto_id=$1',[f.productos[2]]);
  const datos=await pedido();datos.productos.push({agregadoManual:true,productoId:f.productos[2],cantidadOriginal:8});
  const r=await s.enviar(datos),l=r.orden.lineas.find(l=>l.producto_id===f.productos[2]);assert.equal(l.cantidad_proveedor,2);assert.equal(Number(l.cantidad_propia),12);assert.equal(Number(l.factor_conversion),6);assert.deepEqual(l.origenes,[]);
});
caso('confirmado retira temporales revisados y conserva ediciones concurrentes',async()=>{
  await guardar(0,10);await c.query("INSERT INTO orden_compra_temporal(proveedor_nombre,producto_codigo,producto_nombre,cantidad_original,cantidad_modificada) VALUES($1,'ZZ1','ZZ revisada',10,7),($1,'ZZ2','ZZ concurrente',10,8)",[f.p.nombre]);
  wa.enviarDocumento=async d=>{envios++;await c.query("UPDATE orden_compra_temporal SET cantidad_modificada=3,updated_at=updated_at+interval '1 second' WHERE proveedor_nombre=$1 AND producto_codigo='ZZ2'",[f.p.nombre]);return {enviado:true,numero:d.telefono,via:'interno'}};
  await s.enviar(await pedido());const filas=(await c.query('SELECT producto_codigo,cantidad_modificada FROM orden_compra_temporal WHERE proveedor_nombre=$1',[f.p.nombre])).rows;
  assert.deepEqual(filas,[{producto_codigo:'ZZ2',cantidad_modificada:3}]);
});
caso('fallo de bitácora revierte edición y PDF, sin tocar transporte',async()=>{
  await guardar(0,10);const datos=await pedido(),o=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id),q=c.query;
  c.query=function(sql,p){if(String(sql).includes('INSERT INTO bitacora_cambio')&&p?.includes('revisar_reporte'))throw Error('ZZ bitácora fallida');return q.call(this,sql,p)};
  try{await assert.rejects(s.enviar(datos),/ZZ bitácora fallida/)}finally{c.query=q}
  assert.deepEqual(await motor.obtener(o.id),o);assert.equal(envios,0);
});

caso('código/nombre cambiados con el mismo mapping exigen actualizar lo revisado',async()=>{
  await guardar(0,10);const datos=await pedido(),o=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id);
  await c.query("UPDATE supplier_product_mapping SET supplier_code='ZZ cambiado' WHERE producto_id=$1",[f.productos[0]]);
  await assert.rejects(s.enviar(datos),e=>e.status===409);assert.deepEqual(await motor.obtener(o.id),o);assert.equal(envios,0);
  const nuevo=await pedido();await c.query("UPDATE producto SET nombre='ZZ nombre cambiado' WHERE id=$1",[f.productos[0]]);
  await assert.rejects(s.enviar(nuevo),e=>e.status===409);assert.equal(envios,0);
});

caso('fecha filtrada compra sólo orígenes visibles; el faltante anterior queda independiente',async()=>{
  await c.query("UPDATE factura SET fecha='2026-10-01' WHERE id=$1",[f.facturas[0]]);
  await guardar(0,10);await guardar(0,3,1);
  const r=await s.enviar(await pedido('2026-10-12'));assert.equal(r.orden.lineas[0].cantidad_proveedor,3);
  assert.deepEqual(r.orden.lineas[0].origenes.map(o=>o.factura_id),[f.facturas[1]]);
  assert.equal((await reporte()).productos_faltantes[0].cantidad_faltante,10);
});
caso('fallo conocido anterior al transporte permite nuevo intento explícito con otra clave',async()=>{
  await guardar(0,10);wa.enviarDocumento=async()=>{envios++;const e=Error('ZZ canal no iniciado');e.envioNoIniciado=true;throw e};
  const datos=await pedido(),r=await s.enviar(datos);assert.equal(r.envioEstado,'no_enviado');
  assert.equal((await s.enviar(datos)).envioEstado,'no_enviado');assert.equal(envios,1);
  wa.enviarDocumento=async d=>{envios++;return {enviado:true,numero:d.telefono,via:'interno'}};
  const n=await s.enviar({...datos,clave:randomUUID()});assert.equal(n.envioEstado,'confirmado');assert.equal(n.orden.id,r.orden.id);assert.equal(envios,2);
});
caso('POST directo exige Reporte Proveedores y entrega contrato de la interfaz por HTTP',async()=>{
  await guardar(0,10);const datos=await pedido(),actor=(await c.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ envío HTTP','ZZ sin login') RETURNING id",['zz-'+randomUUID()])).rows[0].id;
  const express=require('express'),app=express();app.use(express.json());
  app.use('/api',require('../src/modules/auth/auth.middleware').requireAuth);
  app.use('/api',require('../src/modules/usuarios/permisos.middleware').requirePermiso);
  app.use('/api/orden-compra',require('../src/modules/orders-whatsapp/orders-whatsapp.routes'));
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});
  const token=require('jsonwebtoken').sign({sub:actor},process.env.JWT_SECRET,{expiresIn:'5m'}),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const pedir=()=>fetch(`http://127.0.0.1:${server.address().port}/api/orden-compra/Proveedor/Enviar/`,{method:'POST',headers,body:JSON.stringify(datos)});
  try{
    assert.equal((await pedir()).status,403);assert.equal(envios,0);
    await c.query("INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,'reporte-proveedores')",[actor]);
    const respuesta=await pedir();assert.equal(respuesta.status,200);const cuerpo=await respuesta.json();assert.equal(cuerpo.success,true);assert.equal(cuerpo.data.envioEstado,'confirmado');assert.equal(envios,1);
    assert.equal((await pedir()).status,200);assert.equal(envios,1);
  }finally{await new Promise(r=>server.close(r))}
});

caso('cantidades manuales fraccionarias se rechazan conservando borrador y PDF',async()=>{
  await guardar(0,10);await c.query('UPDATE supplier_product_mapping SET factor_conversion=.01 WHERE producto_id=$1',[f.productos[2]]);
  const datos=await pedido();datos.productos.push({agregadoManual:true,productoId:f.productos[2],cantidadOriginal:.07});
  const antes=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id);
  await assert.rejects(s.enviar(datos),e=>e.status===400);assert.equal(envios,0);assert.deepEqual(await motor.obtener(antes.id),antes);
});

caso('borradores históricos separados se reúnen al enviar sin reservas ocultas ni borrar historia',async()=>{
  await guardar(0,10);let primera=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id);
  primera=await motor.cambiarEstado(primera.id,{version:primera.version,estado:'pendiente_enviar'});
  primera=await env.preparar(primera.id,{version:primera.version,clave:randomUUID(),telefono:'88888888',mensaje:`ZZ ${primera.referencia}`});
  const bytes=await env.descargar(primera.id,primera.envios[0].id);
  await c.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula) VALUES($1,$2,5,'parcial','pendiente',$3,$4)",[f.facturas[1],f.productos[1],f.p.nombre,f.p.identificacion]);
  const segunda=await motor.crear({clave:randomUUID(),proveedorId:f.p.id,cicloId:f.ciclo,lineas:[{productoId:f.productos[1],cantidadProveedor:5}]});
  const r=await s.enviar(await pedido());assert.equal(r.orden.id,segunda.id);assert.equal(envios,1);
  assert.deepEqual(new Map(r.orden.lineas.map(l=>[l.producto_id,l.cantidad_proveedor])),new Map([[f.productos[0],10],[f.productos[1],5]]));
  const anterior=await motor.obtener(primera.id);assert.equal(anterior.estado,'cerrada');assert.deepEqual(anterior.lineas,primera.lineas);assert.deepEqual((await env.descargar(primera.id,primera.envios[0].id)).pdf,bytes.pdf);
});

caso('mapeo con más de seis decimales muestra y guarda la misma conversión',async()=>{
  await guardar(0,1);await c.query('UPDATE supplier_product_mapping SET factor_conversion=$2 WHERE producto_id=$1',[f.productos[0],1/3]);
  const datos=await pedido();assert.equal(datos.productos[0].factorConversion,.333333);
  const r=await s.enviar(datos);assert.equal(r.envioEstado,'confirmado');assert.equal(Number(r.orden.lineas[0].factor_conversion),.333333);
});
caso('temporales congelados no contaminan el pedido nuevo; fallo no iniciado permite recuperarlos',async()=>{
  await guardar(0,10);await require('../src/modules/orders-whatsapp/temporalesProveedor.service').guardarCantidades([{proveedor_nombre:f.p.nombre,producto_codigo:`id:${f.productos[0]}`,producto_id:f.productos[0],producto_nombre:'ZZ revisado',cantidad_original:10,cantidad_modificada:7}]);
  const temporales=new(require('../src/modules/orders-whatsapp/orders-whatsapp.service'))();
  const visibles=async()=> (await temporales.getCantidadesModificadas()).modificadas.filter(t=>t.proveedor_nombre===f.p.nombre);
  const datos=await pedido();datos.productos[0].cantidad=7;datos.productos[0].cantidadOriginal=7;
  wa.enviarDocumento=async()=>{envios++;assert.equal((await visibles()).length,0,'enviando ya está separado del próximo pedido');const e=Error('ZZ no inició');e.envioNoIniciado=true;throw e};
  assert.equal((await s.enviar(datos)).envioEstado,'no_enviado');const [guardada]=await visibles();assert.equal(guardada.producto_id,f.productos[0]);assert.equal(guardada.cantidad_modificada,7);
  wa.enviarDocumento=async()=>{envios++;throw Error('ZZ incierto')};
  assert.equal((await s.enviar({...datos,clave:randomUUID()})).envioEstado,'incierto');assert.equal((await visibles()).length,0);
  assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_temporal WHERE proveedor_nombre=$1',[f.p.nombre])).rows[0].n,0);
});
caso('incertidumbre anterior al filtro conserva prueba exacta fuera de la lista visible',async()=>{
  await guardar(0,10);wa.enviarDocumento=async()=>{envios++;throw Error('ZZ incierto fuera de fecha')};
  const datos=await pedido(),r=await s.enviar(datos);
  await c.query("UPDATE factura SET fecha=CURRENT_DATE+1 WHERE id=$1",[f.facturas[1]]);await guardar(0,3,1);
  const fecha=(await c.query("SELECT (CURRENT_DATE+1)::text fecha")).rows[0].fecha;
  const reporteCompleto=await reportes.getMissingItemsBySupplier(fecha,{db});assert.equal(reporteCompleto.success,true,reporteCompleto.error);
  assert.equal(reporteCompleto.data.some(p=>p.orden_id===r.orden.id),false);
  const actual=reporteCompleto.data.find(p=>p.cedula===f.p.identificacion && !p.enviada);
  assert.equal(actual.productos_faltantes[0].cantidad_faltante,3);
  assert.deepEqual(actual.comprobacionEnvios,[{orden_id:r.orden.id,envio_id:datos.clave,enviada:true,estado_envio:'incierto'}]);
});
caso('saldo de conversión fraccional más un extra entero no redondea demanda ni inventa clientes',async()=>{
  await c.query('UPDATE supplier_product_mapping SET factor_conversion=.3 WHERE producto_id=$1',[f.productos[0]]);await guardar(0,10);
  let o=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id);
  o=await motor.editar(o.id,{version:o.version,lineas:[{productoId:f.productos[0],cantidadProveedor:11}]});
  o=await motor.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'});
  o=await env.preparar(o.id,{version:o.version,clave:randomUUID(),telefono:'88888888',mensaje:`ZZ ${o.referencia}`});
  await env.enviar(o.id,o.envios[0].id,{confirmar:true});
  const actual=await reporte();assert.equal(actual.productos_faltantes[0].cantidad_faltante,6.7);
  const datos=await pedido();datos.productos[0].cantidadOriginal=9.7;datos.productos[0].cantidadAdicional=3;datos.productos[0].cantidad=33;
  const r=await s.enviar(datos);assert.equal(r.orden.lineas[0].cantidad_proveedor,33);assert.equal(r.orden.lineas[0].origenes.reduce((t,o)=>t+Number(o.cantidad),0),6.7);
});
caso('saldo 0.14 más extra entero1 se compara con aritmética exacta al enviar',async()=>{
  await c.query('UPDATE supplier_product_mapping SET factor_conversion=.43 WHERE producto_id=$1',[f.productos[0]]);await guardar(0,1);
  let o=await motor.obtener((await motor.listar({proveedorId:f.p.id}))[0].id);
  o=await motor.editar(o.id,{version:o.version,lineas:[{productoId:f.productos[0],cantidadProveedor:2}]});
  o=await motor.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'});
  o=await env.preparar(o.id,{version:o.version,clave:randomUUID(),telefono:'88888888',mensaje:`ZZ ${o.referencia}`});
  await env.enviar(o.id,o.envios[0].id,{confirmar:true});
  assert.equal((await reporte()).productos_faltantes[0].cantidad_faltante,.14);
  const datos=await pedido();datos.productos[0].cantidadOriginal=1.14;datos.productos[0].cantidadAdicional=1;datos.productos[0].cantidad=3;
  const r=await s.enviar(datos);assert.equal(r.orden.lineas[0].cantidad_proveedor,3);
  assert.equal(r.orden.lineas[0].origenes.reduce((t,o)=>t+Number(o.cantidad),0),.14);
});
