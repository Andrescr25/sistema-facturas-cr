/**
 * Quién tiene el turno de WhatsApp: una sola copia del servidor a la vez.
 *
 * POR QUÉ
 * En cada despliegue Render levanta la copia nueva ANTES de apagar la vieja.
 * Si las dos se conectan con la misma sesión, WhatsApp cierra una
 * ("connectionReplaced"), esa se reconecta, cierra a la otra, y así en
 * bucle. Y peor: las dos escribiendo llaves de cifrado a la vez las
 * corrompen. Un candado de Postgres (pg_advisory_lock) no sirve acá: el
 * pooler de Supabase no garantiza la misma conexión entre consultas.
 *
 * CÓMO
 * Una fila con dueño y vencimiento. La copia que tiene el turno lo renueva
 * seguido; la otra espera a que venza o a que la dueña lo suelte al
 * apagarse (SIGTERM). Cada UPDATE es atómico por sí solo.
 */

const { query } = require('../../../config/database');

const SQL_TABLA = `
  CREATE TABLE IF NOT EXISTS whatsapp_turno (
      id SMALLINT PRIMARY KEY,
      dueno VARCHAR(200),
      vence_en TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

async function asegurarTabla() {
  await query(SQL_TABLA);
  await query(`INSERT INTO whatsapp_turno (id, dueno, vence_en) VALUES (1, NULL, now()) ON CONFLICT (id) DO NOTHING`);
}

/** Toma o renueva el turno. true si quedó en manos de `dueno`. */
async function tomar(dueno, segundos) {
  const { rows } = await query(`
    UPDATE whatsapp_turno
       SET dueno = $1, vence_en = now() + make_interval(secs => $2)
     WHERE id = 1 AND (dueno = $1 OR dueno IS NULL OR vence_en < now())
     RETURNING dueno
  `, [dueno, segundos]);
  return rows.length > 0;
}

/** Lo suelta al apagarse, para que la copia nueva no espere a que venza. */
async function soltar(dueno) {
  await query(`UPDATE whatsapp_turno SET dueno = NULL, vence_en = now() WHERE id = 1 AND dueno = $1`, [dueno]);
}

module.exports = { SQL_TABLA, asegurarTabla, tomar, soltar };
