const consultas=require('./comprasProveedores.service');
const automaticas=require('./ordenesAutomaticas.service');
const responder=(res,p)=>p.then(data=>res.json({success:true,data}))
  .catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudieron consultar o preparar las compras.'}));
module.exports={
  resumen:(req,res)=>responder(res,consultas.resumen(req.query)),
  preparar:(req,res)=>responder(res,automaticas.sincronizar(req.body,req.usuario?.id))
};
