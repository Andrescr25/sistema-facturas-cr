const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const habilitadas=process.env.PROBAR_BASE_LOCAL==='1';
let db,inv;
if(habilitadas){
  require('../config/aislado').asegurarBaseLocal();
  db=require('../config/database');inv=require('../src/modules/inventario/inventario.service');
  after(()=>db.pool.end());
}
async function conCopia(trabajo){
  const c=await db.pool.connect();await c.query('BEGIN');
  try{
    const {rows:[p]}=await c.query("INSERT INTO producto(nombre,referencia,costo_con_iva) VALUES('ZZ Inventario propio','zz-inventario',100) RETURNING *");
    await trabajo(c,p);
  }finally{await c.query('ROLLBACK');c.release();}
}
function prueba(nombre,fn){test(nombre,{skip:!habilitadas},()=>conCopia(fn));}
const mover=(c,p,datos)=>inv.registrarEn(c,{productoId:p.id,tipo:'compra',origenTipo:'compra',origenId:1,clave:'zz-'+Math.random(),...datos});

prueba('apertura en cero es provisional; no se importan existencias del maestro',async(c,p)=>{
 const s=await inv.saldo(c,p.id);assert.equal(Number(s.existencia),0);assert.equal(s.conteo_confirmado,false);
 assert.equal(s.costo_promedio,null);
 const listado=await inv.listarExistencias({q:'ZZ Inventario propio'},c);
 assert.equal(listado.productos.find(r=>r.producto_id===p.id).conteo_confirmado,false);
});

prueba('promedio móvil, venta y compra se explican por los movimientos con precisión decimal',async(c,p)=>{
 await mover(c,p,{cantidad:'10.0000',costoUnitario:'100.00000000'});
 await mover(c,p,{tipo:'venta',origenTipo:'factura',cantidad:'-4.0000',costoUnitario:'100.00000000'});
 await mover(c,p,{cantidad:'4.0000',costoUnitario:'200.00000000'});
 const s=await inv.saldo(c,p.id);assert.equal(Number(s.existencia),10);assert.equal(Number(s.costo_promedio),140);
 const k=await inv.kardex(p.id,{},c);assert.equal(k.movimientos.length,3);assert.equal(Number(k.movimientos[0].existencia),10);
});

prueba('un negativo queda visible sin valoración y una nueva entrada restablece el costo',async(c,p)=>{
 await mover(c,p,{tipo:'venta',origenTipo:'factura',cantidad:'-2',costoUnitario:'100'});
 let s=await inv.saldo(c,p.id);assert.equal(Number(s.existencia),-2);assert.equal(s.costo_promedio,null);
 await mover(c,p,{cantidad:'5',costoUnitario:'160'});
 s=await inv.saldo(c,p.id);assert.equal(Number(s.existencia),3);assert.equal(Number(s.costo_promedio),160);
});

prueba('la misma clave no duplica y datos diferentes para esa clave se rechazan',async(c,p)=>{
 const datos={cantidad:'1.2345',costoUnitario:'150.12345678',clave:'zz-unica'};
 const a=await mover(c,p,datos),b=await mover(c,p,datos);assert.equal(a.id,b.id);
 assert.equal(Number((await inv.saldo(c,p.id)).existencia),1.2345);
 await assert.rejects(mover(c,p,{...datos,costoUnitario:'150.12345679'}),e=>e.status===409);
});

prueba('el conteo real corrige el saldo provisional y establece su costo, sin borrar movimientos',async(c,p)=>{
 await mover(c,p,{cantidad:'10',costoUnitario:'100'});
 await mover(c,p,{tipo:'inicial',origenTipo:'auditoria_item',cantidad:'-5',cantidadContada:'5',costoUnitario:'150'});
 const s=await inv.saldo(c,p.id);assert.equal(Number(s.existencia),5);assert.equal(Number(s.costo_promedio),150);
 assert.equal(s.conteo_confirmado,true);assert.equal((await inv.kardex(p.id,{},c)).movimientos.length,2);
});

prueba('reconciliar factura es idempotente, una edición mueve solo la diferencia y anular revierte',async(c,p)=>{
 await mover(c,p,{cantidad:'10',costoUnitario:'100'});
 const {rows:[f]}=await c.query("INSERT INTO factura(cliente_nombre,fecha,estado) VALUES('ZZ Cliente',CURRENT_DATE,'emitida') RETURNING *");
 await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
  VALUES($1,1,$2,'ZZ Producto',3,1,3)`,[f.id,p.id]);
 await inv.reconciliarDocumentoEn(c,'factura',f.id);
 await inv.reconciliarDocumentoEn(c,'factura',f.id);
 assert.equal(Number((await inv.saldo(c,p.id)).existencia),7);
 await c.query('UPDATE factura_linea SET cantidad=4 WHERE factura_id=$1',[f.id]);
 await inv.reconciliarDocumentoEn(c,'factura',f.id);
 assert.equal(Number((await inv.saldo(c,p.id)).existencia),6);
 await c.query("UPDATE factura SET estado='anulada' WHERE id=$1",[f.id]);
 await inv.reconciliarDocumentoEn(c,'factura',f.id);
 assert.equal(Number((await inv.saldo(c,p.id)).existencia),10);
});

prueba('una factura histórica de Alegra no se convierte en una venta nueva de inventario',async(c,p)=>{
 const {rows:[f]}=await c.query("INSERT INTO factura(cliente_nombre,fecha,estado,alegra_id) VALUES('ZZ Cliente',CURRENT_DATE,'emitida','zz-inventario') RETURNING *");
 await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
  VALUES($1,1,$2,'ZZ Producto',3,1,3)`,[f.id,p.id]);
 await inv.reconciliarDocumentoEn(c,'factura',f.id);assert.equal(Number((await inv.saldo(c,p.id)).existencia),0);
});

prueba('el kardex rechaza editar o borrar; ROLLBACK conserva el movimiento original',async(c,p)=>{
 const m=await mover(c,p,{cantidad:'2',costoUnitario:'100'});
 for(const sql of ['UPDATE movimiento_inventario SET cantidad=9 WHERE id=$1','DELETE FROM movimiento_inventario WHERE id=$1']){
  await c.query('SAVEPOINT intento');await assert.rejects(c.query(sql,[m.id]),/no se edita ni se borra/);await c.query('ROLLBACK TO SAVEPOINT intento');
 }
 assert.equal(Number((await inv.saldo(c,p.id)).existencia),2);
});

test('dos conexiones respetan el bloqueo de bodega y la segunda lee el saldo confirmado, no el pendiente', {skip:!habilitadas}, async()=>{
  const a=await db.pool.connect(),b=await db.pool.connect();let pendiente;
  try{
    await a.query('BEGIN');await b.query('BEGIN');await b.query("SET LOCAL statement_timeout='5s'");
    const {rows:[p]}=await a.query('SELECT id FROM producto WHERE inventariable ORDER BY id LIMIT 1');
    const antes=await inv.saldo(a,p.id);
    await mover(a,p,{cantidad:'3',costoUnitario:'100',clave:'zz-conexion-a'});
    let completo=false;
    pendiente=mover(b,p,{cantidad:'2',costoUnitario:'200',clave:'zz-conexion-b'}).then(r=>{completo=true;return r;});
    // Solo demuestra la espera del bloqueo. Ninguna transacción de prueba se
    // confirma: la segunda debe ver el estado previo después del ROLLBACK.
    await new Promise(r=>setTimeout(r,100));assert.equal(completo,false);
    await a.query('ROLLBACK');await pendiente;
    assert.equal(Number((await inv.saldo(b,p.id)).existencia),Number(antes.existencia)+2);
  }finally{
    await a.query('ROLLBACK');if(pendiente)await pendiente.catch(()=>{});await b.query('ROLLBACK');a.release();b.release();
  }
});
