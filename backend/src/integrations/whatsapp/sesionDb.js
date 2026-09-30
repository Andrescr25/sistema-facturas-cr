/**
 * La sesión de WhatsApp (Baileys) guardada en la base, no en archivos.
 *
 * POR QUÉ EN LA BASE
 * En Render el disco se borra en cada despliegue: una sesión en archivos
 * obligaría a volver a vincular el teléfono cada vez. Baileys lo dice en su
 * propio ejemplo (`useMultiFileAuthState`): sirve de guía, pero para
 * producción hay que guardar en una base de datos. Esto es ese ejemplo,
 * punto por punto, contra Postgres.
 *
 * QUÉ SE GUARDA
 * `creds` (la identidad del dispositivo vinculado) y las llaves de cifrado
 * de Signal, una fila por llave ("tipo-id"). Baileys actualiza llaves en
 * CADA mensaje; si no se guardan, los mensajes siguientes no le llegan al
 * destinatario (advertencia textual de su documentación).
 *
 * `baileys` se recibe de afuera: es un módulo ESM y se carga una sola vez con
 * import() en conexion.js. Así esto se prueba sin él.
 */

const { query } = require('../../../config/database');

const SQL_TABLA = `
  CREATE TABLE IF NOT EXISTS whatsapp_sesion (
      clave VARCHAR(512) PRIMARY KEY,
      valor TEXT NOT NULL,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

const FILAS_POR_LOTE = 200;

async function asegurarTabla() {
  await query(SQL_TABLA);
}

/**
 * El mismo contrato que `useMultiFileAuthState`: { state: { creds, keys },
 * saveCreds }.
 */
async function usarSesionDb({ BufferJSON, initAuthCreds, proto }) {
  const aTexto = (valor) => JSON.stringify(valor, BufferJSON.replacer);
  const deTexto = (texto) => JSON.parse(texto, BufferJSON.reviver);

  async function guardar(pares) {
    // Una llave repetida en el mismo INSERT hace fallar el ON CONFLICT.
    const unicos = [...new Map(pares).entries()];
    for (let i = 0; i < unicos.length; i += FILAS_POR_LOTE) {
      const lote = unicos.slice(i, i + FILAS_POR_LOTE);
      const marcas = lote.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}, CURRENT_TIMESTAMP)`).join(', ');
      await query(`
        INSERT INTO whatsapp_sesion (clave, valor, actualizado_en) VALUES ${marcas}
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = CURRENT_TIMESTAMP
      `, lote.flat());
    }
  }

  const { rows } = await query(`SELECT valor FROM whatsapp_sesion WHERE clave = 'creds'`);
  const creds = rows[0] ? deTexto(rows[0].valor) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const datos = {};
          if (!ids || ids.length === 0) return datos;
          const r = await query(
            `SELECT clave, valor FROM whatsapp_sesion WHERE clave = ANY($1::varchar[])`,
            [ids.map((id) => `${tipo}-${id}`)]
          );
          const porClave = new Map(r.rows.map((f) => [f.clave, f.valor]));
          for (const id of ids) {
            const texto = porClave.get(`${tipo}-${id}`);
            let valor = texto ? deTexto(texto) : null;
            if (tipo === 'app-state-sync-key' && valor) valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
            datos[id] = valor;
          }
          return datos;
        },
        set: async (datos) => {
          const guardarPares = [];
          const borrar = [];
          for (const tipo in datos) {
            for (const id in datos[tipo]) {
              const valor = datos[tipo][id];
              const clave = `${tipo}-${id}`;
              if (valor) guardarPares.push([clave, aTexto(valor)]);
              else borrar.push(clave);
            }
          }
          if (guardarPares.length) await guardar(guardarPares);
          if (borrar.length) await query(`DELETE FROM whatsapp_sesion WHERE clave = ANY($1::varchar[])`, [borrar]);
        }
      }
    },
    saveCreds: async () => guardar([['creds', aTexto(creds)]])
  };
}

/**
 * ¿Esta sesión terminó de vincularse?
 *
 * NO ES `creds.registered` (2026-09-29, pasó en producción): Baileys solo la
 * pone en true al vincular con el CÓDIGO de 8 caracteres; con el QR queda en
 * false para siempre. El sistema, vinculado con QR, funcionaba hasta el
 * primer corte (un reinicio de Render, un corte de red): al releer la
 * sesión creía que no había teléfono y no se reconectaba, mientras el
 * teléfono lo seguía mostrando conectado.
 *
 * Lo que sí prueba que la vinculación terminó, por cualquiera de los dos
 * caminos, es `account`: la identidad del dispositivo firmada por WhatsApp,
 * que Baileys guarda al recibir "pair-success". `me` solo no alcanza: con el
 * código se llena ANTES de que la persona lo escriba.
 */
function sesionCompleta(creds) {
  return Boolean(creds?.me?.id && creds?.account);
}

/** ¿Hay un teléfono vinculado? (sin cargar Baileys) */
async function hayVinculo() {
  const { rows } = await query(`SELECT valor FROM whatsapp_sesion WHERE clave = 'creds'`);
  if (!rows[0]) return false;
  try { return sesionCompleta(JSON.parse(rows[0].valor)); } catch { return false; }
}

/** Borra la sesión entera: el teléfono queda desvinculado de este sistema. */
async function borrarSesion() {
  await query(`DELETE FROM whatsapp_sesion`);
}

module.exports = { SQL_TABLA, asegurarTabla, usarSesionDb, hayVinculo, borrarSesion, sesionCompleta };
