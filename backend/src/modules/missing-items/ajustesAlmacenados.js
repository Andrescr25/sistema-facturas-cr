const { AHORA_CR_SQL } = require('../../utils/fechaCR');

async function guardarAjusteEn(db, faltanteId, entrega) {
  await db.query(`INSERT INTO faltantes_ajustes(faltante_id,cantidad_entregada,estado,requiere_actualizacion,revisado)
    VALUES($1,$2,$3,$4,COALESCE($5,FALSE)) ON CONFLICT(faltante_id) DO UPDATE SET
      cantidad_entregada=$2,estado=$3,requiere_actualizacion=$4,
      revisado=COALESCE($5,CASE WHEN faltantes_ajustes.cantidad_entregada<>$2 OR faltantes_ajustes.estado<>$3
        THEN FALSE ELSE faltantes_ajustes.revisado END),updated_at=${AHORA_CR_SQL}`,
  [faltanteId, entrega.cantidad, entrega.estado, entrega.requiereActualizacion, entrega.revisado ?? null]);
}

module.exports = { guardarAjusteEn };
