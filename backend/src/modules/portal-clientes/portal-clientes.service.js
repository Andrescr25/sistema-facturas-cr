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

const { telefonosDe } = require('../../utils/telefonosCliente');
const whatsapp = require('../../integrations/whatsapp');

// ==================== LADO DEL PERSONAL ====================

/**
 * Los clientes con el estado de su cuenta en el portal.
 *
 * SALÍA DE ALEGRA EN VIVO: se recorrían hasta 900 contactos paginados de a
 * 30 cada vez que alguien abría la pestaña, solo para dibujar una lista. Como
 * las 247 fichas están en `cliente`, ahora es una sola consulta, y la
 * pantalla deja de depender de que Alegra conteste.
 *
 * Se cruzan por NUESTRO id, no por el contacto de Alegra. Mientras esa
 * columna fuera la llave, no se podía invitar a un cliente que no existiera
 * también allá.
 */
async function listarClientes({ busqueda = '' } = {}) {
  const termino = String(busqueda).trim().toLowerCase();
  const params = [];
  let filtro = '';
  if (termino) {
    params.push(`%${termino}%`);
    filtro = `AND (lower(c.nombre) LIKE $1 OR lower(COALESCE(c.identificacion, '')) LIKE $1)`;
  }

  const { rows } = await query(`
    SELECT c.id, c.nombre, c.identificacion, c.correo,
           cp.id AS cuenta_id, cp.activo AS cuenta_activa, cp.usuario, cp.ultimo_ingreso,
           (SELECT COUNT(*)::int FROM pedido_cliente p WHERE p.cliente_portal_id = cp.id) AS pedidos,
           (SELECT MAX(creado_en) FROM pedido_cliente p WHERE p.cliente_portal_id = cp.id) AS ultimo_pedido,
           (SELECT MAX(expira_en) FROM cliente_invitacion i
             WHERE i.cliente_id = c.id AND i.usado_en IS NULL) AS invitacion_vence
      FROM cliente c
      LEFT JOIN cliente_portal cp ON cp.cliente_id = c.id
     WHERE c.activo = TRUE ${filtro}
     ORDER BY c.nombre;
  `, params);

  return rows.map((r) => {
    const invitacionVigente = r.invitacion_vence && new Date(r.invitacion_vence) > new Date();

    return {
      clienteId: r.id,
      nombre: r.nombre,
      identificacion: r.identificacion || null,
      email: r.correo || null,
      // 'sin_cuenta' -> nunca se invitó
      // 'invitado'   -> hay invitación vigente sin usar
      // 'vencido'    -> se invitó pero el enlace venció y no activó
      // 'activo'     -> ya entró, o al menos puso su contraseña
      estado: !r.cuenta_id
        ? (invitacionVigente ? 'invitado' : 'sin_cuenta')
        : (!r.cuenta_activa ? 'revocado'
          : (r.usuario ? 'activo' : (invitacionVigente ? 'invitado' : 'vencido'))),
      usuario: r.usuario || null,
      ultimoIngreso: r.ultimo_ingreso,
      pedidos: r.pedidos || 0,
      ultimoPedido: r.ultimo_pedido,
      invitacionVence: r.invitacion_vence
    };
  });
}

/**
 * Genera el enlace de invitación.
 *
 * Devuelve el token en claro UNA sola vez — en la base queda solo su hash,
 * igual que con una contraseña. Quien lo pierda necesita generar otro; no
 * hay forma de recuperarlo, y eso es a propósito.
 */
async function generarInvitacion(clienteId, usuarioId) {
  const id = Number(clienteId);
  // La ficha sale de NUESTRA base. Antes se le pedía a Alegra en vivo, así
  // que no se podía invitar a un cliente que no existiera también allá —y
  // si Alegra no contestaba, no se podía invitar a nadie—.
  const { rows } = await query(
    `SELECT id, nombre, identificacion, correo, telefono, telefono_secundario, celular
       FROM cliente WHERE id = $1 AND activo = TRUE`, [id]);
  const contacto = rows[0];
  if (!contacto) throw httpError(404, 'No existe ese cliente.');

  await query(`
    INSERT INTO cliente_portal (cliente_id, nombre, identificacion, email)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (cliente_id) WHERE cliente_id IS NOT NULL DO UPDATE SET
      nombre = EXCLUDED.nombre,
      identificacion = EXCLUDED.identificacion,
      email = EXCLUDED.email,
      activo = TRUE;
  `, [id, contacto.nombre, contacto.identificacion || null, contacto.correo || null]);

  // Invitaciones anteriores sin usar quedan muertas: si alguien reenvía el
  // enlace, el viejo no debe seguir sirviendo.
  await query(
    `UPDATE cliente_invitacion SET expira_en = CURRENT_TIMESTAMP
     WHERE cliente_id = $1 AND usado_en IS NULL AND expira_en > CURRENT_TIMESTAMP;`,
    [id]
  );

  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date();
  expira.setDate(expira.getDate() + DIAS_INVITACION);

  await query(`
    INSERT INTO cliente_invitacion (cliente_id, token_hash, expira_en, creado_por)
    VALUES ($1, $2, $3, $4);
  `, [id, hashToken(token), expira, usuarioId || null]);

  // Los teléfonos van con la invitación para poder ofrecer mandarla por
  // WhatsApp sin una segunda vuelta a Alegra. Se devuelven TODOS los que la
  // ficha contenga —muchas traen dos, o el nombre de quien contesta pegado—
  // porque elegir por nuestra cuenta sería adivinar a quién le llega un
  // enlace que da acceso a la cuenta del cliente.
  // `telefonosDe` sabe leer fichas sucias —"88272453 GABRIEL", dos números en
  // un campo— y esa lógica no se copia: se le pasan nuestras columnas con los
  // nombres que espera.
  const { candidatos, sinReconocer } = telefonosDe({
    mobile: contacto.celular,
    phonePrimary: contacto.telefono,
    phoneSecondary: contacto.telefono_secundario
  });

  return {
    token,
    expira,
    nombre: contacto.nombre,
    clienteId: id,
    diasVigencia: DIAS_INVITACION,
    telefonos: candidatos,
    telefonosSinReconocer: sinReconocer
  };
}

async function revocarAcceso(clienteId) {
  const id = Number(clienteId);
  const r = await query(
    `UPDATE cliente_portal SET activo = FALSE WHERE cliente_id = $1 RETURNING nombre;`,
    [id]
  );
  if (r.rows.length === 0) throw httpError(404, 'Ese cliente no tiene cuenta en el portal.');

  // Y las invitaciones sin usar se matan: revocar el acceso y dejar vivo un
  // enlace que lo devuelve no revoca nada.
  await query(
    `UPDATE cliente_invitacion SET expira_en = CURRENT_TIMESTAMP
     WHERE cliente_id = $1 AND usado_en IS NULL;`,
    [id]
  );
  return { revocado: true, nombre: r.rows[0].nombre };
}

async function reactivarAcceso(clienteId) {
  const r = await query(
    `UPDATE cliente_portal SET activo = TRUE WHERE cliente_id = $1 RETURNING nombre;`,
    [Number(clienteId)]
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
async function enviarInvitacionWhatsApp(clienteId, { telefono, mensaje }) {
  const r = await whatsapp.enviarTexto({ telefono, mensaje });

  // Queda en el registro del servidor a qué número se mandó el enlace de qué
  // cliente. Si alguna vez uno aparece donde no debía, esto es lo único que
  // dice cuándo salió y hacia dónde: el token ya no existe en claro.
  console.log(`📨 Invitación del cliente ${clienteId} enviada por WhatsApp al ${r.telefono}`);

  return r;
}

module.exports = {
  enviarInvitacionWhatsApp,
  listarClientes,
  generarInvitacion,
  revocarAcceso,
  reactivarAcceso
};
