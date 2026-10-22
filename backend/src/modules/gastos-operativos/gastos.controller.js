const servicio = require('./gastos.service');
const registro = require('./gastos.registro');
const archivos = require('./gastos.archivos');
const { httpError } = require('../../utils/validacion');

const responder = (fn, status = 200) => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.status(status).json({ success: true, data: await fn(req) });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('Gastos operativos: no se pudo completar la operación.');
    res.status(status).json({ success: false, message: e.status ? e.message : 'No se pudo completar la operación del gasto.' });
  }
};

module.exports = {
  listar: responder(req => servicio.listar(req.query)),
  pendientes: responder(req => servicio.listar({ ...req.query, decision: 'pendiente' })),
  decidir: responder(req => require('./gastos.aprobacion').decidir(req.params.id, req.body || {}, req.usuario?.id)),
  obtener: responder(req => servicio.obtener(req.params.id)),
  editar: responder(req => servicio.editar(req.params.id, req.body, req.usuario?.id)),
  desdeFactura: responder(req => registro.desdeFactura(req.body?.facturaId, req.body, req.usuario?.id), 201),
  revalidar: responder(req => servicio.revalidar(req.params.id, req.usuario?.id)),
  pagar: responder(req => servicio.pagar(req.params.id, req.body || {}, req.usuario?.id), 201),
  adjuntarPdf: responder(async req => {
    if (!req.file) throw httpError(400, 'Elegí el PDF del proveedor.');
    const gasto = await servicio.obtener(req.params.id);
    return archivos.conservarPdf(gasto.factura_id, req.file.buffer, req.usuario?.id);
  }),
  adjuntarXml: responder(async req => {
    if (!req.file) throw httpError(400, 'Elegí el XML original del proveedor.');
    await archivos.conservarXml(req.params.id, req.file.buffer, req.usuario?.id);
    return servicio.revalidar(req.params.id, req.usuario?.id);
  }),
  estadoFiscal: responder(async req => {
    const g = await servicio.obtener(req.params.id);
    if (!g.compra_id) return { motivoNoEmitible: 'El comprobante todavía requiere validación.', comprobante: null };
    return require('../../integrations/hacienda/rutas').estadoCompra(g.compra_id);
  }),
  responderFiscal: responder(async req => {
    if (req.body?.confirmar !== true) throw httpError(400, 'Confirmá la respuesta y los importes revisados antes de enviarlos.');
    const g = await servicio.obtener(req.params.id);
    if (!g.compra_id) throw httpError(409, 'Validá el comprobante antes de responder a Hacienda.');
    return require('../../integrations/hacienda/rutas').responderCompra(g.compra_id, req.usuario?.id);
  }),
  descargar: async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const buffer = await archivos.descargar(req.params.id, req.params.tipo);
      res.type(req.params.tipo === 'xml' ? 'application/xml' : 'application/pdf')
        .attachment(`gasto-${Number(req.params.id)}.${req.params.tipo}`).send(buffer);
    } catch (e) {
      res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'No se pudo descargar el archivo.' });
    }
  }
};
