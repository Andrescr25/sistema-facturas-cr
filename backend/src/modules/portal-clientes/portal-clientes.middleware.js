/**
 * Portal de clientes - Middleware
 *
 * Protege SOLO las rutas del portal. No hace falta lo inverso (impedir que
 * un token de cliente abra el sistema) porque eso ya es imposible por
 * construcción: requireAuth verifica contra JWT_SECRET y los tokens de
 * cliente se firman con JWT_SECRET_CLIENTES, así que a un token de cliente
 * le falla la FIRMA en las rutas del personal — no una comprobación que
 * alguien pudiera olvidar escribir. Ver portal-clientes.auth.js.
 */

const { verificarTokenCliente, query } = require('./portal-clientes.auth');

// Rutas del portal que se pueden usar sin haber entrado todavía.
const SIN_SESION = ['/invitacion', '/activar', '/entrar'];

function esSinSesion(ruta) {
  return SIN_SESION.some(p => ruta === p || ruta.startsWith(`${p}/`));
}

async function requireCliente(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  if (esSinSesion(req.path)) return next();

  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'No autenticado', code: 'SIN_TOKEN' });
  }

  const datos = verificarTokenCliente(token);
  if (!datos || !Number.isInteger(Number(datos.sub)) || Number(datos.sub) <= 0) {
    return res.status(401).json({ success: false, error: 'Sesión vencida', code: 'TOKEN_INVALIDO' });
  }

  // La firma válida NO alcanza: el token dura 30 días y en ese tiempo la
  // cuenta puede haberse revocado o borrado. Sin esta comprobación, quitarle
  // el acceso a un cliente no lo echaba —seguía viendo su historial y
  // armando carritos— y un token de una cuenta borrada reventaba contra la
  // llave foránea del carrito con un error 500 ilegible.
  //
  // Es una consulta por petición, contra la clave primaria. Barato al lado
  // de dejar entrar a alguien a quien ya se le cerró la puerta.
  let cuenta;
  try {
    // Se relee la ficha por la cuenta del token. También sirve para tokens
    // viejos: su `contacto` se ignora, nunca se interpreta como cliente.id.
    const r = await query(`
      SELECT cp.id, cp.activo, cp.cliente_id, cp.usuario,
             c.nombre, c.activo AS cliente_activo
        FROM cliente_portal cp LEFT JOIN cliente c ON c.id = cp.cliente_id
       WHERE cp.id = $1;`, [Number(datos.sub)]);
    cuenta = r.rows[0];
  } catch (error) {
    console.error('Error verificando la cuenta del cliente:', error.message);
    return res.status(500).json({ success: false, error: 'No se pudo verificar la sesión.' });
  }

  if (!cuenta) {
    return res.status(401).json({ success: false, error: 'Sesión vencida', code: 'CUENTA_INEXISTENTE' });
  }
  if (!cuenta.activo || !cuenta.cliente_id || !cuenta.cliente_activo) {
    return res.status(403).json({
      success: false,
      message: 'Su cuenta está desactivada. Comuníquese con nosotros.',
      code: 'CUENTA_INACTIVA'
    });
  }

  req.cliente = { id: cuenta.id, clienteId: cuenta.cliente_id, nombre: cuenta.nombre, usuario: cuenta.usuario };
  next();
}

module.exports = { requireCliente };
