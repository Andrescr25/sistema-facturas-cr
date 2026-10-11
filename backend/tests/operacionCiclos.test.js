/** Separación real de ruta/semana y origen de faltantes; PostgreSQL propio y ROLLBACK. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const XLSX = require('xlsx');
const activo = process.env.PROBAR_BASE_LOCAL === '1';
const caso = (n, f) => test(n, { skip: !activo }, f);
let c, pool, db, rutas, clientes, bodega, reportes, notas, excel, operacion;
let ruta, otraRuta, cliente, segundo, actual, proximo, ajeno, producto, docs;
const zz = s => `ZZ ciclos ${s} ${randomUUID().slice(0,8)}`;
if (activo) {
  require('../config/aislado').asegurarBaseLocal();
  assert.match(new URL(process.env.DATABASE_URL).pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let nivel = 0;
  const ejecutar = (sql, p) => c.query(sql, p);
  db = { query: ejecutar, pool: { query: ejecutar, connect: async () => {
    const sp = `operacion_${++nivel}`;
    return { query: (sql,p) => sql === 'BEGIN' ? ejecutar(`SAVEPOINT ${sp}`) : sql === 'COMMIT' ? ejecutar(`RELEASE SAVEPOINT ${sp}`) : sql === 'ROLLBACK' ? ejecutar(`ROLLBACK TO SAVEPOINT ${sp}`) : ejecutar(sql,p), release() {} };
  } } };
  const pathDb = require.resolve('../config/database');
  require.cache[pathDb] = { id: pathDb, filename: pathDb, loaded: true, exports: db };
  const prisma = require.resolve('../lib/prisma');
  require.cache[prisma] = { id: prisma, filename: prisma, loaded: true, exports: { productoFactura: { findFirst: async () => null } } };
  rutas = require('../src/modules/rutas/rutas.service'); clientes = require('../src/modules/clientes/clientes.service');
  bodega = require('../src/modules/warehouse/bodegaPropia'); reportes = new (require('../src/modules/reports/report.service'))();
  notas = require('../src/modules/reports/notasDeFaltantes'); excel = require('../src/modules/reports/report.excel');
  operacion = require('../src/modules/rutas/operacionCiclo.service');
  before(async () => {
    c = await pool.connect(); await c.query('BEGIN');
    ruta = await rutas.crearRuta({ nombre: zz('Ruta') }); otraRuta = await rutas.crearRuta({ nombre: zz('Otra') });
    cliente = await clientes.crearCliente({ nombre: zz('A'), ruta_id: ruta.id, ubicacion_maps: 'https://maps.app.goo.gl/ZZPrueba' });
    segundo = await clientes.crearCliente({ nombre: zz('B'), ruta_id: ruta.id });
    actual = await rutas.crearCiclo(ruta.id,{ semana: '2026-10-12' }); proximo = await rutas.crearCiclo(ruta.id,{ semana: '2026-10-19' });
    await rutas.cambiarEstadoCiclo(actual.id,{ estado: 'preparacion', estadoAnterior: 'preventa' });
    await clientes.editarCliente(cliente.id,{ ruta_id: otraRuta.id });
    ajeno = await rutas.crearCiclo(otraRuta.id,{ semana: '2026-10-19' });
    producto = (await c.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id',[zz('Tubo'),zz('COD')])).rows[0].id;
    docs = [];
    // Intentionally older dates and reverse creation order: scope/stop wins.
    for (const [ciclo,cl,q,nota,anticipado] of [[actual,segundo,1,'AZUL',false],[actual,cliente,6,'ROJO',false],[proximo,cliente,4,'VERDE',true],[ajeno,cliente,3,'NEGRO',false],[null,cliente,2,'VIEJO',false]]) {
      const recorrido = ciclo ? (await c.query('SELECT id FROM ciclo_ruta_cliente WHERE ciclo_id=$1 AND cliente_id=$2',[ciclo.id,cl.id])).rows[0].id : null;
      const f = (await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,tipo_documento,ciclo_ruta_cliente_id,preventa_anticipada)
        VALUES($1,'emitida','2020-01-01',$2,$3,'factura',$4,$5) RETURNING id`,[zz('FAC'),cl.id,cl.nombre,recorrido,anticipado])).rows[0].id;
      await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,descripcion,cantidad,precio_unitario,total)
        VALUES($1,1,$2,'ZZ Tubo',$3,$4::numeric,10,$4::numeric*10)`,[f,producto,nota,q]);
      const faltante = (await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,proveedor_asignado,proveedor_cedula)
        VALUES($1,$2,$3,'parcial','pendiente','ZZ Proveedor ciclos','ZZ-CICLOS') RETURNING id`,[f,producto,q])).rows[0].id;
      docs.push({ f, faltante, ciclo, cl, q });
    }
  });
  after(async () => { if (c) { await c.query('ROLLBACK'); c.release() } await pool.end() });
}
const supplier = async filtros => { const r=await reportes.getMissingItemsBySupplier(null,{...filtros,asignarProveedores:false}); assert.equal(r.success,true,r.error); return r.data.flatMap(p=>p.productos_faltantes).filter(p=>p.producto_id===producto) };
const filas = (r, hoja='Faltantes') => XLSX.utils.sheet_to_json(XLSX.read(r.buffer,{type:'buffer'}).Sheets[hoja]);
caso('ficha distingue contexto original de facturas y pedidos aunque cambie el maestro',async()=>{
  await c.query('SAVEPOINT ficha_contexto');
  try {
    const resumen=require('../src/modules/clientes/clientes.resumen.service');
    const ids=docs.filter(d=>d.cl.id===cliente.id).map(d=>d.f);
    await c.query('UPDATE factura SET total=20 WHERE id=ANY($1::int[])',[ids]);
    for(const cy of [actual,proximo,null]){
      const rc=cy?(await c.query('SELECT id FROM ciclo_ruta_cliente WHERE ciclo_id=$1 AND cliente_id=$2',[cy.id,cliente.id])).rows[0].id:null;
      await c.query("INSERT INTO pedido_cliente(cliente_id,cliente_nombre,origen,ciclo_ruta_cliente_id,preventa_anticipada) VALUES($1,$2,'agente',$3,$4)",[cliente.id,cliente.nombre,rc,cy?.id===proximo.id]);
    }
    await clientes.editarCliente(cliente.id,{nombre:zz('nombre posterior'),ubicacion_maps:'https://maps.google.com/?q=10,-84'});
    await rutas.editarRuta(ruta.id,{nombre:zz('ruta posterior')});
    const r=await resumen.resumenDeCliente(cliente.id);
    assert.equal(r.cliente.ruta_id,otraRuta.id);
    assert.equal(r.cliente.ubicacion_maps,'https://maps.google.com/?q=10,-84');
    for(const lista of [r.facturas,r.facturasPendientes]){
      assert.equal(lista.length,4);
      for(const d of docs.filter(d=>d.cl.id===cliente.id)){
        const f=lista.find(f=>f.id===d.f);assert.ok(f);
        assert.equal(f.ciclo?.id??null,d.ciclo?.id??null);
        assert.equal(f.anticipado,d.ciclo?.id===proximo.id);
        if(d.ciclo)assert.equal(f.ciclo.rutaNombre,d.ciclo.ruta_nombre);
        else assert.equal(f.ciclo,null);
      }
    }
    assert.deepEqual(r.pedidos.map(p=>p.ciclo?.id??null),[null,proximo.id,actual.id]);
    assert.deepEqual(r.pedidos.map(p=>p.anticipado),[false,true,false]);
    assert.ok(r.pedidos.every(p=>p.origen==='agente'));
    assert.equal(r.saldo.total,80);assert.equal(r.saldo.facturas,4);
    assert.ok(r.pedidos.filter(p=>p.ciclo).every(p=>p.ciclo.rutaNombre===ruta.nombre));
    assert.ok(r.facturas.every(f=>!('ubicacion_maps' in f)&&!('cliente_id' in (f.ciclo||{}))));
  } finally {await c.query('ROLLBACK TO SAVEPOINT ficha_contexto')}
});
caso('promover la próxima semana conserva ficha, faltantes e históricos sin reclasificar',async()=>{
  await c.query('SAVEPOINT ficha_promocion');
  try {
    const resumen=require('../src/modules/clientes/clientes.resumen.service');
    const antes=await resumen.resumenDeCliente(cliente.id);
    const huella=(await c.query('SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) h FROM faltantes f')).rows[0].h;
    await rutas.cambiarEstadoCiclo(actual.id,{estado:'entrega',estadoAnterior:'preparacion'});
    await rutas.cambiarEstadoCiclo(actual.id,{estado:'cerrado',estadoAnterior:'entrega'});
    await rutas.cambiarEstadoCiclo(proximo.id,{estado:'preparacion',estadoAnterior:'preventa'});
    assert.deepEqual(await resumen.resumenDeCliente(cliente.id),antes);
    assert.equal((await supplier({cicloId:actual.id}))[0].cantidad_faltante,7);
    assert.equal((await supplier({cicloId:proximo.id}))[0].cantidad_faltante,4);
    assert.equal((await supplier({cicloId:'sin-ciclo'}))[0].cantidad_faltante,2);
    assert.equal((await c.query('SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) h FROM faltantes f')).rows[0].h,huella);
  } finally {await c.query('ROLLBACK TO SAVEPOINT ficha_promocion')}
});
caso('bodega filtra antes de ventana/límite y prepara por el orden fijo, no creación',async()=>{
  const r=await bodega.listar({cicloId:actual.id,dias:1,limit:1});
  assert.deepEqual(r.data.pendientes.map(f=>f.factura_id),[docs[1].f,docs[0].f]);
  assert.deepEqual(r.data.pendientes.map(f=>f.ciclo.orden),[1,2]);
  assert.equal(r.data.pendientes[0].ubicacion_maps,'https://maps.app.goo.gl/ZZPrueba');
  assert.equal(r.metadata.filtros.limit,null);
  assert.equal((await bodega.listar({cicloId:proximo.id})).data.pendientes[0].anticipado,true);
});
caso('misma ruta en dos semanas conserva la ruta original tras mover el cliente',async()=>{
  const r=await bodega.listar({rutaId:ruta.id});assert.equal(r.data.pendientes.length,3);
  assert.ok(r.data.pendientes.every(f=>f.ciclo.rutaId===ruta.id));
  const r2=await reportes.getMissingItemsByClient({cicloId:actual.id,asignarProveedores:false});assert.equal(r2.success,true,r2.error);
  assert.deepEqual(r2.data.flatMap(c=>c.facturas_con_faltantes).map(f=>f.ciclo.orden),[1,2]);
  assert.equal(r2.data[0].facturas_con_faltantes[0].ciclo.rutaNombre,ruta.nombre);
});
caso('proveedor muestra 6+4 por semanas, factura/cliente/parada y origen anticipado',async()=>{
  const [p]=await supplier({rutaId:ruta.id});assert.equal(p.cantidad_faltante,11);
  assert.deepEqual(p.origenes.map(o=>Number(o.cantidad)),[6,1,4]);
  assert.deepEqual(p.origenes.map(o=>o.facturaId),[docs[1].f,docs[0].f,docs[2].f]);
  const [next]=await supplier({cicloId:proximo.id});assert.equal(next.cantidad_faltante,4);
  assert.equal(next.origenes[0].anticipado,true);assert.equal(next.origenes[0].semana,'2026-10-19');
  assert.equal((await supplier({cicloId:actual.id}))[0].cantidad_faltante,7);
});
caso('Sin ciclo conserva historial y la combinación incompatible nunca ignora ruta',async()=>{
  assert.deepEqual((await supplier({cicloId:'sin-ciclo'}))[0].origenes.map(o=>o.facturaId),[docs[4].f]);
  assert.deepEqual(await supplier({rutaId:ruta.id,cicloId:'sin-ciclo'}),[]);
  assert.deepEqual((await bodega.listar({rutaId:otraRuta.id,cicloId:actual.id})).data.pendientes,[]);
  const r=await reportes.getMissingItemsByClient({cicloId:'sin-ciclo',asignarProveedores:false});
  assert.ok(r.data.flatMap(c=>c.facturas_con_faltantes).every(f=>f.ciclo===null));
});
caso('notas de la próxima semana no incluyen variantes pedidas esta semana',async()=>{
  const r=await notas.notasPorProducto(null,{cicloId:proximo.id});assert.deepEqual(r.porProducto[String(producto)].map(n=>n.nota),['VERDE']);
  const actualR=await notas.notasPorProducto(null,{cicloId:actual.id});assert.deepEqual(new Set(actualR.porProducto[String(producto)].map(n=>n.nota)),new Set(['ROJO','AZUL']));
});
caso('Excel respeta ciclo y exporta procedencia sumable sin cambiar faltantes',async()=>{
  const antes=(await c.query('SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) huella FROM faltantes f')).rows[0].huella;
  const rr=await excel.exportarProveedores({cicloId:proximo.id});
  assert.equal(filas(rr).find(p=>p['ID producto']===producto)['Cantidad faltante'],4);
  const oo=filas(rr,'Procedencia').filter(p=>p['ID producto']===producto);assert.equal(oo.length,1);
  assert.equal(oo[0]['ID ciclo'],proximo.id);assert.equal(oo[0]['ID factura'],docs[2].f);assert.equal(oo[0]['Preventa anticipada'],'Sí');
  const cc=filas(await excel.exportarClientes({cicloId:actual.id}));assert.deepEqual(cc.map(f=>f['Orden de entrega']),[1,2]);
  assert.ok(cc.every(f=>f['ID ciclo']===actual.id));
  assert.equal((await c.query('SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY id)::text) huella FROM faltantes f')).rows[0].huella,antes);
});
caso('despachar una factura no altera alistado/faltantes de la próxima ruta',async()=>{
  await bodega.actualizarEstado(docs[1].f,{estado:'procesado'});
  assert.equal((await bodega.listar({cicloId:actual.id})).data.listas.length,1);
  assert.equal((await bodega.listar({cicloId:proximo.id})).data.pendientes[0].factura_id,docs[2].f);
  assert.equal((await supplier({cicloId:proximo.id}))[0].cantidad_faltante,4);
});
caso('filtros mal formados rechazan en API/Excel en vez de devolver todos los ciclos',async()=>{
  for(const v of ['1 OR 1=1',[],{},true,'0','1.2']){
    await assert.rejects(bodega.listar({cicloId:v}),e=>e.status===400);
    const rr=await reportes.getMissingItemsByClient({cicloId:v});assert.equal(rr.success,false);assert.equal(rr.status,400);
    await assert.rejects(excel.exportarProveedores({cicloId:v}),e=>e.status===400);
  }
});
caso('selector ofrece también ciclos históricos sin revelar recorrido o Maps',async()=>{
  const cc=await operacion.listarCiclos();assert.ok(cc.some(c=>c.id===actual.id));
  assert.deepEqual(Object.keys(cc[0]).sort(),['estado','id','rutaId','rutaNombre','semana'].sort());
});
caso('lecturas de ciclo y Maps pertenecen a cada módulo y limpieza conserva dueño admin',()=>{
  const m=require('../src/modules/usuarios/modulos');
  assert.equal(m.moduloDeRuta('/bodega/ciclos'),'facturas-bodega');
  assert.equal(m.moduloDeRuta('/reportes/faltantes/cliente/ciclos'),'reporte-clientes');
  assert.equal(m.moduloDeRuta('/reportes/faltantes/cliente'),'reporte-clientes');
  assert.equal(m.moduloDeRuta('/reportes/faltantes/proveedor/ciclos'),'reporte-proveedores');
  assert.equal(m.moduloDeRuta('/reportes/faltantes/proveedor/limpiar'),'configuracion');
});
caso('reporte filtrado no asigna automáticamente en ninguna semana',async()=>{
  await c.query('SAVEPOINT asignacion_scope');
  const rutaAsignador=require.resolve('../services/proveedorAsignacionService');
  const rutaReporte=require.resolve('../src/modules/reports/report.service');
  const viejoAsignador=require.cache[rutaAsignador], viejoReporte=require.cache[rutaReporte], llamadas=[];
  try {
    await c.query('UPDATE faltantes SET proveedor_asignado=NULL,proveedor_cedula=NULL WHERE id=ANY($1::int[])',[[docs[0].faltante,docs[2].faltante]]);
    require.cache[rutaAsignador]={id:rutaAsignador,filename:rutaAsignador,loaded:true,exports:{asignarProveedorAutomatico:async id=>{
      llamadas.push(id);await c.query("UPDATE faltantes SET proveedor_asignado='ZZ Asignado',proveedor_cedula='ZZ-ASIGNADO' WHERE id=$1",[id]);
    }}};
    delete require.cache[rutaReporte];
    const reporte=new(require('../src/modules/reports/report.service'))();
    const rr=await reporte.getMissingItemsBySupplier(null,{cicloId:actual.id});assert.equal(rr.success,true,rr.error);
    assert.deepEqual(llamadas,[]);
    assert.equal((await c.query('SELECT proveedor_asignado FROM faltantes WHERE id=$1',[docs[0].faltante])).rows[0].proveedor_asignado,null);
    assert.equal((await c.query('SELECT proveedor_asignado FROM faltantes WHERE id=$1',[docs[2].faltante])).rows[0].proveedor_asignado,null);
  } finally {require.cache[rutaAsignador]=viejoAsignador;require.cache[rutaReporte]=viejoReporte;await c.query('ROLLBACK TO SAVEPOINT asignacion_scope')}
});
caso('proveedores distintos del mismo producto conservan sus cantidades y origen',async()=>{
  await c.query('SAVEPOINT proveedor_distinto');
  try {
    await c.query("UPDATE faltantes SET proveedor_asignado='ZZ Proveedor segundo',proveedor_cedula='ZZ-SEGUNDO' WHERE id=$1",[docs[0].faltante]);
    const rr=await reportes.getMissingItemsBySupplier(null,{cicloId:actual.id,asignarProveedores:false});
    const propios=rr.data.filter(p=>p.productos_faltantes.some(f=>f.producto_id===producto));
    assert.equal(propios.length,2);
    assert.equal(propios.find(p=>p.cedula==='ZZ-SEGUNDO').productos_faltantes[0].cantidad_faltante,1);
    const original=propios.find(p=>p.cedula==='ZZ-CICLOS').productos_faltantes[0];
    assert.equal(original.cantidad_faltante,6);assert.deepEqual(original.origenes.map(o=>o.facturaId),[docs[1].f]);
  } finally { await c.query('ROLLBACK TO SAVEPOINT proveedor_distinto') }
});
