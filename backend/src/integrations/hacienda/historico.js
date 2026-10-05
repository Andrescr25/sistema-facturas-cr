"use strict";
// Estado fiscal del documento de origen, no de su plantilla de numeración.
// Este módulo es puro: los cargadores no arrancan la conexión fiscal.
function numeracionDesdeAlegra(documento, tipo) {
  const t = documento.numberTemplate || {},
    k = documento.stamp?.uuid;
  const original = String(t.prefix || "").trim() || null;
  // Alegra usa el mismo prefijo de ocho dígitos para venta y factura fiscal.
  // Su clave contiene el tipo y el consecutivo reales; el número impreso se
  // conserva aunque Alegra lo muestre abreviado a dieciocho posiciones.
  if (/^\d{50}$/.test(k || "") && k.slice(29, 31) === tipo)
    return { serie: k.slice(21, 31), consecutivo: Number(k.slice(31, 41)) };
  return {
    serie:
      t.isElectronic && /^\d{8}$/.test(original || "")
        ? original + tipo
        : original,
    consecutivo:
      t.number == null
        ? null
        : Number(String(t.number).replace(/\D/g, "")) || null,
  };
}
function desdeAlegra(documento) {
  const stamp = documento.stamp || {},
    estado = typeof stamp.legalStatus === "string" ? stamp.legalStatus : null;
  const estados = {
    STAMPED_AND_ACCEPTED: "aceptada",
    STAMPED_AND_REJECTED: "rechazada",
  };
  const clave = typeof stamp.uuid === "string" ? stamp.uuid : null;
  const confirmado = estados[estado] || null;
  return {
    hacienda_estado: confirmado,
    electronica: confirmado === "aceptada" && /^\d{50}$/.test(clave || ""),
    plantilla_electronica: Boolean(documento.numberTemplate?.isElectronic),
    hacienda_origen: {
      fuente: "alegra",
      estado,
      clave,
      fecha: typeof stamp.date === "string" ? stamp.date : null,
      plantilla: {
        id: documento.numberTemplate?.id || null,
        prefijo: documento.numberTemplate?.prefix || null,
        numero: documento.numberTemplate?.number || null,
      },
    },
  };
}
async function normalizarSeriesHistoricas(db, tabla) {
  if (!["factura", "nota_credito"].includes(tabla))
    throw Error("Tabla histórica inválida");
  // Hace repetible la recarga de una base que ya copió prefijos abreviados.
  // No cambia número impreso, importes, estado fiscal ni documentos nativos.
  await db.query(
    `UPDATE ${tabla} SET serie=substring(clave_hacienda from 22 for 10),consecutivo=substring(clave_hacienda from 32 for 10)::bigint WHERE alegra_id IS NOT NULL AND clave_hacienda ~ '^506[0-9]{47}$' AND substring(clave_hacienda from 30 for 2) IN ('01','03','04') AND (serie IS DISTINCT FROM substring(clave_hacienda from 22 for 10) OR consecutivo IS DISTINCT FROM substring(clave_hacienda from 32 for 10)::bigint)`,
  );
}
module.exports = {
  desdeAlegra,
  numeracionDesdeAlegra,
  normalizarSeriesHistoricas,
};
