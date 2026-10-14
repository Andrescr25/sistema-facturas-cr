const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { sembrar } = require('./dobles/ordenesAutomaticas');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const habilitado = process.env.PROBAR_BASE_LOCAL === '1';

describe('Factura del proveedor revisada → orden exacta, automática sólo si única', { skip: !habilitado }, () => {
  let pool, c, compras, facturacion, resumen, ordenes, env, f, actor, servidor, url;
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
    pool = new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL });
    c = await pool.connect(); await c.query('BEGIN');
    actor = (await c.query("INSERT INTO usuario(usuario,nombre,password_hash) VALUES($1,'ZZ factura orden','ZZ sin login') RETURNING id", ['zz-'+randomUUID()])).rows[0].id;
    const db = baseEnTransaccion(c, 'facturada'), conectar = db.pool.connect;
    db.pool.connect = async () => { const cl=await conectar(), q=cl.query; cl.query=(sql,p)=>sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'?Promise.resolve({rows:[]}):q(sql,p); return cl; };
    const ruta = require.resolve('../config/database'); require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:db};
    compras = require('../src/modules/compras/compras.service');
    facturacion = require('../src/modules/orders-whatsapp/facturacionOrdenProveedor.service');
    resumen = require('../src/modules/orders-whatsapp/ordenesFacturacionReporte.service');
    ordenes = require('../src/modules/orders-whatsapp/ordenesCiclo.service');
    require('../config/aislado').salidasBloqueadas=()=>false;
    env = require('../src/modules/orders-whatsapp/ordenesCicloEnvio.service');
    require('../src/integrations/whatsapp').enviarDocumento=async d=>({enviado:true,numero:d.telefono,via:'interno'});
    const app=require('express')();app.use(require('express').json());
    app.use('/api',require('../src/modules/auth/auth.middleware').requireAuth);
    app.use('/api',require('../src/modules/usuarios/permisos.middleware').requirePermiso);
    app.use('/api/revision-precios',require('../src/modules/revision-precios/revision-precios.routes'));
    servidor=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});url=`http://127.0.0.1:${servidor.address().port}/api/revision-precios`;
  });
  after(async () => { if(servidor)await new Promise(r=>servidor.close(r)); if(c){await c.query('ROLLBACK');c.release()} await pool?.end(); });
  const caso=(nombre,fn)=>test(nombre,async()=>{await c.query('SAVEPOINT caso');try{f=await sembrar(c);await fn()}finally{await c.query('ROLLBACK TO SAVEPOINT caso')} });
  const faltante=async(i,q,n=0)=>require('../src/modules/warehouse/bodegaPropia').registrarFaltantes(f.facturas[n],[{producto_id:f.productos[i],cantidad_faltante:q,tipo_faltante:'parcial'}],null,actor);
  const enviada=async(n=0)=>{
    await faltante(0,10,n);await faltante(1,5,n);await faltante(2,2,n);
    let o=(await ordenes.listar({proveedorId:f.p.id})).find(o=>o.estado==='borrador');
    o=await ordenes.cambiarEstado(o.id,{version:o.version,estado:'pendiente_enviar'},actor);
    o=await env.preparar(o.id,{version:o.version,clave:randomUUID(),telefono:'88888888',mensaje:`ZZ ${o.referencia}`},actor);
    return env.enviar(o.id,o.envios[0].id,{confirmar:true},actor);
  };
  const factura=async(lineas=[[0,3],[2,2]])=>{
    const id=randomUUID();await c.query(`INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,fecha_emision,fecha_procesada,total_productos,total_factura,archivo_xml,estado,porcentaje_relacionado)
      VALUES($1,$2,$3,$4,$5,'2026-10-14',NOW(),$6,100,'ZZ.xml','RELACIONADA',100)`,[id,String(Date.now())+String(Math.floor(Math.random()*1e9)).padStart(9,'0')+'0'.repeat(28),'ZZ-'+randomUUID().slice(0,8),f.p.nombre,f.p.identificacion,lineas.length]);
    for(const [n,[i,q]] of lineas.entries()){
      const m=(await c.query('SELECT id FROM supplier_product_mapping WHERE proveedor_id=$1 AND producto_id=$2',[f.p.id,f.productos[i]])).rows[0].id;
      await c.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado)
        VALUES($1,$2,$3,$4,'ZZ comprado',$5,'Unid',10,0,0,100,$6,$7,'RELACIONADO')`,[randomUUID(),id,n+1,'ZZ-'+i,q,f.productos[i],m]);
    }return id;
  };
  const contar=async(id)=>(await c.query('SELECT COUNT(*)::int n FROM compra WHERE factura_proveedor_id=$1',[id])).rows[0].n;

  caso('sin orden enviada registra normalmente y no inventa un vínculo',async()=>{
    const id=await factura(),lista=await facturacion.candidatas(id);assert.deepEqual(lista,{ordenes:[],automatica:null,vinculada:null,requiereSeleccion:false});
    const r=await compras.registrarCompra(id,{},actor);assert.equal(r.ordenCompraId,null);assert.equal(await contar(id),1);
    assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_factura WHERE factura_id=$1',[id])).rows[0].n,0);
  });
  caso('única enviada se vincula al registrar; cantidades propias y productos ausentes se distinguen',async()=>{
    const o=await enviada(),pdf=(await env.descargar(o.id,o.envio_id)).pdf,id=await factura();
    await c.query('UPDATE supplier_product_mapping SET factor_conversion=2 WHERE proveedor_id=$1 AND producto_id=$2',[f.p.id,f.productos[0]]);
    assert.equal((await facturacion.candidatas(id)).automatica,o.id);
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='sin_revisar'&&p.cantidadFacturada===null));
    const r=await compras.registrarCompra(id,{},actor);assert.equal(r.ordenCompraId,o.id);
    const actual=await resumen.comparacionEn(c,o.id),porId=new Map(actual.map(p=>[p.productoId,p]));
    assert.deepEqual(porId.get(f.productos[0]),{productoId:f.productos[0],estado:'parcial',cantidadFacturada:6});
    assert.deepEqual(porId.get(f.productos[1]),{productoId:f.productos[1],estado:'no_facturado',cantidadFacturada:0});
    assert.deepEqual(porId.get(f.productos[2]),{productoId:f.productos[2],estado:'facturado',cantidadFacturada:2});
    assert.deepEqual(await ordenes.obtener(o.id),o);assert.deepEqual((await env.descargar(o.id,o.envio_id)).pdf,pdf);
    await c.query('UPDATE supplier_product_mapping SET factor_conversion=9 WHERE proveedor_id=$1',[f.p.id]);
    assert.deepEqual(await resumen.comparacionEn(c,o.id),actual);
    assert.equal((await c.query('SELECT inventario_por_recepcion FROM compra WHERE id=$1',[r.compra.id])).rows[0].inventario_por_recepcion,false);
    await assert.rejects(compras.registrarCompra(id,{},actor),e=>e.status===409);assert.equal(await contar(id),1);
  });
  caso('dos enviadas exigen selección y el rechazo conserva compra/CxP/costos/stock',async()=>{
    const a=await enviada(),b=await enviada(1),id=await factura();assert.equal((await facturacion.candidatas(id)).ordenes.length,2);
    const huella=async()=>(await c.query('SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) h FROM producto p WHERE id=ANY($1::int[])',[f.productos])).rows[0].h,antes=await huella();
    await assert.rejects(compras.registrarCompra(id,{},actor),e=>e.status===409&&/Elegí/.test(e.message));assert.equal(await contar(id),0);assert.equal(await huella(),antes);
    assert.equal((await c.query('SELECT COUNT(*)::int n FROM cuentas_por_pagar WHERE factura_id=$1',[id])).rows[0].n,0);
    assert.equal((await compras.registrarCompra(id,{},actor,{ordenCompraId:b.id})).ordenCompraId,b.id);
    assert.ok((await resumen.comparacionEn(c,a.id)).every(p=>p.estado==='sin_revisar'));
  });
  caso('pedido de otro proveedor o borrador no puede confirmarse por id enviado',async()=>{
    const o=await enviada(),id=await factura(),otro=await sembrar(c);await c.query('UPDATE facturas_proveedores SET proveedor_cedula=$2 WHERE id=$1',[id,otro.p.identificacion]);
    await assert.rejects(compras.registrarCompra(id,{},actor,{ordenCompraId:o.id}),e=>e.status===409);assert.equal(await contar(id),0);
    await c.query('UPDATE facturas_proveedores SET proveedor_cedula=$2 WHERE id=$1',[id,f.p.identificacion]);await faltante(0,3,1);
    const borrador=(await ordenes.listar({proveedorId:f.p.id})).find(o=>o.estado==='borrador');
    await assert.rejects(compras.registrarCompra(id,{},actor,{ordenCompraId:borrador.id}),e=>e.status===409);assert.equal(await contar(id),0);
  });
  caso('vínculo anterior del buzón conserva historia y sólo confirma facturado después de registrar',async()=>{
    const o=await enviada(),id=await factura(),s=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service'),p=await s.proponer(o.id,id);
    await s.vincular(o.id,{clave:randomUUID(),facturaId:id,version:p.version,revision:p.revision,confirmar:true},actor);
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='sin_revisar'));
    assert.equal((await facturacion.candidatas(id)).vinculada,o.id);await compras.registrarCompra(id,{},actor);
    assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_factura WHERE factura_id=$1',[id])).rows[0].n,1);
    assert.equal((await resumen.comparacionEn(c,o.id)).find(p=>p.productoId===f.productos[0]).cantidadFacturada,3);
  });
  caso('fallo al crear el vínculo revierte compra, precios y cuenta por pagar',async()=>{
    await enviada();const id=await factura(),query=c.query.bind(c),antes=(await c.query('SELECT costo_con_iva FROM producto WHERE id=$1',[f.productos[0]])).rows[0].costo_con_iva;
    c.query=(sql,p)=>String(sql).includes('INSERT INTO orden_compra_ciclo_factura(')?Promise.reject(new Error('ZZ vínculo falló')):query(sql,p);
    try{await assert.rejects(compras.registrarCompra(id,{},actor),/ZZ vínculo falló/)}finally{c.query=query}
    assert.equal(await contar(id),0);assert.equal((await c.query('SELECT costo_con_iva FROM producto WHERE id=$1',[f.productos[0]])).rows[0].costo_con_iva,antes);
    assert.equal((await c.query('SELECT COUNT(*)::int n FROM cuentas_por_pagar WHERE factura_id=$1',[id])).rows[0].n,0);
    assert.equal((await c.query('SELECT estado FROM facturas_proveedores WHERE id=$1',[id])).rows[0].estado,'RELACIONADA');
  });
  caso('fuente comercial modificada o compra anulada no indica No facturado por ausencia',async()=>{
    const o=await enviada(),id=await factura(),r=await compras.registrarCompra(id,{},actor);
    await c.query('UPDATE compra_linea SET cantidad=9 WHERE compra_id=$1 AND producto_id=$2',[r.compra.id,f.productos[0]]);
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='por_identificar'&&p.cantidadFacturada===null));
    await c.query("UPDATE compra SET estado='anulada' WHERE id=$1",[r.compra.id]);
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='sin_revisar'&&p.cantidadFacturada===null));
  });
  caso('factura6 + factura4 completan la misma orden10, sin cambiar su fotografía',async()=>{
    const o=await enviada(),pdf=(await env.descargar(o.id,o.envio_id)).pdf;
    const primera=await factura([[0,6],[1,5],[2,2]]);await compras.registrarCompra(primera,{},actor);
    const segunda=await factura([[0,4]]),lista=await facturacion.candidatas(segunda);
    assert.equal(lista.automatica,o.id);assert.equal(lista.ordenes[0].facturacion,'parcial');assert.equal(lista.requiereSeleccion,false);
    assert.equal((await compras.registrarCompra(segunda,{},actor)).ordenCompraId,o.id);
    assert.equal((await c.query("SELECT COUNT(*)::int n FROM orden_compra_ciclo_factura WHERE orden_id=$1 AND estado='vigente'",[o.id])).rows[0].n,2);
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='facturado'));
    assert.deepEqual(await ordenes.obtener(o.id),o);assert.deepEqual((await env.descargar(o.id,o.envio_id)).pdf,pdf);
    assert.equal((await facturacion.candidatas(await factura())).ordenes.length,0);
  });
  caso('parcial anterior y orden nueva exigen elegir; factura4 no se desvía a la nueva',async()=>{
    const anterior=await enviada();await compras.registrarCompra(await factura([[0,6],[1,5],[2,2]]),{},actor);
    const nueva=await enviada(1),id=await factura([[0,4]]),lista=await facturacion.candidatas(id);
    assert.deepEqual(new Set(lista.ordenes.map(o=>o.id)),new Set([anterior.id,nueva.id]));assert.equal(lista.automatica,null);assert.equal(lista.requiereSeleccion,true);
    await assert.rejects(compras.registrarCompra(id,{},actor),e=>e.status===409);assert.equal(await contar(id),0);
    assert.equal((await compras.registrarCompra(id,{},actor,{ordenCompraId:anterior.id})).ordenCompraId,anterior.id);
    assert.ok((await resumen.comparacionEn(c,nueva.id)).every(p=>p.estado==='sin_revisar'));
    assert.deepEqual((await facturacion.candidatas(await factura())).ordenes.map(o=>o.id),[nueva.id]);
  });
  caso('si la automática anterior se completó no se desvía a la nueva candidata única',async()=>{
    const o=await enviada();await compras.registrarCompra(await factura([[0,6],[1,5],[2,2]]),{},actor);
    const pendiente=await factura([[0,4]]);assert.equal((await facturacion.candidatas(pendiente)).automatica,o.id);
    await compras.registrarCompra(await factura([[0,4]]),{},actor);
    const nueva=await enviada(1);assert.equal((await facturacion.candidatas(pendiente)).automatica,nueva.id);
    await assert.rejects(compras.registrarCompra(pendiente,{},actor,{ordenCompraAutomaticaId:o.id}),e=>e.status===409&&/automática cambió/.test(e.message));
    assert.equal(await contar(pendiente),0);assert.ok((await resumen.comparacionEn(c,nueva.id)).every(p=>p.estado==='sin_revisar'));
  });
  caso('sin automática en la revisión exige actualizar si apareció una orden enviada',async()=>{
    const id=await factura();assert.equal((await facturacion.candidatas(id)).automatica,null);await enviada();
    await assert.rejects(compras.registrarCompra(id,{},actor,{ordenCompraAutomaticaId:null}),e=>e.status===409);assert.equal(await contar(id),0);
  });
  caso('orden totalmente facturada queda fuera incluso si su recepción física sigue abierta',async()=>{
    const o=await enviada();await compras.registrarCompra(await factura([[0,10],[1,5],[2,2]]),{},actor);
    const id=await factura();assert.equal((await ordenes.obtener(o.id)).estado,'enviada');
    assert.equal((await facturacion.candidatas(id)).ordenes.length,0);
    await assert.rejects(compras.registrarCompra(id,{},actor,{ordenCompraId:o.id}),e=>e.status===409);assert.equal(await contar(id),0);
  });
  caso('una fuente alterada nunca se declara completa ni se elige automáticamente',async()=>{
    const o=await enviada(),r=await compras.registrarCompra(await factura([[0,10],[1,5],[2,2]]),{},actor);
    await c.query('UPDATE compra_linea SET cantidad=11 WHERE compra_id=$1 AND producto_id=$2',[r.compra.id,f.productos[0]]);
    const id=await factura(),lista=await facturacion.candidatas(id);assert.equal(lista.ordenes.length,1);assert.equal(lista.ordenes[0].id,o.id);
    assert.equal(lista.ordenes[0].facturacion,'por_revisar');assert.equal(lista.automatica,null);assert.equal(lista.requiereSeleccion,true);
    await assert.rejects(compras.registrarCompra(id,{},actor),e=>e.status===409);assert.equal(await contar(id),0);
    await compras.registrarCompra(id,{},actor,{ordenCompraId:o.id});
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='por_identificar'));
  });
  caso('comprobante vinculado todavía sin registrar requiere elección, aun si sólo hay una orden',async()=>{
    const o=await enviada(),buzon=await factura(),s=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service'),p=await s.proponer(o.id,buzon);
    await s.vincular(o.id,{clave:randomUUID(),facturaId:buzon,version:p.version,revision:p.revision,confirmar:true},actor);
    const id=await factura(),lista=await facturacion.candidatas(id);assert.equal(lista.requiereSeleccion,true);assert.equal(lista.automatica,null);
    assert.equal(lista.ordenes[0].facturasPorRevisar,true);await assert.rejects(compras.registrarCompra(id,{},actor),e=>e.status===409);
    const otra=await enviada(1),vinculada=await facturacion.candidatas(buzon);assert.equal(vinculada.vinculada,o.id);assert.equal(vinculada.requiereSeleccion,false);
    await assert.rejects(compras.registrarCompra(buzon,{},actor,{ordenCompraId:otra.id}),e=>e.status===409);
    assert.equal((await compras.registrarCompra(buzon,{},actor)).ordenCompraId,o.id);
  });
  caso('vínculos históricos de varias facturas se conservan y suman una vez al registrar',async()=>{
    const o=await enviada(),ids=[await factura([[0,6],[1,5],[2,2]]),await factura([[0,4]])];
    const s=require('../src/modules/orders-whatsapp/ordenesCicloFactura.service');
    for(const facturaId of ids){const p=await s.proponer(o.id,facturaId);await s.vincular(o.id,{clave:randomUUID(),facturaId,version:p.version,revision:p.revision,confirmar:true},actor)}
    for(const id of ids)assert.equal((await compras.registrarCompra(id,{},actor)).ordenCompraId,o.id);
    assert.equal((await c.query('SELECT COUNT(*)::int n FROM orden_compra_ciclo_factura WHERE orden_id=$1',[o.id])).rows[0].n,2);
    assert.ok((await resumen.comparacionEn(c,o.id)).every(p=>p.estado==='facturado'));
    assert.equal((await facturacion.candidatas(await factura())).ordenes.length,0);
  });
  caso('recibida físicamente conserva el parcial comercial y su protección SQL de nuevos vínculos',async()=>{
    const o=await enviada();await compras.registrarCompra(await factura([[0,6],[1,5],[2,2]]),{},actor);
    const recepcion=require('../src/modules/orders-whatsapp/ordenesCicloRecepcion.service');let p=await recepcion.consultar(o.id);
    const parcial=await recepcion.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:false,
      motivos:[],lineas:p.lineas.map(l=>({lineaId:l.id,cantidad:l.producto_id===f.productos[0]?2:l.cantidad_propia}))},actor);
    assert.equal(parcial.orden.estado,'parcialmente_recibida');assert.equal((await facturacion.candidatas(await factura([[0,4]]))).automatica,o.id);
    p=await recepcion.consultar(o.id);
    const recibida=await recepcion.registrar(o.id,{clave:randomUUID(),version:p.version,revision:p.revision,confirmar:true,final:true,
      motivos:[{productoId:f.productos[0],tipo:'agotado_confirmado',detalle:'ZZ cuatro pendientes no llegarán'}],
      lineas:p.lineas.map(l=>({lineaId:l.id,cantidad:l.pendiente}))},actor);
    assert.equal(recibida.orden.estado,'recibida');assert.equal((await resumen.comparacionEn(c,o.id)).find(p=>p.productoId===f.productos[0]).estado,'parcial');
    assert.equal((await facturacion.candidatas(await factura())).ordenes.length,0);
  });
  caso('lector no bloquea filas y ruta requiere Revisión de precios, sin pedir Reporte Proveedores',async()=>{
    const o=await enviada(),id=await factura();await compras.registrarCompra(id,{},actor);
    const lectura={query:(sql,p)=>{assert.doesNotMatch(sql,/FOR SHARE|FOR UPDATE|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);return c.query(sql,p)}};
    assert.ok((await resumen.comparacionEn(lectura,o.id)).some(p=>p.estado==='facturado'));
    const falla={query:(sql,p)=>String(sql).includes('FROM compra_linea')?Promise.reject(Error('ZZ consulta falló')):c.query(sql,p)};
    await assert.rejects(resumen.comparacionEn(falla,o.id),/ZZ consulta falló/);
    const token=require('jsonwebtoken').sign({sub:actor},process.env.JWT_SECRET,{expiresIn:'5m'}),headers={Authorization:`Bearer ${token}`};
    const ruta=`/facturas/${id}/ordenes-compra`;assert.equal((await fetch(url+ruta,{headers})).status,403);
    await c.query("INSERT INTO usuario_modulo(usuario_id,modulo) VALUES($1,'revision-precios')",[actor]);
    assert.equal((await fetch(url+ruta,{headers})).status,200);assert.equal((await fetch(url+`/Facturas/${id}/Ordenes-Compra/`,{headers})).status,200);
    assert.equal((await fetch(url+ruta)).status,401);
  });
  test('lector y candidatas admiten READ ONLY/REPEATABLE READ reales sobre la copia',async()=>{
    const real=await pool.connect();
    try {
      await real.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      assert.equal((await real.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
      const {rows:[o]}=await real.query('SELECT id FROM orden_compra_ciclo ORDER BY id LIMIT 1');
      const {rows:[f]}=await real.query('SELECT id FROM facturas_proveedores ORDER BY id LIMIT 1');
      assert.ok(o&&f,'La copia conserva órdenes y comprobantes históricos para leer.');
      assert.ok(Array.isArray(await resumen.comparacionEn(real,o.id)));
      assert.ok(Array.isArray((await facturacion.candidatasEn(real,f.id)).ordenes));
    } finally { await real.query('ROLLBACK');real.release(); }
  });
});
