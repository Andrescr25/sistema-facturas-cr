import api from "../../services/api";

export const mensajeError = (e) =>
  e.response?.data?.message ||
  e.response?.data?.error ||
  "No se pudo completar la operación con Hacienda.";
export const raizDocumento = (origen) =>
  origen === "compra" ? "/compras/hacienda" : "/facturacion/hacienda";
export async function configuracion(ambiente) {
  return (await api.get(`/configuracion/hacienda/${ambiente}`)).data.data;
}
/**
 * Lo vacío no viaja —así una contraseña en blanco conserva la guardada—,
 * salvo estos campos, donde dejarlo vacío es una decisión: «sin elegir».
 */
const VACIO_ES_UN_VALOR = new Set(["condicion_iva_compras"]);
export async function guardar(ambiente, datos, archivo) {
  const form = new FormData();
  Object.entries(datos).forEach(([k, v]) => {
    if (v !== undefined && (v !== "" || VACIO_ES_UN_VALOR.has(k))) form.append(k, String(v));
  });
  if (archivo) form.append("certificado", archivo);
  return (
    await api.put(`/configuracion/hacienda/${ambiente}`, form, {
      headers: { "Content-Type": undefined },
    })
  ).data.data;
}
/** Con qué número sale el próximo comprobante de cada tipo en ese ambiente. */
export async function numeracion(ambiente) {
  return (await api.get(`/configuracion/hacienda/${ambiente}/numeracion`)).data.data;
}
/** Cambiar el número con que sale el próximo comprobante de un tipo. */
export async function fijarNumeracion(ambiente, tipo, siguiente) {
  return (
    await api.put(`/configuracion/hacienda/${ambiente}/numeracion`, { tipo, siguiente })
  ).data.data;
}
// --- Un clic desde la factura (ver emisionPasos.js) ---
/** Cómo va la emisión de esa factura: ambiente, comprobante y correo al cliente. */
export async function estadoFactura(id) {
  return (await api.get(`/facturacion/hacienda/facturas/${id}/estado`)).data.data;
}
/** Prepara y firma sin preguntar: el servidor elige ambiente y tipo. */
export async function emitirFactura(id, datos = {}) {
  return (await api.post(`/facturacion/hacienda/facturas/${id}/emitir`, datos)).data.data;
}
/** Cómo va la emisión de una nota de crédito (mismo formato que la factura). */
export async function estadoNota(id) {
  return (await api.get(`/facturacion/hacienda/notas-credito/${id}/estado`)).data.data;
}
/** Prepara y firma la nota: lleva qué hace sobre su factura (`codigoReferencia`). */
export async function emitirNota(id, datos = {}) {
  return (await api.post(`/facturacion/hacienda/notas-credito/${id}/emitir`, datos)).data.data;
}
/** Volver a mandarle al cliente el PDF con los dos XML. */
export async function reenviarCorreo(id) {
  return (await api.post(`/facturacion/hacienda/facturas/${id}/correo`)).data.data;
}
/** Lo mismo para una nota de crédito aceptada. */
export async function reenviarCorreoNota(id) {
  return (await api.post(`/facturacion/hacienda/notas-credito/${id}/correo`)).data.data;
}
export async function operar(comprobante, accion) {
  return (
    await api.post(
      `${raizDocumento(comprobante.origen)}/comprobantes/${comprobante.id}/${accion}`,
    )
  ).data.data;
}
export async function descargar(comprobante, respuesta = false) {
  const r = await api.get(
    `${raizDocumento(comprobante.origen)}/comprobantes/${comprobante.id}/${respuesta ? "respuesta" : "xml"}`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(r.data),
    a = document.createElement("a");
  a.href = url;
  a.download = `${respuesta ? "respuesta" : "comprobante"}-${comprobante.clave}.xml`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function listar(ambiente) {
  return (await api.get(`/configuracion/hacienda/${ambiente}/comprobantes`))
    .data.data;
}
export async function probar(ambiente) {
  return (await api.post(`/configuracion/hacienda/${ambiente}/probar`)).data
    .data;
}
// --- La compra se acepta sola (ver hooks/useAceptacionCompra.js) ---
// `id` es el de la factura del buzón, que es el que tiene Revisión de Precios.
/** Cómo va la aceptación de esa compra ante Hacienda. */
export async function estadoCompra(id) {
  return (await api.get(`/compras/hacienda/compras/${id}/estado`)).data.data;
}
/** Prepara y firma la aceptación total, sin preguntar nada. */
export async function aceptarCompra(id, datos = {}) {
  return (await api.post(`/compras/hacienda/compras/${id}/aceptar`, datos)).data.data;
}
/** Conservar el XML del proveedor de una compra que no lo tiene. */
export async function subirOriginal(id, archivo) {
  const form = new FormData();
  form.append("xml", archivo);
  return (
    await api.post(`/compras/hacienda/compras/${id}/xml`, form, {
      headers: { "Content-Type": undefined },
    })
  ).data.data;
}
