/**
 * Catalogo Publico Module - Controller
 */

const catalogoAgenteService = require('./catalogo-agente.service');
const pedidosAgente = require('./pedidos-agente.service');

/**
 * GET /api/catalogo-agente/productos
 */
async function listarProductos(req, res) {
  const { start, limit } = req.query;
  try {
    const data = await catalogoAgenteService.listarProductos({ start, limit });
    res.json(data);
  } catch (error) {
    console.error('Error listando productos del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-agente/categorias
 */
async function listarCategorias(req, res) {
  try {
    const data = await catalogoAgenteService.listarCategorias();
    res.json({ categories: data, count: data.length });
  } catch (error) {
    console.error('Error listando categorías del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-agente/ofertas
 */
async function listarOfertasPorBaja(req, res) {
  try {
    res.json({ ofertas: await catalogoAgenteService.listarOfertasPorBaja() });
  } catch (error) {
    console.error('Error listando las bajas de precio:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

async function listarOfertas(req, res) {
  try {
    const data = await catalogoAgenteService.listarOfertas();
    res.json({ ofertas: data });
  } catch (error) {
    console.error('Error listando ofertas del catálogo público:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * GET /api/catalogo-agente/historial-clientes
 * Payload compacto (offline) del historial de compras por cliente.
 */
async function obtenerHistorialClientes(req, res) {
  try {
    const data = await catalogoAgenteService.obtenerHistorialParaCatalogo();
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo el historial de compras por cliente:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}

/**
 * POST /api/catalogo-agente/historial-clientes/sync
 * Fuerza la sincronización del historial de compras desde Alegra.
 */
async function sincronizarHistorialClientes(req, res) {
  try {
    const data = await catalogoAgenteService.sincronizarHistorialCompras({ desde: req.body?.desde });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error sincronizando el historial de compras por cliente:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
}


/**
 * Recibe un pedido levantado en la calle.
 *
 * Devuelve 200 tanto si el pedido se creó como si YA existía —el dispositivo
 * reenvió algo que sí había entrado—, porque para el agente el desenlace es
 * el mismo: su pedido está guardado y puede borrar la copia local. Un error
 * acá lo dejaría reintentando para siempre algo que ya está.
 */
async function crearPedido(req, res) {
  try {
    const { alegraContactId, clienteNombre, lineas, observaciones, claveIdempotencia } = req.body;
    const resultado = await pedidosAgente.crear(req.usuario?.id || null, {
      alegraContactId, clienteNombre, lineas, observaciones, claveIdempotencia
    });
    res.json({
      success: true,
      data: {
        pedidoId: resultado.pedido.id,
        total: Number(resultado.pedido.total),
        yaExistia: resultado.yaExistia,
        noDisponibles: resultado.noDisponibles || []
      },
      message: resultado.yaExistia ? 'Ese pedido ya estaba guardado.' : 'Pedido recibido.'
    });
  } catch (error) {
    console.error('Error creando pedido del agente:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}


/** El dispositivo cuenta cómo está. No falla la petición si algo sale mal:
 *  es información secundaria y no debe estorbar el envío de pedidos. */
async function reportarEstadoDispositivo(req, res) {
  try {
    const { dispositivoId, pedidosPendientes, pedidoMasViejo } = req.body;
    const d = await pedidosAgente.reportarEstado(req.usuario?.id || null, {
      dispositivoId, usuarioNombre: req.usuario?.nombre || null,
      pedidosPendientes, pedidoMasViejo
    });
    res.json({ success: true, data: { id: d.id } });
  } catch (error) {
    console.error('Error reportando estado del dispositivo:', error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
}

/** Los dispositivos y sus pendientes, para la pantalla de la casa. */
async function listarDispositivos(req, res) {
  try {
    res.json({ success: true, data: await pedidosAgente.listarDispositivos() });
  } catch (error) {
    console.error('Error listando dispositivos:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listarOfertasPorBaja,
  reportarEstadoDispositivo,
  listarDispositivos,
  crearPedido,
  listarProductos,
  listarCategorias,
  listarOfertas,
  obtenerHistorialClientes,
  sincronizarHistorialClientes
};
