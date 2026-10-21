"use strict";
const { opcionesFiscales } = require("../../modules/gastos-operativos/gastos.validacion");
const { error } = require("./errores");

async function gastoDeCompra(db, compraId) {
  return (await db.query("SELECT * FROM gasto_operativo WHERE compra_id=$1", [compraId])).rows[0] || null;
}

function opcionesDelGasto(gasto) {
  try {
    return opcionesFiscales(gasto);
  } catch (e) {
    throw error("GASTO_SIN_REVISION_FISCAL", e.message, 409);
  }
}

/** También en preparar(), bajo el bloqueo de compra: una API genérica no
 * puede reemplazar la revisión guardada por la condición global de compras.
 */
async function aplicarRevisionGasto(db, compraId, datos) {
  const gasto = await gastoDeCompra(db, compraId);
  return gasto ? { ...datos, ...opcionesDelGasto(gasto) } : datos;
}

module.exports = { gastoDeCompra, opcionesDelGasto, aplicarRevisionGasto };
