/**
 * Volver a enviar una orden de compra YA ENVIADA (2026-11-11). El usuario:
 * «agrégame la opción en Reporte Proveedor de volver a enviar, para quitar la
 * opción de "usar código proveedor"». Pasa cuando el PDF salió con los códigos
 * y nombres del proveedor y conviene mandarlo con los nuestros, o al revés.
 *
 * QUÉ HACE Y QUÉ NO
 *   · Arma el PDF otra vez desde la orden guardada: mismas líneas y mismas
 *     cantidades; solo cambia si lleva los códigos/nombres del proveedor
 *     (`preferirDatosProveedor`, igual que al enviar).
 *   · NO toca la orden ni su envío confirmado: `orden_compra_ciclo_envio`
 *     admite un solo envío activo por orden y es inmutable. El reenvío queda
 *     en `envio_whatsapp` (el historial de WhatsApp) y en la bitácora, con la
 *     huella del PDF y la opción elegida.
 *   · Uno a la vez: se reclama con la orden bloqueada, antes de tocar la red,
 *     y otro reenvío de la misma orden dentro de 2 minutos responde 409 (un
 *     doble clic no le manda dos PDF al proveedor).
 */
const { createHash } = require('node:crypto');
const whatsapp = require('../../integrations/whatsapp');
const { salidasBloqueadas, errorSalidaBloqueada } = require('../../../config/aislado');
const { httpError } = require('../../utils/validacion');
const { telefonosDe, validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { registrarCambio } = require('../../utils/bitacora');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { generarPdfOrden } = require('./ordenesCiclo.pdf');
const { mensajePredeterminado } = require('./ordenesCicloEnvio.service');
const { interno: { enOrden, obtenerEn } } = require('./ordenesCiclo.service');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const ESPERA_MINUTOS = 2;

async function enviadaEn(db, id, opciones) {
  const o = await obtenerEn(db, id, opciones);
  if (o.estado !== 'enviada') throw httpError(409, 'Solo se vuelve a enviar una orden que ya se envió.');
  return o;
}

/** Lo que el modal propone: el número del envío original, los de la ficha y el mensaje de siempre. */
async function propuesta(id) {
  return enOrden(async (db) => {
    const o = await enviadaEn(db, id);
    const { rows: [p] } = await db.query('SELECT telefono_whatsapp, telefono FROM proveedor WHERE id = $1', [o.proveedor_id]);
    const { candidatos } = telefonosDe({ mobile: p?.telefono_whatsapp, phonePrimary: p?.telefono });
    const original = o.envios.find((e) => e.estado === 'confirmado');
    const delOriginal = original ? validarTelefonoEscrito(original.numero.slice(3)) : null;
    return {
      telefono: (delOriginal?.valido && delOriginal.formateado) || candidatos[0]?.formateado || '',
      telefonos: candidatos.map((t) => ({ formateado: t.formateado })),
      mensaje: mensajePredeterminado
    };
  });
}

async function reenviar(id, datos = {}, usuarioId = null) {
  if (typeof datos.preferirDatosProveedor !== 'boolean') throw httpError(400, 'Elegí si el PDF lleva los códigos del proveedor.');
  const telefono = validarTelefonoEscrito(datos.telefono);
  if (!telefono.valido) throw httpError(400, telefono.motivo);
  const mensaje = typeof datos.mensaje === 'string' && datos.mensaje.trim() ? datos.mensaje.trim() : mensajePredeterminado;
  if (mensaje.length > 2000) throw httpError(400, 'Escribí un mensaje de hasta 2000 caracteres.');
  if (salidasBloqueadas()) throw errorSalidaBloqueada('volver a enviar la orden de compra');

  const { o, pdf } = await enOrden(async (db) => {
    const o = await enviadaEn(db, id, { bloquear: true });
    const { rows: recientes } = await db.query(
      `SELECT 1 FROM bitacora_cambio WHERE entidad = 'orden_compra_ciclo' AND entidad_id = $1 AND accion = 'iniciar_reenvio'
          AND creado_en > NOW() - make_interval(mins => $2) LIMIT 1`, [String(o.id), ESPERA_MINUTOS]);
    if (recientes.length) throw httpError(409, 'Esta orden se volvió a enviar hace un momento. Esperá a que el proveedor la reciba antes de mandarla otra vez.');
    const pdf = await generarPdfOrden(o, { preferirDatosProveedor: datos.preferirDatosProveedor });
    if (pdf.length > 5 * 1024 * 1024) throw httpError(413, 'La orden supera el tamaño permitido para el PDF.');
    await registrarCambio(db, {
      entidad: 'orden_compra_ciclo', entidadId: o.id, accion: 'iniciar_reenvio', usuarioId,
      despues: { numero: telefono.numero, sha256: sha(pdf), preferirDatosProveedor: datos.preferirDatosProveedor }
    });
    return { o, pdf };
  });

  let resultado;
  try {
    // Fuera de la transacción: el reenvío ya quedó reclamado.
    const r = await whatsapp.enviarDocumento({
      telefono: telefono.numero, mensaje, pdf, nombreArchivo: `orden-de-compra-${hoyEnCostaRica()}.pdf`, sujeto: 'proveedor'
    });
    if (r?.enviado !== true || r.numero !== telefono.numero) throw new Error('Sin confirmación del transporte');
    resultado = { estado: 'enviado', motivo: null };
  } catch (error) {
    // Nunca guardar el error crudo: puede traer claves o la URL del servicio.
    resultado = error.envioNoIniciado === true
      ? { estado: 'no_enviado', motivo: 'WhatsApp no inició el envío. Podés intentarlo de nuevo en 2 minutos.' }
      : { estado: 'incierto', motivo: 'No se sabe si llegó. Preguntale al proveedor antes de volver a enviarla.' };
  }

  await enOrden(async (db) => {
    await db.query(`INSERT INTO envio_whatsapp (tipo, referencia, telefono, enviado_por, exito, error)
      VALUES ('orden_compra', $1, $2, $3, $4, $5)`, [o.referencia, telefono.numero, usuarioId, resultado.estado === 'enviado', resultado.motivo]);
    await registrarCambio(db, {
      entidad: 'orden_compra_ciclo', entidadId: o.id, accion: `reenvio_${resultado.estado}`, usuarioId,
      despues: { numero: telefono.numero, preferirDatosProveedor: datos.preferirDatosProveedor }, motivo: resultado.motivo
    });
  }).catch(() => { /* el reenvío ya salió o no; la pantalla dice cuál */ });

  return { ...resultado, numero: telefono.numero };
}

module.exports = { propuesta, reenviar };
