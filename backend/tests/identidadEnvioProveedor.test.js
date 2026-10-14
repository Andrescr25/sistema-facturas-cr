/** Compra revisada en pantalla; PostgreSQL con ROLLBACK y WhatsApp simulado. */
const { test,before,after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
let pool,c,f,s,reportes,wa,motor,db,envios,ultimo;
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
    wa=require('../src/integrations/whatsapp');
    s=require('../src/modules/orders-whatsapp/envioDesdeReporte.service');motor=require('../src/modules/orders-whatsapp/ordenesCiclo.service');
    reportes=new(require('../src/modules/reports/report.service'))();
  });
  after(async()=>{if(c){await c.query('ROLLBACK');c.release()}await pool?.end()});
}
const pedidoDe=p=>({clave:randomUUID(),cedula:p.cedula,nombre:p.nombre,revisionReporte:p.revisionReporte,
  productos:p.productos_faltantes.map(l=>({productoId:l.producto_id,cantidad:Math.ceil(l.cantidad_faltante/l.factor_conversion),cantidadOriginal:l.cantidad_faltante,factorConversion:l.factor_conversion}))});
async function asignadoSinCedula(cedula=null){await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula)
  VALUES($1,$2,6,'parcial','pendiente',$3,$4)`,[f.facturas[0],f.productos[0],f.p.nombre,cedula]);}
async function pendientePorNombre(){const r=await reportes.getMissingItemsBySupplier(null,{db,incluirEnviadas:false});assert.equal(r.success,true,r.error);return r.data.find(p=>p.nombre===f.p.nombre && !p.cedula);}

for(const cedula of [null,'','SIN_PROVEEDOR'])caso(`asignación antigua ${String(cedula)} conserva clave pública y envía con la ficha identificada`,async()=>{
  await asignadoSinCedula(cedula);const p=await pendientePorNombre();
  assert.equal(p.id,f.p.nombre.toUpperCase());assert.equal(p.cedula,null);assert.equal(p.nombre,f.p.nombre);assert.equal(p.proveedor_id,undefined);
  const r=await s.enviar(pedidoDe(p));assert.equal(r.envioEstado,'confirmado');assert.equal(envios,1);
  assert.equal(r.orden.proveedor_id,f.p.id);assert.equal(r.orden.proveedor_cedula,f.p.identificacion);
  assert.equal(r.orden.lineas[0].cantidad_proveedor,6);assert.deepEqual(r.orden.lineas[0].origenes.map(o=>o.factura_id),[f.facturas[0]]);
});
caso('ficha sin cédula y mapping con nombre histórico muestran y envían la misma conversión',async()=>{
  await c.query('UPDATE proveedor SET identificacion=NULL WHERE id=$1',[f.p.id]);
  await c.query("UPDATE supplier_product_mapping SET supplier_name='ZZ nombre anterior',factor_conversion=2 WHERE producto_id=$1",[f.productos[0]]);
  await asignadoSinCedula();const p=await pendientePorNombre(),l=p.productos_faltantes[0];assert.equal(l.factor_conversion,2);assert.ok(l.mapping_id);
  const r=await s.enviar(pedidoDe(p));assert.equal(r.envioEstado,'confirmado');assert.equal(envios,1);
  assert.equal(r.orden.lineas[0].cantidad_proveedor,3);assert.equal(Number(r.orden.lineas[0].factor_conversion),2);assert.equal(r.orden.lineas[0].mapping_id,l.mapping_id);
});
caso('asignaciones por nombre y por cédula conservan sus claves y envían sólo sus orígenes visibles',async()=>{
  await asignadoSinCedula();await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula)
    VALUES($1,$2,3,'parcial','pendiente',$3,$4)`,[f.facturas[1],f.productos[0],f.p.nombre,f.p.identificacion]);
  const r=await reportes.getMissingItemsBySupplier(null,{db,incluirEnviadas:false}),nombre=r.data.find(p=>p.nombre===f.p.nombre && !p.cedula),cedula=r.data.find(p=>p.cedula===f.p.identificacion);
  assert.equal(nombre.id,f.p.nombre.toUpperCase());assert.equal(cedula.id,f.p.identificacion);
  const una=await s.enviar(pedidoDe(nombre));assert.equal(una.orden.lineas[0].cantidad_proveedor,6);assert.deepEqual(una.orden.lineas[0].origenes.map(o=>o.factura_id),[f.facturas[0]]);
  const dos=await s.enviar(pedidoDe(cedula));assert.equal(dos.orden.lineas[0].cantidad_proveedor,3);assert.deepEqual(dos.orden.lineas[0].origenes.map(o=>o.factura_id),[f.facturas[1]]);assert.equal(envios,2);
});
caso('nombre homónimo no identifica el faltante sin cédula ni consume reservas de otra ficha',async()=>{
  const otra=(await c.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'87777777') RETURNING id",[f.p.nombre,randomUUID().slice(0,18)])).rows[0].id;
  await asignadoSinCedula();const p=await pendientePorNombre();assert.equal(p.productos_faltantes[0].mapping_id,null);
  const necesidades=await motor.interno.necesidadesEn(db,f.p,null,null,{sinCiclos:true});assert.equal(necesidades.some(x=>x.productoId===f.productos[0]),false);
  await assert.rejects(s.enviar(pedidoDe(p)),e=>e.status===409 && /varias fichas/.test(e.message));assert.equal(envios,0);
  const filas=(await c.query('SELECT proveedor_asignado,proveedor_cedula FROM faltantes WHERE factura_propia_id=$1',[f.facturas[0]])).rows;
  assert.deepEqual(filas,[{proveedor_asignado:f.p.nombre,proveedor_cedula:null}]);
  assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo WHERE proveedor_id=ANY($1::int[])',[[f.p.id,otra]])).rows[0].n,0);
});
caso('nombre homónimo con cédulas distintas conserva productos, conversiones y destinatarios separados',async()=>{
  const otra=(await c.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'87777777') RETURNING *",[f.p.nombre,randomUUID().slice(0,18)])).rows[0];
  await c.query(`INSERT INTO supplier_product_mapping(supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,'ZZ otro código','ZZ otro producto','','',$3,$4,3)`,[otra.nombre,otra.identificacion,f.productos[0],otra.id]);
  for(const [i,p] of [f.p,otra].entries())await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula)
    VALUES($1,$2,6,'parcial','pendiente',$3,$4)`,[f.facturas[i],f.productos[0],p.nombre,p.identificacion]);
  const r=await reportes.getMissingItemsBySupplier(null,{db,incluirEnviadas:false}),propia=r.data.find(p=>p.cedula===f.p.identificacion),ajena=r.data.find(p=>p.cedula===otra.identificacion);
  assert.deepEqual(propia.productos_faltantes[0].origenes.map(o=>o.facturaId),[f.facturas[0]]);assert.deepEqual(ajena.productos_faltantes[0].origenes.map(o=>o.facturaId),[f.facturas[1]]);
  const una=await s.enviar(pedidoDe(propia));assert.equal(una.orden.proveedor_id,f.p.id);assert.equal(ultimo.telefono,'50688888888');assert.equal(una.orden.lineas[0].cantidad_proveedor,6);
  const dos=await s.enviar(pedidoDe(ajena));assert.equal(dos.orden.proveedor_id,otra.id);assert.equal(ultimo.telefono,'50687777777');assert.equal(dos.orden.lineas[0].cantidad_proveedor,2);assert.equal(envios,2);
});
