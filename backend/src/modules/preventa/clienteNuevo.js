/**
 * «Cliente nuevo» desde Preventa (E2 de la planilla, 2026-10-30; migración 073).
 *
 * El usuario le paga al agente ₡2.000 «por cliente nuevo que consiga», y
 * decidió que cuenta con su primera compra. El agente no tiene Clientes: lo
 * registra desde la ruta donde lo encontró, y queda a su nombre (`captado_por`).
 *
 * Como de esto sale plata, es más estricto que el alta de Clientes:
 * · Solo en sus rutas (salvo «Ver todas las rutas»), al final del orden.
 * · Cédula de verdad, que calce con su tipo. La de mostrador (100000000) no:
 *   ahí caben decenas de clientes y ninguno sería «nuevo».
 * · Una cédula que ya tiene ficha se rechaza diciendo de quién es: un cliente
 *   que ya existía no es uno que consiguió.
 * Pasa por el mismo `crearCliente` (validación, orden de ruta y bitácora).
 */
const { httpError, idValido } = require('../../utils/validacion');
const clientes = require('../clientes/clientes.service');
const { limpiar } = require('../clientes/identificacion');
const { enlaceDeUbicacion, rotacionValida } = require('./fichaDesdeVisita');

const TIPOS_DEL_AGENTE = ['CF', 'CJ', 'DIMEX', 'NITE', 'EXTRANJERO'];
// La de mostrador y cualquier número de un solo dígito repetido.
const GENERICA = /^(10+|(\d)\2+)$/;

/**
 * @param {{rutaId, nombre, tipoIdentificacion, identificacion, celular?, telefono?, correo?, otrasSenas?, rotacionDias?, ubicacion?}} datos
 * @param {{usuarioId: number, rutasPermitidas: number[]|null}} quien
 */
async function crearClienteNuevo(datos = {}, { usuarioId, rutasPermitidas = null } = {}) {
  const rutaId = idValido(datos.rutaId);
  if (rutasPermitidas && !rutasPermitidas.includes(rutaId)) throw httpError(403, 'Esa ruta no está asignada a tu usuario.');
  if (!TIPOS_DEL_AGENTE.includes(datos.tipoIdentificacion)) throw httpError(400, 'Elegí el tipo de identificación.');
  const identificacion = limpiar(datos.identificacion, datos.tipoIdentificacion);
  if (!identificacion) throw httpError(400, 'Escribí la cédula del cliente: sin ella no cuenta como cliente nuevo.');
  if (GENERICA.test(identificacion)) throw httpError(400, 'Esa es una cédula genérica: pedile al cliente la suya.');

  const ficha = {
    nombre: datos.nombre, tipo_identificacion: datos.tipoIdentificacion, identificacion,
    celular: datos.celular, telefono: datos.telefono, correo: datos.correo, otras_senas: datos.otrasSenas, ruta_id: rutaId
  };
  if (datos.rotacionDias !== undefined && datos.rotacionDias !== '') ficha.rotacion_dias = rotacionValida(datos.rotacionDias);
  if (datos.ubicacion) ficha.ubicacion_maps = enlaceDeUbicacion(datos.ubicacion);
  for (const campo of Object.keys(ficha)) if (ficha[campo] === undefined || ficha[campo] === '') delete ficha[campo];

  return clientes.crearCliente(ficha, usuarioId, { captadoPor: usuarioId, identificacionUnica: true });
}

module.exports = { crearClienteNuevo };
