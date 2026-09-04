/**
 * Cotizaciones - Controller
 */

const servicio = require('./cotizaciones.service');

async function listar(req, res) {
  try {
    res.json({ success: true, data: await servicio.listar({ limite: req.query.limite }) });
  } catch (error) {
    console.error('Error listando cotizaciones:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function detalle(req, res) {
  try {
    res.json({ success: true, data: await servicio.detalle(req.params.id) });
  } catch (error) {
    console.error('Error obteniendo cotización:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function buscarClientes(req, res) {
  try {
    res.json({ success: true, data: await servicio.buscarClientes(req.query.q) });
  } catch (error) {
    console.error('Error buscando clientes:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function catalogo(req, res) {
  try {
    res.json({ success: true, data: await servicio.catalogoParaCotizar() });
  } catch (error) {
    console.error('Error cargando el catálogo para cotizar:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function crear(req, res) {
  try {
    const { clienteId, lineas, observaciones, validezDias, claveIdempotencia } = req.body;
    const r = await servicio.crear({ clienteId, lineas, observaciones, validezDias, claveIdempotencia });
    res.json({
      success: true,
      data: r,
      message: r.yaExistia ? 'Esa cotización ya estaba creada.' : 'Cotización creada.'
    });
  } catch (error) {
    console.error('Error creando cotización:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function editar(req, res) {
  try {
    const { clienteId, lineas, observaciones, vence } = req.body;
    const r = await servicio.editar(req.params.id, { clienteId, lineas, observaciones, vence });
    res.json({ success: true, data: r, message: 'Cotización actualizada.' });
  } catch (error) {
    console.error('Error editando cotización:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function pdf(req, res) {
  try {
    // Se devuelve el archivo, no un enlace: el PDF lo arma este servidor.
    const { archivo, numero } = await servicio.pdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="cotizacion-${numero}.pdf"`);
    return res.send(archivo);
  } catch (error) {
    console.error('Error obteniendo el PDF de la cotización:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function enviarPorWhatsApp(req, res) {
  try {
    const { telefono, mensaje } = req.body || {};
    const r = await servicio.enviarPorWhatsApp(req.params.id, {
      telefono, mensaje, usuarioId: req.usuario?.id
    });
    res.json({ success: true, data: r, message: `Cotización enviada al ${r.telefono}.` });
  } catch (error) {
    console.error('Error enviando la cotización por WhatsApp:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function eliminar(req, res) {
  try {
    const r = await servicio.eliminar(req.params.id);
    res.json({ success: true, data: r, message: `Cotización ${r.numero} eliminada.` });
  } catch (error) {
    console.error('Error eliminando la cotización:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

async function facturar(req, res) {
  try {
    // `aunqueVencida` la manda la pantalla solo después de que alguien
    // confirmó que quiere sostener un precio vencido.
    const r = await servicio.facturar(req.params.id, {
      aunqueVencida: req.body?.aunqueVencida === true
    });
    res.json({
      success: true,
      data: r,
      message: r.yaExistia ? 'Esa cotización ya se había facturado.' : 'Factura creada desde la cotización.'
    });
  } catch (error) {
    console.error('Error facturando cotización:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

module.exports = { listar, buscarClientes, catalogo, detalle, pdf, crear, editar, eliminar, facturar, enviarPorWhatsApp };
