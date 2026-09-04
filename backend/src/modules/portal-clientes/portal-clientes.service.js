/**
 * Portal de clientes - Service
 *
 * Dos públicos en un mismo archivo, separados por sección:
 *   · lo que usa el PERSONAL (invitar, listar cuentas, facturar pedidos)
 *   · lo que usa el CLIENTE  (activar, entrar, pedir, ver su historial)
 *
 * Las rutas de cada sección van detrás de middlewares distintos y con
 * secretos de firma distintos — ver portal-clientes.auth.js.
 */

const {
  bcrypt, crypto, query, httpError,
  RONDAS_BCRYPT, DIAS_INVITACION,
  hashToken, firmarToken
} = require('./portal-clientes.auth');

const { getClient } = require('../../integrations/alegra');
const { telefonosDe } = require('../../utils/telefonosCliente');
const whatsapp = require('../../integrations/whatsapp');

// ==================== LADO DEL PERSONAL ====================

/**
 * Clientes de Alegra con el estado de su cuenta en el portal.
 *
 * Los contactos salen de Alegra en vivo (no hay caché local de clientes) y
 * se cruzan con cliente_portal. Es una sola pasada paginada, no una consulta
 * por cliente.
 */
async function listarClientes({ busqueda = '' } = {}) {
  const client = getClient();
  const contactos = [];
  let start = 0;
  while (start < 900) {
    const { data } = await client.api.get('/contacts', { params: { limit: 30, start, type: 'client' } });
    if (!Array.isArray(data) || data.length === 0) break;
    contactos.push(...data);
    if (data.length < 30) break;
    start += 30;
  }

  const cuentas = await query(`
    SELECT cp.*,
           (SELECT COUNT(*)::int FROM pedido_cliente p WHERE p.cliente_portal_id = cp.id) AS pedidos,
           (SELECT MAX(creado_en) FROM pedido_cliente p WHERE p.cliente_portal_id = cp.id) AS ultimo_pedido,
           (SELECT MAX(expira_en) FROM cliente_invitacion i
             WHERE i.alegra_contact_id = cp.alegra_contact_id AND i.usado_en IS NULL) AS invitacion_vence
    FROM cliente_portal cp;
  `);
  const porContacto = new Map(cuentas.rows.map(r => [String(r.alegra_contact_id), r]));

  const termino = String(busqueda).trim().toLowerCase();

  return contactos
    .filter(c => !termino
      || String(c.name || '').toLowerCase().includes(termino)
      || String(c.identification || '').toLowerCase().includes(termino))
    .map(c => {
      const cuenta = porContacto.get(String(c.id));
      const invitacionVigente = cuenta?.invitacion_vence && new Date(cuenta.invitacion_vence) > new Date();

      return {
        alegraContactId: String(c.id),
        nombre: c.name,
        identificacion: c.identification || null,
        email: c.email || null,
        // 'sin_cuenta' -> nunca se invitó
        // 'invitado'   -> hay invitación vigente sin usar
        // 'vencido'    -> se invitó pero el enlace venció y no activó
        // 'activo'     -> puso su contraseña
        // 'inactivo'   -> se le revocó el acceso
        estado: !cuenta ? 'sin_cuenta'
          : !cuenta.activo ? 'inactivo'
            : cuenta.password_hash ? 'activo'
              : invitacionVigente ? 'invitado' : 'vencido',
        usuario: cuenta?.usuario || null,
        ultimoIngreso: cuenta?.ultimo_ingreso || null,
        pedidos: cuenta?.pedidos || 0,
        ultimoPedido: cuenta?.ultimo_pedido || null
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Genera el enlace de invitación.
 *
 * Devuelve el token en claro UNA sola vez — en la base queda solo su hash,
 * igual que con una contraseña. Quien lo pierda necesita generar otro; no
 * hay forma de recuperarlo, y eso es a propósito.
 */
async function generarInvitacion(alegraContactId, usuarioId) {
  const client = getClient();
  let contacto;
  try {
    const { data } = await client.api.get(`/contacts/${alegraContactId}`);
    contacto = data;
  } catch (error) {
    throw httpError(404, 'Ese cliente no existe en Alegra.');
  }

  await query(`
    INSERT INTO cliente_portal (alegra_contact_id, nombre, identificacion, email)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (alegra_contact_id) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      identificacion = EXCLUDED.identificacion,
      email = EXCLUDED.email,
      activo = TRUE;
  `, [String(alegraContactId), contacto.name, contacto.identification || null, contacto.email || null]);

  // Invitaciones anteriores sin usar quedan muertas: si alguien reenvía el
  // enlace, el viejo no debe seguir sirviendo.
  await query(
    `UPDATE cliente_invitacion SET expira_en = CURRENT_TIMESTAMP
     WHERE alegra_contact_id = $1 AND usado_en IS NULL AND expira_en > CURRENT_TIMESTAMP;`,
    [String(alegraContactId)]
  );

  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date();
  expira.setDate(expira.getDate() + DIAS_INVITACION);

  await query(`
    INSERT INTO cliente_invitacion (alegra_contact_id, token_hash, expira_en, creado_por)
    VALUES ($1, $2, $3, $4);
  `, [String(alegraContactId), hashToken(token), expira, usuarioId || null]);

  // Los teléfonos van con la invitación para poder ofrecer mandarla por
  // WhatsApp sin una segunda vuelta a Alegra. Se devuelven TODOS los que la
  // ficha contenga —muchas traen dos, o el nombre de quien contesta pegado—
  // porque elegir por nuestra cuenta sería adivinar a quién le llega un
  // enlace que da acceso a la cuenta del cliente.
  const { candidatos, sinReconocer } = telefonosDe(contacto);

  return {
    token,
    expira,
    nombre: contacto.name,
    diasVigencia: DIAS_INVITACION,
    telefonos: candidatos,
    telefonosSinReconocer: sinReconocer
  };
}

async function revocarAcceso(alegraContactId) {
  const r = await query(
    `UPDATE cliente_portal SET activo = FALSE WHERE alegra_contact_id = $1 RETURNING nombre;`,
    [String(alegraContactId)]
  );
  if (r.rows.length === 0) throw httpError(404, 'Ese cliente no tiene cuenta en el portal.');

  await query(
    `UPDATE cliente_invitacion SET expira_en = CURRENT_TIMESTAMP
     WHERE alegra_contact_id = $1 AND usado_en IS NULL;`,
    [String(alegraContactId)]
  );
  return { revocado: true, nombre: r.rows[0].nombre };
}

async function reactivarAcceso(alegraContactId) {
  const r = await query(
    `UPDATE cliente_portal SET activo = TRUE WHERE alegra_contact_id = $1 RETURNING nombre;`,
    [String(alegraContactId)]
  );
  if (r.rows.length === 0) throw httpError(404, 'Ese cliente no tiene cuenta en el portal.');
  return { reactivado: true, nombre: r.rows[0].nombre };
}

/**
 * Manda el enlace de invitación por WhatsApp.
 *
 * EL MENSAJE VIENE DE LA PANTALLA, NO DE ACÁ, y no es por comodidad: el
 * token se muestra una sola vez y en la base queda solo su hash, así que el
 * servidor ya no sabe cuál es el enlace. El único que lo tiene es el
 * navegador que acaba de generarlo.
 *
 * El número se valida igual aunque venga de la lista que mandamos nosotros.
 * Lo que llega en una petición es lo que alguien escribió, no lo que le
 * ofrecimos, y este mensaje le da a quien lo reciba la puerta de la cuenta
 * del cliente.
 */
async function enviarInvitacionWhatsApp(alegraContactId, { telefono, mensaje }) {
  const r = await whatsapp.enviarTexto({ telefono, mensaje });

  // Queda en el registro del servidor a qué número se mandó el enlace de qué
  // cliente. Si alguna vez uno aparece donde no debía, esto es lo único que
  // dice cuándo salió y hacia dónde: el token ya no existe en claro.
  console.log(`📨 Invitación del cliente ${alegraContactId} enviada por WhatsApp al ${r.telefono}`);

  return r;
}

module.exports = {
  enviarInvitacionWhatsApp,
  listarClientes,
  generarInvitacion,
  revocarAcceso,
  reactivarAcceso
};
