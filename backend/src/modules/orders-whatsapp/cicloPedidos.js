/**
 * El ciclo semanal de pedidos a proveedores: desde cuándo cuenta la marca
 * "Pedido enviado" del Reporte de Proveedores.
 *
 * Decisión del usuario (2026-09-29): la marca se va con el borrado semanal
 * —la limpieza del domingo a las 23:59 o el botón "Limpiar BD Faltantes" de
 * Configuración, que "resetea el ciclo de pedidos"—, para que cada semana
 * todos los proveedores arranquen en "Sin enviar".
 *
 * NO SE BORRA NADA DE `envio_whatsapp`: ese registro guarda también las
 * facturas, cotizaciones y saldos mandados, y dice qué salió y qué falló. Se
 * anota CUÁNDO se reinició el ciclo, y la marca solo cuenta lo enviado
 * después.
 *
 * Mientras no haya un reinicio anotado (recién desplegado), el ciclo empieza
 * el lunes a las 00:00 de esta semana en Costa Rica: el mismo corte que el
 * de la limpieza del domingo.
 *
 * `reiniciado_en` es TIMESTAMP sin zona, igual que `envio_whatsapp.creado_en`:
 * los dos se escriben con CURRENT_TIMESTAMP en una sesión en hora de Costa
 * Rica (config/database.js), así que se comparan directo.
 */

const { query } = require('../../../config/database');

const SQL_TABLA = `
  CREATE TABLE IF NOT EXISTS ciclo_pedidos (
      id SMALLINT PRIMARY KEY,
      reiniciado_en TIMESTAMP NOT NULL
  );
`;

/** Desde cuándo cuenta el ciclo actual (para usar dentro de un WHERE). */
const SQL_INICIO_CICLO = `COALESCE(
  (SELECT reiniciado_en FROM ciclo_pedidos WHERE id = 1),
  date_trunc('week', now() AT TIME ZONE 'America/Costa_Rica')
)`;

let tablaLista = null;
function asegurarTabla() {
  if (!tablaLista) tablaLista = query(SQL_TABLA).catch((e) => { tablaLista = null; throw e; });
  return tablaLista;
}

/** Empieza un ciclo nuevo: desde ahora, ningún proveedor tiene el pedido enviado. */
async function reiniciar() {
  await asegurarTabla();
  const { rows } = await query(`
    INSERT INTO ciclo_pedidos (id, reiniciado_en) VALUES (1, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET reiniciado_en = EXCLUDED.reiniciado_en
    RETURNING reiniciado_en::text AS reiniciado_en
  `);
  console.log(`🔄 Ciclo de pedidos reiniciado (${rows[0]?.reiniciado_en}): todos los proveedores vuelven a "Sin enviar".`);
  return rows[0]?.reiniciado_en || null;
}

module.exports = { SQL_TABLA, SQL_INICIO_CICLO, asegurarTabla, reiniciar };
