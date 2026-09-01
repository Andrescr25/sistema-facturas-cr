/**
 * Idempotencia al crear facturas: reenviar la misma no crea una segunda.
 *
 * EL PROBLEMA QUE RESUELVE
 * Crear una factura es un POST a Alegra. Si la respuesta no llega —timeout,
 * WiFi cortado, Render reiniciando— quien la mandó NO SABE si se creó. Antes
 * la única salida era reenviarla, y si Alegra sí la había creado quedaban dos
 * documentos fiscales. Anular uno exige nota de crédito, que le llega al
 * cliente.
 *
 * LA IDEA
 * Quien crea la factura le pone una CLAVE, una sola vez, cuando arma el
 * documento — no en cada intento. Esa clave viaja en todos los reenvíos. El
 * backend la registra ANTES de llamar a Alegra, así que un segundo intento se
 * encuentra con el rastro del primero y sabe qué hacer.
 *
 * LO CENTRAL: "INCIERTA" NO ES "FALLIDA"
 *
 *   fallida    Alegra respondió y rechazó (un 4xx). Consta que no creó nada,
 *              así que reintentar es seguro.
 *   incierta   No hubo respuesta. Alegra PUDO haberla creado. Reintentar a
 *              ciegas es justo lo que duplica.
 *
 * Confundir esos dos desenlaces es el origen del problema. Acá se separan y
 * la incierta exige reconciliar contra Alegra antes de volver a intentar.
 */

const crypto = require('crypto');
const { query } = require('../../../config/database');

/**
 * Huella del contenido de la factura.
 *
 * No identifica el intento (para eso está la clave) sino QUÉ se mandó. Si
 * llega la misma clave con otro contenido, es un error de programación —una
 * clave reusada— y no un reenvío legítimo. Mejor descubrirlo acá que
 * devolverle a alguien una factura que no es la que pidió.
 */
function huellaDe(facturaData) {
  const partes = [
    facturaData?.client,
    facturaData?.date,
    (facturaData?.items || [])
      .map(i => `${i.id}:${i.quantity}:${i.price}`)
      .sort()
      .join('|')
  ].join('~');
  return crypto.createHash('sha256').update(partes).digest('hex').slice(0, 64);
}

/** Error con `status`, para que el controlador responda con el código justo. */
function errorHttp(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

/**
 * Reserva la clave antes de llamar a Alegra.
 *
 * Devuelve:
 *   { seguir: true }                    -> nadie la usó; adelante
 *   { seguir: false, yaCreada: {...} }  -> ya existe la factura; se devuelve
 *
 * Y lanza cuando reenviar sería peligroso o incorrecto.
 */
async function reservar(clave, facturaData) {
  const huella = huellaDe(facturaData);

  // INSERT ... ON CONFLICT DO NOTHING es atómico: si dos intentos llegan a la
  // vez —el reintento automático y el manual, por ejemplo— solo uno gana la
  // reserva. Sin esto la comprobación y la escritura serían dos pasos y en el
  // medio cabe el segundo intento.
  const reserva = await query(`
    INSERT INTO factura_intento (clave, estado, huella)
    VALUES ($1, 'en_proceso', $2)
    ON CONFLICT (clave) DO NOTHING
    RETURNING clave;
  `, [clave, huella]);

  if (reserva.rows.length > 0) return { seguir: true, huella };

  // La clave ya existía: hay que mirar en qué quedó aquel intento.
  const previo = (await query(`SELECT * FROM factura_intento WHERE clave = $1;`, [clave])).rows[0];

  if (previo.huella && previo.huella !== huella) {
    throw errorHttp(409,
      'Esa clave de factura ya se usó para otro documento distinto. ' +
      'Cada factura necesita su propia clave; reusar una devolvería la factura equivocada.');
  }

  if (previo.estado === 'creada') {
    // El caso que da sentido a todo esto: alguien reenvía algo que YA se creó.
    return {
      seguir: false,
      yaCreada: {
        id: previo.alegra_invoice_id,
        numero: previo.numero_factura
      }
    };
  }

  if (previo.estado === 'en_proceso') {
    throw errorHttp(409,
      'Esa factura se está enviando en este momento. Espere a que termine ' +
      'en vez de mandarla de nuevo.');
  }

  if (previo.estado === 'incierta') {
    throw errorHttp(409,
      'El envío anterior de esa factura quedó sin confirmar: Alegra pudo haberla ' +
      'creado. Hay que verificar en Alegra antes de reenviarla, o se duplica.',
      { requiereReconciliacion: true, clave });
  }

  // 'fallida': Alegra la rechazó explícitamente, no creó nada. Se reintenta.
  await query(`
    UPDATE factura_intento
    SET estado = 'en_proceso', intentos = intentos + 1,
        huella = $2, detalle = NULL, actualizado_en = CURRENT_TIMESTAMP
    WHERE clave = $1;
  `, [clave, huella]);

  return { seguir: true, huella };
}

/** Alegra confirmó: se guarda con qué factura quedó asociada la clave. */
async function marcarCreada(clave, factura) {
  const numero = factura?.numberTemplate?.fullNumber
    || factura?.numberTemplate?.formattedNumber
    || String(factura?.id || '');

  await query(`
    UPDATE factura_intento
    SET estado = 'creada', alegra_invoice_id = $2, numero_factura = $3,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE clave = $1;
  `, [clave, String(factura?.id || ''), numero]);
}

/**
 * El intento terminó mal. `huboRespuesta` decide TODO:
 *
 *   true   Alegra contestó y rechazó -> 'fallida', se puede reintentar
 *   false  no contestó               -> 'incierta', pudo haberla creado
 */
async function marcarFallo(clave, { huboRespuesta, detalle }) {
  const estado = huboRespuesta ? 'fallida' : 'incierta';
  await query(`
    UPDATE factura_intento
    SET estado = $2, detalle = $3, actualizado_en = CURRENT_TIMESTAMP
    WHERE clave = $1;
  `, [clave, estado, String(detalle || '').slice(0, 500)]);
  return estado;
}

/** Los intentos que quedaron sin resolver, para revisarlos desde la casa. */
async function listarSinResolver() {
  const r = await query(`
    SELECT clave, estado, huella, detalle, intentos, creado_en, actualizado_en
    FROM factura_intento
    WHERE estado IN ('en_proceso', 'incierta')
    ORDER BY creado_en DESC
    LIMIT 200;
  `);
  return r.rows;
}

module.exports = { huellaDe, reservar, marcarCreada, marcarFallo, listarSinResolver };
