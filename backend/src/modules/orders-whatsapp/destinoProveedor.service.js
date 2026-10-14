const { pool } = require('../../../config/database');
const { telefonosDe } = require('../../utils/telefonosCliente');
const { interno:{resolverProveedorEn} } = require('./ordenesCiclo.service');
const { mensajePredeterminado } = require('./ordenesCicloEnvio.service');

/** Mostrar contactos no prepara una compra. Esta lectura no espera el bloqueo
 * global de órdenes ni calcula faltantes/PDF. Al revisar el envío se vuelve a
 * comprobar el destino y se conserva el snapshot exacto que se confirmará.
 */
async function consultar(datos,{db=pool}={}) {
  const p=await resolverProveedorEn(db,datos,{bloquear:false,contactos:true});
  const campo=p.telefono_whatsapp?.trim()?{mobile:p.telefono_whatsapp}:{phonePrimary:p.telefono};
  const telefonos=telefonosDe(campo).candidatos;
  return {telefono:telefonos.length===1?telefonos[0].numero:'',telefonos,mensaje:mensajePredeterminado};
}

module.exports={consultar};
