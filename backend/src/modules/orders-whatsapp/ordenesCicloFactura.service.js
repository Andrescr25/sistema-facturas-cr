const {createHash}=require('node:crypto');
const {httpError}=require('../../utils/validacion');
const {registrarCambio}=require('../../utils/bitacora');
const {interno:{entero,enOrden,obtenerEn,revision}}=require('./ordenesCiclo.service');
const archivos=require('./ordenesCicloFactura.archivos');
const {generarRepresentacion}=require('./ordenesCicloFactura.pdf');
const uuid=v=>{if(typeof v!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v))throw httpError(400,'Identificador de factura o vínculo inválido.');return v.toLowerCase()};
const identidad=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
async function ordenEn(db,id,opciones){
  const o=await obtenerEn(db,id,opciones),{rows}=await db.query('SELECT id,cantidad_propia::text FROM orden_compra_ciclo_linea WHERE orden_id=$1',[o.id]);
  // La comparación usa el decimal SQL exacto, no la cantidad formateada
  // para UI, que puede perder fracciones en órdenes grandes.
  o.lineas=o.lineas.map(l=>({...l,cantidad_propia:rows.find(r=>r.id===l.id).cantidad_propia}));return o;
}
const enviada=o=>{if(!['enviada','parcialmente_recibida'].includes(o.estado))throw httpError(409,'Vinculá el comprobante a una orden con envío confirmado.');};
const micro=v=>{const [a,b='']=String(v).split('.');if(!/^\d+$/.test(a)||!/^\d{0,6}$/.test(b))throw httpError(409,'Una cantidad del comprobante requiere revisión.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))};
const cantidad=v=>Number(v)/1000000;

/** Fuente revisada: compra ya registrada tiene conversión propia histórica.
 * Sin compra se conserva el buzón/mapeo explícito; jamás deducir producto
 * por nombre/código ni asumir factor 1 cuando falta su relación. */
async function fuenteEn(db,o,id){
  const {rows:[f]}=await db.query(`SELECT id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,
    fecha_emision::text,moneda,total_factura,estado::text,xml_ruta IS NOT NULL AS xml_disponible
    FROM facturas_proveedores WHERE id=$1 FOR SHARE`,[uuid(id)]);
  if(!f)throw httpError(404,'No existe ese comprobante.');
  if(!identidad(o.proveedor_cedula)||identidad(f.proveedor_cedula)!==identidad(o.proveedor_cedula))throw httpError(409,'La factura pertenece a otro proveedor.');
  if(!/^\d{50}$/.test(f.clave)||!['RECIBIDA','PROCESADA','RELACIONADA','ENVIADA'].includes(f.estado))throw httpError(409,'El comprobante no es una factura electrónica disponible para esta orden.');
  const {rows:[c]}=await db.query('SELECT id,estado,proveedor_id FROM compra WHERE factura_proveedor_id=$1 FOR SHARE',[f.id]);
  if(c&&(c.estado!=='registrada'||c.proveedor_id!==o.proveedor_id))throw httpError(409,'La compra está anulada o no coincide con el proveedor de la orden.');
  let lineas;
  if(c){({rows:lineas}=await db.query(`SELECT id::text,numero_linea,producto_id,descripcion,codigo_proveedor,unidad,
    cantidad::text,factor_conversion::text,cantidad_propia::text,precio_unitario::text,descuento::text,impuesto::text,total_linea::text
    FROM compra_linea WHERE compra_id=$1 ORDER BY numero_linea,id FOR SHARE`,[c.id]));}
  else{({rows:lineas}=await db.query(`SELECT l.id::text,l.numero_linea,COALESCE(l.producto_id,m.producto_id) producto_id,
    l.descripcion,l.codigo_proveedor,l.unidad_medida unidad,l.cantidad::numeric::text cantidad,
    CASE WHEN (m.proveedor_id=$2 OR (m.proveedor_id IS NULL AND regexp_replace(upper(m.supplier_cedula),'[^A-Z0-9]','','g')=$3))
      AND (l.producto_id IS NULL OR l.producto_id=m.producto_id) AND m.factor_conversion>0
      THEN m.factor_conversion::numeric(14,6)::text END factor_conversion,
    CASE WHEN (m.proveedor_id=$2 OR (m.proveedor_id IS NULL AND regexp_replace(upper(m.supplier_cedula),'[^A-Z0-9]','','g')=$3))
      AND (l.producto_id IS NULL OR l.producto_id=m.producto_id) AND m.factor_conversion>0
      THEN ROUND(ROUND(l.cantidad::numeric,4)*m.factor_conversion::numeric(14,6),4)::text END cantidad_propia,
    l.precio_unitario::numeric::text,l.descuento::numeric::text,l.impuesto::numeric::text,l.total_linea::numeric::text
    FROM productos_factura_proveedor l LEFT JOIN supplier_product_mapping m ON m.id=l.mapeo_id
    WHERE l.factura_id=$1 ORDER BY l.numero_linea,l.id FOR SHARE OF l`,[f.id,o.proveedor_id,identidad(o.proveedor_cedula)]));}
  if(!lineas.length||lineas.length>2000)throw httpError(409,'La factura debe tener entre 1 y 2000 líneas para compararla.');
  lineas=lineas.map(l=>({...l,revision:!l.producto_id?'Producto sin relacionar':!l.factor_conversion||Number(l.factor_conversion)<=0||!l.cantidad_propia||Number(l.cantidad)<=0?'Conversión o cantidad sin confirmar':null}));
  return {documento:{...f,compra_id:c?.id||null,fuente:c?'compra_registrada':'buzon'},lineas};
}
async function vinculosEn(db,o){
  const {rows}=await db.query(`SELECT id,factura_id,documento,lineas,firma,estado,creado_en,retirado_en,motivo
    FROM orden_compra_ciclo_factura WHERE orden_id=$1 ORDER BY secuencia DESC`,[o.id]);
  for(const v of rows){
    const {rows:pdfs}=await db.query('SELECT id,tipo,sha256,bytes,creado_en FROM orden_compra_ciclo_factura_pdf WHERE vinculo_id=$1 ORDER BY secuencia DESC',[v.id]);v.pdfs=pdfs;
    if(v.estado==='vigente')try{v.fuenteCambio=hash(await fuenteEn(db,o,v.factura_id))!==v.firma}catch{v.fuenteCambio=true}
  }
  return rows;
}
function comparar(o,documentos){
  const vigentes=documentos.filter(v=>v.estado!=='retirada'),items=vigentes.flatMap(v=>v.lineas.map(l=>({...l,facturaId:v.factura_id||v.documento.id,numeroFactura:v.documento.numero_consecutivo}))),grupos=new Map();
  for(const l of items){if(!l.producto_id)continue;if(!grupos.has(l.producto_id))grupos.set(l.producto_id,{total:0n,revision:false,lineas:[]});const g=grupos.get(l.producto_id);g.lineas.push(l);if(l.revision)g.revision=true;else g.total+=micro(l.cantidad_propia)}
  const desconocidas=items.filter(l=>!l.producto_id),hay=vigentes.length>0;
  const fila=(p,propia)=>{const g=grupos.get(p.producto_id)||{total:0n,revision:false,lineas:[]},pedido=micro(propia),duda=g.revision||desconocidas.length>0,f=g.total-pedido;
    return {productoId:p.producto_id,nombre:p.producto_nombre,solicitado:cantidad(pedido),facturado:hay&&!duda?cantidad(g.total):null,
      facturadoConocido:cantidad(g.total),faltante:hay&&!duda?cantidad(f<0n?-f:0n):null,exceso:hay&&!duda?cantidad(f>0n?f:0n):null,
      estado:!hay?'sin_comprobante':duda?'por_revisar':f===0n?'coincide':f<0n?'menos_facturado':'mas_facturado',lineas:g.lineas};};
  const pedidos=new Set(o.lineas.map(l=>l.producto_id));
  return {productos:o.lineas.map(l=>fila(l,String(l.cantidad_propia))),extras:[...grupos.entries()].filter(([id])=>!pedidos.has(id)).map(([id,g])=>fila({producto_id:id,producto_nombre:g.lineas[0].descripcion},'0')),
    porRelacionar:desconocidas,requiereRevision:desconocidas.length>0||items.some(l=>l.revision)||vigentes.some(v=>v.fuenteCambio),recepcionFisica:'pendiente_de_registrar'};
}
async function datosEn(db,o){const facturas=await vinculosEn(db,o);return {facturas,comparacion:comparar(o,facturas)}}
async function consultar(id){return enOrden(async db=>datosEn(db,await ordenEn(db,id)))}
async function candidatas(id,{buscar='',pagina=1}={}){return enOrden(async db=>{
  const o=await ordenEn(db,id);enviada(o);if(typeof buscar!=='string'||buscar.length>80)throw httpError(400,'La búsqueda admite hasta 80 caracteres.');
  const n=entero(pagina,'Página');if(n>1000)throw httpError(400,'Página inválida.');
  const {rows}=await db.query(`SELECT f.id,f.numero_consecutivo,f.clave,f.fecha_emision::text,f.total_factura,f.moneda,f.estado::text,v.orden_id AS orden_asignada
    FROM facturas_proveedores f LEFT JOIN orden_compra_ciclo_factura v ON v.factura_id=f.id AND v.estado='vigente'
    WHERE regexp_replace(upper(f.proveedor_cedula),'[^A-Z0-9]','','g')=$1 AND f.clave ~ '^[0-9]{50}$'
      AND f.estado::text IN ('RECIBIDA','PROCESADA','RELACIONADA','ENVIADA')
      AND (f.numero_consecutivo ILIKE $2 OR f.clave ILIKE $2)
      AND EXISTS(SELECT 1 FROM productos_factura_proveedor l WHERE l.factura_id=f.id)
    ORDER BY f.fecha_emision DESC,f.id LIMIT 21 OFFSET $3`,[identidad(o.proveedor_cedula),'%'+buscar.trim()+'%',(n-1)*20]);
  return {facturas:rows.slice(0,20),pagina:n,hayMas:rows.length>20};
})}
async function propuestaEn(db,o,facturaId){
  enviada(o);const {rows:[previo]}=await db.query("SELECT orden_id FROM orden_compra_ciclo_factura WHERE factura_id=$1 AND estado='vigente'",[uuid(facturaId)]);
  if(previo)throw httpError(409,`La factura ya está vinculada a OC-${previo.orden_id}. No se contará dos veces.`);
  const fuente=await fuenteEn(db,o,facturaId),vinculos=await vinculosEn(db,o),contexto=vinculos.filter(v=>v.estado==='vigente').map(v=>v.id).sort();
  return {...fuente,firma:hash(fuente),revision:hash({version:o.version,fuente,contexto}),version:o.version,
    comparacion:comparar(o,[...vinculos,{...fuente}])};
}
async function proponer(id,facturaId){return enOrden(async db=>propuestaEn(db,await ordenEn(db,id),facturaId))}
async function vincular(id,datos,usuarioId){
  const clave=uuid(datos?.clave),facturaId=uuid(datos?.facturaId);
  if(datos?.confirmar!==true)throw httpError(400,'Revisá la factura y la comparación antes de vincular.');
  const solicitud={facturaId,version:datos.version,revision:datos.revision};
  return enOrden(async db=>{
    const o=await ordenEn(db,id,{bloquear:true});
    const {rows:[previa]}=await db.query('SELECT orden_id,solicitud FROM orden_compra_ciclo_factura WHERE id=$1',[clave]);
    if(previa){if(previa.orden_id!==o.id||hash(previa.solicitud)!==hash(solicitud))throw httpError(409,'Esa clave ya corresponde a otro vínculo.');return datosEn(db,o)}
    revision(o,datos.version);const p=await propuestaEn(db,o,facturaId);
    if(p.revision!==datos.revision)throw httpError(409,'Cambió la factura, su relación o la comparación. Revisá de nuevo antes de vincular.');
    await db.query(`INSERT INTO orden_compra_ciclo_factura(id,orden_id,factura_id,solicitud,documento,lineas,firma,creado_por)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[clave,o.id,facturaId,solicitud,p.documento,JSON.stringify(p.lineas),p.firma,usuarioId||null]);
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'vincular_factura',despues:{vinculoId:clave,facturaId,firma:p.firma},usuarioId});
    return datosEn(db,o);
  });
}
async function vinculoEn(db,o,id){const {rows:[v]}=await db.query('SELECT * FROM orden_compra_ciclo_factura WHERE id=$1 AND orden_id=$2 FOR UPDATE',[uuid(id),o.id]);if(!v)throw httpError(404,'El vínculo no corresponde a esta orden.');return v}
async function retirar(id,vinculoId,datos,usuarioId){
  const motivo=typeof datos?.motivo==='string'?datos.motivo.trim():'';if(!motivo||motivo.length>1000)throw httpError(400,'Indicá el motivo para corregir el vínculo (hasta 1000 caracteres).');
  return enOrden(async db=>{const o=await ordenEn(db,id,{bloquear:true}),v=await vinculoEn(db,o,vinculoId);enviada(o);
    if((await db.query('SELECT 1 FROM orden_compra_ciclo_recepcion_linea WHERE vinculo_id=$1 LIMIT 1',[v.id])).rows.length)throw httpError(409,'Este vínculo respalda una recepción física; no se retira sin corregir esa recepción.');
    if(v.estado==='vigente'){await db.query("UPDATE orden_compra_ciclo_factura SET estado='retirada',motivo=$2,retirado_por=$3,retirado_en=NOW() WHERE id=$1",[v.id,motivo,usuarioId||null]);
      await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'retirar_factura',despues:{vinculoId:v.id},usuarioId,motivo});}
    return datosEn(db,o);
  });
}
async function guardarPdf(id,vinculoId,datos,buffer,usuarioId){
  const clave=uuid(datos?.clave),tipo=datos?.tipo;
  if(!['original_adjuntado','representacion_buzon'].includes(tipo))throw httpError(400,'Tipo de PDF inválido.');
  if(tipo==='original_adjuntado'){
    if(![true,'true'].includes(datos.confirmar))throw httpError(400,'Confirmá que el PDF corresponde a esta factura y proveedor.');archivos.validarPdf(buffer);
  }
  let archivo,filaCreada=false;
  try{return await enOrden(async db=>{
    const o=await ordenEn(db,id),v=await vinculoEn(db,o,vinculoId);
    const {rows:[previa]}=await db.query('SELECT vinculo_id,tipo,sha256 FROM orden_compra_ciclo_factura_pdf WHERE id=$1',[clave]);
    if(previa){if(previa.vinculo_id!==v.id||previa.tipo!==tipo||(tipo==='original_adjuntado'&&previa.sha256!==archivos.sha(buffer)))throw httpError(409,'La clave de PDF ya corresponde a otra copia.');return datosEn(db,o)}
    if(v.estado!=='vigente')throw httpError(409,'Retiraste este vínculo; no admite nuevos PDF.');
    const pdf=tipo==='original_adjuntado'?buffer:await generarRepresentacion(v);archivo=await archivos.guardar(pdf,clave);
    await db.query('INSERT INTO orden_compra_ciclo_factura_pdf(id,vinculo_id,tipo,ruta,sha256,bytes,creado_por) VALUES($1,$2,$3,$4,$5,$6,$7)',[clave,v.id,tipo,archivo.ruta,archivo.sha256,archivo.bytes,usuarioId||null]);filaCreada=true;
    await registrarCambio(db,{entidad:'orden_compra_ciclo',entidadId:o.id,accion:'adjuntar_pdf_factura',despues:{vinculoId:v.id,pdfId:clave,tipo,sha256:archivo.sha256},usuarioId});return datosEn(db,o);
  })}catch(e){if(archivo&&!filaCreada)await archivos.borrar(archivo.ruta).catch(()=>{});throw e}
}
async function descargarPdf(id,vinculoId,pdfId){return enOrden(async db=>{
  const o=await ordenEn(db,id),v=await vinculoEn(db,o,vinculoId),{rows:[p]}=await db.query('SELECT * FROM orden_compra_ciclo_factura_pdf WHERE id=$1 AND vinculo_id=$2',[uuid(pdfId),v.id]);
  if(!p)throw httpError(404,'Este PDF no corresponde a la factura de la orden.');
  return {pdf:await archivos.leer(p),nombreArchivo:`factura-${v.factura_id}-${p.tipo}.pdf`};
})}
module.exports={consultar,candidatas,proponer,vincular,retirar,guardarPdf,descargarPdf,comparar,interno:{uuid,identidad,hash}};
