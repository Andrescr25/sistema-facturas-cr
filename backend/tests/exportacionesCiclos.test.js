/** Consulta operativa en clon propio: cantidades/procedencia sin escrituras. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const activo=process.env.PROBAR_BASE_LOCAL==='1';let c,pool,serv,ordenes,envios,facturas,compras,recepcion,fisico,d,wa,original,fechaAnterior=false;
const zz=s=>'ZZ necesidades '+s+' '+randomUUID().slice(0,8);
let excelN,excelO,excelE,cierre;
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
 const db=require.resolve('../config/database');require.cache[db]={id:db,filename:db,loaded:true,exports:{query:q,pool:{query:q,connect:async()=>{const sp='necesidad_'+ ++nivel;return{query:(sql,p)=>sql==='BEGIN'?q('SAVEPOINT '+sp):sql==='COMMIT'?q('RELEASE SAVEPOINT '+sp):sql==='ROLLBACK'?q('ROLLBACK TO SAVEPOINT '+sp):q(sql,p),release(){}}}}}};
 serv=require('../src/modules/reports/necesidades.service');ordenes=require('../src/modules/orders-whatsapp/ordenesCiclo.service');envios=require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');facturas=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service');compras=require('../src/modules/compras/compras.service');recepcion=require('../src/modules/orders-whatsapp/ordenesCicloRecepcion.service');fisico=require('../src/modules/entregas/registroFisico.service');
 excelN=require('../src/modules/reports/necesidades.excel');excelO=require('../src/modules/orders-whatsapp/ordenesCiclo.excel');excelE=require('../src/modules/entregas/entregas.excel');cierre=require('../src/modules/orders-whatsapp/ordenesCicloCierre.service');
 wa=require('../src/integrations/whatsapp');original=wa.enviarDocumento;
 before(async()=>{c=await pool.connect();await c.query('BEGIN')});after(async()=>{wa.enviarDocumento=original;if(c){await c.query('ROLLBACK');c.release()}await pool.end()});
}
const vista=(extra={})=>serv.listar({cicloId:d.ciclo,...extra});
const item=async(extra={})=>(await vista({q:'P-'+d.producto,...extra})).productos.find(p=>p.productoId===d.producto);
const n=(p,k)=>Number(p.cantidades[k]);
async function crearOrden({factor=1,q=10,incierto=false,enviar=true}={}){
 if(!(await c.query('SELECT id FROM supplier_product_mapping WHERE proveedor_id=$1 AND producto_id=$2',[d.pr.id,d.producto])).rowCount)await c.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion) VALUES($1,$2,$3,'ZZ-U','ZZ producto','','',$4,$5,$6)`,[randomUUID(),d.pr.nombre,d.pr.identificacion,d.producto,d.pr.id,factor]);
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
const XLSX=require('xlsx');
const libro=async r=>XLSX.read((await r).buffer,{type:'buffer',cellNF:true});
const filas=(l,n)=>XLSX.utils.sheet_to_json(l.Sheets[n],{defval:null});
const deNecesidad=(extra={})=>libro(excelN.exportar({cicloId:d.ciclo,...extra}));
const deOrden=(extra={})=>libro(excelO.exportar({cicloId:d.ciclo,...extra}));
const deEntrega=(extra={})=>libro(excelE.exportar({cicloId:d.ciclo,...extra}));
const huellas=async()=>{const r={};for(const t of ['producto','cliente','pedido_cliente','pedido_cliente_linea','factura','factura_linea','faltantes','inventario_saldo','movimiento_inventario','orden_compra_ciclo','orden_compra_ciclo_linea','orden_compra_ciclo_origen','orden_compra_ciclo_envio','orden_compra_ciclo_factura','orden_compra_ciclo_recepcion','orden_compra_ciclo_recepcion_linea','orden_compra_ciclo_cierre','entrega_evento','bitacora_cambio','supplier_product_mapping'])r[t]=(await c.query(`SELECT md5(COALESCE(string_agg(h,'' ORDER BY h),'')) h FROM (SELECT md5(to_jsonb(t)::text) h FROM ${t} t) x`)).rows[0].h;return r};
caso('necesidades exporta todas las páginas y el mismo filtro de búsqueda sin truncar productos',async()=>{
 for(let i=0;i<24;i++){const id=(await c.query("INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id",['ZZ exportable '+i,'ZZ-X-'+i])).rows[0].id;await c.query("INSERT INTO pedido_cliente_linea(pedido_id,producto_id,nombre_producto,cantidad,precio_unitario) VALUES($1,$2,'ZZ línea',1,1)",[d.pedido,id]);}
 const l=await deNecesidad({q:'ZZ exportable',pagina:2,tamano:1});assert.equal(filas(l,'Necesidades').length,24);assert.equal(filas(l,'Procedencia').length,24);assert.equal(filas(l,'Sin relación').length,0);assert.ok(filas(l,'Procedencia').every(r=>r['ID ciclo']===d.ciclo));
});
caso('detalle de producto exporta solo su ficha con procedencia completa y cantidades13=10+3',async()=>{
 const l=await deNecesidad({productoId:d.producto}),p=filas(l,'Necesidades')[0];assert.equal(p['Requerido por atender'],13);assert.equal(p['Comprometido por entregar'],10);assert.equal(p['Pedidos por facturar'],3);assert.equal(p['Faltante registrado'],10);assert.equal(filas(l,'Procedencia').length,5);await assert.rejects(deNecesidad({productoId:2147483647}),e=>e.status===404);
});
caso('misma ruta en dos semanas y mover/renombrar maestro no cambian origen fijo del Excel',async()=>{
 const o=await crearOrden();const otra=(await c.query("INSERT INTO ruta_cliente(nombre) VALUES('ZZ nueva ruta') RETURNING id")).rows[0].id;await c.query("UPDATE cliente SET ruta_id=$2,orden_ruta=1,nombre='ZZ cambiado' WHERE id=$1",[d.cl.id,otra]);await c.query("UPDATE ruta_cliente SET nombre='ZZ renombrada' WHERE id=$1",[d.ruta.id]);
 for(const l of [await deNecesidad(),await deOrden(),await deEntrega()]){const ps=filas(l,l.SheetNames.includes('Procedencia')?'Procedencia':'Documentos');assert.ok(ps.every(r=>r['ID ciclo']===d.ciclo));assert.ok(ps.every(r=>r.Ruta===d.ruta.nombre));}
 const next=await deNecesidad({cicloId:d.proximo});assert.equal(filas(next,'Necesidades')[0]['Requerido por atender'],4);assert.equal(filas(next,'Compras').length,0);assert.equal(filas(await deOrden({rutaId:otra}),'Órdenes').length,0);assert.equal(filas(await deEntrega({rutaId:otra}),'Documentos').length,0);assert.equal((await ordenes.obtener(o.id)).ciclo.id,d.ciclo);
});
caso('pedido facturado aparece una vez como factura en entrega y necesidad',async()=>{
 await c.query("UPDATE pedido_cliente SET estado='facturado',factura_id=$2 WHERE id=$1",[d.pedido,d.fs[0]]);const n=await deNecesidad(),e=await deEntrega();assert.equal(filas(n,'Necesidades')[0]['Requerido por atender'],10);assert.equal(filas(e,'Documentos').filter(r=>r.Documento==='pedido').length,0);assert.equal(filas(e,'Documentos').filter(r=>r['ID pedido origen']===d.pedido).length,1);
});
caso('necesidades parcial/cerrada conserva original10/recibido6/pendiente0 y cobertura6 sin multiplicar6+4',async()=>{
 const o=await crearOrden();await compraVinculada(o);await recibir(o,6);let l=await deNecesidad();assert.equal(filas(l,'Compras').length,1);assert.equal(filas(l,'Necesidades')[0]['Solicitado confirmado'],10);assert.equal(filas(l,'Necesidades')[0]['Pendiente de recibir'],4);
 const p=await cierre.consultar(o.id);await cierre.cerrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,motivo:'ZZ cierre confirmado'},d.actor);l=await deNecesidad();const n=filas(l,'Necesidades')[0];assert.equal(n['Solicitado confirmado'],10);assert.equal(n['Recibido físicamente'],6);assert.equal(n['Pendiente de recibir'],0);assert.equal(n['Cobertura válida'],6);assert.equal(n['Faltante sin cobertura'],4);assert.equal(filas(l,'Cobertura').reduce((s,r)=>s+r['Recibido asignado'],0),6);
});
caso('borrador e incierto se muestran apartados sin inventar pedido confirmado ni fecha',async()=>{
 const o=await crearOrden({enviar:false});let n=filas(await deNecesidad(),'Necesidades')[0];assert.equal(n['Apartado en borradores'],10);assert.equal(n['Solicitado confirmado'],0);assert.equal(filas(await deOrden(),'Productos')[0]['Pendiente de recibir'],null);
 await ordenes.cambiarEstado(o.id,{version:o.version,estado:'cerrada',motivo:'ZZ descartar borrador'});await crearOrden({incierto:true});n=filas(await deNecesidad(),'Necesidades')[0];assert.equal(n['Apartado por verificar envío'],10);assert.equal(n['Solicitado confirmado'],0);const l=await deOrden();assert.equal(filas(l,'Órdenes')[0]['Envío confirmado'],'No');assert.equal(filas(l,'Órdenes')[0]['Enviada (Costa Rica)'],null);assert.equal(filas(l,'Envíos')[0]['Estado envío'],'incierto');
});
caso('necesidad sin producto propio y cantidades desconocidas quedan separadas/vacías',async()=>{
 await c.query('UPDATE pedido_cliente_linea SET producto_id=NULL WHERE pedido_id=$1',[d.pedido]);await c.query("UPDATE factura SET alegra_id='ZZ-IMPORT' WHERE id=$1",[d.fs[0]]);const l=await deNecesidad();const n=filas(l,'Necesidades')[0];assert.equal(n['Requerido por atender'],null);assert.equal(n['Requiere revisión'],'Sí');assert.equal(filas(l,'Sin relación').length,1);assert.equal(filas(l,'Sin relación')[0]['ID pedido'],d.pedido);assert.equal(filas(l,'Sin relación')[0]['ID ciclo'],d.ciclo);assert.equal(filas(l,'Procedencia').find(r=>r['ID factura']===d.fs[0]&&r.Origen==='factura')['Pendiente por atender'],null);
});
caso('Sin ciclo preserva clasificación histórica y no inventa Maps/carga/semana',async()=>{
 const f=(await c.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre) VALUES($1,'emitida','2000-01-01',$2,$3) RETURNING id",[zz('HIST'),d.cl.id,d.cl.nombre])).rows[0].id;await c.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ histórico',2,1,2)",[f,d.producto]);
 const e=await deEntrega({cicloId:'sin-ciclo'});assert.equal(filas(e,'Recorrido')[0].Ruta,'Sin ciclo');assert.equal(filas(e,'Recorrido')[0]['Semana'],null);assert.equal(filas(e,'Recorrido')[0]['Ubicación Maps'],null);assert.equal(filas(e,'Carga sugerida').length,0);const n=await deNecesidad({cicloId:'sin-ciclo'});assert.ok(filas(n,'Procedencia').every(r=>r['ID ciclo']===null));assert.equal(filas(await deEntrega({cicloId:'sin-ciclo',rutaId:d.ruta.id}),'Documentos').length,0);
});
async function agregarParadas(cantidad=23){
 const rc0=(await c.query('SELECT id FROM ciclo_ruta_cliente WHERE ciclo_id=$1',[d.ciclo])).rows[0].id;
 // Crear otro ciclo fijo con23paradas antes de fijar el recorrido.
 const cy=(await c.query("INSERT INTO ciclo_ruta(ruta_id,ruta_nombre,semana) VALUES($1,$2,'2026-10-26') RETURNING id",[d.ruta.id,d.ruta.nombre])).rows[0].id;const ids=[];
 for(let i=1;i<=cantidad;i++){const cl=(await c.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING id',['ZZ parada '+String(i).padStart(2,'0')])).rows[0].id;const rc=(await c.query('INSERT INTO ciclo_ruta_cliente(ciclo_id,cliente_id,cliente_nombre,orden,ubicacion_maps) VALUES($1,$2,$3,$4,$5) RETURNING id',[cy,cl,'ZZ parada '+String(i).padStart(2,'0'),i,'https://maps.google.com/?q=9.9,-84.1'])).rows[0].id;ids.push(rc)}
 await c.query('UPDATE ciclo_ruta SET recorrido_fijado=TRUE WHERE id=$1',[cy]);
 for(const [i,rc] of ids.entries()){const f=(await c.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,ciclo_ruta_cliente_id,estado_bodega) SELECT $1,'emitida','2000-01-01',cliente_id,cliente_nombre,id,'procesado' FROM ciclo_ruta_cliente WHERE id=$2 RETURNING id",[zz('CARGA'),rc])).rows[0].id;await c.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ cargar',1,1,1)",[f,d.producto]);}
 return{cy,ids};
}
caso('entrega exporta23paradas y carga23→1 con productos más allá de página visible',async()=>{
 const {cy}=await agregarParadas();const l=await deEntrega({cicloId:cy,pagina:2,tamano:1});assert.equal(filas(l,'Recorrido').length,23);assert.equal(filas(l,'Productos').length,23);assert.deepEqual(filas(l,'Recorrido').map(r=>r['Orden de entrega']),Array.from({length:23},(_,i)=>i+1));assert.deepEqual(filas(l,'Carga sugerida').map(r=>r['Orden de entrega']),Array.from({length:23},(_,i)=>23-i));assert.ok(filas(l,'Documentos').every(r=>r['ID ciclo']===cy));
});
caso('detalle exporta solo parada elegida y conserva posición global de carga/entrega',async()=>{
 const {cy,ids}=await agregarParadas();const l=await deEntrega({cicloId:cy,clave:'rc-'+ids[2]});assert.equal(filas(l,'Recorrido').length,1);assert.equal(filas(l,'Productos').length,1);assert.equal(filas(l,'Carga sugerida')[0]['Orden sugerido de carga'],21);assert.equal(filas(l,'Carga sugerida')[0]['Orden de entrega'],3);await assert.rejects(deEntrega({clave:'rc-'+ids[2]}),e=>e.status===404);
});
caso('entrega real sale de carga sugerida; avance conservado sin precios/stock/CxC/cuenta',async()=>{
 await evento('carga',6);await evento('entrega',6);const l=await deEntrega(),docs=filas(l,'Documentos');assert.equal(docs.find(r=>r['ID documento']===d.fs[0])['Avance físico'],'entregada');assert.equal(filas(l,'Carga sugerida').filter(r=>r['ID documento']===d.fs[0]).length,0);for(const n of l.SheetNames){const h=JSON.stringify(filas(l,n));for(const dato of ['precio_unitario','costo','saldo','password_hash','cliente_portal_id'])assert.equal(h.includes(dato),false)}
});
caso('reimpresión requiere revisión y no presenta avance antiguo como verificado',async()=>{
 await evento('carga',6);await c.query('UPDATE factura_linea SET cantidad=4 WHERE factura_id=$1',[d.fs[0]]);const e=await deEntrega();const f=filas(e,'Documentos').find(r=>r['ID documento']===d.fs[0]);assert.equal(f['Requiere revisión física'],'Sí');assert.equal(f['En camión suma de líneas'],null);assert.equal(f['En camión anterior por revisar'],6);const n=await deNecesidad();assert.equal(filas(n,'Necesidades')[0]['Requerido por atender'],null);
});
caso('órdenes activas/históricas mantienen filtro, PDF original, cierre y cobertura recibida',async()=>{
 const o=await crearOrden();await compraVinculada(o);await recibir(o,6);const p=await cierre.consultar(o.id);await cierre.cerrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,motivo:'ZZ cerrar confirmado'},d.actor);
 assert.equal(filas(await deOrden(),'Órdenes').length,0);const l=await deOrden({vista:'historial'}),r=filas(l,'Productos')[0];assert.equal(r['Pedido original propias'],10);assert.equal(r['Recibido físicamente'],6);assert.equal(r['Pendiente de recibir'],0);assert.equal(filas(l,'Órdenes')[0]['Motivo cierre'],'ZZ cerrar confirmado');assert.equal(filas(l,'Procedencia').reduce((a,r)=>a+r['Cobertura válida'],0),6);assert.equal(filas(l,'Envíos')[0]['Documento PDF'],o.envios[0].nombre_archivo);
 const detalle=await deOrden({ordenId:o.id});assert.equal(filas(detalle,'Órdenes')[0]['ID orden'],o.id);await assert.rejects(deOrden({ordenId:o.id,cicloId:d.proximo}),e=>e.status===404);
});
caso('recibida archivada conserva recepción/cobertura en historia y no cambia al exportar',async()=>{
 fechaAnterior=true;const o=await crearOrden();await compraVinculada(o);await recibir(o,6,true);const l=await deOrden({vista:'historial'});assert.equal(filas(l,'Órdenes')[0].Archivada,'Sí');assert.equal(filas(l,'Productos')[0]['Recibido físicamente'],6);assert.equal(filas(await deOrden(),'Órdenes').length,0);assert.equal(filas(await deNecesidad(),'Necesidades')[0]['Cobertura válida'],6);
});
caso('filtros inválidos/módulo sin semana no exportan todo silenciosamente',async()=>{
 for(const extra of [{cicloId:'x'},{cicloId:2147483648},{rutaId:true},{rutaId:[]},{rutaId:2147483648}])for(const fn of [deNecesidad,deOrden,deEntrega])await assert.rejects(fn(extra),e=>e.status===400);
 await assert.rejects(excelN.exportar({}),e=>e.status===400);await assert.rejects(excelE.exportar({}),e=>e.status===400);await assert.rejects(deNecesidad({q:{}}),e=>e.status===400);await assert.rejects(deOrden({vista:'x'}),e=>e.status===400);await assert.rejects(deEntrega({clave:'rc-0'}),e=>e.status===400);
});
caso('archivos vacíos conservan encabezados y códigos/textos no se vuelven fórmulas',async()=>{
 await c.query("UPDATE producto SET referencia='00012',nombre='=ZZ formula' WHERE id=$1",[d.producto]);const n=await deNecesidad();assert.equal(filas(n,'Necesidades')[0].Código,'00012');const sheet=n.Sheets.Necesidades;assert.equal(sheet.C2.t,'s');assert.equal(sheet.C2.f,undefined);const v=await deNecesidad({q:'NO EXISTE ZZ'});assert.equal(filas(v,'Necesidades').length,0);assert.ok(v.Sheets.Necesidades['!ref']);
});
caso('fracciones conservan seis decimales visibles en Excel y no pierden resto al recibir',async()=>{
 // Factura_linea.cantidad tiene cuatro decimales; la conversión de compra
 // conserva seis. Probar la cantidad original real, sin cambiar el schema.
 const o=await crearOrden({factor:0.333333,q:3});await compraVinculada(o,{cantidad:3,factor:0.333333});await recibir(o,0.3333);
 const l=await deOrden(),r=filas(l,'Productos')[0];assert.equal(r['Pedido original propias'],0.999999);assert.equal(r['Pendiente de recibir'],0.666699);const headers=Object.keys(r),j=headers.indexOf('Pedido original propias');const cell=l.Sheets.Productos[XLSX.utils.encode_cell({r:1,c:j})];assert.equal(cell.z,'#,##0.######');assert.equal(cell.v,0.999999);
});
caso('descargas no cambian negocio, documentos, cobertura, actores ni inventario',async()=>{
 const o=await crearOrden();await compraVinculada(o);await recibir(o,6);const h=await huellas();await deNecesidad();await deEntrega();await deOrden();await deNecesidad({cicloId:d.proximo});await deOrden({vista:'historial'});assert.deepEqual(await huellas(),h);
});
caso('tres exportaciones nativas usan una transacción READ ONLY/REPEATABLE READ cada una',async()=>{
 const externa=c,previo=d,seed=await pool.connect();let fixture;
 try{c=seed;await seed.query('BEGIN');d=await sembrar(seed,{activar:false});await crearOrden({enviar:false});fixture=d;await seed.query('COMMIT')}catch(e){await seed.query('ROLLBACK');throw e}finally{c=externa;d=previo;seed.release()}
 const paths=['../config/database','../src/modules/reports/necesidades.service','../src/modules/reports/necesidades.excel','../src/modules/orders-whatsapp/ordenesCiclo.service','../src/modules/orders-whatsapp/ordenesCiclo.excel','../src/modules/entregas/entregas.service','../src/modules/entregas/entregas.excel'].map(require.resolve),previas=paths.map(p=>require.cache[p]);
 require.cache[paths[0]]={id:paths[0],filename:paths[0],loaded:true,exports:{pool,query:(...a)=>pool.query(...a)}};for(const p of paths.slice(1))delete require.cache[p];
 const connect=pool.connect.bind(pool),observados=[];pool.connect=async()=>{const db=await connect(),q=db.query.bind(db);db.query=async(sql,p)=>{assert.equal(/FOR\s+(SHARE|UPDATE)|\b(INSERT|DELETE|TRUNCATE)\b/i.test(sql),false);const r=await q(sql,p);if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')observados.push([(await q('SHOW transaction_read_only')).rows[0].transaction_read_only,(await q('SHOW transaction_isolation')).rows[0].transaction_isolation]);return r};const release=db.release.bind(db);db.release=()=>{db.query=q;db.release=release;release()};return db};
 try{for(const p of [paths[2],paths[4],paths[6]]){const l=await libro(require(p).exportar({cicloId:fixture.ciclo}));assert.ok(l.SheetNames.length>=4)}assert.deepEqual(observados,Array.from({length:3},()=>['on','repeatable read']))}finally{pool.connect=connect;paths.forEach((p,i)=>require.cache[p]=previas[i])}
});
test('nuevas descargas conservan permiso del módulo incluyendo variantes Express',()=>{const {moduloDeRuta}=require('../src/modules/usuarios/modulos');for(const [ruta,modulo] of [['/Reportes/Faltantes/Proveedor/Necesidades/Exportar/','reporte-proveedores'],['/Orden-Compra/Por-Ciclo/Exportar/','reporte-proveedores'],['/Orden-Compra/Por-Ciclo/1/Exportar/','reporte-proveedores'],['/Entregas/Exportar/','entregas']])assert.equal(moduloDeRuta(ruta),modulo)});
