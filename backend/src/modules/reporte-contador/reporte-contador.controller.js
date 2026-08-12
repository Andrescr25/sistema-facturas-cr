/**
 * Reporte Contador - Controller
 */

const service = require('./reporte-contador.service');

function manejarError(res, error, contexto) {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(`❌ Error ${contexto}:`, error);
  res.status(500).json({ success: false, message: error.message });
}

async function cargarPeriodo(req, res) {
  try {
    if (!req.file) throw Object.assign(new Error('No se recibió ningún archivo.'), { status: 400 });
    const { anio, mes, tipo } = req.body;
    const data = await service.cargarPeriodo({
      anio, mes, tipo, buffer: req.file.buffer, nombreArchivo: req.file.originalname
    });
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'cargando el período');
  }
}

async function importarDesdeAlegra(req, res) {
  try {
    const { anio, mes, tipo } = req.body;
    const data = await service.importarDesdeAlegra({ anio, mes, tipo });
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'importando desde Alegra');
  }
}

async function listarPeriodos(req, res) {
  try {
    const { anio, mes } = req.query;
    if (!anio || !mes) throw Object.assign(new Error('Faltan año y mes.'), { status: 400 });
    const data = await service.listarPeriodos(anio, mes);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'listando períodos');
  }
}

async function obtenerPeriodo(req, res) {
  try {
    const data = await service.obtenerPeriodo(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'obteniendo el período');
  }
}

async function toggleExcluirFactura(req, res) {
  try {
    const data = await service.toggleExcluirFactura(req.params.id, req.params.numero, req.body.excluido);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'actualizando la factura');
  }
}

async function actualizarLinea(req, res) {
  try {
    const data = await service.actualizarLinea(req.params.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    manejarError(res, error, 'actualizando la línea');
  }
}

async function eliminarLinea(req, res) {
  try {
    const data = await service.eliminarLinea(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'eliminando la línea');
  }
}

async function eliminarPeriodo(req, res) {
  try {
    const data = await service.eliminarPeriodo(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'eliminando el período');
  }
}

async function redetectarDuplicados(req, res) {
  try {
    const data = await service.redetectarDuplicados(req.params.id);
    res.json({ success: true, ...data });
  } catch (error) {
    manejarError(res, error, 'redetectando duplicados');
  }
}

async function exportarPeriodo(req, res) {
  try {
    const { buffer, nombreSugerido } = await service.exportarPeriodo(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nombreSugerido)}"`);
    res.send(buffer);
  } catch (error) {
    manejarError(res, error, 'exportando el período');
  }
}

async function listarContactos(req, res) {
  try {
    res.json({ success: true, data: await service.listarContactos() });
  } catch (error) {
    manejarError(res, error, 'listando los contactos');
  }
}

async function crearContacto(req, res) {
  try {
    const { nombre, email } = req.body;
    res.json({ success: true, data: await service.crearContacto({ nombre, email }) });
  } catch (error) {
    manejarError(res, error, 'guardando el contacto');
  }
}

async function eliminarContacto(req, res) {
  try {
    res.json({ success: true, ...(await service.eliminarContacto(req.params.id)) });
  } catch (error) {
    manejarError(res, error, 'eliminando el contacto');
  }
}

async function enviarAlContador(req, res) {
  try {
    const { anio, mes, contactoId } = req.body;
    const resultado = await service.enviarAlContador({ anio, mes, contactoId });
    res.json({ success: true, ...resultado });
  } catch (error) {
    manejarError(res, error, 'enviando los reportes al contador');
  }
}

module.exports = {
  listarContactos,
  crearContacto,
  eliminarContacto,
  enviarAlContador,
  cargarPeriodo,
  importarDesdeAlegra,
  listarPeriodos,
  obtenerPeriodo,
  toggleExcluirFactura,
  actualizarLinea,
  eliminarLinea,
  eliminarPeriodo,
  redetectarDuplicados,
  exportarPeriodo
};
