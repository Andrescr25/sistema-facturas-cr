"use strict";
const { leerXml } = require("./seguridad/almacen");
const { parsear, texto } = require("./xml/util");
// La representación impresa usa la foto FIRMADA del emisor y el número fiscal,
// aunque Configuración cambie después. No devuelve rutas privadas ni secretos.
async function leer(r) {
  if (!r) return null;
  const doc = parsear(await leerXml(r.xml_ruta, r.xml_sha256)),
    e = doc.getElementsByTagNameNS("*", "Emisor")[0],
    ref = doc.getElementsByTagNameNS("*", "InformacionReferencia")[0];
  return {
    id: r.id,
    clave: r.clave,
    consecutivo: r.consecutivo,
    tipo: r.tipo,
    fecha: texto(doc, "FechaEmision"),
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
    // Una nota de crédito declara sobre qué documento actúa: el papel lo dice
    // con lo que se firmó, no con lo que hoy diga la base.
    ...(ref
      ? { referencia: { tipo: texto(ref, "TipoDocIR"), clave: texto(ref, "Numero") } }
      : {}),
  };
}
async function aceptada(db, id) {
  return leer(
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
    (
      await db.query(
        "SELECT * FROM hacienda_comprobante WHERE ambiente='produccion' AND origen='nota_credito' AND origen_id=$1 AND estado='aceptada' ORDER BY revision_documento DESC LIMIT 1",
        [notaId],
      )
    ).rows[0],
  );
}
module.exports = { aceptada, notaAceptada };
