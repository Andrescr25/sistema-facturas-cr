const marcas = require('./marcas.service');
const imagenes = require('./marcas.imagenes');

function responder(res, trabajo, status = 200) {
  return trabajo.then(data => res.status(status).json({ success:true,data })).catch(error => {
    const s = error.status || 500;
    if (s >= 500) console.error('Marcas del catálogo:', error);
    res.status(s).json({ success:false,message:error.message });
  });
}

module.exports = {
  listar:(req,res) => responder(res, marcas.listar(req.params.subId)),
  crear:(req,res) => responder(res, marcas.guardar(req.params.subId, null, req.body, req.usuario?.id), 201),
  editar:(req,res) => responder(res, marcas.guardar(req.params.subId, req.params.id, req.body, req.usuario?.id)),
  eliminar:(req,res) => responder(res, marcas.eliminar(req.params.id, req.usuario?.id).then(async m => {
    await imagenes.borrarPropia(m.id, m.imagen);
    return { id:m.id };
  })),
  imagen:(req,res) => responder(res, imagenes.asignar(req.params.id, req.file, req.usuario?.id)),
  quitarImagen:(req,res) => responder(res, imagenes.quitar(req.params.id, req.usuario?.id))
};
