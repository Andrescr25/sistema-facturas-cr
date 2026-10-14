const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cargar=(archivo,nombres)=>new Function(fs.readFileSync(path.join(__dirname,'../../frontend/src/utils',archivo),'utf8').replaceAll('export ','')+'\nreturn {'+nombres+'}')();
const {estadoOrdenCompra,normalizarTelefonoOrden}=cargar('ordenCompraTexto.js','estadoOrdenCompra,normalizarTelefonoOrden');
const {fechaHoraEnCostaRica}=cargar('fechaCR.js','fechaHoraEnCostaRica');
test('estados separan pendientes, enviados e inciertos; cancelar conserva historia',()=>{
 assert.equal(estadoOrdenCompra({estado:'borrador'}),'Borrador');assert.equal(estadoOrdenCompra({estado:'pendiente_enviar'}),'Pendiente de envío');
 assert.equal(estadoOrdenCompra({estado:'cerrada'}),'Cancelada');assert.equal(estadoOrdenCompra({estado:'cerrada',enviada_en:'fecha'}),'Cerrada');
 assert.equal(estadoOrdenCompra({estado:'pendiente_enviar',envio_id:'uuid'}),'Envío por verificar');
 assert.equal(estadoOrdenCompra({estado:'enviada',enviada_en:'fecha'}),'Enviada');assert.equal(estadoOrdenCompra({estado:'recibida',enviada_en:'fecha'}),'Recibida');
 assert.equal(estadoOrdenCompra({estado:'parcialmente_recibida',enviada_en:'fecha'}),'Recibida parcialmente');
});
test('fechas de creación/envío convierten UTC a Costa Rica',()=>{
 const fecha=fechaHoraEnCostaRica('2026-10-14T02:30:00.000Z');assert.match(fecha,/13/);assert.match(fecha,/2026/);assert.match(fecha,/8:30/);
 assert.equal(fechaHoraEnCostaRica(null),'—');assert.equal(fechaHoraEnCostaRica('inválida'),'—');
});

const {lineasDeCantidades,cantidadesOrdenValidas,revisionOrdenCambio}=cargar('ordenCompraTexto.js','lineasDeCantidades,cantidadesOrdenValidas,revisionOrdenCambio');
test('excluir producto no manda cero; cajas enteras válidas y cambios manuales exigen revisión',()=>{
 const lineas=lineasDeCantidades({2:'3',1:''});assert.deepEqual(lineas,[{productoId:2,cantidadProveedor:3}]);assert.equal(cantidadesOrdenValidas(lineas),true);
 for(const q of [0,-1,1.5,1000001])assert.equal(cantidadesOrdenValidas([{cantidadProveedor:q}]),false);assert.equal(cantidadesOrdenValidas([]),false);
 const orden={lineas:[{producto_id:2,cantidad_proveedor:3},{producto_id:1,cantidad_proveedor:10}]};
 assert.equal(revisionOrdenCambio(orden,[{productoId:1,cantidadProveedor:10},...lineas]),false);assert.equal(revisionOrdenCambio(orden,lineas),true);
});
test('comparar el destino de la copia reconoce prefijo CR y separadores, sin confundir otro número',()=>{
 assert.equal(normalizarTelefonoOrden('8888 8888'),'50688888888');
 assert.equal(normalizarTelefonoOrden('+506 8888-8888'),'50688888888');
 assert.equal(normalizarTelefonoOrden('50688888888'),'50688888888');
 assert.notEqual(normalizarTelefonoOrden('8888 8887'),'50688888888');
});
