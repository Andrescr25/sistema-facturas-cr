/**
 * Cotizaciones (proformas), en la base propia.
 *
 * Hasta la migración 029 vivían en Alegra (/estimates) y facturarlas creaba
 * la factura en Alegra. Ahora nacen acá, con su número de la serie propia, y
 * facturarlas crea una factura propia en la MISMA transacción que marca la
 * cotización: o quedan las dos, o ninguna.
 *
 * LO QUE YA COSTÓ CARO APRENDER, Y SIGUE VALIENDO
 *
 *   1. El precio sale del catálogo del SERVIDOR, nunca de lo que mande el
 *      navegador: si viajara en la petición, cualquiera cotizaría a ₡1.
 *   2. El precio se guarda SIN impuesto y la tarifa por línea, igual que en la
 *      factura, y las líneas se arman con la MISMA función (`armarLineas` de
 *      facturación): si cotización y factura redondearan distinto, el total
 *      facturado no sería el cotizado.
 *   3. Al facturar vale el precio COTIZADO, no el de hoy. Si el producto subió
 *      entre la cotización y la aceptación, cobrarle el nuevo es romper lo que
 *      se le prometió al cliente. Para eso está la fecha de vencimiento.
 *
 * Una cotización equivocada no es un documento fiscal —se corrige y ya— pero
 * si el precio está mal, el cliente ya lo vio. Eso no se corrige.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { validarTelefonoEscrito } = require('../../utils/telefonosCliente');
const { NEGOCIO } = require('../../utils/marcaPdf');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { enviarYRegistrar } = require('../envios-whatsapp/envios.service');
const { clientesParaOperar } = require('../clientes/clientes.service');
const { armarLineas, sumarDias, crearFacturaEnTransaccion } = require('../facturacion/facturaPropia.service');
const { generarPdfCotizacion } = require('./cotizacion.pdf');
const { leerToken, enlaceDe } = require('./enlacePublico');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

const VALIDEZ_POR_OMISION = 15;
const TOPE_LISTA = 200;

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;

function recortar(valor, largo) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s.slice(0, largo) : null;
}

/**
 * El estado se CALCULA, no se guarda (ver la migración 029): anular la
 * factura tiene que devolver la cotización a vigente sin que nadie corra
 * nada. El día es el de Costa Rica, no el de la sesión de la base.
 */
const SELECT_CABECERA = `
  SELECT c.*, c.fecha::text AS fecha, c.vence::text AS vence,
         f.numero AS factura_numero, f.estado AS factura_estado,
         CASE
           WHEN f.id IS NOT NULL AND f.estado <> 'anulada' THEN 'facturada'
           WHEN c.factura_id IS NULL AND c.facturada_en IS NOT NULL THEN 'facturada'
           WHEN c.vence < (now() AT TIME ZONE 'America/Costa_Rica')::date THEN 'vencida'
           ELSE 'vigente'
         END AS estado
    FROM cotizacion c
    LEFT JOIN factura f ON f.id = c.factura_id`;

function aVista(f) {
  return {
    id: f.id,
    numero: f.numero,
    fecha: f.fecha,
    vence: f.vence,
    estado: f.estado,
    facturada: f.estado === 'facturada',
    vencida: f.estado === 'vencida',
    clienteId: f.cliente_id,
    clienteNombre: f.cliente_nombre,
    clienteIdentificacion: f.cliente_identificacion,
    observaciones: f.observaciones,
    subtotal: Number(f.subtotal),
    descuento: Number(f.descuento),
    impuesto: Number(f.impuesto),
    total: Number(f.total),
    // La factura que salió de acá. Si se anuló, la cotización vuelve a estar
    // vigente y la pantalla lo dice en vez de esconder la anulada.
    factura: f.factura_id
      ? { id: f.factura_id, numero: f.factura_numero, anulada: f.factura_estado === 'anulada' }
      : null,
    facturadaEnAlegra: !f.factura_id && Boolean(f.facturada_en),
    // El enlace para el cliente. Lo arma el servidor porque la firma se
    // calcula con el secreto de la aplicación: la pantalla no puede —ni
    // debe— conocerlo.
    enlacePublico: enlaceDe(f.id)
  };
}

function lineaAVista(l) {
  const lista = Number(l.precio_unitario);
  const descuento = Number(l.descuento_porcentaje) || 0;
  return {
    productoId: l.producto_id,
    nombre: l.nombre,
    referencia: l.referencia,
    cantidad: Number(l.cantidad),
    // El precio unitario que se le muestra al cliente es el NETO: el PDF
    // multiplica cantidad × precio, y con el de lista una línea con
    // descuento no sumaría el total guardado. Las que crea esta pantalla no
    // llevan descuento; las copiadas de Alegra podrían.
    precio: Math.round(lista * (1 - descuento / 100) * 100000) / 100000,
    precioLista: lista,
    descuentoPorcentaje: descuento,
    taxPercentage: Number(l.tarifa),
    impuesto: Number(l.impuesto_monto),
    total: Number(l.total)
  };
}

async function lineasDe(ejecutor, cotizacionId) {
  const { rows } = await ejecutor.query(
    'SELECT * FROM cotizacion_linea WHERE cotizacion_id = $1 ORDER BY numero_linea',
    [cotizacionId]
  );
  return rows;
}

/** La cotización con su estado, tomada con bloqueo. Para editar, borrar o facturar. */
async function bloquear(cliente, id) {
  const { rows } = await cliente.query(`${SELECT_CABECERA} WHERE c.id = $1 FOR UPDATE OF c`, [id]);
  if (!rows[0]) throw httpError(404, 'Cotización no encontrada.');
  return rows[0];
}

/**
 * El siguiente número de cotización.
 *
 * No usa `tomarConsecutivo` de facturación porque ese exige un prefijo de
 * serie —una factura sin él está mal armada— y las cotizaciones no llevan:
 * son "3", "4", continuando las de Alegra. El UPDATE ... RETURNING toma la
 * fila con bloqueo, así que dos cotizaciones a la vez no comparten número, y
 * como corre dentro de la transacción, si la cotización no se guarda el
 * número no se gasta.
 */
async function tomarNumero(cliente) {
  const { rows } = await cliente.query(
    `UPDATE serie_consecutivo SET siguiente = siguiente + 1
      WHERE id = (SELECT id FROM serie_consecutivo
                   WHERE tipo_documento = 'cotizacion' AND NOT electronica AND activo
                   ORDER BY id LIMIT 1)
      RETURNING siguiente - 1 AS consecutivo`
  );
  if (!rows[0]) throw httpError(500, 'No hay una serie activa para las cotizaciones (migración 029).');
  return Number(rows[0].consecutivo);
}

async function buscarClienteCotizable(ejecutor, clienteId) {
  const { rows } = await ejecutor.query(
    'SELECT id, nombre, identificacion, activo FROM cliente WHERE id = $1',
    [idValido(clienteId)]
  );
  const encontrado = rows[0];
  if (!encontrado) throw httpError(400, 'No se encontró ese cliente.');
  if (!encontrado.activo) throw httpError(400, `${encontrado.nombre} está inactivo: no se le puede cotizar.`);
  return encontrado;
}

/**
 * Convierte las líneas que manda la pantalla (`productoId` y `cantidad`) en
 * líneas con precio y tarifa del maestro.
 *
 * VIVE APARTE PORQUE LO USAN CREAR Y EDITAR. Si cada uno lo armara por su
 * lado, bastaría con tocar uno para que editar una cotización le quitara el
 * impuesto que crear sí le puso.
 *
 * Un producto dado de baja no revienta la cotización: se deja fuera y se
 * avisa (`noDisponibles`). Pasa al editar una cotización vieja.
 */
async function armarDesdeCatalogo(ejecutor, lineas) {
  const pedidas = lineas.map((l) => ({ productoId: Number(l.productoId), cantidad: Number(l.cantidad) }));
  const ids = pedidas.map((l) => l.productoId).filter((n) => Number.isInteger(n) && n > 0);

  const { rows: productos } = ids.length === 0 ? { rows: [] } : await ejecutor.query(
    `SELECT p.id, p.alegra_id, p.nombre, p.referencia, p.descripcion, p.cabys, p.unidad,
            p.activo, p.impuesto_id, p.precio_sin_iva, i.tarifa
       FROM producto p
       LEFT JOIN impuesto i ON i.id = p.impuesto_id
      WHERE p.id = ANY($1::int[])`,
    [ids]
  );
  const porId = new Map(productos.map((p) => [String(p.id), p]));

  const noDisponibles = [];
  const items = [];
  for (const l of pedidas) {
    const p = porId.get(String(l.productoId));
    if (!p || !p.activo) {
      noDisponibles.push({ productoId: l.productoId, nombre: p?.nombre || null });
      continue;
    }
    // El precio del SERVIDOR, sin impuesto. Descuento cero: la pantalla no
    // cotiza con rebaja.
    items.push({ productoId: p.id, cantidad: l.cantidad, precio: Number(p.precio_sin_iva), descuento: 0 });
  }

  if (items.length === 0) throw httpError(400, 'Ninguno de los productos está disponible para cotizar.');

  return { armado: armarLineas(items, porId, (i) => i.productoId), noDisponibles };
}

const COLUMNAS_LINEA = [
  'cotizacion_id', 'numero_linea', 'producto_id', 'nombre', 'referencia', 'cantidad', 'precio_unitario',
  'descuento_porcentaje', 'descuento_monto', 'impuesto_id', 'tarifa', 'impuesto_monto', 'total', 'alegra_item_id'
];

async function guardarLineas(cliente, cotizacionId, lineas) {
  for (const linea of lineas) {
    await cliente.query(
      `INSERT INTO cotizacion_linea (${COLUMNAS_LINEA.join(', ')})
       VALUES (${COLUMNAS_LINEA.map((_, i) => `$${i + 1}`).join(', ')})`,
      COLUMNAS_LINEA.map((c) => (c === 'cotizacion_id' ? cotizacionId : linea[c] ?? null))
    );
  }
}

async function yaCreada(ejecutor, clave) {
  const { rows } = await ejecutor.query(
    'SELECT id, numero, total FROM cotizacion WHERE clave_idempotencia = $1',
    [clave]
  );
  return rows[0] ? { id: rows[0].id, numero: rows[0].numero, total: Number(rows[0].total) } : null;
}

function validarFecha(valor, etiqueta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) {
    throw httpError(400, `${etiqueta}: va como AAAA-MM-DD.`);
  }
  return String(valor);
}

/** Crea la cotización con el número que sigue de la serie. */
async function crear({ clienteId, lineas, observaciones, validezDias = VALIDEZ_POR_OMISION, claveIdempotencia } = {}, usuarioId) {
  if (!clienteId) throw httpError(400, 'Falta el cliente.');
  if (!Array.isArray(lineas) || lineas.length === 0) throw httpError(400, 'La cotización no tiene productos.');
  const dias = Math.round(Number(validezDias));
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    throw httpError(400, 'La cotización vale entre 1 y 365 días.');
  }

  // Idempotencia: si el navegador reenvía —doble clic, respuesta perdida— se
  // devuelve la que ya existe en vez de gastar otro número.
  const clave = recortar(claveIdempotencia, 80);
  if (clave) {
    const previa = await yaCreada(pool, clave);
    if (previa) return { ...previa, yaExistia: true, noDisponibles: [] };
  }

  try {
    return await enTransaccion(async (cliente) => {
      const quien = await buscarClienteCotizable(cliente, clienteId);
      const { armado, noDisponibles } = await armarDesdeCatalogo(cliente, lineas);
      const consecutivo = await tomarNumero(cliente);
      const fecha = hoyEnCostaRica();

      const { rows } = await cliente.query(
        `INSERT INTO cotizacion (consecutivo, numero, fecha, vence, cliente_id, cliente_nombre, cliente_identificacion,
                                 observaciones, subtotal, descuento, impuesto, total, clave_idempotencia, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, numero, total`,
        [
          consecutivo, String(consecutivo), fecha, sumarDias(fecha, dias), quien.id, quien.nombre, quien.identificacion,
          recortar(observaciones, 4000), armado.subtotal, armado.descuento, armado.impuesto, armado.total,
          clave, usuarioId ?? null
        ]
      );
      const creada = rows[0];
      await guardarLineas(cliente, creada.id, armado.lineas);

      await registrarCambio(cliente, {
        entidad: 'cotizacion', entidadId: creada.id, accion: 'crear',
        despues: { numero: creada.numero, cliente: quien.nombre, total: armado.total, lineas: armado.lineas.length },
        usuarioId
      });

      return { id: creada.id, numero: creada.numero, total: Number(creada.total), yaExistia: false, noDisponibles };
    });
  } catch (error) {
    // Dos envíos con la misma clave a la vez: los dos pasan la consulta de
    // arriba, el segundo choca con la UNIQUE y su transacción se deshace
    // entera —el número incluido—. Se devuelve la que ganó.
    if (clave && error?.code === '23505' && /clave_idempotencia/.test(`${error.constraint} ${error.detail}`)) {
      const previa = await yaCreada(pool, clave);
      if (previa) return { ...previa, yaExistia: true, noDisponibles: [] };
    }
    throw error;
  }
}

/** Las cotizaciones, de la más nueva a la más vieja. */
async function listar({ limite = TOPE_LISTA } = {}) {
  const tope = Math.min(Math.max(parseInt(limite, 10) || TOPE_LISTA, 1), TOPE_LISTA);
  const { rows } = await pool.query(`${SELECT_CABECERA} ORDER BY c.consecutivo DESC LIMIT $1`, [tope]);
  return rows.map(aVista);
}

async function detalle(id) {
  const n = idValido(id);
  const { rows } = await pool.query(`${SELECT_CABECERA} WHERE c.id = $1`, [n]);
  if (!rows[0]) throw httpError(404, 'Cotización no encontrada.');
  return { ...aVista(rows[0]), lineas: (await lineasDe(pool, n)).map(lineaAVista) };
}

/**
 * Cambia una cotización que todavía no se facturó.
 *
 * Las líneas se REEMPLAZAN enteras: la pantalla manda siempre todas, y una
 * cotización corregida puede tener menos que antes.
 *
 * La fecha de emisión NO se toca. Es cuándo se le pasó el precio al cliente,
 * y moverla haría parecer que una cotización de la semana pasada es de hoy.
 * Lo que sí se puede correr es hasta cuándo vale.
 *
 * Los precios se vuelven a leer del catálogo, así que editar una cotización
 * vieja la actualiza a los precios de hoy. Es lo que se espera al reabrirla
 * para cambiarle algo; si lo que se quiere es sostener el precio viejo, se
 * factura sin editar (facturar sí respeta el precio cotizado).
 */
async function editar(id, datos = {}, usuarioId) {
  const n = idValido(id);
  const { lineas } = datos;
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw httpError(400, 'La cotización no puede quedar sin productos.');
  }

  return enTransaccion(async (cliente) => {
    const actual = await bloquear(cliente, n);
    // Una cotización facturada ya tiene una factura que la copia: cambiarla
    // dejaría los dos documentos diciendo cosas distintas, y la factura es la
    // que vale.
    if (actual.estado === 'facturada') {
      throw httpError(409, `La cotización ${actual.numero} ya se facturó y no se puede cambiar.`);
    }

    const vence = datos.vence ? validarFecha(datos.vence, 'Vale hasta') : actual.vence;
    if (vence < actual.fecha) {
      throw httpError(400, `No puede vencer antes de su fecha de emisión (${actual.fecha}).`);
    }

    const quien = datos.clienteId && Number(datos.clienteId) !== Number(actual.cliente_id)
      ? await buscarClienteCotizable(cliente, datos.clienteId)
      : { id: actual.cliente_id, nombre: actual.cliente_nombre, identificacion: actual.cliente_identificacion };

    const { armado, noDisponibles } = await armarDesdeCatalogo(cliente, lineas);
    // `observaciones: null` la borra; si no viene, queda la que estaba.
    const observaciones = datos.observaciones === undefined
      ? actual.observaciones
      : recortar(datos.observaciones, 4000);

    await cliente.query('DELETE FROM cotizacion_linea WHERE cotizacion_id = $1', [n]);
    await guardarLineas(cliente, n, armado.lineas);

    const { rows } = await cliente.query(
      `UPDATE cotizacion
          SET vence = $1, cliente_id = $2, cliente_nombre = $3, cliente_identificacion = $4, observaciones = $5,
              subtotal = $6, descuento = $7, impuesto = $8, total = $9, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $10
        RETURNING numero, total`,
      [vence, quien.id, quien.nombre, quien.identificacion, observaciones,
        armado.subtotal, armado.descuento, armado.impuesto, armado.total, n]
    );

    await registrarCambio(cliente, {
      entidad: 'cotizacion', entidadId: n, accion: 'editar',
      antes: { total: Number(actual.total), vence: actual.vence, cliente: actual.cliente_nombre },
      despues: { total: armado.total, vence, cliente: quien.nombre, lineas: armado.lineas.length },
      usuarioId
    });

    return { id: n, numero: rows[0].numero, total: Number(rows[0].total), noDisponibles };
  });
}

/**
 * Borra una cotización que no se va a facturar.
 *
 * SE BORRA DE VERDAD. Una cotización no es documento fiscal: no hay nada que
 * conservar de una que nunca se vendió, y dejarlas ahí llena la pantalla de
 * cosas muertas. La bitácora anota qué se borró.
 *
 * UNA QUE SE FACTURÓ NO SE BORRA, aunque su factura se haya anulado: la
 * factura dice "Cotización N" y quien la revise después tiene que poder
 * saber de dónde salieron esos precios.
 */
async function eliminar(id, usuarioId) {
  const n = idValido(id);
  return enTransaccion(async (cliente) => {
    const cot = await bloquear(cliente, n);
    if (cot.factura_id || cot.facturada_en) {
      throw httpError(409,
        `La cotización ${cot.numero} ya se facturó${cot.factura_numero ? ` (factura ${cot.factura_numero})` : ''} ` +
        'y no se puede borrar: su factura la referencia.');
    }

    await cliente.query('DELETE FROM cotizacion WHERE id = $1', [n]);

    // El registro del envío por WhatsApp NO se borra: si se le mandó al
    // cliente, eso pasó, y el día que pregunte por "la cotización que me
    // mandaron" hay que poder decir cuándo salió y a qué número.
    await registrarCambio(cliente, {
      entidad: 'cotizacion', entidadId: n, accion: 'borrar',
      antes: { numero: cot.numero, cliente: cot.cliente_nombre, total: Number(cot.total), vence: cot.vence },
      usuarioId
    });

    return { borrada: true, numero: cot.numero, cliente: cot.cliente_nombre };
  });
}

/**
 * Convierte una cotización aceptada en factura de venta propia.
 *
 * Se factura con las MISMAS líneas y los MISMOS precios que vio el cliente.
 * La tarifa, en cambio, es la del maestro de hoy: el impuesto lo fija la ley,
 * no la cotización.
 *
 * La factura se crea y la cotización se marca en UNA transacción, con la
 * cotización tomada con bloqueo: un doble clic espera al primero, encuentra la
 * cotización ya facturada y devuelve esa factura en vez de crear otra.
 */
async function facturar(id, { aunqueVencida = false } = {}, usuarioId) {
  const n = idValido(id);
  return enTransaccion(async (cliente) => {
    const cot = await bloquear(cliente, n);

    if (cot.estado === 'facturada') {
      if (cot.factura_numero) {
        return { facturado: true, yaExistia: true, facturaId: cot.factura_id, numeroFactura: cot.factura_numero };
      }
      throw httpError(409, `La cotización ${cot.numero} ya se facturó en Alegra.`);
    }

    // UNA COTIZACIÓN VENCIDA NO SE FACTURA DE UN CLIC. Facturar usa los
    // precios COTIZADOS, que es lo correcto mientras sigan vigentes. Pasada la
    // fecha, un clic distraído vendería a precios viejos. Se puede hacer igual
    // —a veces se le sostiene el precio a un cliente— pero diciéndolo.
    if (!aunqueVencida && cot.estado === 'vencida') {
      throw httpError(409,
        `La cotización ${cot.numero} venció el ${cot.vence} y sus precios son de esa fecha. ` +
        'Si se factura igual, se le cobra al cliente el precio que se le prometió entonces.');
    }

    const lineas = await lineasDe(cliente, n);
    if (lineas.length === 0) throw httpError(400, 'Esa cotización no tiene líneas.');
    const huerfana = lineas.find((l) => !l.producto_id);
    if (huerfana) {
      throw httpError(409,
        `"${huerfana.nombre}" no está en el catálogo propio: editá la cotización antes de facturarla.`);
    }

    const factura = await crearFacturaEnTransaccion(cliente, {
      clienteId: cot.cliente_id,
      items: lineas.map((l) => ({
        productoId: l.producto_id,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio_unitario),        // el COTIZADO, no el de hoy
        descuento: Number(l.descuento_porcentaje)
      })),
      observaciones: `Cotización ${cot.numero}`
    }, usuarioId);

    await cliente.query(
      `UPDATE cotizacion
          SET factura_id = $1, facturada_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [factura.id, n]
    );

    await registrarCambio(cliente, {
      entidad: 'cotizacion', entidadId: n, accion: 'facturar',
      despues: { factura: factura.numero, total: Number(factura.total) },
      usuarioId
    });

    return { facturado: true, yaExistia: false, facturaId: factura.id, numeroFactura: factura.numero };
  });
}

/**
 * El PDF de la cotización, con el formato de la casa (cotizacion.pdf.js).
 * Se genera en el momento y no se guarda: siempre refleja lo que hay ahora.
 */
async function pdf(id) {
  const cot = await detalle(id);
  return { archivo: await generarPdfCotizacion(cot), numero: cot.numero, cot };
}

/**
 * Le manda la cotización al cliente por WhatsApp, con el PDF adjunto.
 *
 * El número lo elige una persona entre los de la ficha propia del cliente y
 * se valida acá: un dígito de más es el teléfono de otra persona.
 */
async function enviarPorWhatsApp(id, { telefono, mensaje, usuarioId } = {}) {
  const numeroLimpio = validarTelefonoEscrito(telefono);
  if (!numeroLimpio.valido) {
    throw httpError(400, numeroLimpio.motivo || 'Ese número no parece un teléfono de Costa Rica.');
  }
  if (!String(mensaje || '').trim()) throw httpError(400, 'Escribí el mensaje que acompaña la cotización.');

  const { archivo, cot } = await pdf(id);

  return enviarYRegistrar({
    tipo: 'cotizacion',
    referencia: cot.numero,
    clienteId: cot.clienteId,
    telefono: numeroLimpio.numero,
    mensaje: String(mensaje).trim(),
    pdf: archivo,
    nombreArchivo: `cotizacion-${cot.numero}.pdf`,
    usuarioId
  });
}

/**
 * La cotización tal como la ve el cliente en el navegador: lo mismo que el
 * PDF más la foto de cada producto.
 *
 * SE DEVUELVE LO JUSTO. Esta ruta es pública —la abre quien tenga el enlace—
 * así que sale solo lo que ya está en el PDF que el cliente recibió: nombre,
 * productos, precios y fechas. Nada de ids internos ni el resto de la ficha.
 *
 * Un enlace mandado ANTES de la migración trae el id de Alegra: se busca por
 * `alegra_id`, nunca por `id` (ver enlacePublico.js).
 */
async function publicaPorToken(token) {
  const llave = leerToken(token);
  if (!llave) throw httpError(404, 'Ese enlace no es válido.');

  let id = llave.id;
  if (llave.legado) {
    const { rows } = await pool.query('SELECT id FROM cotizacion WHERE alegra_id = $1', [String(llave.id)]);
    if (!rows[0]) throw httpError(404, 'Esa cotización ya no existe.');
    id = rows[0].id;
  }

  const cot = await detalle(id);

  const ids = cot.lineas.map((l) => l.productoId).filter(Boolean);
  const fotos = new Map();
  if (ids.length > 0) {
    const { rows } = await pool.query(
      'SELECT id, imagen_url FROM producto WHERE id = ANY($1::int[]) AND imagen_url IS NOT NULL',
      [ids]
    );
    rows.forEach((r) => fotos.set(r.id, r.imagen_url));
  }

  return {
    numero: cot.numero,
    fecha: cot.fecha,
    vence: cot.vence,
    // Se muestra igual si venció, con el aviso: encontrarse una página muerta
    // sería peor que decirle que los precios ya no rigen.
    vencida: cot.vencida,
    facturada: cot.facturada,
    cliente: cot.clienteNombre,
    observaciones: cot.observaciones,
    negocio: NEGOCIO,
    lineas: cot.lineas.map((l) => ({
      nombre: l.nombre,
      referencia: l.referencia,
      cantidad: l.cantidad,
      precio: l.precio,
      taxPercentage: l.taxPercentage,
      // El precio que el cliente paga por unidad, ya con impuesto.
      precioConIva: precioConImpuesto(l.precio, l.taxPercentage),
      importe: dinero(l.cantidad * l.precio),
      imagen: fotos.get(l.productoId) || null
    }))
  };
}

/** Clientes propios por nombre o cédula, conforme se escribe. */
async function buscarClientes(termino) {
  const t = String(termino || '').trim();
  // Con una letra devuelve medio directorio y no ayuda a elegir.
  if (t.length < 2) return [];
  const { data } = await clientesParaOperar({ buscar: t, limite: 15 });
  return data.map((c) => ({ id: c.id, nombre: c.nombre, identificacion: c.identificacion || null }));
}

/**
 * El catálogo entero, en la forma mínima que necesita el modal.
 *
 * SE MANDA COMPLETO A PROPÓSITO: paginado, el buscador del modal solo veía
 * los primeros y una referencia real ("G22") parecía no existir.
 *
 * El precio va CON impuesto, que es el que ve el cliente y el que tiene que
 * cuadrar con el total del PDF. El que termina en la cotización no sale de
 * acá: lo vuelve a leer `crear` del maestro.
 */
async function catalogoParaCotizar() {
  const { rows } = await pool.query(
    `SELECT p.id, p.nombre, p.referencia, p.precio_sin_iva, i.tarifa
       FROM producto p
       LEFT JOIN impuesto i ON i.id = p.impuesto_id
      WHERE p.activo AND NOT p.oculto
      ORDER BY lower(p.nombre)`
  );
  return rows.map((p) => ({
    id: String(p.id),
    nombre: p.nombre,
    referencia: p.referencia || '',
    precio: precioConImpuesto(p.precio_sin_iva, p.tarifa)
  }));
}

module.exports = {
  crear, editar, listar, detalle, facturar, eliminar, pdf, enviarPorWhatsApp,
  publicaPorToken, buscarClientes, catalogoParaCotizar
};
