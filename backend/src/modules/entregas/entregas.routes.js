const router=require('express').Router();
const service=require('./entregas.service');
const {enviarExcel}=require('../../utils/exportarExcel');
const fisico=require('./registroFisico.service');
const {listarCiclos}=require('../rutas/operacionCiclo.service');
const responder=(res,resultado)=>resultado.then(data=>res.json({success:true,data}))
  .catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudo completar la operación de entregas.'}));
// Todo el prefijo pertenece al permiso Entregas, incluidos Maps y el selector.
// Bodega revisada no es entrega real; la operación exige revisión física.
router.get('/ciclos',(req,res)=>responder(res,listarCiclos()));
router.get('/exportar',(req,res)=>require('./entregas.excel').exportar(req.query).then(r=>enviarExcel(res,r)).catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudo exportar el recorrido.'})));
router.get('/plan',(req,res)=>responder(res,service.plan(req.query)));
router.get('/paradas/:clave',(req,res)=>responder(res,service.parada(req.params.clave,req.query)));
router.get('/facturas/:id/registro',(req,res)=>responder(res,fisico.consultar(req.params.id)));
router.post('/facturas/:id/eventos',(req,res)=>responder(res,fisico.registrar(req.params.id,req.body,req.usuario?.id)));
// Prefijo/método también registrado como acción de administrador. El servicio
// y SQL vuelven a comprobar el actor; no aceptar revision por /eventos.
router.post('/facturas/:id/revision',(req,res)=>responder(res,fisico.revisar(req.params.id,req.body,req.usuario?.id)));
module.exports=router;
