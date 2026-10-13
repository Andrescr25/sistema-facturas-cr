const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cargar=(archivo,nombres)=>new Function(fs.readFileSync(path.join(__dirname,'../../frontend/src/utils',archivo),'utf8').replaceAll('export ','')+'\nreturn {'+nombres+'}')();
const {estadoOrdenCompra,grupoOrdenCompra}=cargar('ordenCompraTexto.js','estadoOrdenCompra,grupoOrdenCompra');
const {fechaHoraEnCostaRica}=cargar('fechaCR.js','fechaHoraEnCostaRica');
test('estados separan pendientes, enviados e inciertos; cancelar conserva historia',()=>{
 for(const estado of ['borrador','pendiente_enviar'])assert.equal(grupoOrdenCompra({estado}),'pendientes');
 assert.equal(estadoOrdenCompra({estado:'cerrada'}),'Cancelada');assert.equal(estadoOrdenCompra({estado:'cerrada',enviada_en:'fecha'}),'Cerrada');
 assert.equal(estadoOrdenCompra({estado:'pendiente_enviar',envio_id:'uuid'}),'Envío por verificar');assert.equal(grupoOrdenCompra({estado:'pendiente_enviar',envio_id:'uuid'}),'verificar');
 for(const estado of ['enviada','parcialmente_recibida','recibida'])assert.equal(grupoOrdenCompra({estado,enviada_en:'fecha'}),'enviadas');
 assert.equal(estadoOrdenCompra({estado:'parcialmente_recibida',enviada_en:'fecha'}),'Recibida parcialmente');
});
test('fechas de creación/envío convierten UTC a Costa Rica',()=>{
 const fecha=fechaHoraEnCostaRica('2026-10-14T02:30:00.000Z');assert.match(fecha,/13/);assert.match(fecha,/2026/);assert.match(fecha,/8:30/);
 assert.equal(fechaHoraEnCostaRica(null),'—');assert.equal(fechaHoraEnCostaRica('inválida'),'—');
});

const {lineasDeCantidades,cantidadesOrdenValidas,revisionOrdenCambio,productosParaRevisar}=cargar('ordenCompraTexto.js','lineasDeCantidades,cantidadesOrdenValidas,revisionOrdenCambio,productosParaRevisar');
test('excluir producto no manda cero; cajas enteras válidas y cambios manuales exigen revisión',()=>{
 const lineas=lineasDeCantidades({2:'3',1:''});assert.deepEqual(lineas,[{productoId:2,cantidadProveedor:3}]);assert.equal(cantidadesOrdenValidas(lineas),true);
 for(const q of [0,-1,1.5,1000001])assert.equal(cantidadesOrdenValidas([{cantidadProveedor:q}]),false);assert.equal(cantidadesOrdenValidas([]),false);
 const orden={lineas:[{producto_id:2,cantidad_proveedor:3},{producto_id:1,cantidad_proveedor:10}]};
 assert.equal(revisionOrdenCambio(orden,[{productoId:1,cantidadProveedor:10},...lineas]),false);assert.equal(revisionOrdenCambio(orden,lineas),true);
});
test('la revisión muestra cantidades asignadas propias, sin confundirlas con cajas o necesidad libre',()=>{
 const [p]=productosParaRevisar({lineas:[{producto_id:1,factor_conversion:6,cantidad_proveedor:2,origenes:[{cantidad:6},{cantidad:4}]}]},null);assert.equal(p.reservada,10);assert.equal(p.factorConversion,6);
 assert.deepEqual(productosParaRevisar(null,{productos:[{disponible:0},{disponible:3}]}),[{disponible:3}]);
});
