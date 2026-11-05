const servicio = require('./sustitucion.service');
const { puedeHacer } = require('../usuarios/permisos.middleware');

const responder = trabajo => async (req,res) => {
  try {
    if (!await puedeHacer(req,'sustituir-producto')) return res.status(403).json({ success:false,message:'No tenés permiso para cambiar productos en Reporte Clientes.' });
    res.json({ success:true,data:await trabajo(req) });
  } catch (error) {
    if (!error.status) console.error('Sustitución de producto:',error);
    res.status(error.status||500).json({ success:false,message:error.message });
  }
};

module.exports = {
  listar:responder(req=>servicio.listar(req.params.faltanteId,req.query.q)),
  previsualizar:responder(req=>servicio.previsualizar(req.params.faltanteId,req.query)),
  sustituir:responder(req=>servicio.sustituir(req.params.faltanteId,req.body,req.usuario))
};
