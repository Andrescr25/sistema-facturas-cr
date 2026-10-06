/** Consulta operativa en clon propio: cantidades/procedencia sin escrituras. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const activo=process.env.PROBAR_BASE_LOCAL==='1';let c,pool,serv,ordenes,envios,facturas,compras,recepcion,fisico,d,wa,original,fechaAnterior=false;
const zz=s=>'ZZ necesidades '+s+' '+randomUUID().slice(0,8);
const caso=(n,fn)=>test(n,{skip:!activo},async()=>{await c.query('SAVEPOINT caso');try{d=await sembrar(c);await fn()}finally{wa.enviarDocumento=original;fechaAnterior=false;await c.query('ROLLBACK TO SAVEPOINT caso')}});
async function sembrar(db,{activar=true}={}){
 const ruta=(await db.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *',[zz('ruta')])).rows[0];
 const cl=(await db.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING *',[zz('cliente')])).rows[0];
 const pr=(await db.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'88888888') RETURNING *",[zz('proveedor'),randomUUID().slice(0,18)])).rows[0];
 const producto=(await db.query("INSERT INTO producto(nombre,referencia) VALUES($1,'ZZ-NEC') RETURNING id",[zz('producto')])).rows[0].id;
 const ciclos=[],faltantes=[],fs=[];
 for(const semana of ['2026-10-12','2026-10-19']){
  const cy=(await db.query('INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,$2,$3) RETURNING id',[ruta.id,ruta.nombre,semana])).rows[0].id;
  const rc=(await db.query('INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,orden,cliente_nombre) VALUES($1,$2,1,$3) RETURNING id',[cy,cl.id,cl.nombre])).rows[0].id;
  await db.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[cy]);ciclos.push(cy);
  for(const q of semana==='2026-10-12'?[6,4]:[4]){
   const f=(await db.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,preventa_anticipada,estado_bodega) VALUES($1,'emitida','2000-01-01',$2,$3,$4,TRUE,'procesado') RETURNING id",[zz('FAC'),cl.id,cl.nombre,rc])).rows[0].id;
   await db.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ Producto',$3::numeric,99,$3::numeric*99)",[f,producto,q]);
   const faltante=(await db.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula) VALUES($1,$2,$3,'parcial','pendiente',$4,$5) RETURNING id",[f,producto,q,pr.nombre,pr.identificacion])).rows[0].id;
   fs.push(f);faltantes.push(faltante);
  }
 }
 if(activar)await db.query("UPDATE ciclo_ruta SET estado='entrega' WHERE id=$1",[ciclos[0]]);
 const cp=(await db.query("INSERT INTO cliente_portal(usuario,nombre,password_hash,cliente_id) VALUES($1,$2,'ZZ no login',$3) RETURNING id",[zz('portal'),cl.nombre,cl.id])).rows[0].id;
 const rc=(await db.query('SELECT id FROM ciclo_ruta_cliente WHERE ciclo_id=$1',[ciclos[0]])).rows[0].id;
 const pedido=(await db.query("INSERT INTO pedido_cliente(cliente_portal_id,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,preventa_anticipada,origen) VALUES($1,$2,$3,$4,TRUE,'portal') RETURNING id",[cp,cl.id,cl.nombre,rc])).rows[0].id;
 await db.query("INSERT INTO pedido_cliente_linea(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario) VALUES($1,$2,'ZZ pedido',3,99)",[pedido,producto]);
 const actor=(await db.query("INSERT INTO usuario(usuario,nombre,password_hash,es_admin) VALUES($1,'ZZ supervisor','ZZ no login',TRUE) RETURNING id",[zz('usuario')])).rows[0].id;
 return{ruta,cl,pr,producto,ciclo:ciclos[0],proximo:ciclos[1],fs,faltantes,pedido,actor};
}
if(activo){
 require('../config/aislado').asegurarBaseLocal();assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
 pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:4});let nivel=0;
 const q=(sql,p)=>{
  // Sólo reloj de fixture para archivo24h: conservar todo el SQL de negocio.
  if(fechaAnterior&&sql.startsWith('INSERT INTO orden_compra_ciclo_recepcion('))sql=sql.replace('observaciones,usuario_id)','observaciones,usuario_id,fecha)').replace('VALUES($1,$2,$3,$4,$5,$6,$7,$8)',"VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP-INTERVAL '2 days')");
  return sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'?Promise.resolve({rows:[]}):c.query(sql,p);
 };
 const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{pool:{query:q,connect:async()=>{const sp='necesidad_'+ ++nivel;return{query:(sql,p)=>sql==='BEGIN'?q('SAVEPOINT '+sp):sql==='COMMIT'?q('RELEASE SAVEPOINT '+sp):sql==='ROLLBACK'?q('ROLLBACK TO SAVEPOINT '+sp):q(sql,p),release(){}}}}}};
 serv=require('../src/modules/reports/necesidades.service');ordenes=require('../src/modules/orders-whatsapp/ordenesCiclo.service');envios=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');facturas=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service');compras=require('../src/modules/compras/compras.service');recepcion=require('../src/modules/orders-whatsapp/ordenesCicloRecepcion.service');fisico=require('../src/modules/entregas/registroFisico.service');
 wa=require('../src/integrations/whatsapp');original=wa.enviarDocumento;
 before(async()=>{c=await pool.connect();await c.query('BEGIN')});after(async()=>{wa.enviarDocumento=original;if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
const vista=(extra={})=>serv.listar({cicloId:d.ciclo,...extra});
const item=async(extra={})=>(await vista({q:'P-'+d.producto,...extra})).productos.find(p=>p.productoId===d.producto);
const n=(p,k)=>Number(p.cantidades[k]);
async function crearOrden({factor=1,q=10,incierto=false,enviar=true}={}){
 await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion) VALUES($1,$2,$3,'ZZ-U','ZZ producto','','',$4,$5,$6)`,[randomUUID(),d.pr.nombre,d.pr.identificacion,d.producto,d.pr.id,factor]);
 let o=await ordenes.crear({proveedorId:d.pr.id,cicloId:d.ciclo,clave:randomUUID(),lineas:[{productoId:d.producto,cantidadProveedor:q}]},d.actor);
 if(!enviar)return o;
 o=await ordenes.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'},d.actor);o=await envios.preparar(o.id,{version:o.version,clave:randomUUID(),telefono:'88888888',mensaje:'ZZ orden de pruebas '+o.referencia},d.actor);
 wa.enviarDocumento=async doc=>{if(incierto)throw Error('ZZ respuesta perdida');return{enviado:true,numero:doc.telefono,via:'interno'}};
 return envios.enviar(o.id,o.envios[0].id,{confirmar:true},d.actor);
}
async function compraVinculada(o,{cantidad=10,factor=1}={}){
 const id=randomUUID(),clave=String(Date.now())+String(Math.floor(Math.random()*1e9)).padStart(9,'0')+'0'.repeat(28);
 await c.query(`INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,fecha_emision,fecha_procesada,total_productos,total_factura,archivo_xml,estado,porcentaje_relacionado) VALUES($1,$2,$3,$4,$5,'2026-10-06',NOW(),1,100,'ZZ.xml','PROCESADA',0)`,[id,clave,'ZZ-'+randomUUID().slice(0,8),d.pr.nombre,d.pr.identificacion]);
 const m=(await c.query('SELECT id FROM supplier_product_mapping WHERE producto_id=$1 ORDER BY id LIMIT 1',[d.producto])).rows[0].id;
 await c.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado) VALUES($1,$2,1,'ZZ-U','ZZ producto',$3,'Unid',10,0,0,100,$4,$5,'PENDIENTE')`,[randomUUID(),id,cantidad,d.producto,m]);
 const p=await facturas.proponer(o.id,id);await facturas.vincular(o.id,{clave:randomUUID(),facturaId:id,version:p.version,revision:p.revision,confirmar:true},d.actor);await compras.registrarCompra(id,d.actor);
 return recepcion.consultar(o.id);
}
async function recibir(o,q,final=false){const p=await recepcion.consultar(o.id);return recepcion.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final,motivos:final&&q<Number(p.comparacion[0].pendiente)?[{productoId:d.producto,tipo:'agotado_confirmado',detalle:'ZZ proveedor confirmó faltante final'}]:[],lineas:q?[{lineaId:p.lineas[0].id,cantidad:q}]:[]},d.actor)}
async function evento(accion,q){const p=await fisico.consultar(d.fs[0]);return fisico.registrar(d.fs[0],{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,accion,lineas:[{numeroLinea:1,cantidad:q}]},d.actor)}
caso('13 requeridas=10 comprometidas+3 portal; cada necesidad conserva documento/cliente/ciclo',async()=>{
 const p=await item();assert.equal(n(p,'requerido'),13);assert.equal(n(p,'comprometido'),10);assert.equal(n(p,'porFacturar'),3);assert.equal(n(p,'faltanteRegistrado'),10);assert.equal(n(p,'sinCobertura'),10);
 assert.ok(p.origenes.every(o=>o.clienteId===d.cl.id&&o.ciclo.id===d.ciclo));assert.equal(p.origenes.find(o=>o.tipo==='pedido').pedidoId,d.pedido);
});
caso('facturar pedido sustituye su demanda sin sumarlo dos veces',async()=>{
 await c.query("UPDATE pedido_cliente SET estado='facturado',factura_id=$2 WHERE id=$1",[d.pedido,d.fs[0]]);const p=await item();assert.equal(n(p,'requerido'),10);assert.equal(n(p,'porFacturar'),0);assert.equal(p.origenes.find(o=>o.tipo==='factura'&&o.facturaId===d.fs[0]).pedidoId,d.pedido);
});
caso('dos semanas de igual ruta se separan; maestro movido no cambia contexto fijo',async()=>{
 const otra=(await c.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING id',[zz('otra')])).rows[0].id;await c.query("UPDATE cliente SET ruta_id=$2,orden_ruta=1,nombre='ZZ nombre posterior' WHERE id=$1",[d.cl.id,otra]);
 const p=await item({cicloId:d.proximo});assert.equal(n(p,'requerido'),4);assert.equal(n(p,'faltanteRegistrado'),4);assert.ok(p.origenes.every(o=>o.ciclo.rutaId===d.ruta.id&&o.clienteNombre===d.cl.nombre));assert.equal((await vista({rutaId:otra})).productos.length,0);
});
caso('stock general no se resta otra vez ni cubre automáticamente faltantes de otra semana',async()=>{
 const inv=require('../src/modules/inventario/inventario.service');await inv.registrarEn(c,{productoId:d.producto,tipo:'ajuste_auditoria',cantidad:18,origenTipo:'auditoria_item',origenId:d.actor,clave:randomUUID()});
 await inv.reconciliarDocumentoEn(c,'factura',d.fs[0]);await inv.reconciliarDocumentoEn(c,'factura',d.fs[1]);
 const p=await item(),next=await item({cicloId:d.proximo});assert.equal(Number(p.stock.existencia),8);assert.equal(n(p,'requerido'),13);assert.equal(n(p,'sinCobertura'),10);assert.equal(Number(next.stock.existencia),8);assert.equal(n(next,'sinCobertura'),4);assert.equal(p.stock.conteoConfirmado,false);
});
caso('borrador apartado no es solicitado ni pendiente de recibir; cierre libera cobertura',async()=>{
 const o=await crearOrden({enviar:false});let p=await item();assert.equal(n(p,'reservadaBorrador'),10);assert.equal(n(p,'solicitado'),0);assert.equal(n(p,'pendienteRecibir'),0);assert.equal(n(p,'sinCobertura'),0);
 await ordenes.cambiarEstado(o.id,{version:o.version,estado:'cerrada',motivo:'ZZ ya no se solicita'},d.actor);p=await item();assert.equal(n(p,'sinCobertura'),10);assert.equal(p.compras.length,0);
});
caso('envío incierto conserva cobertura y no afirma solicitado confirmado',async()=>{
 await crearOrden({incierto:true});const p=await item();assert.equal(n(p,'envioPorVerificar'),10);assert.equal(n(p,'reservadaBorrador'),0);assert.equal(n(p,'solicitado'),0);assert.equal(n(p,'sinCobertura'),0);assert.equal(p.compras[0].envioEstado,'incierto');
});
caso('orden10 cubre dos faltantes6+4 una vez; aparece3 nuevo sin ampliar enviada',async()=>{
 const o=await crearOrden();const id=(await c.query("INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado) VALUES($1,$2,3,'parcial','pendiente') RETURNING id",[d.fs[0],d.producto])).rows[0].id;
 const p=await item();assert.equal(n(p,'solicitado'),10);assert.equal(n(p,'pendienteRecibir'),10);assert.equal(n(p,'faltanteRegistrado'),13);assert.equal(n(p,'sinCobertura'),3);assert.equal(p.compras.length,1);assert.equal(Number((await ordenes.obtener(o.id)).lineas[0].cantidad_propia),10);assert.equal(Number(p.origenes.find(x=>x.tipo==='faltante'&&x.documentoId===id).sinCobertura),3);
});
caso('recepción parcial6 separa10 solicitadas/4 pendientes/6 recibidas sin resolver faltantes',async()=>{
 const o=await crearOrden();await compraVinculada(o);await recibir(o,6);const p=await item();assert.equal(n(p,'solicitado'),10);assert.equal(n(p,'pendienteRecibir'),4);assert.equal(n(p,'recibido'),6);assert.equal(n(p,'sinCobertura'),0);assert.equal(n(p,'faltanteRegistrado'),10);assert.equal(p.origenes.filter(x=>x.tipo==='faltante').reduce((s,x)=>s+Number(x.ordenes[0].recibida),0),6);
});
caso('final6 de10 conserva10 originales, pendiente0 y libera solo4; archivada sigue contando',async()=>{
 const o=await crearOrden();await compraVinculada(o);fechaAnterior=true;await recibir(o,6);await recibir(o,0,true);const p=await item();assert.equal(n(p,'solicitado'),10);assert.equal(n(p,'pendienteRecibir'),0);assert.equal(n(p,'recibido'),6);assert.equal(n(p,'sinCobertura'),4);assert.equal(p.compras[0].archivada,true);assert.equal(n(await item({cicloId:d.proximo}),'sinCobertura'),4);
});
caso('cajas/conversión cuentan unidades propias, excedente no cubre otro ciclo',async()=>{
 const o=await crearOrden({factor:6,q:2});await compraVinculada(o,{cantidad:2,factor:6});await recibir(o,7);const p=await item();assert.equal(n(p,'solicitado'),12);assert.equal(n(p,'recibido'),7);assert.equal(n(p,'pendienteRecibir'),5);assert.equal(n(p,'cubierta'),10);assert.equal(n(await item({cicloId:d.proximo}),'cubierta'),0);
});
caso('entrega parcial/completa reduce requerido y compromiso, no altera stock ni faltantes',async()=>{
 await evento('carga',6);await evento('entrega',3);let p=await item();assert.equal(n(p,'comprometido'),7);assert.equal(n(p,'requerido'),10);assert.equal(n(p,'enCamion'),3);await evento('entrega',3);p=await item();assert.equal(n(p,'comprometido'),4);assert.equal(n(p,'requerido'),7);assert.equal(n(p,'faltanteRegistrado'),10);assert.equal(Number(p.stock.existencia),0);
});
caso('reimpresión no reasigna entrega vieja: requerido/compromiso desconocidos hasta revisión',async()=>{
 await evento('carga',6);await evento('entrega',3);await c.query("UPDATE factura_linea SET nombre='ZZ revisado',cantidad=4 WHERE factura_id=$1",[d.fs[0]]);const p=await item();assert.equal(p.requiereRevision,true);assert.equal(p.cantidades.comprometido,null);assert.equal(p.cantidades.requerido,null);assert.equal(n(p,'requeridoVerificado'),7);assert.equal(p.origenes.find(o=>o.facturaId===d.fs[0]&&o.tipo==='factura').pendiente,null);
});
caso('histórico sin entrega se distingue; Sin ciclo no inventa recorrido ni compromiso',async()=>{
 const f=(await c.query("INSERT INTO factura(numero,alegra_id,estado,fecha,cliente_id,cliente_nombre) VALUES($1,$2,'emitida','2000-01-01',$3,$4) RETURNING id",[zz('hist'),'ZZ-'+randomUUID().slice(0,12),d.cl.id,d.cl.nombre])).rows[0].id;
 await c.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ histórico',9,1,9)",[f,d.producto]);const p=await item({cicloId:'sin-ciclo'});assert.equal(p.cantidades.comprometido,null);assert.equal(p.origenes[0].ciclo,null);assert.equal(p.origenes[0].historicoSinEntrega,true);assert.equal(n(await item(),'comprometido'),10);
});
caso('anulada/rechazado/completo no forman necesidad; producto inactivo conserva procedencia',async()=>{
 await c.query("UPDATE factura SET estado='anulada' WHERE id=$1",[d.fs[0]]);await c.query("UPDATE pedido_cliente SET estado='rechazado' WHERE id=$1",[d.pedido]);await c.query("UPDATE faltantes SET tipo_faltante='completo' WHERE id=$1",[d.faltantes[1]]);await c.query('UPDATE producto SET activo=FALSE WHERE id=$1',[d.producto]);const p=await item();assert.equal(n(p,'comprometido'),4);assert.equal(n(p,'porFacturar'),0);assert.equal(n(p,'faltanteRegistrado'),0);assert.equal(p.activo,false);
});
caso('producto sin relación conserva línea/cliente/pedido sin adivinar referencia duplicada',async()=>{
 await c.query('UPDATE pedido_cliente_linea SET producto_id=NULL WHERE pedido_id=$1',[d.pedido]);await c.query("INSERT INTO pedido_cliente_linea(pedido_id,nombre_producto,referencia,cantidad,precio_unitario) VALUES($1,'ZZ otro sin relación','ZZ-NEC',2,1)",[d.pedido]);const r=await vista();assert.equal(r.sinProducto.length,2);assert.ok(r.sinProducto.every(o=>o.pedidoId===d.pedido&&o.clienteId===d.cl.id&&o.lineas.length===1));assert.equal(n(await item(),'porFacturar'),0);
});
caso('precisión fraccionaria propia, producto no inventariable y búsqueda/página estrictas',async()=>{
 await c.query('UPDATE factura_linea SET cantidad=0.1 WHERE factura_id=$1',[d.fs[0]]);await c.query('UPDATE factura_linea SET cantidad=0.2 WHERE factura_id=$1',[d.fs[1]]);await c.query('UPDATE producto SET inventariable=FALSE WHERE id=$1',[d.producto]);const p=await item();assert.equal(p.cantidades.comprometido,'0.300000');assert.equal(p.stock.existencia,null);assert.equal((await vista({q:'NO EXISTE ZZ'})).productos.length,0);assert.equal((await vista({q:'P-'+d.producto,tamano:1})).productos.length,1);
 for(const args of [{cicloId:''},{cicloId:'x'},{cicloId:2147483648},{rutaId:[]},{q:{}},{pagina:0},{tamano:51}])await assert.rejects(vista(args),e=>e.status===400);
});
caso('consulta conserva tablas de negocio, cobertura, físicos, permisos y bitácora',async()=>{
 await crearOrden();const huellas=async()=>{const result={};for(const t of ['factura','factura_linea','cliente','producto','pedido_cliente','pedido_cliente_linea','faltantes','inventario_saldo','movimiento_inventario','orden_compra_ciclo','orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_recepcion','entrega_evento','bitacora_cambio','usuario_modulo'])result[t]=(await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;return result};const antes=await huellas();await vista();await vista({cicloId:d.proximo});await vista({cicloId:'sin-ciclo'});assert.deepEqual(await huellas(),antes);
 const texto=JSON.stringify(await vista());for(const dato of ['precio_unitario','costo_con_iva','password_hash','archivo_xml','pdf','telefono_whatsapp'])assert.equal(texto.includes('"'+dato+'"'),false);
});
caso('dos líneas del mismo producto conservan procedencia y suman demanda una vez',async()=>{
 await c.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,2,$2,'ZZ segunda partida',1.25,1,1.25)",[d.fs[0],d.producto]);const p=await item();assert.equal(n(p,'comprometido'),11.25);assert.equal(n(p,'requerido'),14.25);const o=p.origenes.find(o=>o.tipo==='factura'&&o.facturaId===d.fs[0]);assert.deepEqual(o.lineas,[1,2]);assert.equal(Number(o.cantidad),7.25);
});
caso('paginación/búsqueda conservan todo el producto y no mezclan otra semana',async()=>{
 for(let i=1;i<=24;i++){const p=(await c.query("INSERT INTO producto(nombre) VALUES($1) RETURNING id",['ZZ producto paginado '+String(i).padStart(2,'0')])).rows[0].id;await c.query("INSERT INTO pedido_cliente_linea(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario) VALUES($1,$2,'ZZ paginado',1,1)",[d.pedido,p]);}
 const a=await vista({q:'ZZ producto paginado'}),b=await vista({q:'ZZ producto paginado',pagina:2});assert.equal(a.paginacion.total,24);assert.equal(a.productos.length,20);assert.equal(b.productos.length,4);assert.equal(new Set([...a.productos,...b.productos].map(p=>p.productoId)).size,24);assert.ok(b.productos.every(p=>p.origenes[0].ciclo.id===d.ciclo));
});
caso('consulta nativa usa READ ONLY/REPEATABLE READ sin advisory ni FOR SHARE',async()=>{
 const seed=await pool.connect();let fixture;try{await seed.query('BEGIN');fixture=await sembrar(seed,{activar:false});await seed.query('COMMIT')}catch(e){await seed.query('ROLLBACK');throw e}finally{seed.release()}
 const rutas=['../config/database','../src/modules/reports/necesidades.service'].map(require.resolve),previas=rutas.map(r=>require.cache[r]);require.cache[rutas[0]]={id:rutas[0],filename:rutas[0],loaded:true,exports:{pool}};delete require.cache[rutas[1]];
 const connect=pool.connect.bind(pool),observados=[];pool.connect=async()=>{const db=await connect(),q=db.query.bind(db);db.query=async(sql,p)=>{const r=await q(sql,p);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')observados.push([(await q('SHOW transaction_read_only')).rows[0].transaction_read_only,(await q('SHOW transaction_isolation')).rows[0].transaction_isolation]);return r};const release=db.release.bind(db);db.release=()=>{db.query=q;db.release=release;release()};return db};
 try{const r=await require(rutas[1]).listar({cicloId:fixture.ciclo});assert.equal(Number(r.productos[0].cantidades.requerido),13);assert.deepEqual(observados,[['on','repeatable read']])}finally{pool.connect=connect;rutas.forEach((r,i)=>require.cache[r]=previas[i])}
});
test('necesidades pertenece a Reporte Proveedores con variantes Express',()=>{const {moduloDeRuta}=require('../src/modules/usuarios/modulos');assert.equal(moduloDeRuta('/Reportes/Faltantes/Proveedor/Necesidades/'),'reporte-proveedores')});
