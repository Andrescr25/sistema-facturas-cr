/**
 * Cotizaciones (proformas).
 *
 * SE USA EL ENDPOINT DE ALEGRA, NO UNO PROPIO
 * Alegra tiene /estimates y hace todo lo que hace falta: numeración propia,
 * PDF, y lleva el estado `unbilled` hasta que la cotización se factura.
 * Guardar cotizaciones aparte, en nuestra base, sería mantener un segundo
 * lugar donde vive lo mismo — y el día que alguien la facture desde Alegra,
 * las dos versiones dejan de coincidir sin que nadie se entere.
 *
 * LAS DOS COSAS QUE YA COSTARON CARO APRENDER
 * La estructura de `items` es idéntica a la de una factura, así que aplican
 * las mismas dos reglas:
 *
 *   1. Cada línea manda su `tax`. Alegra NO completa solo el impuesto del
 *      producto: sin ese campo la línea sale sin IVA y el documento entero
 *      queda 13% más barato. Pasó de verdad con las facturas del portal.
 *   2. `price` va SIN impuesto. Así lo guarda Alegra y así lo suma según el
 *      impuesto de la línea; mandarlo con IVA lo cobraría dos veces. El
 *      precio de `alegra_products_cache` ya viene sin impuesto, se manda tal
 *      cual.
 *
 * Una cotización equivocada no es un documento fiscal —se corrige y ya— pero
 * si el precio está mal, el cliente ya lo vio. Eso no se corrige.
 */

const { getClient } = require('../../integrations/alegra');
const { query } = require('../../../config/database');
const { precioConImpuesto } = require('../catalogo-clientes/precio');
const { NEGOCIO } = require('../../utils/marcaPdf');
const { enviarYRegistrar } = require('../envios-whatsapp/envios.service');
const { generarPdfCotizacion } = require('./cotizacion.pdf');
const { idDesdeToken, enlaceDe } = require('./enlacePublico');
const FacturacionService = require('../facturacion/facturacion.service');

const facturacion = new FacturacionService();

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Mapa porcentaje -> objeto de impuesto de Alegra.
 *
 * Mismo criterio que en los pedidos del portal: solo IVA activo y mayor a 0.
 * Alegra tiene TRES tasas de 0% distintas y un porcentaje suelto no dice cuál
 * corresponde, así que un producto exento va con `tax: []`.
 */
async function mapaImpuestos() {
  const { data } = await facturacion.getTaxes();
  const lista = Array.isArray(data) ? data : data?.data || [];
  const mapa = new Map();
  for (const t of lista) {
    if (t.status !== 'active' || t.type !== 'IVA') continue;
    const pct = Math.round(parseFloat(t.percentage) * 100) / 100;
    if (pct > 0 && !mapa.has(pct)) {
      mapa.set(pct, [{ id: t.id, percentage: pct, name: t.name, type: t.type }]);
    }
  }
  return mapa;
}

/** Los datos del producto que hacen falta para armar la línea. */
async function traerProductos(ids) {
  if (ids.length === 0) return new Map();
  const r = await query(`
    SELECT alegra_id, name, reference, price, tax_percentage, status
    FROM alegra_products_cache
    WHERE alegra_id = ANY($1::varchar[]);
  `, [ids.map(String)]);
  return new Map(r.rows.map(x => [String(x.alegra_id), x]));
}

/**
 * Convierte las líneas que manda la pantalla en los `items` que espera
 * Alegra, con su precio y su impuesto.
 *
 * VIVE APARTE PORQUE LO USAN CREAR Y EDITAR. Si cada uno lo armara por su
 * lado, bastaría con tocar uno para que editar una cotización le quitara el
 * impuesto que crear sí le puso — y nadie lo notaría hasta ver el total.
 *
 * El precio se toma del catálogo del servidor, NO de lo que mande el
 * navegador: si viajara en la petición, cualquiera podría cotizar a precio 1.
 * Es la misma regla que en los pedidos del portal.
 */
async function armarItems(lineas) {
  const productos = await traerProductos(lineas.map(l => l.alegraItemId));
  const impuestos = await mapaImpuestos();

  const noDisponibles = [];
  const items = [];

  for (const l of lineas) {
    const p = productos.get(String(l.alegraItemId));
    const cantidad = Math.max(0, Number(l.cantidad) || 0);
    if (!p || p.status !== 'active' || cantidad <= 0) {
      noDisponibles.push({ alegraItemId: l.alegraItemId, nombre: p?.name || null });
      continue;
    }

    const pct = Math.round((Number(p.tax_percentage) || 0) * 100) / 100;
    let tax = [];
    if (pct > 0) {
      tax = impuestos.get(pct);
      if (!tax) {
        throw httpError(500, `No se encontró en Alegra el impuesto de ${pct}% para "${p.name}". ` +
          `Sin eso la cotización saldría con un precio que no es el real.`);
      }
    }

    // `price` de la caché ya viene SIN impuesto (así lo guarda Alegra), así
    // que se manda tal cual.
    items.push({
      id: parseInt(l.alegraItemId, 10),
      reference: p.reference || '',
      quantity: cantidad,
      price: Number(p.price),
      tax,
      discount: 0,
      description: ''
    });
  }

  if (items.length === 0) {
    throw httpError(400, 'Ninguno de los productos está disponible para cotizar.');
  }

  return { items, noDisponibles };
}

/** La fecha, en el formato que usa Alegra, sumando días si se piden. */
function fechaISO(desde = new Date(), masDias = 0) {
  return new Date(desde.getTime() + masDias * 86400000).toISOString().split('T')[0];
}

/** Crea la cotización en Alegra. */
async function crear({ clienteId, lineas, observaciones, validezDias = 15, claveIdempotencia }) {
  if (!clienteId) throw httpError(400, 'Falta el cliente.');
  if (!Array.isArray(lineas) || lineas.length === 0) throw httpError(400, 'La cotización no tiene productos.');

  const { items, noDisponibles } = await armarItems(lineas);

  const cuerpo = {
    date: fechaISO(),
    // Hasta cuándo vale el precio cotizado.
    dueDate: fechaISO(new Date(), Math.max(1, Number(validezDias) || 15)),
    client: parseInt(clienteId, 10),
    items,
    observations: observaciones || undefined
  };

  // Idempotencia: si el navegador reenvía —doble clic, respuesta perdida— no
  // se crea una segunda cotización con otro número.
  if (claveIdempotencia) {
    const previo = await query(
      `SELECT alegra_invoice_id, numero_factura FROM factura_intento WHERE clave = $1 AND estado = 'creada';`,
      [claveIdempotencia]
    );
    if (previo.rows.length > 0) {
      return {
        id: previo.rows[0].alegra_invoice_id,
        numero: previo.rows[0].numero_factura,
        yaExistia: true,
        noDisponibles
      };
    }
  }

  const client = getClient();
  const creada = await client.request('POST', '/estimates', cuerpo);

  const numero = creada?.numberTemplate?.fullNumber || String(creada?.number ?? creada?.id ?? '');

  if (claveIdempotencia) {
    await query(`
      INSERT INTO factura_intento (clave, estado, alegra_invoice_id, numero_factura)
      VALUES ($1, 'creada', $2, $3)
      ON CONFLICT (clave) DO UPDATE SET
        estado = 'creada', alegra_invoice_id = EXCLUDED.alegra_invoice_id,
        numero_factura = EXCLUDED.numero_factura, actualizado_en = CURRENT_TIMESTAMP;
    `, [claveIdempotencia, String(creada?.id || ''), numero]);
  }

  return { id: creada?.id, numero, total: Number(creada?.total) || 0, yaExistia: false, noDisponibles };
}

/**
 * Las cotizaciones, de la más nueva a la más vieja.
 *
 * EL TOPE ES 30 Y LO PONE ALEGRA. Pedir más devuelve 400 con
 * "El límite de cotizaciones para retornar debe estar entre 0 y 30" — no es
 * el tope de las facturas, que sí acepta más. Con 40 la pantalla salía en
 * blanco con un error genérico.
 */
const TOPE_ALEGRA = 30;

async function listar({ limite = TOPE_ALEGRA } = {}) {
  const client = getClient();
  const data = await client.request('GET', '/estimates', {
    limit: Math.min(Number(limite) || TOPE_ALEGRA, TOPE_ALEGRA),
    order_field: 'id',
    order_direction: 'DESC'
  });
  const lista = Array.isArray(data) ? data : [];
  return lista.map(e => ({
    id: e.id,
    enlacePublico: enlaceDe(e.id),
    numero: e.numberTemplate?.fullNumber || String(e.number ?? e.id),
    fecha: e.date,
    vence: e.dueDate,
    // `unbilled` es como Alegra marca la que todavía no se facturó.
    facturada: e.status !== 'unbilled',
    estado: e.status,
    clienteNombre: e.client?.name || null,
    clienteId: e.client?.id || null,
    total: Number(e.total) || 0,
    observaciones: e.observations || null
  }));
}

/**
 * Busca clientes en Alegra por lo que se va escribiendo.
 *
 * NO SE BAJA LA LISTA ENTERA. El endpoint de contactos que usa el resto del
 * sistema recorre las 1.600 fichas de la cuenta página por página: se midió
 * en 31 segundos, con el modal abierto y en blanco todo ese rato. Alegra
 * acepta `query` y contesta en poco más de un segundo.
 *
 * Además así aparece el cliente que se dio de alta hoy. La lista del catálogo
 * del agente solo tiene a los que ya compraron, y una cotización es
 * justamente lo que se le manda a alguien que todavía no compró.
 */
async function buscarClientes(termino) {
  const t = String(termino || '').trim();
  // Con una letra devuelve medio directorio y no ayuda a elegir.
  if (t.length < 2) return [];

  const data = await getClient().request('GET', '/contacts', { query: t, limit: 15 });
  const lista = Array.isArray(data) ? data : [];

  return lista
    // Un contacto de Alegra puede ser proveedor, cliente o ambos. A un
    // proveedor no se le cotiza.
    .filter(c => (c.type || []).includes('client') && c.status !== 'inactive')
    .map(c => ({
      id: c.id,
      nombre: c.name,
      // Muchas fichas tienen 100000000 de cédula; se manda igual porque a
      // veces es lo único que distingue dos nombres parecidos.
      identificacion: c.identification || null
    }));
}

/**
 * El catálogo entero, en la forma mínima que necesita el modal.
 *
 * SE MANDA COMPLETO A PROPÓSITO. La pantalla del catálogo de clientes pagina
 * de 120 en 120, y con eso el buscador del modal solo veía los primeros 120
 * de 2.010 productos: escribir la referencia "G22" no devolvía nada y parecía
 * que el producto no existía. Son ~160 KB de una consulta local; el catálogo
 * del agente ya se baja entero por la misma razón.
 *
 * El precio va CON impuesto, que es el que ve el cliente y el que tiene que
 * cuadrar con el total del PDF de Alegra. El precio que termina en la
 * cotización no sale de acá: lo vuelve a leer `crear` de la misma tabla.
 */
async function catalogoParaCotizar() {
  const r = await query(`
    SELECT alegra_id, name, reference, price, tax_percentage
    FROM alegra_products_cache
    WHERE status = 'active'
    ORDER BY name;
  `);
  return r.rows.map(p => ({
    id: String(p.alegra_id),
    nombre: p.name,
    referencia: p.reference || '',
    precio: precioConImpuesto(p.price, p.tax_percentage)
  }));
}

async function detalle(id) {
  const client = getClient();
  const e = await client.request('GET', `/estimates/${id}`);
  if (!e?.id) throw httpError(404, 'Cotización no encontrada.');
  return {
    id: e.id,
    numero: e.numberTemplate?.fullNumber || String(e.number ?? e.id),
    fecha: e.date,
    vence: e.dueDate,
    facturada: e.status !== 'unbilled',
    estado: e.status,
    clienteNombre: e.client?.name || null,
    clienteId: e.client?.id || null,
    total: Number(e.total) || 0,
    observaciones: e.observations || null,
    // El enlace para el cliente. Lo arma el servidor porque la firma se
    // calcula con el secreto de la aplicación: la pantalla no puede —ni
    // debe— conocerlo.
    enlacePublico: enlaceDe(e.id),
    lineas: (e.items || []).map(i => ({
      alegraItemId: i.id,
      nombre: i.name,
      referencia: i.reference || null,
      cantidad: Number(i.quantity),
      precio: Number(i.price),
      taxPercentage: (i.tax || []).reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0),
      total: Number(i.total ?? Number(i.quantity) * Number(i.price))
    }))
  };
}

/**
 * Cambia una cotización que todavía no se facturó.
 *
 * SE MANDA EL DOCUMENTO ENTERO, NO EL CAMBIO. Alegra prohíbe PATCH (403) y
 * solo acepta PUT, que reemplaza. Por eso la pantalla manda siempre las
 * líneas completas: mandar solo las que cambiaron borraría el resto.
 *
 * La fecha de emisión NO se toca. Es cuándo se le pasó el precio al cliente,
 * y moverla al editar haría parecer que una cotización de la semana pasada
 * es de hoy. Lo que sí se puede correr es hasta cuándo vale.
 *
 * Los precios se vuelven a leer del catálogo, así que editar una cotización
 * vieja la actualiza a los precios de hoy. Es lo que se espera al reabrirla
 * para cambiarle algo; si lo que se quiere es sostener el precio viejo, se
 * factura sin editar (facturar sí respeta el precio cotizado).
 */
async function editar(id, { clienteId, lineas, observaciones, vence }) {
  const actual = await detalle(id);

  // Una cotización facturada ya tiene una factura que la copia: cambiarla
  // dejaría los dos documentos diciendo cosas distintas, y la factura es la
  // que vale ante Hacienda.
  if (actual.facturada) {
    throw httpError(400, `La cotización ${actual.numero} ya se facturó y no se puede cambiar.`);
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw httpError(400, 'La cotización no puede quedar sin productos.');
  }

  const { items, noDisponibles } = await armarItems(lineas);

  const cuerpo = {
    date: actual.fecha,      // la de emisión no se mueve
    dueDate: vence || actual.vence || fechaISO(new Date(), 15),
    client: parseInt(clienteId || actual.clienteId, 10),
    items,
    observations: observaciones ?? actual.observaciones ?? undefined
  };

  const guardada = await getClient().request('PUT', `/estimates/${id}`, cuerpo);

  // NO se devuelve el total. Alegra contesta el PUT con el total ANTERIOR:
  // se editó una de ₡231 a ₡4.355 y la respuesta seguía diciendo 231. Quien
  // necesite el total actualizado que vuelva a pedir el detalle; devolver el
  // de la respuesta sería mostrarle al vendedor un número que ya no existe.
  return {
    id: guardada?.id ?? id,
    numero: guardada?.numberTemplate?.fullNumber || String(guardada?.number ?? id),
    noDisponibles
  };
}

/**
 * El PDF de la cotización, con el formato de la casa.
 *
 * ANTES SE MANDABA EL DE ALEGRA. Alegra genera uno propio y era el que veía
 * el cliente: se ve viejo y no lleva nada de la marca. Para una cotización
 * —que muchas veces es lo PRIMERO que un cliente nuevo ve del negocio— ese
 * papel es la carta de presentación, así que se arma acá (cotizacion.pdf.js).
 *
 * Se genera en el momento y no se guarda: los datos salen de Alegra, que es
 * donde vive la cotización, y así el PDF siempre refleja lo que hay ahora.
 */
async function pdf(id) {
  const cot = await detalle(id);
  return { archivo: await generarPdfCotizacion(cot), numero: cot.numero, cot };
}

/**
 * Le manda la cotización al cliente por WhatsApp, con el PDF adjunto.
 *
 * El texto lo escribe quien manda (llega desde la pantalla, editable). El
 * archivo no se delega: se arma acá con los datos que están en Alegra, no con
 * lo que diga el navegador.
 */
async function enviarPorWhatsApp(id, { telefono, mensaje, usuarioId }) {
  const { archivo, cot } = await pdf(id);

  return enviarYRegistrar({
    tipo: 'cotizacion',
    referencia: cot.numero,
    alegraContactId: cot.clienteId,
    telefono,
    mensaje,
    pdf: archivo,
    nombreArchivo: `cotizacion-${cot.numero}.pdf`,
    usuarioId
  });
}

/**
 * La cotización tal como la ve el cliente en el navegador.
 *
 * Es lo mismo que hay en el PDF más la foto de cada producto, que es lo que
 * el PDF no puede dar: quien no conoce el producto lee "ROLLO BOLSA GDE.1X41
 * BASURA EZ" y no sabe qué le están ofreciendo.
 *
 * SE DEVUELVE LO JUSTO. Esta ruta es pública —la abre quien tenga el enlace—
 * así que sale solo lo que ya está en el PDF que el cliente recibió: nombre,
 * productos, precios y fechas. Nada de ids internos, estados ni el resto de
 * la ficha del cliente.
 */
async function publicaPorToken(token) {
  const id = idDesdeToken(token);
  if (!id) throw httpError(404, 'Ese enlace no es válido.');

  const cot = await detalle(id);

  const fotos = new Map();
  const ids = cot.lineas.map(l => String(l.alegraItemId)).filter(Boolean);
  if (ids.length > 0) {
    const r = await query(
      `SELECT alegra_id, image_url FROM alegra_products_cache WHERE alegra_id = ANY($1::varchar[]);`,
      [ids]
    );
    r.rows.forEach(x => { if (x.image_url) fotos.set(String(x.alegra_id), x.image_url); });
  }

  const hoy = new Date().toISOString().split('T')[0];

  return {
    numero: cot.numero,
    fecha: cot.fecha,
    vence: cot.vence,
    // Se muestra igual si venció, con el aviso: el cliente puede abrir el
    // enlace un día tarde y encontrarse una página muerta sería peor que
    // decirle que los precios ya no rigen.
    vencida: Boolean(cot.vence && cot.vence < hoy),
    facturada: cot.facturada,
    cliente: cot.clienteNombre,
    observaciones: cot.observaciones,
    negocio: NEGOCIO,
    lineas: cot.lineas.map(l => ({
      nombre: l.nombre,
      referencia: l.referencia,
      cantidad: l.cantidad,
      precio: l.precio,
      taxPercentage: l.taxPercentage,
      // El precio que el cliente paga por unidad, ya con impuesto.
      precioConIva: Math.round(l.precio * (1 + (Number(l.taxPercentage) || 0) / 100) * 100) / 100,
      importe: Math.round(l.cantidad * l.precio * 100) / 100,
      imagen: fotos.get(String(l.alegraItemId)) || null
    }))
  };
}

/**
 * Borra una cotización que no se va a facturar.
 *
 * SE BORRA DE VERDAD, EN ALEGRA. Una cotización no es documento fiscal: no
 * hay nada que conservar de una que nunca se vendió, y dejarlas ahí llena la
 * pantalla de cosas muertas hasta que no se distingue lo vigente.
 *
 * UNA YA FACTURADA NO SE BORRA. Su factura existe y la referencia (el
 * "Cotización N" que va en las observaciones de la venta) apuntaría a algo
 * que ya no está: quien revise esa factura después no tendría cómo saber de
 * dónde salieron esos precios.
 */
async function eliminar(id) {
  const cot = await detalle(id);

  if (cot.facturada) {
    throw httpError(409,
      `La cotización ${cot.numero} ya se facturó y no se puede borrar. ` +
      `Su factura la referencia, y sin ella no habría cómo saber de dónde salieron esos precios.`);
  }

  await getClient().request('DELETE', `/estimates/${id}`);

  // El registro del envío por WhatsApp NO se borra: si se le mandó al
  // cliente, eso pasó, y el día que pregunte por "la cotización que me
  // mandaron" hay que poder decir cuándo salió y a qué número.
  return { borrada: true, numero: cot.numero, cliente: cot.clienteNombre };
}

/**
 * Convierte una cotización aceptada en factura de venta.
 *
 * Se arma la factura con las MISMAS líneas y los MISMOS precios que vio el
 * cliente, no con los precios de hoy: si subieron entre la cotización y la
 * aceptación, cobrarle de más es romper lo que se le prometió. Para eso está
 * la fecha de vencimiento de la cotización.
 *
 * Pasa por facturacion.createInvoice con clave `cotizacion-<id>`, así que
 * facturarla dos veces devuelve la misma factura en vez de crear otra.
 */
async function facturar(id, { aunqueVencida = false } = {}) {
  const cot = await detalle(id);

  if (cot.facturada) {
    throw httpError(400, `Esa cotización ya se facturó (estado "${cot.estado}").`);
  }
  if (cot.lineas.length === 0) {
    throw httpError(400, 'Esa cotización no tiene líneas.');
  }

  // UNA COTIZACIÓN VENCIDA NO SE FACTURA DE UN CLIC.
  // Facturar usa los precios COTIZADOS, que es lo correcto mientras el
  // precio siga vigente. Pasada la fecha deja de serlo: en la cuenta hay
  // cotizaciones de 2024 por más de un millón de colones, y un clic distraído
  // vendería a precios de hace dos años. Se puede hacer igual —a veces se le
  // sostiene el precio a un cliente— pero diciéndolo.
  const hoyISO = new Date().toISOString().split('T')[0];
  if (!aunqueVencida && cot.vence && cot.vence < hoyISO) {
    throw httpError(409,
      `La cotización ${cot.numero} venció el ${cot.vence} y sus precios son de esa fecha. ` +
      `Si se factura igual, se le cobra al cliente el precio que se le prometió entonces.`);
  }

  const impuestos = await mapaImpuestos();
  const hoy = new Date().toISOString().split('T')[0];

  const facturaData = {
    date: hoy,
    dueDate: hoy,
    client: parseInt(cot.clienteId, 10),
    items: cot.lineas.map(l => {
      const pct = Math.round((Number(l.taxPercentage) || 0) * 100) / 100;
      let tax = [];
      if (pct > 0) {
        tax = impuestos.get(pct);
        if (!tax) {
          throw httpError(500, `No se encontró en Alegra el impuesto de ${pct}% para "${l.nombre}".`);
        }
      }
      return {
        id: parseInt(l.alegraItemId, 10),
        reference: l.referencia || '',
        quantity: l.cantidad,
        price: l.precio,     // el precio COTIZADO, no el de hoy
        tax,
        discount: 0,
        description: ''
      };
    }),
    observations: `Cotización ${cot.numero}`,
    status: 'open'
  };

  const resultado = await facturacion.createInvoice(facturaData, `cotizacion-${id}`);
  const creada = resultado?.data;
  if (!creada?.id) throw httpError(502, 'Alegra no devolvió la factura creada.');

  return {
    facturado: true,
    alegraInvoiceId: String(creada.id),
    numeroFactura: creada.numberTemplate?.fullNumber || String(creada.id),
    yaExistia: Boolean(resultado.yaExistia)
  };
}

module.exports = {
  crear, editar, listar, detalle, facturar, eliminar, pdf, enviarPorWhatsApp,
  publicaPorToken, enlaceDe,
  buscarClientes, catalogoParaCotizar, mapaImpuestos, TOPE_ALEGRA
};
