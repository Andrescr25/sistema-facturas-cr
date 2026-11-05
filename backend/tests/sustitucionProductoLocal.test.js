const { describe,test,before,after,beforeEach,afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { baseEnTransaccion } = require('../src/utils/baseEnTransaccion');

describe('sustituir faltantes — PostgreSQL desechable', { skip:process.env.PROBAR_BASE_LOCAL!=='1' }, () => {
  let pool,db,servicio,ajustes,usuario;
  before(async()=>{
    require('../config/aislado').asegurarBaseLocal();
    assert.match(new URL(process.env.DATABASE_URL).pathname,/^\/tachi_codex_[a-z0-9_]+$/);
    const { Pool }=require('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});db=await pool.connect();
    const ruta=require.resolve('../config/database');require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:baseEnTransaccion(db,'sust_zz')};
    servicio=require('../src/modules/missing-items/sustitucion.service');
    ajustes=require('../src/modules/missing-items/missing-items.service');
    usuario={id:(await db.query('SELECT min(id) AS id FROM usuario WHERE es_admin AND activo')).rows[0].id,nombre:'ZZ Sustitución'};
  });
  beforeEach(async()=>{await db.query('BEGIN');});
  afterEach(async()=>{await db.query('ROLLBACK');});
  after(async()=>{db?.release();await pool?.end();});

  const escenario = opciones => require('./helpers/sustitucionProducto').crearEscenario(db,usuario,opciones);
  const lineas=async e=>(await db.query('SELECT * FROM factura_linea WHERE factura_id=$1 ORDER BY numero_linea',[e.factura.id])).rows;
  const documento=async e=>(await db.query('SELECT * FROM factura WHERE id=$1',[e.factura.id])).rows[0];
  const preview=(e,cantidad=3)=>servicio.previsualizar(e.faltanteId,{productoId:e.b.id,cantidad});
  const confirmar=(e,p)=>servicio.sustituir(e.faltanteId,{productoId:e.b.id,cantidad:p.cantidad,version:p.version},usuario);
  const reservado=async id=>Number((await db.query('SELECT COALESCE(sum(cantidad),0) AS n FROM faltante_ingreso WHERE faltante_id=$1',[id])).rows[0].n);

  test('seis facturadas y tres faltantes: conserva tres Kenda, agrega tres Vini y cambia el precio/IVA solo ahí',async()=>{
    const e=await escenario();const antes=await lineas(e),f=await documento(e);
    const lista=await servicio.listar(e.faltanteId,e.b.nombre);assert.equal(lista.productos.length,1);assert.equal(lista.productos[0].disponible,3);
    const p=await preview(e);assert.equal(p.factura.totalAnterior,6880);assert.equal(p.factura.totalNuevo,9550);
    await confirmar(e,p);const despues=await lineas(e);
    assert.equal(Number(despues.find(l=>l.producto_id===e.a.id).cantidad),3);
    assert.equal(Number(despues.find(l=>l.producto_id===e.b.id).cantidad),3);
    assert.deepEqual(despues.find(l=>l.producto_id===e.otro.id),antes.find(l=>l.producto_id===e.otro.id));
    const final=await documento(e);assert.equal(final.numero,f.numero);assert.equal(final.id,f.id);assert.equal(Number(final.total),9550);
    const vista=await require('../src/modules/facturacion/facturaConsulta.service').obtenerFactura(e.factura.id);
    assert.equal(vista.saldo,9550,'el saldo se deriva del total nuevo, sin escribir otro saldo en la ficha');
    const {rows:[origen]}=await db.query('SELECT cantidad_faltante,tipo_faltante FROM faltantes WHERE id=$1',[e.faltanteId]);
    assert.equal(origen.cantidad_faltante,0);assert.equal(origen.tipo_faltante,'completo');
    const {rows:[dest]}=await db.query('SELECT id FROM faltantes WHERE factura_propia_id=$1 AND producto_propio_id=$2',[e.factura.id,e.b.id]);
    assert.equal(await reservado(dest.id),3);
    const {rows:[aj]}=await db.query('SELECT * FROM faltantes_ajustes WHERE faltante_id=$1',[dest.id]);assert.equal(aj.estado,'completo');assert.equal(aj.revisado,false);
    await ajustes.saveAdjustment({faltanteId:dest.id,cantidadEntregada:3,estado:'completo',revisado:true},usuario.id);
    assert.equal(await reservado(dest.id),3,'confirmar revisión no consume dos veces');
    assert.equal((await db.query("SELECT count(*)::int n FROM bitacora_cambio WHERE entidad='faltante' AND entidad_id=$1",[String(e.faltanteId)])).rows[0].n,1);
  });

  test('puede sustituir una parte y completar el resto después, sin repetir unidades ni facturas',async()=>{
    const e=await escenario();const p=await preview(e,2);const r=await confirmar(e,p);
    assert.equal((await db.query('SELECT cantidad_faltante FROM faltantes WHERE id=$1',[e.faltanteId])).rows[0].cantidad_faltante,1);
    assert.equal(await reservado(r.faltanteDestinoId),2);
    await assert.rejects(confirmar(e,p),err=>[400,409].includes(err.status));
    await confirmar(e,await preview(e,1));assert.equal(await reservado(r.faltanteDestinoId),3);
    assert.equal((await lineas(e)).filter(l=>l.producto_id===e.b.id).reduce((n,l)=>n+Number(l.cantidad),0),3);
  });

  test('precio o factura cambiados después de la propuesta exigen confirmar una nueva vista',async()=>{
    const e=await escenario();const p=await preview(e);const antes=await lineas(e);
    await db.query('UPDATE producto SET precio_sin_iva=2100 WHERE id=$1',[e.b.id]);
    await assert.rejects(confirmar(e,p),err=>err.status===409&&/Cambió/.test(err.message));
    assert.deepEqual(await lineas(e),antes);await confirmar(e,await preview(e));
  });

  test('si la compra se anula o sus unidades se reservan para otro cliente, no cambia la factura',async()=>{
    const e=await escenario();const p=await preview(e),antes=await lineas(e);
    await db.query("UPDATE compra SET estado='anulada' WHERE id=$1",[e.compraId]);
    await assert.rejects(confirmar(e,p),err=>err.status===409);assert.deepEqual(await lineas(e),antes);
    await db.query("UPDATE compra SET estado='registrada' WHERE id=$1",[e.compraId]);
    const otro=await escenario({recibidas:0,catalogo:[e.b,e.a,e.otro]});
    await ajustes.saveAdjustment({faltanteId:otro.faltanteId,cantidadEntregada:1,estado:'parcial'},usuario.id);
    await assert.rejects(confirmar(e,p),err=>err.status===409);assert.deepEqual(await lineas(e),antes);
  });

  test('un error al auditar revierte factura, ajustes, nuevos faltantes, inventario y reservas',async()=>{
    const e=await escenario();const p=await preview(e),antes=await lineas(e),f=await documento(e);
    const movimientos=(await db.query("SELECT * FROM movimiento_inventario WHERE origen_tipo='factura' AND origen_id=$1 ORDER BY id",[e.factura.id])).rows;
    await db.query(`CREATE OR REPLACE FUNCTION pg_temp.fallar_sustitucion() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.entidad='faltante' THEN RAISE EXCEPTION 'ZZ auditoría caída'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER zz_sustitucion BEFORE INSERT ON bitacora_cambio FOR EACH ROW EXECUTE FUNCTION pg_temp.fallar_sustitucion()');
    await assert.rejects(confirmar(e,p),/ZZ auditoría caída/);
    assert.deepEqual(await lineas(e),antes);assert.deepEqual(await documento(e),f);
    assert.deepEqual((await db.query("SELECT * FROM movimiento_inventario WHERE origen_tipo='factura' AND origen_id=$1 ORDER BY id",[e.factura.id])).rows,movimientos);
    assert.equal((await db.query('SELECT 1 FROM faltantes WHERE factura_propia_id=$1 AND producto_propio_id=$2',[e.factura.id,e.b.id])).rowCount,0);
    assert.equal((await servicio.listar(e.faltanteId,e.b.nombre)).productos[0].disponible,3);
  });

  test('No llegó sigue disponible; una factura electrónica no admite cambiar productos',async()=>{
    const e=await escenario();await ajustes.saveAdjustment({faltanteId:e.faltanteId,cantidadEntregada:0,estado:'no_llego'},usuario.id);
    assert.equal((await servicio.listar(e.faltanteId,e.b.nombre)).productos.length,1);
    await db.query("UPDATE factura SET electronica=true,hacienda_estado='aceptada' WHERE id=$1",[e.factura.id]);
    await assert.rejects(preview(e),err=>err.status===409&&/electrónica/.test(err.message));
  });

  test('la reserva entra en la misma línea destino y conserva sus otras entregas',async()=>{
    const e=await escenario({recibidas:5});
    await db.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,
      descuento_porcentaje,descuento_monto,tarifa,impuesto_monto,total,cabys,unidad)
      VALUES($1,3,$2,'ZZ Vini anterior',2,1500,0,0,1,30,3030,'4294401030100','Unid')`,[e.factura.id,e.b.id]);
    const detectados=[];await require('../src/utils/guardarFaltantes').guardarFaltantes(e.factura.id,
      [{producto_id:e.b.id,cantidad_faltante:2,tipo_faltante:'total'}],usuario.nombre,db,detectados);
    const destinoId=detectados[0].id;
    await ajustes.saveAdjustment({faltanteId:destinoId,cantidadEntregada:1,estado:'parcial'},usuario.id);
    const anterior=(await lineas(e)).find(l=>l.numero_linea===3);
    const r=await confirmar(e,await preview(e));assert.equal(r.faltanteDestinoId,destinoId);
    assert.equal(await reservado(destinoId),4);
    assert.deepEqual((await lineas(e)).find(l=>l.id===anterior.id),anterior);
    const {rows:[aj]}=await db.query('SELECT cantidad_entregada,estado FROM faltantes_ajustes WHERE faltante_id=$1',[destinoId]);
    assert.equal(aj.cantidad_entregada,4);assert.equal(aj.estado,'parcial');
  });

  test('solo acepta cantidades enteras y no propone productos sin ingreso',async()=>{
    const e=await escenario({recibidas:0});assert.equal((await servicio.listar(e.faltanteId,e.b.nombre)).productos.length,0);
    await assert.rejects(preview(e),err=>err.status===409);
    for(const cantidad of[0,-1,4,0.5,'1.5','abc'])await assert.rejects(preview(e,cantidad),err=>err.status===400);
  });

  test('la factura llega a Impresión con el sustituto y no vuelve a rebajar esas unidades',async()=>{
    const e=await escenario();const r=await confirmar(e,await preview(e));
    await ajustes.saveAdjustment({faltanteId:r.faltanteDestinoId,cantidadEntregada:3,estado:'completo',revisado:true},usuario.id);
    const cola=require('../src/modules/reprinting/colaImpresion');await cola.encolarDesdeReporte(e.factura.id);
    await assert.rejects(preview(e),err=>err.status===409);
    const impresion=require('../src/modules/reprinting/procesarImpresion');await impresion.procesar(e.factura.id,{},usuario);
    assert.equal(Number((await documento(e)).total),9550);
    const actuales=await lineas(e);assert.equal(actuales.filter(l=>l.producto_id===e.a.id).reduce((n,l)=>n+Number(l.cantidad),0),3);
    assert.equal(actuales.filter(l=>l.producto_id===e.b.id).reduce((n,l)=>n+Number(l.cantidad),0),3);
  });

  test('respeta el descuento global vigente del cliente para el nuevo producto',async()=>{
    const e=await escenario();await db.query('UPDATE cliente SET descuento_global=5 WHERE id=$1',[e.cliente.id]);
    const p=await preview(e);assert.equal(p.producto.descuento,5);assert.equal(p.producto.precio,1919);
    await confirmar(e,p);assert.equal(Number((await documento(e)).total),9247);
  });

  test('oferta y descuento del cliente: usa el mayor sin sumarlos',async()=>{
    const e=await escenario();await db.query('UPDATE cliente SET descuento_global=5 WHERE id=$1',[e.cliente.id]);
    const {contextoFacturaEn,prepararSustitucionEn}=require('../src/modules/facturacion/sustitucionFactura.service');
    const contexto=await contextoFacturaEn(db,e.factura.id);
    // La vigencia del empaque/oferta tiene sus pruebas con PostgreSQL; aquí
    // se compone una oferta del 10% con el cliente real del 5%, no un 15%.
    const conOferta={query:(sql,p)=>sql.includes('WITH vigentes AS')?Promise.resolve({rows:[{producto_id:e.b.id,descuento_porcentaje:10}]}):db.query(sql,p)};
    const p=await prepararSustitucionEn(conOferta,contexto,e.a.id,e.b.id,3);
    assert.equal(p.descuento,10);assert.equal(p.armado.total,8944);
  });

  test('Reporte Clientes muestra el sustituto y Proveedores no vuelve a pedir las unidades ya recibidas',async()=>{
    const e=await escenario({originales:3,faltan:3});
    await require('../src/utils/guardarFaltantes').guardarFaltantes(e.factura.id,
      [{producto_id:e.otro.id,cantidad_faltante:0,tipo_faltante:'completo'}],usuario.nombre,db);
    await confirmar(e,await preview(e));
    const reporte=await require('../src/modules/reports/reporteClientes.service').getMissingItemsByClient();
    assert.equal(reporte.success,true);
    const factura=reporte.data.find(c=>c.id===e.cliente.id).facturas_con_faltantes.find(f=>f.factura_id===e.factura.id);
    assert.equal(factura.total_items_factura,2,'el origen sustituido no crea un producto fantasma para calcular Sin Caja');
    assert.deepEqual(factura.productos_faltantes.map(p=>p.producto_id),[e.b.id]);
    const {faltanteOperativo,cantidadPendiente}=require('../src/modules/reports/faltantesCompra.sql');
    const {rows:[pendiente]}=await db.query(`SELECT COALESCE(sum(${cantidadPendiente('f')}),0) n FROM faltantes f
      JOIN factura fa ON fa.id=f.factura_propia_id WHERE fa.id=$1 AND ${faltanteOperativo('f','fa')}`,[e.factura.id]);
    assert.equal(Number(pendiente.n),0);
  });
});
