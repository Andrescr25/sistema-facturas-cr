/**
 * Las pruebas de precios, numeración y pagos tienen una conexión SQL doble;
 * el kardex real se verifica con PostgreSQL en inventarioPropio.test.js.
 * Sustituir esta dependencia evita simular allí todo el motor de inventario.
 */
function instalar() {
  const ruta=require.resolve('../../src/modules/inventario/inventario.service');
  require.cache[ruta]={id:ruta,filename:ruta,loaded:true,exports:{reconciliarDocumentoEn:async()=>{}}};
}
module.exports={instalar};
