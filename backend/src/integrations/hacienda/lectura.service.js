"use strict";
const { leerXml } = require("./seguridad/almacen");
const { parsear, texto } = require("./xml/util");
// La representación impresa usa la foto FIRMADA del emisor y el número fiscal,
// aunque Configuración cambie después. No devuelve rutas privadas ni secretos.
//
// Y EL CONTENIDO DEL COMPROBANTE (2026-10-24). El papel de una electrónica
// «deberá mostrar el contenido de los comprobantes electrónicos, de forma
// legible» (MH-DGT-RES-0027-2024, art. 5). Lo fiscal se lee del XML aceptado,
// no de la base: así el PDF dice lo mismo que lo que Hacienda aceptó.
const monto = (el, n) => {
  const v = texto(el, n);
  return v === "" ? null : Number(v);
};
const hijos = (el, n) => Array.from(el?.getElementsByTagNameNS("*", n) || []);
function contenidoDelXml(xml) {
  const doc = parsear(xml),
    e = hijos(doc, "Emisor")[0],
    ref = hijos(doc, "InformacionReferencia")[0];
  return {
    fecha: texto(doc, "FechaEmision"),
    proveedorSistemas: texto(doc, "ProveedorSistemas") || null,
    actividadReceptor: texto(doc, "CodigoActividadReceptor") || null,
    // ¿Va dirigido a alguien? Un tiquete no: el papel tampoco nombra al cliente.
    conReceptor: Boolean(hijos(doc, "Receptor")[0]),
    condicionVenta: texto(doc, "CondicionVenta") || null,
    plazoCredito: texto(doc, "PlazoCredito") || null,
    empresa: {
      nombre: texto(e, "Nombre"),
      tipo_identificacion: texto(e, "Tipo") === "02" ? "CJ" : "CF",
      identificacion: texto(e, "Numero"),
      correo: texto(e, "CorreoElectronico"),
      otras_senas: texto(e, "OtrasSenas"),
      provincia: texto(e, "Provincia"),
      canton: texto(e, "Canton"),
      distrito: texto(e, "Distrito"),
      actividad_economica: texto(doc, "CodigoActividadEmisor"),
    },
    lineas: hijos(doc, "LineaDetalle").map((l) => ({
      numeroLinea: Number(texto(l, "NumeroLinea")),
      unidad: texto(l, "UnidadMedida") || null,
      codigoDescuento: texto(l, "CodigoDescuento") || null,
      naturalezaDescuento: texto(l, "NaturalezaDescuento") || null,
      subTotal: monto(l, "SubTotal"),
      montoTotalLinea: monto(l, "MontoTotalLinea"),
    })),
    mediosPago: hijos(doc, "MedioPago").map((m) => ({
      tipo: texto(m, "TipoMedioPago"),
      monto: monto(m, "TotalMedioPago"),
    })),
    // Una nota de crédito declara sobre qué documento actúa: el papel lo dice
    // con lo que se firmó, no con lo que hoy diga la base.
    ...(ref
      ? { referencia: { tipo: texto(ref, "TipoDocIR"), clave: texto(ref, "Numero") } }
      : {}),
  };
}
/**
 * El XML lleva la ubicación del emisor en CÓDIGOS (2, 07, 02) y el papel decía
 * «2 07 02». Los nombres de Configuración se usan solo si sus códigos son los
 * firmados; si no coinciden, quedan los códigos. Igual con el nombre de la
 * actividad. El teléfono y los términos de pago (las cuentas) no van en el
 * XML: son los de Configuración, como en la factura de venta. Sin ellos la
 * electrónica salía sin decir por dónde pagar.
 */
async function conNombres(db, empresa) {
  const [{ rows: [h] }, { rows: [cfg] }] = await Promise.all([
    db.query("SELECT datos FROM hacienda_configuracion WHERE ambiente='produccion'"),
    db.query("SELECT * FROM empresa WHERE id=1"),
  ]);
  if (!cfg) return empresa;
  const d = h?.datos || {};
  const misma =
    d.provincia_codigo === empresa.provincia &&
    d.canton_codigo === empresa.canton &&
    d.distrito_codigo === empresa.distrito;
  return {
    ...empresa,
    ...(misma ? { provincia: cfg.provincia, canton: cfg.canton, distrito: cfg.distrito } : {}),
    ...(cfg.actividad_economica === empresa.actividad_economica
      ? { actividad_economica_nombre: cfg.actividad_economica_nombre }
      : {}),
    telefono: cfg.telefono,
    terminos_pago: cfg.terminos_pago,
  };
}
async function leer(db, r) {
  if (!r) return null;
  const contenido = contenidoDelXml(await leerXml(r.xml_ruta, r.xml_sha256));
  return {
    id: r.id,
    clave: r.clave,
    consecutivo: r.consecutivo,
    tipo: r.tipo,
    ...contenido,
    empresa: await conNombres(db, contenido.empresa),
  };
}
async function aceptada(db, id) {
  return leer(
    db,
    (
      await db.query(
        "SELECT * FROM hacienda_comprobante WHERE id=$1 AND ambiente='produccion' AND origen='factura' AND estado='aceptada'",
        [id],
      )
    ).rows[0],
  );
}
/**
 * El comprobante aceptado de una nota de crédito. Se busca por la nota: a
 * diferencia de la factura, la nota no guarda el id de su comprobante.
 */
async function notaAceptada(db, notaId) {
  return leer(
    db,
    (
      await db.query(
        "SELECT * FROM hacienda_comprobante WHERE ambiente='produccion' AND origen='nota_credito' AND origen_id=$1 AND estado='aceptada' ORDER BY revision_documento DESC LIMIT 1",
        [notaId],
      )
    ).rows[0],
  );
}
module.exports = { aceptada, notaAceptada, contenidoDelXml, conNombres };
