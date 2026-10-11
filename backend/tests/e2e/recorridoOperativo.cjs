/**
 * Recorrido real Chromium, separado de la suite nativa (no instala Playwright).
 * Solo node --test, clon tachi_codex_*, puertos 3003/5175 y directorio privado.
 * El anfitrión debe preparar base-prueba.cjs y un servidor de pruebas con
 * WhatsApp sustituido y sockets externos bloqueados. Nunca usar server.js
 * ordinario: NODE_TEST_CONTEXT exceptúa las guardas de transporte existentes.
 * Ver docs/informes/recorrido-visual-2026-10-07.md para el alcance y montaje.
 */
const path=require('node:path'),fsInicial=require('node:fs');
const directorio=process.env.RECORRIDO_PRUEBA_DIR;
if(!directorio||!path.isAbsolute(directorio)||!process.env.NODE_TEST_CONTEXT)throw Error('Requiere node --test y directorio propio absoluto.');
if((fsInicial.statSync(directorio).mode&0o077)!==0)throw Error('La evidencia debe ser privada (0700).');
require(path.join(directorio,'base-prueba.cjs'));
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULO);
const b=path.resolve(__dirname,'../..'),db=require(b+'/config/database'),fixture=require(b+'/tests/fixtures/contextoCadena');
assert.ok(process.env.NODE_TEST_CONTEXT);assert.match(process.env.RECORRIDO_DB_NOMBRE||'',/^tachi_codex_[a-z0-9_]+$/);assert.equal(new URL(process.env.DATABASE_URL).pathname,'/'+process.env.RECORRIDO_DB_NOMBRE);assert.equal(process.env.PROBAR_BASE_LOCAL,'1');
const cp=require('node:child_process'),pid=Number(fsInicial.readFileSync(directorio+'/backend.pid','utf8'));
assert.equal(cp.execFileSync('lsof',['-t','-nP','-iTCP:3003','-sTCP:LISTEN'],{encoding:'utf8'}).trim(),String(pid));
assert.ok(cp.execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes(directorio+'/servidor-prueba.cjs'));
assert.ok([1440,390].includes(Number(process.env.ANCHO_PRUEBA||1440)));
let browser,d,ctx,portal,page,etapa='inicio',vistas=0;const errores=[],writes=[],consultasPost=[],pasos=[],downloads=[];let legado=0,tardia=null,lecturasRecepcion=0;
const sha=x=>createHash('sha256').update(x).digest('hex'),stock=async()=>Number((await db.query('SELECT existencia FROM inventario_saldo WHERE producto_id=$1',[d.producto])).rows[0].existencia);
async function paso(nombre,fn){etapa=nombre;await fn();pasos.push(nombre);console.log('Aprobado: '+nombre)}
async function context(token,key='sistema_facturas_token'){
 const c=await browser.newContext({viewport:{width:Number(process.env.ANCHO_PRUEBA||1440),height:1000},acceptDownloads:true});
 await c.addInitScript(({token,key})=>localStorage.setItem(key,token),{token,key});
 await c.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(!['localhost','127.0.0.1'].includes(u.hostname)||!['3003','5175'].includes(u.port))return route.abort();
 if(u.pathname.startsWith('/api/')&&/limpia|hacienda|gmail|alegra\//i.test(u.pathname))throw Error('ZZ camino excluido');
 if(u.pathname==='/api/reportes/faltantes/proveedor'&&!u.searchParams.get('rutaId')&&!u.searchParams.get('cicloId')){legado++;return route.fulfill({status:503,json:{success:false,message:'ZZ reporte global excluido'}})}
 if(r.method()==='POST'&&u.pathname==='/api/revision-precios/productos-batch'){consultasPost.push(u.pathname)}else if(!['GET','HEAD'].includes(r.method())){assert.match(u.pathname,/^\/api\/(portal\/(carrito|pedidos)|portal-clientes\/(pedidos|clientes\/\d+\/preventa)|clientes\/rutas|bodega\/facturas-propias|orden-compra\/por-ciclo|proveedores\/asignaciones|compras\/registrar|entregas\/facturas)/);writes.push(r.method()+' '+u.pathname)}
 if(r.method()==='GET'&&u.pathname==='/api/orden-compra/por-ciclo/'+d.ordenes[0].id+'/recepciones'&&++lecturasRecepcion===1){
   const response=await route.fetch({maxRedirects:0});let liberar,finalizar;const espera=new Promise(r=>liberar=r),finalizada=new Promise(r=>finalizar=r);tardia={liberar,finalizada};await espera;await route.fulfill({response});finalizar();return;
 }await route.continue()});return c;
}
async function screenshot(nombre,p=page){vistas++;for(const width of [1440,390]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,nombre+' desborda');await p.screenshot({path:directorio+'/'+nombre+'-'+width+'.png',fullPage:true,mask:[p.locator('textarea[aria-label="Enlace de preventa"],textarea[aria-label="Mensaje"]')]})}await p.setViewportSize({width:Number(process.env.ANCHO_PRUEBA||1440),height:1000})}
async function accion(path,method,click,p=page){const promise=p.waitForResponse(r=>new URL(r.url()).pathname===('/api'+path)&&r.request().method()===method);await click();const r=await promise;const json=await r.json();assert.ok(r.ok(),etapa+' HTTP '+r.status()+' '+(json.message||''));return json}
async function filtrar(ruta,ciclo){await page.goto('http://localhost:5175'+ruta);await page.getByRole('combobox',{name:'Filtrar ruta',exact:true}).selectOption(String(d.ruta.id));await page.getByRole('combobox',{name:'Filtrar semana o ciclo',exact:true}).selectOption(String(ciclo))}
async function orden(id,ciclo=d.proximo.id,vista='activas'){await filtrar('/reportes/proveedores',ciclo);await page.getByRole('button',{name:'Órdenes por ciclo',exact:true}).click();if(vista!=='activas')await page.getByRole('combobox',{name:'Mostrar órdenes'}).selectOption(vista);await page.getByRole('button').filter({hasText:'OC-'+id+' · '+d.proveedor.nombre}).click();await page.getByRole('heading',{name:'OC-'+id+' · '+d.proveedor.nombre,exact:true}).waitFor()}
async function descargar(button,nombre,p=page){const promise=p.waitForEvent('download');await button.click();const dl=await promise;assert.equal(await dl.failure(),null);const path=directorio+'/'+nombre;await dl.saveAs(path);await fs.chmod(path,0o600);const bytes=await fs.readFile(path);downloads.push({nombre,sha256:sha(bytes),bytes:bytes.length});return bytes}
async function estadoCiclo(ciclo,fecha,estado){await page.goto('http://localhost:5175/clientes');await page.getByRole('button',{name:'Rutas',exact:true}).click();await page.getByRole('combobox',{name:'Seleccionar ruta'}).selectOption(String(d.ruta.id));const card=page.locator('article').filter({hasText:'semana '+fecha});await card.getByRole('button',{name:estado,exact:true}).click();await accion('/clientes/rutas/ciclos/'+ciclo+'/estado','PATCH',()=>page.getByRole('button',{name:'Continuar',exact:true}).click())}
async function entrega(factura,accionFisica,cantidad){const section=page.getByRole('region',{name:'Registro físico de factura '+factura});await section.getByRole('combobox').selectOption(accionFisica);await section.getByRole('spinbutton',{name:'Cantidad nueva línea 1'}).fill(String(cantidad));await section.getByRole('checkbox',{name:'Verifiqué físicamente las cantidades y el motivo de este registro.'}).check();await accion('/entregas/facturas/'+factura+'/eventos','POST',()=>section.getByRole('button',{name:accionFisica==='carga'?'Registrar carga':'Registrar entrega',exact:true}).click())}
(async()=>{
 d=await fixture.crear(db);
 await db.query("UPDATE cliente SET telefono='88888888' WHERE id=$1",[d.a.id]);
 const p=(await db.query('SELECT nombre FROM producto WHERE id=$1',[d.producto])).rows[0];
 const jwt=require(b+'/node_modules/jsonwebtoken'),personal=jwt.sign({sub:String(d.actor)},process.env.JWT_SECRET,{expiresIn:'2h'});
 const cliente=require(b+'/src/modules/portal-clientes/portal-clientes.auth').firmarToken({id:d.cuenta,cliente_id:d.a.id,nombre:d.a.nombre});
 browser=await chromium.launch({headless:true});ctx=await context(personal);page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errores.push(e.message));
 let enlace,pedido,factura,nueva,numeroFactura,proveedorFactura;
 await paso('ficha y recorrido fijo',async()=>{
  await page.goto('http://localhost:5175/clientes');await page.getByLabel('Buscar clientes').fill(d.a.nombre);await page.getByRole('button',{name:d.a.nombre,exact:true}).click();await page.getByRole('button',{name:'Historial',exact:true}).click();await screenshot('01-ficha');
  await page.goto('http://localhost:5175/clientes');await page.getByRole('button',{name:'Rutas',exact:true}).click();await page.getByRole('combobox',{name:'Seleccionar ruta'}).selectOption(String(d.ruta.id));await page.getByRole('button',{name:'Bajar '+d.a.nombre,exact:true}).click();await accion('/clientes/rutas/'+d.ruta.id+'/orden','PUT',()=>page.getByRole('button',{name:'Guardar orden',exact:true}).click());
  assert.deepEqual((await db.query('SELECT cliente_id FROM ciclo_ruta_cliente WHERE ciclo_id=$1 ORDER BY orden',[d.proximo.id])).rows.map(x=>x.cliente_id),[d.a.id,d.b.id]);
  const card=page.locator('article').filter({hasText:'semana 19/10/2026'});await card.getByRole('button',{name:'Ver recorrido'}).click();await screenshot('02-recorrido-original');
 });
 await paso('preventa PDF y envío revisado simulado',async()=>{
  await page.getByRole('button',{name:'Preparar catálogo',exact:true}).first().click();await page.getByRole('combobox',{name:'Contenido del PDF'}).selectOption('seleccion');await page.getByRole('button',{name:'Preparar PDF',exact:true}).click();await page.getByRole('link',{name:'Descargar PDF',exact:true}).waitFor();enlace=await page.getByRole('textbox',{name:'Enlace de preventa'}).inputValue();assert.ok(new URL(enlace).searchParams.get('preventa'));
  const bytes=await descargar(page.getByRole('link',{name:'Descargar PDF',exact:true}),'catalogo.pdf');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await screenshot('03-catalogo-pdf');
  await page.getByRole('button',{name:'Revisar envío por WhatsApp'}).click();assert.match(await page.getByRole('textbox',{name:'Mensaje',exact:true}).inputValue(),/CATÁLOGO DE PRODUCTOS/);await screenshot('04-envio-catalogo');
  await accion('/portal-clientes/clientes/'+d.a.id+'/preventa/whatsapp','POST',()=>page.getByRole('button',{name:/^Enviar(?: al |$)/}).click());
 });
 await paso('cliente pide tres anticipadas en línea',async()=>{
  portal=await context(cliente,'portal_cliente_token');const cp=await portal.newPage();cp.setDefaultTimeout(12000);cp.on('pageerror',e=>errores.push(e.message));await cp.goto(enlace);await cp.getByPlaceholder('Buscar producto...').fill(p.nombre);await cp.getByRole('button',{name:'Agregar',exact:true}).first().click();await cp.getByRole('spinbutton',{name:'Cantidad de '+p.nombre,exact:true}).fill('3');await cp.getByRole('spinbutton',{name:'Cantidad de '+p.nombre,exact:true}).blur();await cp.getByRole('button',{name:/Ver pedido/}).click();await screenshot('05-pedido-proxima-semana',cp);
  const r=await accion('/portal/pedidos','POST',()=>cp.getByRole('button',{name:'Enviar pedido',exact:true}).click(),cp);pedido=r.data.id;assert.ok(pedido);await cp.getByText('Pedido enviado',{exact:true}).waitFor();await cp.goto('http://localhost:5175/portal/pedidos');await cp.getByText('Pedido #'+pedido,{exact:true}).waitFor();await screenshot('06-pedido-enviado',cp);await portal.close();portal=null;
 });
 await paso('facturación conserva semana y anticipado',async()=>{
  await page.goto('http://localhost:5175/clientes');await page.getByRole('button',{name:/^Pedidos(?: \(|$)/}).click();await page.getByRole('combobox',{name:'Filtrar pedidos por ruta'}).selectOption(String(d.ruta.id));await page.getByRole('combobox',{name:'Filtrar pedidos por ciclo'}).selectOption(String(d.proximo.id));
  await page.getByRole('button',{name:'Facturar',exact:true}).click();
  const r=await accion('/portal-clientes/pedidos/'+pedido+'/facturar','POST',()=>page.getByRole('button',{name:'Confirmar',exact:true}).last().click());factura=r.data.facturaId;assert.ok(factura);
  const f=(await db.query('SELECT numero,ciclo_ruta_cliente_id,preventa_anticipada FROM factura WHERE id=$1',[factura])).rows[0];numeroFactura=f.numero;assert.equal(f.ciclo_ruta_cliente_id,d.proximo.clientes[0].id);assert.equal(f.preventa_anticipada,true);await screenshot('07-pedido-facturado');
 });
 await paso('bodega registra faltante tres de la próxima semana',async()=>{
  await filtrar('/facturas-bodega',d.proximo.id);await page.getByRole('button').filter({hasText:numeroFactura}).click();await page.getByRole('button',{name:'Faltó Todo',exact:true}).click();await accion('/bodega/facturas-propias/'+factura+'/estado','POST',()=>page.getByRole('button',{name:'Registrar 1 faltante',exact:true}).click());await page.getByRole('button',{name:'Siguiente pedido',exact:true}).click();await screenshot('08-bodega');
  assert.equal(Number((await db.query('SELECT cantidad_faltante FROM faltantes WHERE factura_propia_id=$1',[factura])).rows[0].cantidad_faltante),3);
 });
 await paso('asignar proveedor solo en el ciclo seleccionado',async()=>{
  const antes=(await db.query('SELECT md5(to_jsonb(x)::text) h FROM faltantes x JOIN factura f ON f.id=x.factura_propia_id LEFT JOIN ciclo_ruta_cliente rc ON rc.id=f.ciclo_ruta_cliente_id WHERE COALESCE(rc.ciclo_id,0)<>$1 ORDER BY x.id',[d.proximo.id])).rows;
  await filtrar('/reportes/proveedores',d.proximo.id);await page.getByRole('button',{name:'Faltantes y órdenes',exact:true}).click();await page.getByRole('button').filter({hasText:'Sin_Proveedor'}).click();await page.getByRole('checkbox',{name:'Seleccionar '+p.nombre+' para asignar proveedor'}).check();await page.getByRole('button',{name:'Asignar proveedor en este ciclo'}).click();await page.getByPlaceholder('Buscar nombre de entidad...').fill(d.proveedor.nombre);await page.getByRole('button',{name:'Buscar',exact:true}).click();await screenshot('09a-asignar-modal');await accion('/proveedores/asignaciones','POST',()=>page.getByRole('button').filter({hasText:d.proveedor.nombre}).last().click());
  assert.deepEqual((await db.query('SELECT md5(to_jsonb(x)::text) h FROM faltantes x JOIN factura f ON f.id=x.factura_propia_id LEFT JOIN ciclo_ruta_cliente rc ON rc.id=f.ciclo_ruta_cliente_id WHERE COALESCE(rc.ciclo_id,0)<>$1 ORDER BY x.id',[d.proximo.id])).rows,antes);await screenshot('09-asignacion-ciclo');
 });
 await paso('nueva compra tres sin ampliar órdenes enviadas',async()=>{
  const antiguas=await d.s.ordenes.obtener(d.ordenes[1].id);
  await page.getByRole('button').filter({hasText:d.proveedor.nombre}).click();await page.getByRole('button',{name:'Preparar orden de este ciclo'}).click();const q=page.getByRole('spinbutton',{name:'Cantidad del proveedor de '+p.nombre});assert.equal(await q.inputValue(),'3');await screenshot('10-borrador-tres');
  const r=await accion('/orden-compra/por-ciclo','POST',()=>page.getByRole('button',{name:'Guardar borrador',exact:true}).click());nueva=r.data.id;await accion('/orden-compra/por-ciclo/'+nueva+'/estado','PATCH',()=>page.getByRole('button',{name:'Marcar pendiente de enviar'}).click());
  await page.getByRole('textbox',{name:'Número de WhatsApp de la orden'}).fill('88888888');await page.getByRole('button',{name:'Preparar PDF para revisar'}).click();await page.getByRole('button',{name:'Revisar PDF guardado'}).click();const copy=await descargar(page.getByRole('link',{name:'Descargar PDF',exact:true}),'orden.pdf');assert.equal(copy.subarray(0,5).toString(),'%PDF-');await page.getByRole('checkbox',{name:'Revisé el PDF, el número y el mensaje de esta orden.'}).check();await page.getByRole('button',{name:'Enviar esta copia por WhatsApp'}).click();await page.getByText('Pedido original: 3 unidades del proveedor',{exact:true}).waitFor();assert.equal(await q.count(),0);await screenshot('11-orden-enviada');
  const posterior=await d.s.ordenes.obtener(d.ordenes[1].id);assert.deepEqual(posterior.lineas,antiguas.lineas);assert.equal(posterior.lineas[0].cantidad_proveedor,4);
 });
 await paso('factura electrónica vinculada y PDF privado',async()=>{
  // Solo la llegada del buzón es una entrada externa sintética. La vinculación,
  // representación, compra y recepción siguientes usan las pantallas reales.
  proveedorFactura=randomUUID();const linea=randomUUID(),clave=Array.from(randomBytes(50),n=>n%10).join('');const numero='ZZ-NUEVA-'+randomUUID().slice(0,8);
  await db.query("INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,fecha_emision,fecha_procesada,total_productos,total_factura,archivo_xml,estado,porcentaje_relacionado) VALUES($1,$2,$3,$4,$5,'2026-10-07',NOW(),1,30,'ZZ.xml','PROCESADA',100)",[proveedorFactura,clave,numero,d.proveedor.nombre,d.proveedor.identificacion]);
  await db.query("INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado) VALUES($1,$2,1,'ZZ-CAD','ZZ Producto',3,'Unid',10,0,0,30,$3,$4,'RELACIONADO')",[linea,proveedorFactura,d.producto,d.mapping]);
  await page.getByRole('textbox',{name:'Buscar factura de este proveedor'}).fill(numero);await page.getByRole('button',{name:'Consultar facturas del proveedor'}).click();await page.getByRole('button',{name:'Revisar factura '+numero,exact:true}).click();await page.getByRole('checkbox').filter({hasText:/Revis/}).count();
  const sec=page.getByRole('region',{name:'Facturas del proveedor de la orden'});await sec.getByRole('checkbox').first().check();await sec.getByRole('button',{name:'Vincular esta factura'}).click();await sec.getByRole('button',{name:'Generar representación de factura '+numero}).click();await sec.getByRole('button',{name:'Ver Representación de datos del sistema'}).click();await page.getByTitle('Factura del proveedor en PDF').waitFor();await screenshot('12-factura-pdf');
 });
 await paso('registro comercial desde revisión de precios',async()=>{
  const antes=await stock();await page.goto('http://localhost:5175/revision-precios');await page.getByRole('button',{name:/Revisar precios/}).click();const numero=(await db.query('SELECT numero_consecutivo FROM facturas_proveedores WHERE id=$1',[proveedorFactura])).rows[0].numero_consecutivo;
  await page.getByRole('button').filter({hasText:numero}).click();await page.getByRole('button',{name:'Registrar compra',exact:true}).click();await accion('/compras/registrar','POST',()=>page.getByRole('button',{name:'Confirmar',exact:true}).click());assert.equal(await stock(),antes);await screenshot('13-compra-sin-stock');
 });
 await paso('recepción final nueva suma tres una vez',async()=>{
  await orden(nueva);const antes=await stock(),sec=page.getByRole('region',{name:'Recepción física de la orden'});await sec.getByRole('spinbutton',{name:/Recibir línea/}).fill('3');await sec.getByRole('checkbox',{name:'Esta es la entrega final de esta orden; no queda otra recepción del proveedor.'}).check();await sec.getByRole('checkbox',{name:'Verifiqué las cantidades físicas de esta entrega y los motivos indicados.'}).check();await accion('/orden-compra/por-ciclo/'+nueva+'/recepciones','POST',()=>sec.getByRole('button',{name:'Registrar recepción final'}).click());assert.equal(await stock(),antes+3);await screenshot('14-recepcion-final');
  await page.reload();await page.getByRole('button',{name:'Órdenes por ciclo',exact:true}).click();await page.getByRole('button').filter({hasText:'OC-'+nueva+' · '+d.proveedor.nombre}).click();await page.getByText(/Recibido físico: 3 unidades propias/).waitFor();assert.equal(await stock(),antes+3);
 });
 await paso('recepción actual y cierre separado próximo',async()=>{
  await orden(d.ordenes[0].id,d.actual.id);const antes=await stock(),sec=page.getByRole('region',{name:'Recepción física de la orden'});await sec.getByRole('spinbutton',{name:/Recibir línea/}).fill('6');await sec.getByRole('checkbox',{name:'Verifiqué las cantidades físicas de esta entrega y los motivos indicados.'}).check();assert.ok(tardia);tardia.liberar();await tardia.finalizada;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await sec.getByRole('spinbutton',{name:/Recibir línea/}).inputValue(),'6');assert.equal(await sec.getByRole('checkbox',{name:'Verifiqué las cantidades físicas de esta entrega y los motivos indicados.'}).isChecked(),true);await accion('/orden-compra/por-ciclo/'+d.ordenes[0].id+'/recepciones','POST',()=>sec.getByRole('button',{name:'Registrar recepción parcial'}).click());assert.equal(await stock(),antes+6);await screenshot('15-actual-recibida-diez');
  await orden(d.ordenes[1].id);const ci=page.getByRole('region',{name:'Cierre de orden enviada'});await ci.getByRole('textbox',{name:'Motivo del cierre enviado'}).fill('ZZ proveedor confirmó que no enviará las tres restantes');await ci.getByRole('checkbox',{name:'Revisé lo recibido y confirmé con el proveedor el cierre de lo pendiente.'}).check();await accion('/orden-compra/por-ciclo/'+d.ordenes[1].id+'/cierre','POST',()=>ci.getByRole('button',{name:'Confirmar cierre de orden'}).click());assert.equal(await stock(),antes+6);await page.getByText('Cobertura que se conserva: 1 · Cobertura que se libera: 3',{exact:true}).waitFor();await screenshot('16-cierre-conservado');
 });
 await paso('promover próxima ruta y carga entrega en celular',async()=>{
  await estadoCiclo(d.actual.id,'12/10/2026','Cerrado');await estadoCiclo(d.proximo.id,'19/10/2026','Preparación');await estadoCiclo(d.proximo.id,'19/10/2026','Entrega');await page.setViewportSize({width:390,height:1000});
  const antes=await stock();await filtrar('/entregas',d.proximo.id);await page.getByRole('button',{name:'Ver pedidos de '+d.a.nombre,exact:true}).click();assert.equal(await page.getByRole('link',{name:'Ver ubicación',exact:true}).getAttribute('href'),d.a.ubicacion_maps);await entrega(factura,'carga',3);await entrega(factura,'entrega',3);assert.equal(await stock(),antes);await screenshot('17-entrega-completa');
  await filtrar('/entregas',d.actual.id);await page.getByRole('button',{name:'Ver pedidos de '+d.a.nombre,exact:true}).click();await page.getByText('Entrega parcial',{exact:true}).first().waitFor();await screenshot('18-actual-historica');
 });
 await paso('Excel de necesidades órdenes clientes y entrega',async()=>{
  const XLSX=require(b+'/node_modules/xlsx');
  await filtrar('/reportes/proveedores',d.proximo.id);await page.getByRole('button',{name:'Necesidades y cobertura',exact:true}).click();await page.getByRole('button',{name:'Ver procedencia de '+p.nombre}).waitFor();const needs=XLSX.read(await descargar(page.getByRole('button',{name:'Exportar Excel'}),'necesidades.xlsx'));assert.ok(needs.SheetNames.includes('Procedencia'));
  await orden(nueva);const oc=XLSX.read(await descargar(page.getByRole('button',{name:'Exportar Excel'}),'orden.xlsx'));assert.ok(oc.SheetNames.length>=3);
  await filtrar('/reportes/clientes',d.proximo.id);await page.getByRole('button',{name:'Exportar Excel'}).waitFor();assert.ok(XLSX.read(await descargar(page.getByRole('button',{name:'Exportar Excel'}),'clientes.xlsx')).SheetNames.length>=1);
  await filtrar('/entregas',d.proximo.id);assert.ok(XLSX.read(await descargar(page.getByRole('button',{name:'Exportar Excel'}),'entregas.xlsx')).SheetNames.length>=3);await screenshot('19-recorrido-carga');
 });
 await paso('archivo a 24 horas conserva PDF e historial',async()=>{
  // Evento final HISTÓRICO nuevo, sin modificar recepciones confirmadas ni
  // desactivar triggers. Solo reloj de fixture sobre la orden sintética actual.
  const o=d.ordenes[0],p=await d.s.recepcion.consultar(o.id),id=randomUUID();
  await db.query('INSERT INTO orden_compra_ciclo_recepcion(id,orden_id,solicitud,resumen,final,motivos,fecha) VALUES($1,$2,$3,$4,TRUE,\'[]\',NOW()-INTERVAL \'24 hours 1 minute\')',[id,o.id,JSON.stringify({version:p.version,revision:p.revision}),JSON.stringify({incrementos:[],comparacion:p.comparacion})]);
  await db.query("UPDATE orden_compra_ciclo SET estado='recibida',recepcion_id=$2,recepcion_completa_en=(SELECT fecha FROM orden_compra_ciclo_recepcion WHERE id=$2),version=version+1 WHERE id=$1",[o.id,id]);
  await filtrar('/reportes/proveedores',d.actual.id);await page.getByRole('button',{name:'Órdenes por ciclo',exact:true}).click();await page.getByText('No hay órdenes en esta selección.',{exact:true}).waitFor();await screenshot('20-archivo-activa');
  await page.getByRole('combobox',{name:'Mostrar órdenes'}).selectOption('historial');await page.getByRole('button').filter({hasText:o.referencia+' · '+d.proveedor.nombre}).click();await page.getByText(/Recibido físico: 10 unidades propias/).waitFor();await page.getByRole('button',{name:'Ver Representación de datos del sistema'}).click();await page.getByTitle('Factura del proveedor en PDF').waitFor();await screenshot('21-archivo-con-pdf');
  const original=await d.s.facturaOrden.descargarPdf(o.id,d.vinculos[0].vinculo,d.vinculos[0].pdfId);assert.equal(original.pdf.subarray(0,5).toString(),'%PDF-');
 });
 const transportes=(await fs.readFile(directorio+'/transportes.jsonl','utf8')).trim().split('\n').map(JSON.parse);assert.equal(transportes.length,2);for(let i=0;i<2;i++)assert.equal(transportes[i].sha256,downloads[i].sha256);assert.deepEqual(errores,[]);assert.equal(legado,0);assert.equal(pasos.length,14);assert.equal(d.transportes.length,3);
 await fs.writeFile(directorio+'/navegador-evidencia.json',JSON.stringify({pasos,vistas,capturas:vistas*2,anchos:[1440,390],escriturasNavegador:writes,consultasPost,descargas:downloads,errores,legado,lecturaTardiaControlada:true,transportesPreparacion:3,entradaExterna:'factura sintética',reloj:'evento final histórico nuevo solo en clon'},null,2),{mode:0o600});console.log('Chromium aprobado: '+pasos.length+' pasos del flujo; '+writes.length+' escrituras desde UI del clon; '+vistas+' vistas/'+vistas*2+' capturas 1440/390; '+downloads.length+' descargas; sin red externa ni reporte legado.');
})().catch(e=>{const s=String(e.stack).replace(/preventa=[^\s&"']+/g,'preventa=[omitido]').replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,'[token omitido]');console.log('Chromium no completado en '+etapa+': '+s);process.exitCode=1}).finally(async()=>{tardia?.liberar();d?.liberar();await portal?.close();await ctx?.close();await browser?.close();await db.pool.end()});
