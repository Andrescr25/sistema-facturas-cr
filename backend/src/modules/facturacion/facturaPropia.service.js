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
 * 5. SE SIGUE ALIMENTANDO LA TABLA VIEJA `facturas`. De ahí leen Facturas en
 *    Bodega y Faltantes. Cuando esos módulos lean `factura` (sección 11 del
 *    checklist), esta escritura se retira.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, texto, numero, validar, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { tomarConsecutivo } = require('./consecutivo');
const idempotencia = require('./idempotencia');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

const CAMPOS_FACTURA = {
  fecha: { etiqueta: 'Fecha', validar: texto(10, { patron: /^\d{4}-\d{2}-\d{2}$/, mensajePatron: 'va como AAAA-MM-DD' }) },
  observaciones: { etiqueta: 'Observaciones', validar: texto(4000) },
  anotaciones: { etiqueta: 'Anotaciones', validar: texto(4000) }
};

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Recorta un texto al largo de su columna.
 *
 * ES UNA FUNCIÓN PROPIA, Y NO EL `texto` DE utils/validacion, A PROPÓSITO. Ese
 * se usa al revés: `texto(largo)` DEVUELVE el validador, y recién entonces se
 * le pasa el valor. Escribirlo como `texto(valor, largo)` no falla ni avisa —
 * devuelve la función, que al guardarse se convierte en su propio código
 * fuente: 294 caracteres que reventaban tres columnas a la vez. Los archivos
 * de traducción (desdeAlegra) tienen su propio `texto(v, max)` con el valor
 * primero, y esa colisión de nombres fue justo la trampa.
 */
function recortar(valor, largo) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s.slice(0, largo) : null;
}

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
  'condicion_venta', 'plazo_credito_id', 'plazo_texto', 'metodo_pago_id', 'metodo_pago_texto',
  'moneda', 'subtotal', 'descuento', 'impuesto', 'total', 'total_pagado', 'saldo',
  'observaciones', 'anotaciones', 'vendedor', 'actividad_economica', 'creado_por'
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
            c.activo, c.plazo_credito_id, p.nombre AS plazo_nombre, p.dias AS plazo_dias
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
            p.activo, p.impuesto_id, i.tarifa
       FROM producto p
       LEFT JOIN impuesto i ON i.id = p.impuesto_id
      WHERE ${porAlegra ? 'p.alegra_id = ANY($1::varchar[])' : 'p.id = ANY($1::int[])'}`,
    [porAlegra ? alegraItemIds.map(String) : productoIds.map(Number)]
  );
  return rows;
}

/**
 * Arma las líneas con la tarifa del maestro y calcula los totales.
 *
 * El descuento viene en porcentaje, como lo manda la pantalla, y se guarda
 * también en monto para que sumar la factura no exija rehacer la regla de tres
 * en cada consulta.
 */
function armarLineas(items, productosPorClave, claveDe) {
  const lineas = [];
  let subtotal = 0;
  let descuentoTotal = 0;
  let impuestoTotal = 0;

  items.forEach((item, indice) => {
    const clave = claveDe(item);
    const producto = productosPorClave.get(String(clave));
    if (!producto) throw httpError(400, `No se encontró el producto ${clave}.`);
    if (!producto.activo) throw httpError(400, `${producto.nombre} está inactivo: no se puede facturar.`);

    const cantidad = Number(item.quantity ?? item.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw httpError(400, `${producto.nombre}: la cantidad tiene que ser mayor que cero.`);
    }
    const precio = Number(item.price ?? item.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      throw httpError(400, `${producto.nombre}: el precio no es válido.`);
    }

    const porcentajeDescuento = Number(item.discount ?? item.descuento) || 0;
    if (porcentajeDescuento < 0 || porcentajeDescuento > 100) {
      throw httpError(400, `${producto.nombre}: el descuento va entre 0 y 100.`);
    }

    const bruto = cantidad * precio;
    const descuentoMonto = dinero((bruto * porcentajeDescuento) / 100);
    const base = dinero(bruto - descuentoMonto);
    // La tarifa del PRODUCTO, no la que mande la pantalla.
    const tarifa = producto.tarifa === null || producto.tarifa === undefined ? 0 : Number(producto.tarifa);
    const impuestoMonto = dinero((base * tarifa) / 100);

    subtotal += base;
    descuentoTotal += descuentoMonto;
    impuestoTotal += impuestoMonto;

    lineas.push({
      numero_linea: indice + 1,
      producto_id: producto.id,
      nombre: producto.nombre,
      referencia: producto.referencia,
      // Lo que el cajero escribió para esta línea; si no escribió nada, la del producto.
      descripcion: recortar(item.description ?? item.descripcion, 2000) || producto.descripcion,
      cabys: producto.cabys,
      unidad: producto.unidad,
      cantidad,
      precio_unitario: precio,
      descuento_porcentaje: porcentajeDescuento,
      descuento_monto: descuentoMonto,
      impuesto_id: producto.impuesto_id,
      tarifa,
      impuesto_monto: impuestoMonto,
      total: dinero(base + impuestoMonto),
      alegra_item_id: producto.alegra_id
    });
  });

  return {
    lineas,
    subtotal: dinero(subtotal),
    descuento: dinero(descuentoTotal),
    impuesto: dinero(impuestoTotal),
    total: dinero(subtotal + impuestoTotal)
  };
}

/** Suma días a una fecha AAAA-MM-DD sin arrastrar husos horarios. */
function sumarDias(fecha, dias) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + Number(dias || 0));
  return base.toISOString().slice(0, 10);
}

async function guardarFactura(cliente, { datos, clienteFacturado, armado, usuarioId }) {
  const numeracion = await tomarConsecutivo(cliente, 'factura', { electronica: false });

  const fecha = datos.fecha || new Date().toISOString().slice(0, 10);
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
    creado_por: usuarioId ?? null
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

  await registrarCambio(cliente, {
    entidad: 'factura', entidadId: factura.id, accion: 'crear',
    despues: { numero: factura.numero, cliente: factura.cliente_nombre, total: Number(factura.total), lineas: armado.lineas.length },
    usuarioId
  });

  // Facturas en Bodega y Faltantes todavía leen la tabla vieja.
  await cliente.query(
    `INSERT INTO facturas (numero_factura, alegra_id, cliente_nombre, cliente_email,
                           fecha_emision, semana, mes, ano, total, estado_bodega)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente')
     ON CONFLICT (numero_factura) DO NOTHING`,
    [
      factura.numero, 0, factura.cliente_nombre, factura.cliente_correo,
      fecha, semanaDe(fecha), Number(fecha.slice(5, 7)), Number(fecha.slice(0, 4)), armado.total
    ]
  );

  return { ...factura, lineas: armado.lineas };
}

/** La semana del año, como la calculaba el registro viejo. */
function semanaDe(fecha) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  const inicio = new Date(Date.UTC(a, 0, 1));
  const dias = Math.floor((dia - inicio) / 86400000);
  return Math.max(1, Math.ceil((dias + inicio.getUTCDay() + 1) / 7));
}

/**
 * @param {object} datos  lo que manda la pantalla: cliente, líneas, fecha…
 * @param {number} usuarioId
 * @param {{clave?: string|null}} opciones  clave de idempotencia
 */
async function crearFactura(datos, usuarioId, { clave = null } = {}) {
  const cabecera = validar(CAMPOS_FACTURA, datos, { crear: false });
  const items = Array.isArray(datos.items) ? datos.items : [];
  if (items.length === 0) throw httpError(400, 'La factura no tiene líneas.');
  if (datos.client === undefined && datos.clienteId === undefined) {
    throw httpError(400, 'Falta el cliente.');
  }

  if (clave) {
    const reserva = await idempotencia.reservar(clave, datos);
    if (!reserva.seguir) {
      return {
        yaExistia: true,
        id: reserva.yaCreada.id,
        numero: reserva.yaCreada.numero,
        mensaje: 'Esa factura ya estaba creada.'
      };
    }
  }

  try {
    const factura = await enTransaccion(async (cliente) => {
      const clienteFacturado = await buscarCliente(cliente, {
        clienteId: datos.clienteId,
        alegraClienteId: datos.client
      });

      const usaAlegraId = datos.items.some(i => i.productoId === undefined);
      const productos = await buscarProductos(
        cliente,
        usaAlegraId ? items.map(i => i.id) : [],
        usaAlegraId ? [] : items.map(i => i.productoId)
      );
      const porClave = new Map(productos.map(p => [String(usaAlegraId ? p.alegra_id : p.id), p]));
      const armado = armarLineas(items, porClave, (i) => (usaAlegraId ? i.id : i.productoId));

      return guardarFactura(cliente, {
        datos: { ...datos, ...cabecera },
        clienteFacturado,
        armado,
        usuarioId
      });
    });

    if (clave) {
      await idempotencia.marcarCreada(clave, {
        id: factura.id,
        numberTemplate: { fullNumber: factura.numero }
      });
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

module.exports = { crearFactura, armarLineas, sumarDias, semanaDe };
