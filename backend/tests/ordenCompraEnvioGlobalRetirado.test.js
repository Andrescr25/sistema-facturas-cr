const {test}=require('node:test'),assert=require('node:assert/strict');
const express=require('express');

// Una pantalla vieja o una llamada directa tampoco puede comprar por fuera
// del registro de una orden independiente. Se prueba el router real. Desde el
// 2026-10-20 el envío global ni siquiera existe en el servicio: no hay qué espiar.
test('envío global rechaza incluso un pedido válido sin invocar transporte',async()=>{
  const app=express();app.use(express.json());app.use('/orden-compra',require('../src/modules/orders-whatsapp/orders-whatsapp.routes'));
  const servidor=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>servidor.once('listening',resolve));
  try{
    const respuesta=await fetch(`http://127.0.0.1:${servidor.address().port}/orden-compra/enviar-whatsapp`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({proveedor:'ZZ Proveedor',telefono:'88888888',productos:[{codigo:'ZZ',cantidad:10}]})
    });
    assert.equal(respuesta.status,409);assert.match((await respuesta.json()).message,/Abrí el proveedor en Faltantes/);
  }finally{servidor.closeAllConnections();await new Promise(resolve=>servidor.close(resolve))}
});

test('el servicio viejo ya no arma PDF ni envía por su cuenta',()=>{
  const Servicio=require('../src/modules/orders-whatsapp/orders-whatsapp.service');
  for(const m of ['generarOrdenCompraPDFBuffer','enviarOrdenCompraWhatsApp'])assert.equal(typeof Servicio.prototype[m],'undefined',m);
});
