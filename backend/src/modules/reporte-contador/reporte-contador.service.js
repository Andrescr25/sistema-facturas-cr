const { query } = require('../../../config/database');
const { enviarCorreo, estaConfigurado } = require('../../../services/mailer');
const { httpError, uuidValido, correo, texto } = require('../../utils/validacion');
const { obtenerMes } = require('./contador.mes');
const { excelMensual } = require('./contador.excel');
const { comprobantes } = require('./contador.comprobantes');

/** Contactos guardados, el último usado primero. */
async function listarContactos() {
  const res = await query(`
    SELECT id, nombre, email, ultimo_envio
    FROM reporte_contador_contacto
    ORDER BY ultimo_envio DESC NULLS LAST, nombre ASC;
  `);
  return {
    contactos: res.rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      email: r.email,
      ultimoEnvio: r.ultimo_envio
    })),
    envioDisponible: estaConfigurado()
  };
}

function validarEmail(email) {
  const limpio = correo(200)(email, 'Correo');
  if (!limpio) throw httpError(400, 'El correo es obligatorio.');
  return limpio;
}

async function crearContacto({ nombre, email }) {
  const nombreLimpio = texto(150)(nombre, 'Nombre');
  if (!nombreLimpio) throw httpError(400, 'El nombre es obligatorio.');
  const emailLimpio = validarEmail(email);

  // El correo es único: si ya existe, se actualiza el nombre en vez de
  // fallar — es lo que espera alguien que reescribe un contacto.
  const res = await query(
    `
    INSERT INTO reporte_contador_contacto (nombre, email)
    VALUES ($1, $2)
    ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id, nombre, email, ultimo_envio;
  `,
    [nombreLimpio, emailLimpio]
  );

  const r = res.rows[0];
  return { id: r.id, nombre: r.nombre, email: r.email, ultimoEnvio: r.ultimo_envio };
}

async function eliminarContacto(id) {
  const res = await query(`DELETE FROM reporte_contador_contacto WHERE id = $1 RETURNING nombre;`, [
    id
  ]);
  if (res.rows.length === 0) throw httpError(404, 'Contacto no encontrado.');
  return { eliminado: true, nombre: res.rows[0].nombre };
}

async function exportarMes(datos) {
  return excelMensual(await obtenerMes(datos));
}

async function respaldosMes(datos) {
  const mes = await obtenerMes(datos);
  return comprobantes(mes);
}

async function enviarAlContador({ anio, mes, contactoId, huella }) {
  const reporte = await obtenerMes({ anio, mes });
  if (huella !== reporte.huella)
    throw httpError(409, 'El mes cambió. Actualizá el reporte y revisalo antes de enviar.');
  const contacto = (
    await query('SELECT id,nombre,email FROM reporte_contador_contacto WHERE id=$1', [
      uuidValido(contactoId)
    ])
  ).rows[0];
  if (!contacto) throw httpError(404, 'El contacto elegido ya no existe.');
  if (!reporte.documentos.length && !reporte.gastos.length)
    throw httpError(409, 'No hay movimientos en este mes.');
  const excel = excelMensual(reporte);
  const adjuntos = [{ filename: excel.nombre, content: excel.buffer }];
  let faltantes = 0;
  if (reporte.gastos.length) {
    const respaldo = await comprobantes(reporte);
    faltantes = respaldo.faltantes;
    adjuntos.push({ filename: respaldo.nombre, content: respaldo.buffer });
  }
  if (adjuntos.reduce((s, a) => s + a.content.length, 0) > 18 * 1024 * 1024) {
    throw httpError(
      413,
      'Los adjuntos superan el límite de correo. Descargá el Excel y los comprobantes para compartirlos por otro medio.'
    );
  }
  const pendientes = reporte.gastos.filter(
    (g) => g.revision !== 'Revisado' && g.estado !== 'anulada'
  ).length;
  const envio = await enviarCorreo({
    para: contacto.email,
    asunto: `Reporte mensual ${reporte.etiqueta} — Distribuidora Tachi`,
    texto:
      `Adjunto el reporte de facturas y notas electrónicas, compras y gastos de ${reporte.etiqueta}.\n` +
      `${reporte.gastos.length} gastos operativos; ${pendientes} pendientes de revisión.\n` +
      `Los importes por revisar quedan vacíos; recibir o pagar no concede deducción ni crédito.\n` +
      `${faltantes} archivos de respaldo faltantes, detallados en el ZIP.\nDistribuidora Tachi`,
    adjuntos
  });
  await query('UPDATE reporte_contador_contacto SET ultimo_envio=CURRENT_TIMESTAMP WHERE id=$1', [
    contacto.id
  ]);
  return {
    email: contacto.email,
    nombre: contacto.nombre,
    adjuntos: adjuntos.map((a) => a.filename),
    pendientes,
    faltantes,
    messageId: envio.messageId
  };
}

module.exports = {
  obtenerMes,
  exportarMes,
  respaldosMes,
  listarContactos,
  crearContacto,
  eliminarContacto,
  enviarAlContador
};
