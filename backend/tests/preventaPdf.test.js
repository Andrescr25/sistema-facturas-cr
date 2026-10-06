/** PostgreSQL real y ROLLBACK en copia desechable; doble solo del transporte. */
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const habilitadas=process.env.PROBAR_BASE_LOCAL==='1',caso=(n,fn)=>test(n,{skip:!habilitadas},fn),nombre=s=>`ZZ ${s} ${randomUUID().slice(0,8)}`;
let db,rutas,clientes,servicio,preventa,ventas,ruta,cliente,ajeno,ciclo,otroCiclo,propios=[],ajenoProducto,ocultos=[],documento;
if(habilitadas){
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
  const poolReal=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:1});let conexion,nivel=0;
  const ejecutar=(sql,p)=>conexion.query(sql,p);
  db={query:ejecutar,pool:{query:ejecutar,connect:async()=>{const s=`preventa_pdf_${++nivel}`;return{query:(sql,p)=>{
    if(sql==='BEGIN')return ejecutar(`SAVEPOINT ${s}`);
    if(sql==='COMMIT')return ejecutar(`RELEASE SAVEPOINT ${s}`);
    if(sql==='ROLLBACK')return ejecutar(`ROLLBACK TO SAVEPOINT ${s}`);
    return ejecutar(sql,p);
  },release(){}};}}};
  const modulo=require.resolve('../config/database');require.cache[modulo]={id:modulo,filename:modulo,loaded:true,exports:db};
  after(async()=>{if(conexion){await conexion.query('ROLLBACK');conexion.release();}await poolReal.end();});
  rutas=require('../src/modules/rutas/rutas.service');clientes=require('../src/modules/clientes/clientes.service');
  servicio=require('../src/modules/portal-clientes/preventaPdf.service');preventa=require('../src/modules/portal-clientes/preventa.service');
  ventas=require('../src/modules/facturacion/facturaPropia.service');
  before(async()=>{
    conexion=await poolReal.connect();await conexion.query('BEGIN');
    ruta=await rutas.crearRuta({nombre:nombre('Ruta PDF')});
    cliente=await clientes.crearCliente({nombre:nombre('Cliente PDF sin cuenta'),ruta_id:ruta.id});
    ajeno=await clientes.crearCliente({nombre:nombre('Ajeno PDF'),ruta_id:ruta.id});
    ciclo=await rutas.crearCiclo(ruta.id,{semana:'2026-10-19'});otroCiclo=await rutas.crearCiclo(ruta.id,{semana:'2026-10-26'});
    for(const tarifa of [0,1,2,4,8,13]){
      const imp=(await db.query('SELECT id FROM impuesto WHERE tarifa=$1 AND activo LIMIT 1',[tarifa])).rows[0];assert.ok(imp,`Tarifa ${tarifa}`);
      const p=(await db.query('INSERT INTO producto(nombre,precio_sin_iva,impuesto_id,referencia) VALUES($1,1000,$2,$3) RETURNING id',[nombre('IVA '+tarifa),imp.id,'ZZ REF '+tarifa])).rows[0];propios.push({id:p.id,tarifa});
    }
    ajenoProducto=(await db.query('INSERT INTO producto(nombre,precio_sin_iva) VALUES($1,1200) RETURNING id',[nombre('Habitual ajeno')])).rows[0].id;
    for(const sql of ['FALSE,FALSE,100','TRUE,TRUE,100','TRUE,FALSE,0'])ocultos.push((await db.query(`INSERT INTO producto(nombre,activo,oculto,precio_sin_iva) VALUES($1,${sql}) RETURNING id`,[nombre('Visibilidad')])).rows[0].id);
    for(let i=0;i<2;i++){
      await ventas.crearFactura({clienteId:cliente.id,items:[{productoId:propios[0].id,quantity:1,price:1000}]},null);
      await ventas.crearFactura({clienteId:ajeno.id,items:[{productoId:ajenoProducto,quantity:1,price:1200}]},null);
    }
    for(let i=0;i<3;i++){
      const f=await ventas.crearFactura({clienteId:cliente.id,items:[{productoId:propios[1].id,quantity:1,price:1000}]},null);
      await db.query('UPDATE factura SET fecha=CURRENT_DATE-100 WHERE id=$1',[f.id]);
    }
  });
}
const productos=m=>m.secciones.flatMap(s=>s.productos);
caso('PDF completo incluye todos los visibles sin límite de paginación ni filtro por stock',async()=>{
  const m=await servicio.modeloCatalogo(cliente.id,ciclo.id);
  const n=(await db.query('SELECT COUNT(*)::int n FROM producto WHERE activo AND NOT oculto AND precio_sin_iva>0')).rows[0].n;
  assert.equal(m.total,n);assert.ok(n>120);assert.equal(new Set(productos(m).map(p=>p.id)).size,n);
  assert.ok(propios.every(p=>productos(m).some(f=>f.id===p.id)));assert.ok(ocultos.every(id=>!productos(m).some(f=>f.id===id)));
});
caso('selección usa hábitos del cliente sin cantidades ni historial ajenos',async()=>{
  const m=await servicio.modeloCatalogo(cliente.id,ciclo.id,'seleccion');
  assert.ok(productos(m).some(p=>p.id===propios[0].id));
  assert.ok(productos(m).some(p=>p.id===propios[1].id));
  assert.ok(m.secciones.every(s=>s.subcategoria && !['Tus productos habituales','Para volver a pedir','Ofertas y precios rebajados'].includes(s.titulo)));
  assert.ok(!productos(m).some(p=>p.id===ajenoProducto));
  for(const p of productos(m))assert.deepEqual(Object.keys(p).sort(),['id','codigo','referencia','nombre','categoria','subcategoria','precio','precioAnterior','imagen','etiquetas'].sort());
  assert.equal(m.cliente,cliente.nombre);assert.equal(m.ciclo.semana,'2026-10-19');
});
caso('cada producto lleva su propio IVA y código estable con referencia de ficha',async()=>{
  const m=await servicio.modeloCatalogo(cliente.id,ciclo.id);
  for(const p of propios){const f=productos(m).find(f=>f.id===p.id);assert.equal(f.precio,Math.round(1000*(1+p.tarifa/100)*100)/100);assert.equal(f.codigo,'P-'+p.id);assert.equal(f.referencia,'ZZ REF '+p.tarifa);}
});
caso('sin historial ni ofertas la selección cae al catálogo completo; cuenta no obligatoria',async()=>{
  const nuevo=await clientes.crearCliente({nombre:nombre('Nuevo sin historia'),ruta_id:ruta.id});
  const semana=await rutas.crearCiclo(ruta.id,{semana:'2026-11-02'});
  await db.query('SAVEPOINT sin_ofertas');
  try{await db.query('DELETE FROM precio_historico');const m=await servicio.modeloCatalogo(nuevo.id,semana.id,'seleccion');assert.equal(m.fallback,true);assert.ok(m.total>120);assert.equal((await db.query('SELECT id FROM cliente_portal WHERE cliente_id=$1',[nuevo.id])).rows.length,0);}
  finally{await db.query('ROLLBACK TO SAVEPOINT sin_ofertas');}
});
const moverStock=(id,cantidad,auditoriaId)=>require('../src/modules/inventario/inventario.service').registrarEn(db,{productoId:id,tipo:'ajuste_auditoria',cantidad,costoUnitario:800,origenTipo:'auditoria_item',origenId:auditoriaId,clave:randomUUID()});
async function promocion(fn) {
  await db.query('SAVEPOINT promocion_catalogo');
  try {
    const cat=(await db.query('INSERT INTO categoria_producto(nombre) VALUES($1) RETURNING id,nombre',[nombre('Categoria PDF')])).rows[0];
    await db.query('INSERT INTO categoria_config(categoria,nombre_visible,orden) VALUES($1,$2,-10)',[cat.nombre,'Categoria visible PDF']);
    const subs=[];
    for(const [sub,orden] of [['PVC 10',0],['PVC 2',0],['Primero',-1]])subs.push((await db.query('INSERT INTO subcategoria(categoria,nombre,orden) VALUES($1,$2,$3) RETURNING id,nombre,orden',[cat.nombre,sub,orden])).rows[0]);
    for(const [i,p] of propios.entries())await db.query('UPDATE producto SET categoria_id=$1,subcategoria_id=$2 WHERE id=$3',[cat.id,i<3?subs[i].id:null,p.id]);
    const id=propios[5].id;
    await db.query("INSERT INTO precio_historico(producto_id,precio_anterior,precio_nuevo,costo_al_momento,margen_resultante,origen) VALUES($1,1500,1000,800,20,'revision_precios')",[id]);
    const audit=(await db.query("INSERT INTO inventario_auditorias(nombre,tipo,historica) VALUES($1,'exceso',FALSE) RETURNING id",[nombre('Liquidacion PDF')])).rows[0];
    audit.itemId=(await db.query('INSERT INTO inventario_auditoria_items(auditoria_id,producto_id,nombre_producto,stock_real,empacado) VALUES($1,$2,$3,5,TRUE) RETURNING id',[audit.id,id,nombre('Empaque PDF')])).rows[0].id;
    await moverStock(id,5,audit.itemId);
    await db.query('INSERT INTO producto_descuento_exceso(producto_id,nombre_producto,descuento_porcentaje,historica,regalado) VALUES($1,$2,30,FALSE,FALSE)',[id,nombre('Liquidacion PDF')]);
    await fn({cat,subs,id,audit});
  } finally {await db.query('ROLLBACK TO SAVEPOINT promocion_catalogo');}
}
caso('categorías visibles y orden manual/natural de subcategorías, Otros al final',()=>promocion(async({subs})=>{
  const m=await servicio.modeloCatalogo(cliente.id,ciclo.id),grupo=m.secciones.filter(s=>s.titulo==='Categoria visible PDF');
  assert.equal(m.secciones[0].titulo,'Categoria visible PDF');
  assert.deepEqual(grupo.map(s=>s.subcategoria),['Primero','PVC 2','PVC 10','Otros']);
  assert.equal(grupo.flatMap(s=>s.productos).length,propios.length);
  const fuente=await fs.readFile(path.join(__dirname,'../../frontend/src/utils/catalogoAgentePersonalizacion.js'),'utf8');
  const comparar=new Function(fuente.replace(/^export /gm,'')+';return compararSubcategorias;')();
  assert.deepEqual(grupo.filter(s=>s.subcategoria!=='Otros').map(s=>s.subcategoria),[...subs].sort(comparar).map(s=>s.nombre));
}));
caso('Oferta y Liquidación se integran con los demás, precio final una sola vez',()=>promocion(async({id})=>{
  const m=await servicio.modeloCatalogo(cliente.id,ciclo.id,'seleccion'),p=productos(m).find(p=>p.id===id);
  assert.deepEqual(p.etiquetas,['Oferta','Liquidación']);assert.equal(p.precio,791);assert.equal(p.precioAnterior,1695);
  assert.equal(p.categoria,'Categoria visible PDF');assert.equal(p.subcategoria,'Otros');
  assert.equal(productos(m).filter(p=>p.id===id).length,1);
  assert.ok(m.secciones.every(s=>!['Oferta','Liquidación','Ofertas y precios rebajados'].includes(s.titulo)));
}));
caso('sin stock o histórica no anuncia liquidación ni inventa un descuento',()=>promocion(async({id,audit})=>{
  await moverStock(id,-5,audit.itemId);
  let p=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id)).find(p=>p.id===id);
  assert.deepEqual(p.etiquetas,['Oferta']);assert.equal(p.precio,1130);
  await moverStock(id,5,audit.itemId);await db.query('UPDATE producto_descuento_exceso SET historica=TRUE WHERE producto_id=$1',[id]);
  p=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id)).find(p=>p.id===id);assert.deepEqual(p.etiquetas,['Oferta']);assert.equal(p.precio,1130);
}));
caso('rebaja ya sustituida no anuncia Oferta ni se añade a la selección por ella',()=>promocion(async({id})=>{
  await db.query('UPDATE producto SET precio_sin_iva=1100 WHERE id=$1',[id]);
  const p=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id)).find(p=>p.id===id);
  assert.deepEqual(p.etiquetas,['Liquidación']);assert.equal(p.precio,870.1);assert.equal(p.precioAnterior,1243);
}));
caso('regalía o porcentaje 100 no se publica como liquidación vendible',()=>promocion(async({id})=>{
  await db.query('UPDATE producto_descuento_exceso SET descuento_porcentaje=100 WHERE producto_id=$1',[id]);
  let p=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id)).find(p=>p.id===id);assert.deepEqual(p.etiquetas,['Oferta']);assert.equal(p.precio,1130);
  await db.query('UPDATE producto_descuento_exceso SET descuento_porcentaje=30,regalado=TRUE WHERE producto_id=$1',[id]);
  p=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id)).find(p=>p.id===id);assert.deepEqual(p.etiquetas,['Oferta']);assert.equal(p.precio,1130);
}));
caso('más de cien rebajas vigentes se adjuntan a la selección sin tope público',()=>promocion(async({cat,subs})=>{
  const {rows}=await db.query(`INSERT INTO producto(nombre,precio_sin_iva,categoria_id,subcategoria_id) SELECT 'ZZ Rebaja PDF '||g,1000,$1,$2 FROM generate_series(1,107) g RETURNING id`,[cat.id,subs[0].id]);
  const ids=rows.map(r=>r.id);
  await db.query(`INSERT INTO precio_historico(producto_id,precio_anterior,precio_nuevo,costo_al_momento,margen_resultante,origen) SELECT id,1500,1000,800,20,'revision_precios' FROM unnest($1::int[]) id`,[ids]);
  const ps=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id,'seleccion'));
  assert.equal(ps.filter(p=>ids.includes(p.id)&&p.etiquetas.includes('Oferta')).length,107);assert.equal(new Set(ps.map(p=>p.id)).size,ps.length);
  assert.ok((await require('../src/modules/catalogo-clientes/catalogo-clientes.service').ofertasPorBaja()).length<=40);
}));
caso('subcategoría ajena o inactiva conserva producto en Otros de su categoría',()=>promocion(async({subs})=>{
  await db.query('UPDATE subcategoria SET activo=FALSE WHERE id=$1',[subs[0].id]);await db.query('UPDATE subcategoria SET categoria=$1 WHERE id=$2',['ZZ Otra categoria',subs[1].id]);
  const ps=productos(await servicio.modeloCatalogo(cliente.id,ciclo.id));
  for(const id of [propios[0].id,propios[1].id]){const p=ps.find(p=>p.id===id);assert.equal(p.categoria,'Categoria visible PDF');assert.equal(p.subcategoria,'Otros');}
}));
caso('renderer mantiene etiquetas y nombres largos en tarjetas con varias páginas',()=>promocion(async({id})=>{
  await db.query('UPDATE producto SET nombre=$1,referencia=$2 WHERE id=$3',['ZZ '+('Producto con nombre largo '.repeat(9)).trim(),'ZZ-REF-LARGA-1234567890',id]);
  const m=await servicio.modeloCatalogo(cliente.id,ciclo.id,'seleccion');
  const pdf=await require('../src/modules/portal-clientes/preventa.pdf').generarPdfCatalogo(m);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const artefacto=process.env.ALMACENAMIENTO_PRIVADO_DIR;
  await fs.mkdir(artefacto,{recursive:true});await fs.writeFile(path.join(artefacto,'prueba-etiquetas.pdf'),pdf,{mode:0o600});
}));
caso('alcance o ciclo inválidos no generan documentos',async()=>{
  await assert.rejects(servicio.preparar(cliente.id,{cicloId:ciclo.id,alcance:'inventado'}),e=>e.status===400);
  await assert.rejects(servicio.preparar(cliente.id,{cicloId:2147483647}),e=>[400,404].includes(e.status));
});
caso('preparar produce PDF privado con hash, cliente y semana',async()=>{
  documento=await servicio.preparar(cliente.id,{cicloId:ciclo.id,alcance:'seleccion'});
  const {pdf,documento:leido}=await servicio.leer(cliente.id,ciclo.id,documento.id);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal(pdf.length,documento.bytes);assert.match(documento.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(leido,documento);
  const archivo=path.join(require('../src/integrations/almacenamiento').RAIZ_PRIVADA,'preventa-pdf',documento.id+'.pdf');assert.equal((await fs.stat(archivo)).mode&0o777,0o600);
});
caso('descarga no acepta otra ficha, semana, ruta arbitraria ni id inexistente',async()=>{
  await assert.rejects(servicio.leer(ajeno.id,ciclo.id,documento.id),e=>e.status===404);
  await assert.rejects(servicio.leer(cliente.id,otroCiclo.id,documento.id),e=>e.status===404);
  await assert.rejects(servicio.leer(cliente.id,ciclo.id,'../../config/database'),e=>e.status===400);
  await assert.rejects(servicio.leer(cliente.id,ciclo.id,randomUUID()),e=>e.status===404);
});
caso('copia revisada conserva bytes y precio aunque después cambie el maestro',async()=>{
  const a=await servicio.leer(cliente.id,ciclo.id,documento.id);await db.query('UPDATE producto SET precio_sin_iva=2000 WHERE id=$1',[propios[0].id]);
  const b=await servicio.leer(cliente.id,ciclo.id,documento.id);assert.deepEqual(a.pdf,b.pdf);assert.equal(a.documento.sha256,b.documento.sha256);
  assert.equal(productos(await servicio.modeloCatalogo(cliente.id,ciclo.id)).find(p=>p.id===propios[0].id).precio,2000);
});
caso('envío sin cuenta adjunta copia revisada y enlace; no crea pedido ni invitación',async()=>{
  const transporte=require('../src/integrations/whatsapp'),original=transporte.enviarDocumento;let enviado;
  transporte.enviarDocumento=async d=>{enviado=d;return{numero:'50688888888',telefono:'88888888'};};
  const antes=(await db.query('SELECT COUNT(*)::int n FROM pedido_cliente')).rows[0].n;
  try{const token=preventa.crearToken(cliente.id,ciclo.id);await preventa.enviar(cliente.id,{cicloId:ciclo.id,token,pdfId:documento.id,telefono:'88888888',mensaje:`PDF y pedido por WhatsApp. http://localhost/catalogo?preventa=${token}`},null);
    assert.deepEqual(enviado.pdf,(await servicio.leer(cliente.id,ciclo.id,documento.id)).pdf);assert.equal(enviado.nombreArchivo,documento.nombreArchivo);assert.ok(enviado.mensaje.includes(token));
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM pedido_cliente')).rows[0].n,antes);
    for(const t of ['cliente_portal','cliente_invitacion'])assert.equal((await db.query(`SELECT id FROM ${t} WHERE cliente_id=$1`,[cliente.id])).rows.length,0);
    const h=await require('../src/modules/envios-whatsapp/envios.service').historial({tipo:'preventa',referencia:`${ciclo.id}:${cliente.id}`});assert.equal(h[0].exito,true);
  }finally{transporte.enviarDocumento=original;}
});
caso('archivo modificado se rechaza antes del transporte',async()=>{
  const archivo=path.join(require('../src/integrations/almacenamiento').RAIZ_PRIVADA,'preventa-pdf',documento.id+'.pdf'),original=await fs.readFile(archivo);
  try{await fs.writeFile(archivo,Buffer.from('PDF alterado'));await assert.rejects(servicio.leer(cliente.id,ciclo.id,documento.id),e=>e.status===409);}
  finally{await fs.writeFile(archivo,original);}
});
caso('revocar cuenta bloquea generar y descargar sin reactivarla',async()=>{
  await db.query('INSERT INTO cliente_portal(cliente_id,nombre,activo) VALUES($1,$2,FALSE)',[cliente.id,cliente.nombre]);
  await assert.rejects(servicio.preparar(cliente.id,{cicloId:ciclo.id}),e=>e.status===409);await assert.rejects(servicio.leer(cliente.id,ciclo.id,documento.id),e=>e.status===409);
  await db.query('UPDATE cliente_portal SET activo=TRUE WHERE cliente_id=$1',[cliente.id]);
});
caso('cancelar ciclo bloquea generar, descargar y enviar el PDF abierto',async()=>{
  await rutas.cambiarEstadoCiclo(ciclo.id,{estado:'cancelado',estadoAnterior:'preventa'});
  await assert.rejects(servicio.preparar(cliente.id,{cicloId:ciclo.id}),e=>e.status===409);await assert.rejects(servicio.leer(cliente.id,ciclo.id,documento.id),e=>e.status===409);
  await assert.rejects(preventa.enviar(cliente.id,{cicloId:ciclo.id,token:preventa.crearToken(cliente.id,ciclo.id),pdfId:documento.id},null),e=>e.status===409);
});
