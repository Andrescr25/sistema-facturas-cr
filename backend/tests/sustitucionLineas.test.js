const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sustituirLineas } = require('../src/modules/facturacion/sustitucionLineas');
const { armarLineas } = require('../src/modules/facturacion/facturaLineas');
const producto = (id, precio, tarifa) => ({ id, precio, tarifa, nombre:`ZZ ${id}`,referencia:`ZZ-${id}`,activo:true,cabys:'4294401030100',unidad:'Unid',impuesto_id:1 });
const linea = (id, p, cantidad, precio=p.precio, descuento=0) => ({ id, ...armarLineas([{cantidad,precio,descuento}],new Map([[String(p.id),p]]),()=>p.id).lineas[0],numero_linea:id });

test('de seis unidades, cambia solo las tres faltantes y conserva una línea ajena exactamente', () => {
  const a=producto(1,1000,13),b=producto(2,2000,1),c=producto(3,50,0);
  const originales=[linea(1,a,6),linea(2,c,2)];const copia=JSON.stringify(originales);
  const r=sustituirLineas(originales,1,b,3);
  assert.equal(r.lineas.find(l=>l.producto_id===1).cantidad,3);
  assert.equal(r.lineas.find(l=>l.producto_id===2).cantidad,3);
  assert.deepEqual(r.lineas.find(l=>l.producto_id===3),originales[1]);
  assert.equal(r.total,9550);assert.equal(JSON.stringify(originales),copia);
});

test('reemplaza una línea completa sin cambiar su id y usa el IVA real del sustituto', () => {
  const original=linea(7,producto(1,1000,13),3);
  const r=sustituirLineas([original],1,producto(2,2000,0),3);
  assert.equal(r.lineas.length,1);assert.equal(r.lineas[0].id,7);assert.equal(r.lineas[0].numero_linea,7);
  assert.equal(r.lineas[0].producto_id,2);assert.equal(r.total,6000);
});

test('múltiples líneas originales, precio histórico, descuento y destino ya facturado permanecen separados', () => {
  const a=producto(1,1000,13),b=producto(2,2000,13);
  const originales=[linea(1,a,2,900,10),linea(2,b,1,1500,5),linea(3,a,4,800,20)];
  const r=sustituirLineas(originales,1,b,3,7);
  assert.deepEqual(r.lineas.find(l=>l.id===2),originales[1]);
  const resto=r.lineas.find(l=>l.id===3);assert.equal(resto.cantidad,3);assert.equal(resto.precio_unitario,800);assert.equal(resto.descuento_porcentaje,20);
  assert.equal(r.lineas.filter(l=>l.producto_id===2&&l.id!==2).reduce((n,l)=>n+l.cantidad,0),3);
  assert.ok(r.lineas.filter(l=>l.producto_id===2&&l.id!==2).every(l=>l.precio_unitario===2000&&l.descuento_porcentaje===7));
});

test('no inventa unidades si la factura ya no tiene la cantidad requerida', () => {
  assert.throws(()=>sustituirLineas([linea(1,producto(1,100,13),2)],1,producto(2,200,13),3),e=>e.status===409);
});

test('el botón solo aparece para un faltante real sin ingreso ni entrega asignada', async () => {
  const { puedeSustituirProducto } = await import('../../frontend/src/utils/reporteClientesUtils.js');
  const p={faltante_id:1,cantidad_faltante:3,ingreso_disponible:0};
  assert.equal(puedeSustituirProducto(p),true);
  for(const cambio of[{cantidad_faltante:0},{ingreso_disponible:1},{ingreso_disponible:null},{faltante_id:null}])assert.equal(puedeSustituirProducto({...p,...cambio}),false);
  assert.equal(puedeSustituirProducto(p,{tieneAjuste:true,cantidadEntregada:1}),false);
});
