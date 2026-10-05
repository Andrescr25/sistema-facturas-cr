/**
 * Idempotencia al crear facturas: reenviar la misma no crea una segunda.
 *
 * EL PROBLEMA QUE RESUELVE
 * Crear una factura es un POST. Si la respuesta no llega —timeout, WiFi
 * cortado, el servidor reiniciando— quien la mandó NO SABE si se creó. La
 * única salida es reenviarla, y si sí se había creado quedan dos documentos.
 *
 * LA IDEA
 * Quien crea la factura le pone una CLAVE, una sola vez, cuando arma el
 * documento — no en cada intento. Esa clave viaja en todos los reenvíos. El
 * backend la registra ANTES de crear nada, así que un segundo intento se
 * encuentra con el rastro del primero y sabe qué hacer.
 *
 * LO CENTRAL: "INCIERTA" NO ES "FALLIDA"
 *
 *   fallida    Consta que no se creó nada: reintentar es seguro. Es lo que
 *              pasa cuando falla el guardado propio, que va en una
 *              transacción nuestra.
 *   incierta   No hubo respuesta de quien la creaba (Alegra, antes del
 *              corte). PUDO haberla creado. Reintentar a ciegas es justo lo
 *              que duplica.
 *
 * LA TABLA VIENE DE PRODUCCIÓN, con intentos de cuando las facturas —y las
 * cotizaciones— se creaban en Alegra. Esos traen el id de ALLÁ en
 * `alegra_invoice_id`. La factura propia va en `factura_id` (migración 041).
 * Nunca se devuelve un id de Alegra como si fuera nuestro: ver `facturaDe`.
 */

const crypto = require('crypto');
const { query } = require('../../../config/database');

const sha = (texto) => crypto.createHash('sha256').update(texto).digest('hex').slice(0, 64);
const tiene = (v) => v !== undefined && v !== null && v !== '';

/**
 * La huella como se calculó SIEMPRE hasta el 2026-10-04: cliente en `client`,
 * producto en `id`.
 *
 * No se toca ni una coma: es la que tienen guardada los intentos que vienen
 * de producción, y la que va a volver a calcularse cuando una tablet reenvíe,
 * después del corte, una factura que armó antes (esas siguen llegando con
 * `client` e `id`, los de Alegra).
 */
function huellaAnteriorDe(facturaData) {
  return sha([
    facturaData?.client,
    facturaData?.date,
    (facturaData?.items || [])
      .map(i => `${i.id}:${i.quantity}:${i.price}`)
      .sort()
      .join('|')
  ].join('~'));
}

/**
 * Huella del contenido de la factura.
 *
 * No identifica el intento (para eso está la clave) sino QUÉ se mandó. Si
 * llega la misma clave con otro contenido, es un error de programación —una
 * clave reusada— y no un reenvío legítimo. Mejor descubrirlo acá que
 * devolverle a alguien una factura que no es la que pidió.
 *
 * EL CLIENTE ENTRA EN LA HUELLA. La pantalla ya manda nuestros ids
 * (`clienteId`, `productoId`), y la fórmula anterior leía `client`, que en
 * ese contrato viene vacío: la misma clave con los mismos productos para OTRO
 * cliente pasaba por reenvío y devolvía la factura del primero. Con el
 * contrato propio se usa una fórmula propia, marcada, para que un id nuestro
 * y uno de Alegra con el mismo número no den nunca la misma huella.
 */
function huellaDe(facturaData) {
  // La fórmula anterior queda intacta cuando no se eligió ciclo: una cola
  // vieja conserva su huella. Una venta de otra semana sí es otro contenido.
  if (tiene(facturaData?.cicloId)) {
    return sha(['ciclo-ruta-1', huellaDe({ ...facturaData, cicloId: undefined }), Number(facturaData.cicloId)].join('~'));
  }
  if (!tiene(facturaData?.clienteId)) return huellaAnteriorDe(facturaData);

  return sha([
    'propio',
    Number(facturaData.clienteId),
    facturaData?.date,
    (facturaData?.items || [])
      .map(i => `${Number(tiene(i.productoId) ? i.productoId : i.id)}:${i.quantity}:${i.price}`)
      .sort()
      .join('|')
  ].join('~'));
}

/**
 * ¿Es el mismo documento que dejó registrado el intento anterior?
 *
 * Se acepta también la huella anterior: un intento registrado ANTES de este
 * cambio guardó esa, y su reenvío legítimo no puede quedar rechazado como
 * "otro documento". Un intento registrado después guarda la nueva, y contra
 * esa la anterior no calza.
 */
function esElMismoDocumento(huellaGuardada, facturaData) {
  return huellaGuardada === huellaDe(facturaData) ||
    (!tiene(facturaData?.cicloId) && huellaGuardada === huellaAnteriorDe(facturaData));
}

/**
 * La factura PROPIA que creó un intento, o null si todavía no está acá.
 *
 * `factura_id` es nuestro id y se devuelve tal cual. Un intento de antes del
 * corte solo trae el id de Alegra: se busca la factura que tiene ESE id de
 * Alegra Y ESE número. Las dos condiciones, y aun así no alcanzan solas: en
 * producción esta tabla también guarda cotizaciones, y la cotización 7 de
 * Alegra calza en id y en número con la factura 7 de junio de 2024. Por eso
 * quien llama solo pasa intentos de FACTURA (los que tienen huella).
 */
async function facturaDe(intento) {
  if (tiene(intento.factura_id)) {
    return { id: Number(intento.factura_id), numero: intento.numero_factura };
  }
  if (!tiene(intento.alegra_invoice_id) || !tiene(intento.numero_factura)) return null;

  const { rows } = await query(
    'SELECT id, numero FROM factura WHERE alegra_id = $1 AND numero = $2',
    [String(intento.alegra_invoice_id), String(intento.numero_factura)]
  );
  return rows[0] ? { id: Number(rows[0].id), numero: rows[0].numero } : null;
}

/** Error con `status`, para que el controlador responda con el código justo. */
function errorHttp(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

/**
 * Reserva la clave antes de crear la factura.
 *
 * Devuelve:
 *   { seguir: true }                    -> nadie la usó; adelante
 *   { seguir: false, yaCreada: {...} }  -> ya existe la factura; se devuelve
 *
 * `yaCreada.id` es SIEMPRE nuestro id de factura, o null si la factura se
 * creó en Alegra y todavía no está copiada acá (queda el número).
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

  // Sin huella no es un intento de factura: es la clave de una cotización de
  // antes del corte, que en producción usaba esta misma tabla. Tratarla como
  // "ya creada" devolvería una cotización en lugar de una factura.
  if (!previo.huella || !esElMismoDocumento(previo.huella, facturaData)) {
    throw errorHttp(409,
      'Esa clave de factura ya se usó para otro documento distinto. ' +
      'Cada factura necesita su propia clave; reusar una devolvería la factura equivocada.');
  }

  if (previo.estado === 'creada') {
    // El caso que da sentido a todo esto: alguien reenvía algo que YA se creó.
    const propia = await facturaDe(previo);
    return {
      seguir: false,
      yaCreada: {
        id: propia ? propia.id : null,
        numero: propia ? propia.numero : previo.numero_factura
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

/**
 * La factura se guardó: queda con qué factura PROPIA se asoció la clave.
 *
 * `factura` es la nuestra (`{ id, numero }`). Va en `factura_id`;
 * `alegra_invoice_id` no se toca, porque esto no es un documento de Alegra.
 */
async function marcarCreada(clave, factura) {
  await query(`
    UPDATE factura_intento
    SET estado = 'creada', factura_id = $2, numero_factura = $3,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE clave = $1;
  `, [clave, Number(factura.id), String(factura.numero ?? '')]);
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

module.exports = { huellaDe, huellaAnteriorDe, reservar, marcarCreada, marcarFallo, listarSinResolver };
