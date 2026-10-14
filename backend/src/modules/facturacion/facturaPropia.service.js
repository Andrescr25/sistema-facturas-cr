/**
 * Crear una factura de venta SIN Alegra.
 *
 * Es el reemplazo de `POST /invoices` a Alegra: la factura nace en la base
 * propia, con su número tomado de la serie propia, y no sale nada hacia
 * afuera.
 *
 * DECISIONES QUE NO SE VEN EN EL CÓDIGO
 *
 * 1. EL IMPUESTO SALE DEL MAESTRO, NO DE LO QUE MANDA LA PANTALLA. El
 *    navegador manda `tax: [{id}]` con ids de Alegra. Ya pasó una vez que esos
 *    ids no eran los de la cuenta y 82 líneas al 1 % se registraron al 4 %
 *    (ver la bitácora del arreglo en main). La tarifa que vale es la del
 *    producto en `producto.impuesto_id`, y se guarda en la línea junto con el
 *    monto: una factura de hace dos años tiene que poder explicarse sola.
 *
 * 2. EL PRECIO DE LA LÍNEA ES EL QUE SE COBRÓ. Puede no ser el de lista
 *    (precio manual, una rebaja acordada en el mostrador). Se guarda el
 *    cobrado; el de lista vive en el producto y puede cambiar mañana.
 *
 * 3. COPIA FIJA DEL CLIENTE Y DEL PRODUCTO. Nombre, cédula y descripción
 *    quedan escritos en el documento. Corregir después una ficha no puede
 *    cambiar lo que dice una factura ya entregada.
 *
 * 4. LA IDEMPOTENCIA SE SIMPLIFICA. Contra Alegra, un timeout dejaba el
 *    intento INCIERTO: podía haberla creado y nadie sabía. Acá la factura se
 *    guarda en una transacción nuestra: si algo falla, no quedó nada y
 *    reintentar es seguro. Lo que sigue haciendo falta es que reenviar la
 *    misma clave devuelva la factura que ya existe en vez de crear otra.
 *
 * 5. YA NO SE COPIA A LA TABLA VIEJA `facturas` (2026-09-30). Se copiaba
 *    para Bodega, Faltantes, la cola de impresión y el portal; todos leen
 *    `factura` desde la sección 11 (migraciones 031 y 032).
 */

const ciclos = require('../rutas/documentosCiclo.service');
const { pool, query } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { reconciliarDocumentoEn } = require('../inventario/inventario.service');
const { httpError, texto, numero, validar, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
// Un solo lugar sabe qué día es: Costa Rica es UTC−6 y después de las 6 de
// la tarde `toISOString()` ya devuelve mañana.
const { hoyEnCostaRica, diaDeBase, sumarDias } = require('../../utils/fechaCR');
const { tomarConsecutivo } = require('./consecutivo');
const idempotencia = require('./idempotencia');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

const CAMPOS_FACTURA = {
  fecha: { etiqueta: 'Fecha', validar: texto(10, { patron: /^\d{4}-\d{2}-\d{2}$/, mensajePatron: 'va como AAAA-MM-DD' }) },
  observaciones: { etiqueta: 'Observaciones', validar: texto(4000) },
  anotaciones: { etiqueta: 'Anotaciones', validar: texto(4000) }
};

const { armarLineas, exigirClienteMostrado, recortar, dinero } = require('./facturaLineas');
const { aplicarDescuentoEn } = require('./descuentoCliente.service');

/** "₡45.145,80", para los mensajes. `toLocaleString('es-CR')` daba "₡45 145,8". */
const enColones = (v) => `₡${dinero(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/**
 * Postgres avisa "value too long for type character varying(40)" pero NO dice
 * cuál columna. Con 31 columnas eso es una cacería a ciegas —y costó varios
 * intentos averiguarlo la primera vez—. Acá el error se explica solo: nombra
 * las columnas con más texto y su largo, que es donde siempre está la culpable.
 */
function explicarDatoLargo(error, tabla, columnas, valores) {
  if (error?.code !== '22001') return error;

  const largos = columnas
    .map((columna, i) => {
      const v = valores[i];
      return { columna, largo: v === null || v === undefined ? 0 : String(v).length };
    })
    .filter(x => x.largo > 0)
    .sort((a, b) => b.largo - a.largo)
    .slice(0, 5)
    .map(x => `${x.columna} (${x.largo})`);

  const explicado = new Error(
    `Un dato no cabe en la tabla ${tabla}: ${error.message}. ` +
    `Las columnas con más texto en esta fila son ${largos.join(', ')}.`
  );
  explicado.code = error.code;
  explicado.causa = error;
  return explicado;
}

const COLUMNAS_FACTURA = [
  'tipo_documento', 'serie', 'consecutivo', 'numero', 'electronica', 'estado',
  'fecha', 'fecha_vencimiento', 'emitida_en',
  'cliente_id', 'cliente_nombre', 'cliente_tipo_identificacion', 'cliente_identificacion', 'cliente_correo',
  'cliente_telefono', 'cliente_direccion',
  'condicion_venta', 'plazo_credito_id', 'plazo_texto', 'metodo_pago_id', 'metodo_pago_texto',
  'moneda', 'subtotal', 'descuento', 'impuesto', 'total', 'total_pagado', 'saldo',
  'observaciones', 'anotaciones', 'vendedor', 'actividad_economica', 'creado_por', 'ciclo_ruta_cliente_id', 'preventa_anticipada'
];

const COLUMNAS_LINEA = [
  'factura_id', 'numero_linea', 'producto_id', 'nombre', 'referencia', 'descripcion', 'cabys', 'unidad',
  'cantidad', 'precio_unitario', 'descuento_porcentaje', 'descuento_monto',
  'impuesto_id', 'tarifa', 'impuesto_monto', 'total', 'alegra_item_id'
];

/**
 * El cliente al que se factura, con su copia fija y su plazo.
 *
 * Acepta el id propio o el de Alegra, porque la pantalla todavía manda el de
 * Alegra (el mismo que usan el carrito y el histórico).
 */
async function buscarCliente(cliente, { clienteId, alegraClienteId }) {
  const porId = clienteId !== undefined && clienteId !== null && clienteId !== '';
  const { rows } = await cliente.query(
    `SELECT c.id, c.nombre, c.tipo_identificacion, c.identificacion, c.correo,
            -- El teléfono y la dirección se COPIAN en la factura, así que hay
            -- que traerlos: sin estas columnas se guardaban vacíos y el papel
            -- salía sin los datos del cliente.
            c.telefono, c.celular, c.provincia, c.canton, c.distrito, c.barrio, c.otras_senas,
            c.activo, c.descuento_global, c.plazo_credito_id, p.nombre AS plazo_nombre, p.dias AS plazo_dias
       FROM cliente c
       LEFT JOIN plazo_credito p ON p.id = c.plazo_credito_id
      WHERE ${porId ? 'c.id = $1' : 'c.alegra_id = $1'}`,
    [porId ? idValido(clienteId) : String(alegraClienteId)]
  );

  const encontrado = rows[0];
  if (!encontrado) throw httpError(400, 'No se encontró ese cliente.');
  if (!encontrado.activo) throw httpError(400, `${encontrado.nombre} está inactivo: no se le puede facturar.`);
  return encontrado;
}

/** Los productos de las líneas, en una sola consulta. */
async function buscarProductos(cliente, alegraItemIds, productoIds) {
  const porAlegra = alegraItemIds.length > 0;
  const { rows } = await cliente.query(
    `SELECT p.id, p.alegra_id, p.nombre, p.referencia, p.descripcion, p.cabys, p.unidad,
            p.activo, p.precio_sin_iva AS precio, p.costo_con_iva AS costo, p.impuesto_id, i.tarifa
       FROM producto p
       LEFT JOIN impuesto i ON i.id = p.impuesto_id
      WHERE ${porAlegra ? 'p.alegra_id = ANY($1::varchar[])' : 'p.id = ANY($1::int[])'}`,
    [porAlegra ? alegraItemIds.map(String) : productoIds.map(Number)]
  );
  return rows;
}

async function guardarFactura(cliente, { datos, clienteFacturado, armado, usuarioId, contexto }) {
  const numeracion = await tomarConsecutivo(cliente, 'factura', { electronica: false });

  const fecha = datos.fecha || hoyEnCostaRica();
  // A crédito solo si el cliente lo tiene y son más de 0 días; si no, contado.
  const dias = Number(clienteFacturado.plazo_dias) || 0;
  const aCredito = Boolean(clienteFacturado.plazo_credito_id) && dias > 0;

  const fila = {
    tipo_documento: 'factura',
    serie: numeracion.serie,
    consecutivo: numeracion.consecutivo,
    numero: numeracion.numero,
    electronica: numeracion.electronica,
    estado: 'emitida',
    fecha,
    fecha_vencimiento: aCredito ? sumarDias(fecha, dias) : fecha,
    emitida_en: new Date().toISOString(),
    cliente_id: clienteFacturado.id,
    cliente_nombre: clienteFacturado.nombre,
    cliente_tipo_identificacion: clienteFacturado.tipo_identificacion,
    cliente_identificacion: clienteFacturado.identificacion,
    cliente_correo: clienteFacturado.correo,
    // Copia fija, igual que el nombre y la cédula: el papel tiene que poder
    // reimprimirse dentro de dos años diciendo lo mismo, y la ficha cambia.
    cliente_telefono: recortar(clienteFacturado.telefono || clienteFacturado.celular, 60),
    cliente_direccion: [clienteFacturado.provincia, clienteFacturado.canton, clienteFacturado.distrito,
                        clienteFacturado.barrio, clienteFacturado.otras_senas]
      .filter(Boolean).join(' ') || null,
    condicion_venta: aCredito ? 'credito' : 'contado',
    plazo_credito_id: aCredito ? clienteFacturado.plazo_credito_id : null,
    plazo_texto: aCredito ? clienteFacturado.plazo_nombre : 'De contado',
    metodo_pago_id: datos.metodoPagoId ?? null,
    metodo_pago_texto: recortar(datos.metodoPagoTexto, 40),
    moneda: 'CRC',
    subtotal: armado.subtotal,
    descuento: armado.descuento,
    impuesto: armado.impuesto,
    total: armado.total,
    // El cobro se registra aparte (sección 7): la factura nace sin pagos.
    total_pagado: 0,
    saldo: armado.total,
    observaciones: datos.observaciones ?? null,
    anotaciones: datos.anotaciones ?? null,
    vendedor: recortar(datos.vendedor, 120),
    actividad_economica: recortar(datos.actividadEconomica, 10),
    creado_por: usuarioId ?? null,
    ciclo_ruta_cliente_id: contexto?.recorridoId || null,
    preventa_anticipada: Boolean(contexto?.anticipado)
  };

  const valores = COLUMNAS_FACTURA.map(c => fila[c]);
  let rows;
  try {
    ({ rows } = await cliente.query(
      `INSERT INTO factura (${COLUMNAS_FACTURA.join(', ')})
       VALUES (${COLUMNAS_FACTURA.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      valores
    ));
  } catch (error) {
    throw explicarDatoLargo(error, 'factura', COLUMNAS_FACTURA, valores);
  }
  const factura = rows[0];
  factura.ciclo = contexto?.ciclo || null;

  for (const linea of armado.lineas) {
    const valoresLinea = COLUMNAS_LINEA.map(c => (c === 'factura_id' ? factura.id : linea[c]));
    try {
      await cliente.query(
        `INSERT INTO factura_linea (${COLUMNAS_LINEA.join(', ')})
         VALUES (${COLUMNAS_LINEA.map((_, i) => `$${i + 1}`).join(', ')})`,
        valoresLinea
      );
    } catch (error) {
      throw explicarDatoLargo(error, 'factura_linea', COLUMNAS_LINEA, valoresLinea);
    }
  }

  // El documento y su salida de bodega se confirman o revierten juntos.
  await reconciliarDocumentoEn(cliente, 'factura', factura.id, usuarioId);
  await registrarCambio(cliente, {
    entidad: 'factura', entidadId: factura.id, accion: 'crear',
    despues: { numero: factura.numero, cliente: factura.cliente_nombre, total: Number(factura.total), lineas: armado.lineas.length,
      ciclo: factura.ciclo, anticipado: factura.preventa_anticipada },
    usuarioId
  });

  // EL COBRO VA APARTE DE LA CONDICIÓN DE VENTA, a propósito.
  //
  // "De contado" o "a 30 días" es lo que dice el documento, y sale del plazo
  // del cliente. Si el cliente PAGÓ en el mostrador es otra cosa: un cliente
  // con crédito puede pagar de una en efectivo, y uno de contado puede quedar
  // debiendo. Derivar una de la otra deja facturas mostrando un saldo que
  // nadie debe, y es lo que haría inútil la lista de cuentas por cobrar.
  if (datos.cobro && datos.cobro.metodoPagoId) {
    await registrarCobro(cliente, { factura, armado, cobro: datos.cobro, usuarioId });
  }

  return { ...factura, lineas: armado.lineas };
}

/**
 * El cobro de una venta que se paga en el mostrador.
 *
 * No lleva número: un recibo de cobro no es un documento fiscal con serie, y
 * todavía no hay un esquema de numeración para ellos (sección 7 del
 * checklist). Queda con su fecha, su método y su referencia, que es lo que
 * hace falta para cuadrar caja.
 */
async function registrarCobro(cliente, { factura, armado, cobro, usuarioId }) {
  const metodoId = Number(cobro.metodoPagoId);

  const { rows: metodos } = await cliente.query(
    'SELECT id, nombre, pide_referencia FROM metodo_pago WHERE id = $1 AND activo = TRUE',
    [metodoId]
  );
  const metodo = metodos[0];
  if (!metodo) throw httpError(400, 'Ese método de pago no existe o está inactivo.');

  const referencia = recortar(cobro.referencia, 60);
  // SINPE y transferencia sin referencia son imposibles de cuadrar después:
  // el catálogo dice cuáles la piden y acá se hace valer.
  if (metodo.pide_referencia && !referencia) {
    throw httpError(400, `${metodo.nombre}: falta el número de referencia del pago.`);
  }

  const monto = cobro.monto === undefined || cobro.monto === null
    ? armado.total
    : dinero(cobro.monto);
  if (monto <= 0) throw httpError(400, 'El monto cobrado tiene que ser mayor que cero.');
  if (monto > armado.total + 0.01) {
    throw httpError(400, `No se puede cobrar ₡${monto} por una factura de ₡${armado.total}.`);
  }

  const { rows } = await cliente.query(
    `INSERT INTO pago (fecha, cliente_id, cliente_nombre, metodo_pago_id, metodo_pago_texto,
                       cuenta_dinero_id, cuenta_texto, referencia, monto, registrado_por)
     VALUES ($1, $2, $3, $4, $5,
             (SELECT id FROM cuenta_dinero WHERE nombre = 'Caja general' AND activo LIMIT 1),
             'Caja general', $6, $7, $8)
     RETURNING id`,
    [
      factura.fecha, factura.cliente_id, factura.cliente_nombre,
      metodo.id, recortar(metodo.nombre, 40), referencia, monto, usuarioId ?? null
    ]
  );

  await cliente.query(
    'INSERT INTO pago_factura (pago_id, factura_id, monto) VALUES ($1, $2, $3)',
    [rows[0].id, factura.id, monto]
  );

  return rows[0].id;
}

/** Lo que se revisa antes de abrir la transacción: cabecera, líneas y cliente. */
function revisarPedido(datos) {
  const cabecera = validar(CAMPOS_FACTURA, datos, { crear: false });
  const items = Array.isArray(datos.items) ? datos.items : [];
  if (items.length === 0) throw httpError(400, 'La factura no tiene líneas.');
  if (datos.client === undefined && datos.clienteId === undefined) {
    throw httpError(400, 'Falta el cliente.');
  }
  return { cabecera, items };
}

/** Cliente, productos, líneas y el guardado — todo sobre la transacción recibida. */
async function emitirCon(cliente, datos, { cabecera, items }, usuarioId, { preciosConImpuesto = false, contextoPedido = null, exigirDescuentoRevisado = false } = {}) {
  const clienteFacturado = await buscarCliente(cliente, {
    clienteId: datos.clienteId,
    alegraClienteId: datos.client
  });

  const contexto = contextoPedido || await ciclos.validarEn(cliente, clienteFacturado.id, datos.cicloId);

  // Una cola o pantalla anterior a esta función no vio la rebaja: cambiarle
  // el total al sincronizar también cambiaría lo cobrado o prometido.
  if (exigirDescuentoRevisado && Number(clienteFacturado.descuento_global) > 0 && datos.descuentoClienteRevisado === undefined) {
    throw httpError(409, 'Este cliente tiene un descuento global. Actualizá Facturación y revisá la factura antes de guardarla.');
  }

  const usaAlegraId = items.some(i => i.productoId === undefined);
  const productos = await buscarProductos(
    cliente,
    usaAlegraId ? items.map(i => i.id) : [],
    usaAlegraId ? [] : items.map(i => i.productoId)
  );
  const porClave = new Map(productos.map(p => [String(usaAlegraId ? p.alegra_id : p.id), p]));
  // Solo cuando el cliente llegó por id propio: una cola antigua lo trae por
  // el id de Alegra (`client`) y se resolvió por ESE id.
  if (datos.clienteId !== undefined && datos.clienteId !== null && datos.clienteId !== '') {
    exigirClienteMostrado(datos, clienteFacturado);
  }

  const descontados = await aplicarDescuentoEn(cliente, clienteFacturado, items, productos,
    (p) => usaAlegraId ? p.alegra_id : p.id, { revisado: datos.descuentoClienteRevisado, preciosConImpuesto, claveItem: i => usaAlegraId ? i.id : i.productoId });
  const armado = armarLineas(descontados, porClave, (i) => (usaAlegraId ? i.id : i.productoId), {
    preciosConImpuesto,
    // Solo en el contrato propio: una cola antigua de tablet llega con ids
    // de Alegra y se resuelve por ESE id: ahí el id sí es el que mostraba.
    exigirLoMostrado: !usaAlegraId
  });

  return guardarFactura(cliente, {
    datos: { ...datos, ...cabecera },
    clienteFacturado,
    armado,
    usuarioId, contexto
  });
}

/**
 * Crear una factura dentro de una transacción que abrió OTRO módulo.
 *
 * Para quien tiene que dejar algo más escrito en el mismo commit que la
 * factura: la cotización que se factura queda marcada con su factura, o no
 * queda ninguna de las dos. Con dos transacciones, un corte en el medio deja
 * una factura que la cotización no conoce, y facturarla de nuevo la cobra
 * dos veces.
 */
async function crearFacturaEnTransaccion(cliente, datos, usuarioId, { preciosConImpuesto = false, contextoPedido = null } = {}) {
  // Opción interna del portal. Una petición de Facturación no puede activar
  // este modo: sus precios siguen siendo bases sin IVA.
  return emitirCon(cliente, datos, revisarPedido(datos), usuarioId, { preciosConImpuesto, contextoPedido });
}

/**
 * @param {object} datos  lo que manda la pantalla: cliente, líneas, fecha…
 * @param {number} usuarioId
 * @param {{clave?: string|null}} opciones  clave de idempotencia
 */
async function crearFactura(datos, usuarioId, { clave = null } = {}) {
  const pedido = revisarPedido(datos);

  if (clave) {
    const reserva = await idempotencia.reservar(clave, datos);
    if (!reserva.seguir) {
      // `id` es nuestro id de factura, o null: la clave es de una factura
      // creada en Alegra antes del corte que todavía no se copió acá. No se
      // devuelve el id de Alegra — acá ese número es otra factura.
      const { id, numero } = reserva.yaCreada;
      // El acuse lleva el contexto GUARDADO aunque cambie la ruta o cierre
      // la semana. No se valida de nuevo contra la ficha actual del cliente.
      const { rows: [guardada] } = id ? await query(`SELECT f.estado, f.alegra_id, f.preventa_anticipada, ${ciclos.COLUMNAS_CICLO}
        FROM factura f ${ciclos.JOIN_CICLO('f')} WHERE f.id=$1`, [id]) : { rows: [] };
      return {
        yaExistia: true,
        id,
        numero,
        ...(guardada ? { estado: guardada.estado, alegra_id: guardada.alegra_id, ciclo: ciclos.aCiclo(guardada), preventa_anticipada: guardada.preventa_anticipada } : {}),
        mensaje: id
          ? 'Esa factura ya estaba creada.'
          : `Esa factura ya se había creado${numero ? ` (${numero})` : ''} antes de pasar al sistema nuevo y todavía no está cargada acá.`
      };
    }
  }

  try {
    const factura = await enTransaccion((cliente) => emitirCon(cliente, datos, pedido, usuarioId, { exigirDescuentoRevisado: true }));

    if (clave) {
      await idempotencia.marcarCreada(clave, { id: factura.id, numero: factura.numero });
    }
    return factura;
  } catch (error) {
    // La factura se guarda en una transacción nuestra: si falló, NO quedó
    // nada. Por eso el intento se marca como fallido y no como incierto —
    // reintentar es seguro, al revés de lo que pasaba contra Alegra.
    if (clave) {
      await idempotencia.marcarFallo(clave, { huboRespuesta: true, detalle: error.message }).catch(() => {});
    }
    throw error;
  }
}

/**
 * Lo que impide tocar una factura ya emitida.
 *
 * Se mira ANTES de editar o anular, y en este orden porque el mensaje tiene
 * que decir la razón de más peso primero.
 */
async function revisarSiSePuedeTocar(cliente, factura, accion) {
  if (factura.electronica) {
    throw httpError(409,
      `La factura ${factura.numero} se emitió como electrónica: ante Hacienda ya existe y no se puede ${accion}. ` +
      'Se corrige con una nota de crédito.');
  }

  if (['pendiente','enviada'].includes(factura.hacienda_estado)) {
    throw httpError(409, 'La factura está reservada ante Hacienda. Consulte el resultado antes de editar o anular.');
  }

  // SOLO LO VIGENTE. Un cobro anulado y una nota anulada siguen en su tabla
  // —no se borran, por el rastro— y esta suma los contaba igual: después de
  // revertir el cobro, la factura seguía respondiendo "tiene ₡X en cobros
  // aplicados" PARA SIEMPRE, y no había manera de editarla ni de anularla.
  // Es la misma regla del saldo (saldo.sql.js): cobros con `anulado = FALSE`
  // y notas que no estén anuladas.
  const { rows: cobros } = await cliente.query(
    `SELECT COALESCE(SUM(pf.monto), 0) AS total
       FROM pago_factura pf JOIN pago p ON p.id = pf.pago_id
      WHERE pf.factura_id = $1 AND p.anulado = FALSE`,
    [factura.id]
  );
  const cobrado = Number(cobros[0].total) || 0;
  if (cobrado > 0) {
    throw httpError(409,
      `La factura ${factura.numero} tiene ${enColones(cobrado)} en cobros aplicados. ` +
      `Hay que anular el cobro antes de ${accion}la.`);
  }

  const { rows: notas } = await cliente.query(
    `SELECT COALESCE(SUM(nf.monto), 0) AS total
       FROM nota_credito_factura nf JOIN nota_credito nc ON nc.id = nf.nota_credito_id
      WHERE nf.factura_id = $1 AND nc.estado <> 'anulada'`,
    [factura.id]
  );
  const acreditado = Number(notas[0].total) || 0;
  if (acreditado > 0) {
    throw httpError(409,
      `La factura ${factura.numero} ya tiene una nota de crédito aplicada por ${enColones(acreditado)}.`);
  }
}

/**
 * Anular una factura, con motivo.
 *
 * NO SE BORRA: el documento queda, con su número y su estado en 'anulada'.
 * Un número que desaparece es un hueco en la numeración que después hay que
 * explicarle a Hacienda.
 *
 * Volver a anular lo ya anulado no es un error: devuelve la factura como está.
 */
async function anularFactura(id, { motivo } = {}, usuarioId) {
  const n = idValido(id);
  const razon = recortar(motivo, 2000);
  if (!razon || razon.length < 4) {
    throw httpError(400, 'Hay que decir por qué se anula: el motivo queda en el documento.');
  }

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM factura WHERE id = $1 FOR UPDATE', [n]);
    const factura = rows[0];
    if (!factura) throw httpError(404, 'No existe esa factura.');
    if (factura.estado === 'anulada') return factura;

    await revisarSiSePuedeTocar(cliente, factura, 'anular');

    const { rows: actualizada } = await cliente.query(
      `UPDATE factura
          SET estado = 'anulada', motivo_anulacion = $1, saldo = 0, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *`,
      [razon, n]
    );

    await reconciliarDocumentoEn(cliente, 'factura', n, usuarioId);
    await registrarCambio(cliente, {
      entidad: 'factura', entidadId: n, accion: 'anular',
      antes: { estado: factura.estado, saldo: Number(factura.saldo) },
      despues: { estado: 'anulada', saldo: 0 },
      usuarioId, motivo: razon
    });

    return actualizada[0];
  });
}

/**
 * Editar una factura emitida.
 *
 * Se puede mientras NO sea electrónica, no tenga cobros y no tenga notas de
 * crédito. El número, la serie y la fecha NO cambian: es el mismo documento,
 * con otro contenido. Cambiar el número sería emitir uno nuevo y dejar un
 * hueco.
 *
 * Las líneas se reemplazan enteras en vez de actualizarse una por una: una
 * factura corregida puede tener menos líneas que antes, y actualizar dejaría
 * las sobrantes.
 */
async function editarFactura(id, datos, usuarioId) {
  return enTransaccion((cliente) => editarFacturaEn(cliente, id, datos, usuarioId));
}

/**
 * Lo mismo, dentro de una transacción que ya abrió otro: Impresión edita la
 * factura y marca la cola en la misma (reprinting/procesarImpresion.js).
 */
async function editarFacturaEn(cliente, id, datos, usuarioId) {
  const n = idValido(id);
  const items = Array.isArray(datos?.items) ? datos.items : null;
  if (!items || items.length === 0) throw httpError(400, 'La factura no tiene líneas.');

  {
    const { rows } = await cliente.query('SELECT * FROM factura WHERE id = $1 FOR UPDATE', [n]);
    const factura = rows[0];
    if (!factura) throw httpError(404, 'No existe esa factura.');
    if (factura.estado === 'anulada') throw httpError(409, `La factura ${factura.numero} está anulada.`);

    await revisarSiSePuedeTocar(cliente, factura, 'editar');
    if (datos.cicloId !== undefined) {
      const { rows: [vinculo] } = await cliente.query('SELECT ciclo_id FROM ciclo_ruta_cliente WHERE id=$1', [factura.ciclo_ruta_cliente_id || null]);
      if ((datos.cicloId == null ? null : idValido(datos.cicloId)) !== (vinculo?.ciclo_id || null)) {
        throw httpError(409, 'El ciclo de una factura emitida se conserva; no se puede reclasificar.');
      }
    }

    const usaAlegraId = items.some(i => i.productoId === undefined);
    const productos = await buscarProductos(
      cliente,
      usaAlegraId ? items.map(i => i.id) : [],
      usaAlegraId ? [] : items.map(i => i.productoId)
    );
    const porClave = new Map(productos.map(p => [String(usaAlegraId ? p.alegra_id : p.id), p]));
    const { rows: yaEnLaFactura } = await cliente.query(
      'SELECT DISTINCT producto_id FROM factura_linea WHERE factura_id = $1 AND producto_id IS NOT NULL', [n]
    );
    const armado = armarLineas(items, porClave, (i) => (usaAlegraId ? i.id : i.productoId), {
      yaFacturados: new Set(yaEnLaFactura.map(r => r.producto_id)),
      // Al editar, lo que ya estaba en la factura no se revisa; lo que se agrega, sí.
      exigirLoMostrado: !usaAlegraId
    });

    // SE PUEDE CORREGIR EL CLIENTE, que es el error más caro de una factura:
    // el documento queda a nombre de quien no compró y la deuda se le reclama
    // a esa persona. Se vuelve a copiar la ficha entera —nombre, cédula,
    // teléfono, dirección— y se recalculan la condición de venta y el
    // vencimiento, porque el plazo es del cliente nuevo, no del anterior.
    let cambioCliente = null;
    if (datos.clienteId !== undefined && datos.clienteId !== null
        && Number(datos.clienteId) !== Number(factura.cliente_id)) {
      if (factura.ciclo_ruta_cliente_id) throw httpError(409, 'La factura pertenece al recorrido de ese cliente. Anule y emita otra para corregir el destinatario.');
      const nuevo = await buscarCliente(cliente, { clienteId: datos.clienteId });
      // Corregir el cliente con un catálogo viejo lo cambiaría por OTRO.
      exigirClienteMostrado(datos, nuevo);
      const dias = Number(nuevo.plazo_dias) || 0;
      const aCredito = Boolean(nuevo.plazo_credito_id) && dias > 0;
      cambioCliente = {
        cliente_id: nuevo.id,
        cliente_nombre: nuevo.nombre,
        cliente_tipo_identificacion: nuevo.tipo_identificacion,
        cliente_identificacion: nuevo.identificacion,
        cliente_correo: nuevo.correo,
        cliente_telefono: recortar(nuevo.telefono || nuevo.celular, 60),
        cliente_direccion: [nuevo.provincia, nuevo.canton, nuevo.distrito, nuevo.barrio, nuevo.otras_senas]
          .filter(Boolean).join(' ') || null,
        condicion_venta: aCredito ? 'credito' : 'contado',
        plazo_credito_id: aCredito ? nuevo.plazo_credito_id : null,
        plazo_texto: aCredito ? nuevo.plazo_nombre : 'De contado',
        fecha_vencimiento: aCredito ? sumarDias(diaDeBase(factura.fecha), dias) : diaDeBase(factura.fecha)
      };
    }

    await cliente.query('DELETE FROM factura_linea WHERE factura_id = $1', [n]);
    for (const linea of armado.lineas) {
      const valoresLinea = COLUMNAS_LINEA.map(c => (c === 'factura_id' ? n : linea[c]));
      try {
        await cliente.query(
          `INSERT INTO factura_linea (${COLUMNAS_LINEA.join(', ')})
           VALUES (${COLUMNAS_LINEA.map((_, i) => `$${i + 1}`).join(', ')})`,
          valoresLinea
        );
      } catch (error) {
        throw explicarDatoLargo(error, 'factura_linea', COLUMNAS_LINEA, valoresLinea);
      }
    }

    // El saldo se recalcula contra lo ya pagado, que acá es cero porque una
    // factura con cobros no llega hasta aquí.
    const columnasCliente = cambioCliente ? Object.keys(cambioCliente) : [];
    const valores = [
      armado.subtotal, armado.descuento, armado.impuesto, armado.total,
      recortar(datos.observaciones, 4000),
      ...columnasCliente.map(c => cambioCliente[c]),
      n
    ];
    const puestaCliente = columnasCliente.map((c, i) => `${c} = $${i + 6}`).join(', ');

    const { rows: actualizada } = await cliente.query(
      `UPDATE factura
          SET subtotal = $1, descuento = $2, impuesto = $3, total = $4, saldo = $4,
              observaciones = COALESCE($5, observaciones)
              ${puestaCliente ? `, ${puestaCliente}` : ''},
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $${valores.length}
        RETURNING *`,
      valores
    );

    await reconciliarDocumentoEn(cliente, 'factura', n, usuarioId);
    await registrarCambio(cliente, {
      entidad: 'factura', entidadId: n, accion: 'editar',
      antes: {
        total: Number(factura.total), impuesto: Number(factura.impuesto),
        ...(cambioCliente ? { cliente: factura.cliente_nombre } : {})
      },
      despues: {
        total: armado.total, impuesto: armado.impuesto, lineas: armado.lineas.length,
        ...(cambioCliente ? { cliente: cambioCliente.cliente_nombre } : {})
      },
      usuarioId, motivo: recortar(datos.motivo, 2000)
    });

    // UPDATE conserva el vínculo; la tablet también necesita la fotografía
    // de ruta/semana de GET, aun cuando no tenía ninguna copia descargada.
    const { rows: [contexto] } = factura.ciclo_ruta_cliente_id
      ? await cliente.query(`SELECT ${ciclos.COLUMNAS_CICLO} FROM factura f ${ciclos.JOIN_CICLO('f')} WHERE f.id=$1`, [n])
      : { rows: [] };
    return { ...actualizada[0], ciclo: contexto ? ciclos.aCiclo(contexto) : null, lineas: armado.lineas };
  }
}

module.exports = {
  hoyEnCostaRica, registrarCobro, crearFactura, crearFacturaEnTransaccion, editarFactura, editarFacturaEn, anularFactura,
  armarLineas };
