"use strict";
const { leerXml } = require("./seguridad/almacen");
const { parsear, texto } = require("./xml/util");
// La representación impresa usa la foto FIRMADA del emisor y el número fiscal,
// aunque Configuración cambie después. No devuelve rutas privadas ni secretos.
async function aceptada(db, id) {
  const r = (
    await db.query(
      "SELECT * FROM hacienda_comprobante WHERE id=$1 AND ambiente='produccion' AND origen='factura' AND estado='aceptada'",
      [id],
    )
  ).rows[0];
  if (!r) return null;
  const doc = parsear(await leerXml(r.xml_ruta, r.xml_sha256)),
    e = doc.getElementsByTagNameNS("*", "Emisor")[0];
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
  };
}
module.exports = { aceptada };
