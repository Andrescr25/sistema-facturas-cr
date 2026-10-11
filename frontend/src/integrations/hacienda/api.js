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
export async function guardar(ambiente, datos, archivo) {
  const form = new FormData();
  Object.entries(datos).forEach(([k, v]) => {
    if (v !== undefined && v !== "") form.append(k, String(v));
  });
  if (archivo) form.append("certificado", archivo);
  return (
    await api.put(`/configuracion/hacienda/${ambiente}`, form, {
      headers: { "Content-Type": undefined },
    })
  ).data.data;
}
export async function preparar(origen, id, datos) {
  const plural = {
    factura: "facturas",
    nota_credito: "notas-credito",
    compra: "compras",
  }[origen];
  return (
    await api.post(`${raizDocumento(origen)}/${plural}/${id}/preparar`, datos)
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
/** Volver a mandarle al cliente el PDF con los dos XML. */
export async function reenviarCorreo(id) {
  return (await api.post(`/facturacion/hacienda/facturas/${id}/correo`)).data.data;
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
export async function datosDocumento(origen, id, buzon = false) {
  const plural = {
    factura: "facturas",
    nota_credito: "notas-credito",
    compra: "compras",
  }[origen];
  return (
    await api.get(
      buzon
        ? `/compras/hacienda/buzon/${id}`
        : `${raizDocumento(origen)}/${plural}/${id}/datos`,
    )
  ).data.data;
}
export async function subirOriginal(id, archivo) {
  const form = new FormData();
  form.append("xml", archivo);
  return (
    await api.post(`/compras/hacienda/compras/${id}/xml`, form, {
      headers: { "Content-Type": undefined },
    })
  ).data.data;
}
