/**
 * El PDF de una factura, armado por nosotros.
 *
 * POR QUÉ NO SE USA EL DE ALEGRA
 * Hasta hoy el papel que recibía el cliente lo generaba Alegra, y mientras eso
 * siga así no se puede facturar sin Alegra: quien vende en el mostrador
 * necesita entregar algo impreso. Este archivo es lo que desata ese nudo.
 *
 * Comparte la paleta, el logo y las fuentes con la cotización y con la orden
 * de compra (utils/marcaPdf.js), así los tres papeles que salen del negocio se
 * ven de la misma familia.
 *
 * DECISIONES QUE NO SON DE GUSTO
 *
 *   · UNA FACTURA ANULADA LO GRITA. Sello diagonal en cada página y el motivo
 *     bajo el número. Un papel anulado que se ve igual que uno válido es como
 *     se termina cobrando dos veces lo mismo.
 *
 *   · EL IMPUESTO VA DESGLOSADO POR TARIFA. Acá se vende al 1 %, 2 %, 4 % y
 *     13 % en la misma factura; una sola línea de "IVA" esconde esa mezcla. Ya
 *     apareció el caso de 82 líneas al 1 % registradas al 4 %: si el papel no
 *     separa las tarifas, ese error no lo ve nadie.
 *
 *   · LA COLUMNA DE DESCUENTO SOLO SALE SI ALGUNA LÍNEA LO TRAE. Una columna
 *     vacía en todas las facturas es ruido que le quita ancho al nombre del
 *     producto, que es lo que de verdad se lee.
 *
 *   · LOS PRECIOS Y LOS IMPORTES VAN SIN IMPUESTO en la tabla, y el impuesto
 *     en los totales, igual que la cotización: es como lo lee un negocio que
 *     revende, y calza con la cotización que recibió antes. La columna de
 *     importes suma exactamente el Subtotal, y cantidad × precio da el
 *     importe de la línea: si una de las dos cosas no se cumple, el cliente
 *     saca la calculadora en el mostrador y tiene razón.
 *
 *   · Solo una respuesta fiscal aceptada muestra título y consecutivo
 *     electrónicos. La foto del emisor procede del XML firmado.
 *
 * LA NOTA DE CRÉDITO SE DIBUJA CON ESTE MISMO ARCHIVO (2026-10-11): mismo
 * emisor, misma tabla, mismo desglose del impuesto. Lo que cada papel dice
 * distinto viene en `papel` (ver `papelDeFactura`); el de la nota se arma en
 * notaCredito.pdf.js.
 */

const fs = require('fs');
const {
  MARCA, LOGO, LOGO_RATIO, NEGOCIO,
  registrarFuentes, colones, colonesExacto, fechaLarga, medioDePago
} = require('../../utils/marcaPdf');
const { montoEnLetras } = require('../../utils/numeroALetras');
// Lo que agrega el papel de un comprobante aceptado (lo pide Hacienda).
const fiscalPdf = require('./papelFiscal.pdf');

const M = 44;                 // margen
const PIE_RESERVADO = 56;

const num = (v) => Number(v) || 0;

/**
 * Lo que cuesta una línea antes del impuesto: cantidad × precio, menos el
 * descuento. Es lo que va en la columna IMPORTE; la suma de todas es el
 * Subtotal menos el Descuento de los totales.
 */
function importeLinea(l) {
  return num(l.cantidad) * num(l.precioUnitario) - num(l.descuentoMonto);
}

/**
 * El detalle que alguien escribió para ESTA línea al facturar ("ENTREGADO",
 * "OJO CERRADO, VIGILADO X CÁMARAS"), o null.
 *
 * El papel no lo traía: la pantalla lo llama "Detalle en la factura" y la
 * factura salía sin él (287 líneas escritas a mano entre julio y octubre de
 * 2026; Alegra sí las imprimía). Cuando nadie escribe nada el servidor
 * guarda ahí la descripción del producto, que en este catálogo es el nombre
 * repetido: eso no se imprime dos veces.
 */
function detalleLinea(l) {
  const limpio = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const detalle = limpio(l.descripcion);
  if (!detalle || detalle.toLowerCase() === limpio(l.nombre).toLowerCase()) return null;
  return detalle;
}

/**
 * La base imponible: la suma de la columna de importes, que ya trae el
 * descuento restado. Con descuento se saca del total, porque las facturas
 * copiadas de Alegra guardan el subtotal ANTES del descuento y las propias,
 * después; sin descuento, es el guardado.
 */
function subtotalMostrado(f) {
  return num(f.descuento) > 0 ? num(f.total) - num(f.impuesto) : num(f.subtotal);
}

/** El Subtotal que se imprime: lo de antes del descuento (base + descuento). */
function subtotalAntesDeDescuento(f) {
  return Math.round((subtotalMostrado(f) + num(f.descuento)) * 100) / 100;
}

/** "13 %", "1 %", "0 %" — sin decimales cuando no los necesita. */
function tarifaTexto(t) {
  const v = num(t);
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} %`;
}

/**
 * Las columnas, con su ancho. `conDescuento` cambia el reparto.
 *
 * El impuesto lleva su MONTO y no solo el porcentaje: es lo que pide una
 * factura y lo que el contador necesita para cuadrar sin recalcular línea por
 * línea.
 */
function columnas(ancho, conDescuento) {
  const anchoDesc = conDescuento ? 54 : 0;
  const fijas = 20 + 36 + 68 + anchoDesc + 64 + 76;
  const x = (desde) => M + ancho - desde;
  return {
    conDescuento,
    num:      { x: M, w: 20, titulo: '#' },
    desc:     { x: M + 20, w: ancho - fijas, titulo: 'PRODUCTO / SERVICIO' },
    cant:     { x: x(36 + 68 + anchoDesc + 64 + 76), w: 36, titulo: 'CANT.' },
    precio:   { x: x(68 + anchoDesc + 64 + 76), w: 68, titulo: 'PRECIO UNIT.' },
    descuento:{ x: x(anchoDesc + 64 + 76), w: anchoDesc, titulo: 'DESCUENTO' },
    iva:      { x: x(64 + 76), w: 64, titulo: 'IMPUESTO' },
    total:    { x: x(76), w: 76, titulo: 'TOTAL LÍNEA' }
  };
}

/** Los datos del emisor: los de la configuración, con la marca de respaldo. */
function datosEmisor(empresa) {
  if (!empresa) return { ...NEGOCIO, actividad: null, terminos: null };
  const direccion = [empresa.provincia, empresa.canton, empresa.distrito, empresa.barrio, empresa.otras_senas]
    .filter(Boolean).join(' ');
  return {
    nombre: empresa.nombre || NEGOCIO.nombre,
    cedula: empresa.identificacion || NEGOCIO.cedula,
    tipoCedula: empresa.tipo_identificacion === 'CJ' ? 'Cédula Jurídica' : 'Cédula Física',
    telefono: empresa.telefono || NEGOCIO.telefono,
    email: empresa.correo || NEGOCIO.email,
    direccion: direccion || NEGOCIO.direccion,
    actividad: empresa.actividad_economica
      ? `${empresa.actividad_economica}${empresa.actividad_economica_nombre ? ` - ${empresa.actividad_economica_nombre}` : ''}`
      : null,
    terminos: empresa.terminos_pago || null
  };
}

/**
 * LO QUE CAMBIA DE UN PAPEL A OTRO: el título, los datos de arriba a la
 * derecha, las condiciones junto al cliente y la nota del pie. Todo lo demás
 * —emisor, tabla, totales— se dibuja igual para una factura, un tiquete o
 * una nota de crédito.
 *
 *   fiscal        el comprobante aceptado por Hacienda, o null
 *   titulo        qué documento es
 *   numeroPropio  cómo se llama el número interno cuando arriba va el fiscal
 *   datos         [etiqueta, valor] bajo el número
 *   condiciones   [etiqueta, valor] junto al cliente (sin valor, no sale)
 *   observacion   { titulo, texto } a la izquierda de los totales, o null
 *   terminos      si lleva las cuentas por donde se paga
 */
function papelDeFactura(f) {
  const fiscal = (f.electronica && f.haciendaEstado === 'aceptada' && f.fiscal) || null;
  const condicion = f.condicionVenta === 'credito' ? (f.plazo || 'Crédito') : 'Contado';
  return {
    fiscal,
    titulo: fiscal
      ? (fiscal.tipo === '04' ? 'TIQUETE ELECTRÓNICO' : 'FACTURA ELECTRÓNICA')
      : f.tipoDocumento === 'tiquete' ? 'TIQUETE' : 'FACTURA DE VENTA',
    numeroPropio: 'Venta:',
    datos: [
      ['Fecha de creación:', fechaLarga(f.fecha)],
      ...(f.fechaVencimiento ? [['Fecha de vencimiento:', fechaLarga(f.fechaVencimiento)]] : [])
    ],
    condiciones: [
      ['Condición:', fiscal ? fiscalPdf.condicionFiscal(fiscal, condicion) : condicion],
      ['Moneda:', f.moneda || 'CRC'],
      ['Medio de pago:', fiscal ? fiscalPdf.medioFiscal(fiscal, medioDePago(f.metodoPago)) : medioDePago(f.metodoPago)]
    ],
    observacion: f.observaciones ? { titulo: 'NOTA', texto: f.observaciones } : null,
    terminos: true
  };
}

/**
 * La letra chica del pie. Un comprobante aceptado NO puede decir que "no
 * constituye un comprobante electrónico": lo decía, porque la frase se
 * escribió cuando todo era factura de venta y nadie la volvió a mirar.
 */
function leyenda(papel, emisor) {
  return papel.fiscal
    ? 'Representación impresa de un comprobante electrónico aceptado por el Ministerio de Hacienda. ' +
      'El comprobante con validez fiscal es el XML firmado, que se identifica con la clave de arriba.'
    : `Documento emitido por ${emisor.nombre}. No constituye un comprobante electrónico ` +
      'autorizado por el Ministerio de Hacienda. Consérvelo para cualquier reclamo.';
}

/**
 * El encabezado: quién emite a la izquierda, qué documento es a la derecha.
 *
 * Los datos del emisor van COMPLETOS arriba y no escondidos en el pie: el
 * nombre, la cédula, la dirección, el contacto y la actividad económica son
 * parte de lo que hace válida una factura, no una firma decorativa.
 */
function encabezado(doc, f, ancho, F, emisor, papel) {
  let cursor = M;
  const anchoIzq = ancho - 250;

  if (fs.existsSync(LOGO)) {
    const anchoLogo = 128;
    doc.image(LOGO, M, cursor - 4, { width: anchoLogo });
    cursor += anchoLogo * LOGO_RATIO + 6;
  } else {
    doc.font(F.negrita).fontSize(17).fillColor(MARCA.naranja).text('TACHI', M, cursor);
    cursor += 24;
  }

  doc.font(F.negrita).fontSize(11).fillColor(MARCA.tinta)
    .text(emisor.nombre, M, cursor, { width: anchoIzq });
  cursor += 14;

  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.gris);
  const lineas = [
    `${emisor.tipoCedula} ${emisor.cedula}`,
    emisor.direccion,
    [emisor.email, emisor.telefono].filter(Boolean).join('  ·  ')
  ].filter(Boolean);
  for (const linea of lineas) {
    doc.text(linea, M, cursor, { width: anchoIzq });
    cursor += doc.heightOfString(linea, { width: anchoIzq });
  }

  if (emisor.actividad) {
    cursor += 2;
    doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.gris)
      .text('Actividad económica: ', M, cursor, { width: anchoIzq, continued: true })
      .font(F.normal).text(emisor.actividad);
    cursor += doc.heightOfString(`Actividad económica: ${emisor.actividad}`, { width: anchoIzq });
  }

  // ---- Derecha: qué documento es ----
  const anulada = f.estado === 'anulada';
  const { fiscal } = papel;
  const xDer = doc.page.width - M - 240;

  // El título se achica hasta caber en un renglón: "NOTA DE CRÉDITO
  // ELECTRÓNICA" no entra a 16 puntos, y partido en dos pisaba el número.
  doc.font(F.negrita).fontSize(16);
  const cuerpoTitulo = Math.min(16, Math.floor(160 * 240 / doc.widthOfString(papel.titulo)) / 10);
  doc.fontSize(cuerpoTitulo).fillColor(anulada ? MARCA.grisSuave : MARCA.tinta)
    .text(papel.titulo, xDer, M + (16 - cuerpoTitulo), { width: 240, align: 'right', lineBreak: false });
  doc.font(F.negrita).fontSize(13).fillColor(anulada ? MARCA.grisSuave : MARCA.naranja)
    .text(fiscal ? fiscal.consecutivo : f.numero, xDer, M + 21, { width: 240, align: 'right' });

  let yDer = M + 40;
  // Etiqueta y valor se colocan MIDIENDO, no con `continued` + `align:right`:
  // pdfkit alinea cada fragmento por separado dentro de la misma caja y los
  // escribe uno encima del otro ("Fecha de creación" pisada por la fecha).
  const dato = (etiqueta, valor) => {
    doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.gris);
    const anchoValor = doc.widthOfString(String(valor));
    doc.text(String(valor), xDer + 240 - anchoValor, yDer, { lineBreak: false });
    doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
      .text(etiqueta, xDer, yDer, { width: 240 - anchoValor - 4, align: 'right', lineBreak: false });
    yDer += 12;
  };
  if (fiscal) {
    doc.font(F.normal).fontSize(7).fillColor(MARCA.gris)
      .text('Clave: ' + fiscal.clave, xDer, yDer, { width: 240, align: 'right' });
    yDer += 24;
    for (const [etiqueta, valor] of fiscalPdf.datosFiscalesEncabezado(fiscal)) dato(etiqueta, valor);
    dato(papel.numeroPropio, f.numero);
  }
  for (const [etiqueta, valor] of papel.datos) dato(etiqueta, valor);

  if (anulada) {
    doc.font(F.negrita).fontSize(9).fillColor(MARCA.naranjaOscuro)
      .text(`ANULADA — ${f.motivoAnulacion || 'sin motivo registrado'}`,
        xDer - 140, yDer + 2, { width: 380, align: 'right' });
    yDer += 14;
  }

  const yRegla = Math.max(cursor + 10, yDer + 6);
  doc.rect(M, yRegla, ancho, 2.5).fill(anulada ? MARCA.grisSuave : MARCA.naranja);
  return yRegla + 14;
}

/**
 * Lo que el papel dice del cliente: su nombre y los renglones de abajo.
 *
 * Teléfono y dirección salen de la COPIA guardada en la factura, no de la
 * ficha del cliente: el papel se reimprime igual dentro de dos años.
 *
 * UN TIQUETE NO NOMBRA A NADIE (2026-10-24): si lo firmado no lleva receptor
 * (el tiquete, o una nota de crédito sobre uno), el papel dice «Cliente de
 * contado» y nada más: ni su nombre ni la cédula, que muchas veces es de
 * relleno («100000000»). Imprimir un nombre que el XML no tiene es dirigir el
 * comprobante a alguien, justo lo que el usuario no quiere.
 */
function datosDelCliente(f, papel) {
  if (papel.fiscal && papel.fiscal.conReceptor === false) return { nombre: 'Cliente de contado', datos: [] };
  const tipo = f.cliente?.tipoIdentificacion === 'CJ' ? 'Cédula jurídica' : 'Cédula física';
  return {
    nombre: f.cliente?.nombre || 'Cliente de contado',
    datos: [
      f.cliente?.identificacion ? `${tipo}: ${f.cliente.identificacion}` : null,
      f.cliente?.telefono ? `Teléfono: ${f.cliente.telefono}` : null,
      f.cliente?.direccion ? `Dirección: ${f.cliente.direccion}` : null,
      f.cliente?.correo ? `Email: ${f.cliente.correo}` : null,
      papel.fiscal?.actividadReceptor ? `Actividad económica: ${papel.fiscal.actividadReceptor}` : null
    ].filter(Boolean)
  };
}

/** A quién se le factura, y en qué condiciones. */
function bloqueCliente(doc, f, ancho, y, F, papel) {
  const anchoIzq = ancho * 0.62;
  const xDer = M + anchoIzq + 14;
  const anchoDer = ancho - anchoIzq - 14;

  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
    .text('SEÑOR(ES)', M, y, { characterSpacing: 1 });

  doc.font(F.negrita).fontSize(13).fillColor(MARCA.tinta);
  const { nombre, datos } = datosDelCliente(f, papel);
  const altoNombre = doc.heightOfString(nombre, { width: anchoIzq });
  doc.text(nombre, M, y + 11, { width: anchoIzq });

  let yIzq = y + 11 + altoNombre + 1;
  doc.font(F.normal).fontSize(8).fillColor(MARCA.gris);
  for (const linea of datos) {
    doc.text(linea, M, yIzq, { width: anchoIzq });
    yIzq += doc.heightOfString(linea, { width: anchoIzq });
  }

  // ---- Derecha: las condiciones del papel (en la factura: condición,
  // moneda y medio de pago) ----
  let yDer = y + 2;
  const par = (etiqueta, valor) => {
    if (!valor) return;
    // Igual que arriba: medido, nunca con `continued` + alineación a la
    // derecha, que encima "Contado" sobre "Condición:".
    const texto = String(valor);
    doc.font(F.negrita).fontSize(8).fillColor(MARCA.tinta);
    const anchoValor = doc.widthOfString(texto);
    doc.text(texto, xDer + anchoDer - anchoValor, yDer, { lineBreak: false });
    doc.font(F.normal).fontSize(8).fillColor(MARCA.grisSuave)
      .text(etiqueta, xDer, yDer, { width: anchoDer - anchoValor - 4, align: 'right', lineBreak: false });
    yDer += 13;
  };
  for (const [etiqueta, valor] of papel.condiciones) par(etiqueta, valor);

  return Math.max(yIzq, yDer) + 12;
}

function cabeceraTabla(doc, col, ancho, y, F) {
  doc.rect(M, y, ancho, 18).fill(MARCA.panel);
  doc.font(F.negrita).fontSize(6.8).fillColor(MARCA.gris);
  doc.text(col.num.titulo, col.num.x + 5, y + 6);
  doc.text(col.desc.titulo, col.desc.x + 4, y + 6, { characterSpacing: 0.4 });
  doc.text(col.cant.titulo, col.cant.x, y + 6, { width: col.cant.w, align: 'center' });
  doc.text(col.precio.titulo, col.precio.x, y + 6, { width: col.precio.w - 4, align: 'right' });
  if (col.conDescuento) {
    doc.text(col.descuento.titulo, col.descuento.x, y + 6, { width: col.descuento.w - 4, align: 'right' });
  }
  doc.text(col.iva.titulo, col.iva.x, y + 6, { width: col.iva.w - 4, align: 'right' });
  doc.text(col.total.titulo, col.total.x, y + 6, { width: col.total.w - 4, align: 'right' });
  return y + 18;
}

/**
 * Las líneas.
 *
 * EL ALTO DE CADA FILA SE MIDE, no se fija: los nombres del catálogo son
 * largos ("DESINFECTANTE MANZANA CANELA EN GALON SALAZAR") y debajo van la
 * referencia y el CAByS. Con un alto fijo, o se cortaba el nombre o la
 * segunda línea pisaba la fila siguiente.
 *
 * EL CAByS VA EN EL PAPEL porque identifica el bien ante Hacienda; sin él, la
 * línea no se puede clasificar.
 */
function filas(doc, f, col, ancho, yInicio, F, fiscal = null) {
  let y = yInicio;
  const anchoNombre = col.desc.w - 8;

  f.lineas.forEach((l, i) => {
    doc.font(F.negrita).fontSize(8.5);
    const nombre = String(l.nombre || '');
    const altoNombre = doc.heightOfString(nombre, { width: anchoNombre });
    const alPie = [l.referencia ? `Ref: ${l.referencia}` : null, l.cabys ? `CAByS: ${l.cabys}` : null]
      .filter(Boolean).join('   ');
    const detalle = detalleLinea(l);
    doc.font(F.normal).fontSize(7.5);
    const altoDetalle = detalle ? doc.heightOfString(detalle, { width: anchoNombre }) + 2 : 0;
    // Electrónica: lo que el XML firmado dice de la línea (unidad, total con IVA…).
    const extra = fiscal ? fiscalPdf.textoLineaFiscal(fiscalPdf.lineaFiscalDe(fiscal, l.numeroLinea)) : null;
    doc.font(F.normal).fontSize(6.3);
    const altoExtra = extra ? doc.heightOfString(extra, { width: anchoNombre }) + 2 : 0;
    doc.font(F.negrita).fontSize(8.5);
    const alto = Math.max(26, altoNombre + (alPie ? 14 : 6) + altoDetalle + altoExtra + 6);

    if (y + alto > doc.page.height - M - PIE_RESERVADO) {
      doc.addPage();
      y = cabeceraTabla(doc, col, ancho, M, F);
    }

    if (i % 2 === 1) doc.rect(M, y, ancho, alto).fill(MARCA.cebra);

    doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
      .text(String(l.numeroLinea || i + 1), col.num.x + 5, y + 6);

    doc.font(F.negrita).fontSize(8.5).fillColor(MARCA.tinta)
      .text(nombre, col.desc.x + 4, y + 5, { width: anchoNombre });
    if (alPie) {
      doc.font(F.normal).fontSize(6.3).fillColor(MARCA.grisSuave)
        .text(alPie, col.desc.x + 4, y + 5 + altoNombre + 1, { width: anchoNombre, lineBreak: false, ellipsis: true });
    }
    if (detalle) {
      doc.font(F.normal).fontSize(7.5).fillColor(MARCA.gris)
        .text(detalle, col.desc.x + 4, y + 5 + altoNombre + (alPie ? 10 : 2), { width: anchoNombre });
    }
    if (extra) {
      doc.font(F.normal).fontSize(6.3).fillColor(MARCA.grisSuave)
        .text(extra, col.desc.x + 4, y + 5 + altoNombre + (alPie ? 10 : 2) + altoDetalle, { width: anchoNombre });
    }

    const yNum = y + 6;
    doc.font(F.negrita).fontSize(9).fillColor(MARCA.tinta)
      .text(String(num(l.cantidad)), col.cant.x, yNum, { width: col.cant.w, align: 'center' });
    doc.font(F.normal).fontSize(8).fillColor(MARCA.gris)
      .text(colonesExacto(l.precioUnitario), col.precio.x, yNum, { width: col.precio.w - 4, align: 'right' });

    if (col.conDescuento) {
      const d = num(l.descuentoMonto);
      doc.font(F.normal).fontSize(8).fillColor(d ? MARCA.naranjaOscuro : MARCA.linea)
        .text(d ? `−${colones(d)}` : '—', col.descuento.x, yNum, { width: col.descuento.w - 4, align: 'right' });
    }

    // Monto del impuesto, con su tarifa debajo: el contador necesita el monto
    // y quien revisa la factura necesita saber a qué tarifa salió.
    doc.font(F.normal).fontSize(8).fillColor(MARCA.gris)
      .text(colones(l.impuestoMonto), col.iva.x, yNum, { width: col.iva.w - 4, align: 'right' });
    doc.font(F.normal).fontSize(6.3).fillColor(MARCA.grisSuave)
      .text(tarifaTexto(l.tarifa), col.iva.x, yNum + 10, { width: col.iva.w - 4, align: 'right' });

    doc.font(F.negrita).fontSize(9).fillColor(MARCA.tinta)
      .text(colones(importeLinea(l)), col.total.x, yNum, { width: col.total.w - 4, align: 'right' });

    doc.rect(M, y + alto - 0.5, ancho, 0.5).fill(MARCA.linea);
    y += alto;
  });

  return y;
}

/**
 * El impuesto agrupado por tarifa, de menor a mayor.
 * Se calcula desde las líneas, que son las que llevan su propia tarifa: el
 * total guardado en la cabecera no dice CÓMO se compone.
 */
function impuestoPorTarifa(lineas) {
  const porTarifa = new Map();
  for (const l of lineas) {
    const t = num(l.tarifa);
    porTarifa.set(t, (porTarifa.get(t) || 0) + num(l.impuestoMonto));
  }
  return [...porTarifa.entries()]
    .filter(([, monto]) => monto > 0)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * El monto en letras del TOTAL, redondeado al colón como el TOTAL impreso.
 *
 * Decía «… ochenta y nueve con 11/100 colones costarricenses» debajo de un
 * TOTAL de ₡257.089: el papel daba dos cifras. El usuario eligió redondear
 * las letras (2026-10-19). Se redondea igual que `colones()`.
 */
function montoEnLetrasDelTotal(f) {
  return montoEnLetras(Math.round(num(f.total)), f.moneda);
}

/**
 * Los renglones de los totales, en el orden que pidió el usuario el
 * 2026-10-19: «subtotal xx / descuento xx / impuesto %x / total xx». El TOTAL
 * va debajo, en su recuadro.
 *
 * EL SUBTOTAL ES EL DE ANTES DEL DESCUENTO, para que la cuenta cierre en el
 * papel: subtotal − descuento + impuesto = total. Antes el subtotal ya traía
 * el descuento restado y se avisaba con «Ya incluye ₡X de descuento»; un
 * renglón «Descuento» debajo de ESE subtotal no cerraba (1.469 − 36 + 191 no
 * es 1.660), y por eso no estaba. El Descuento sale siempre, en ₡0 si no hay.
 * El impuesto va por tarifa, un renglón cada una y de la mayor a la menor,
 * como lo escribió el usuario: «impuesto 13 % xx / impuesto 2 % xx». Acá se
 * vende con varias (0, 1, 2, 4, 8 y 13 %).
 */
function renglonesDeTotales(f) {
  const descuento = num(f.descuento);
  const desglose = impuestoPorTarifa(f.lineas);
  return [
    ['Subtotal', colones(subtotalAntesDeDescuento(f))],
    ['Descuento', descuento > 0 ? `−${colones(descuento)}` : colones(0)],
    ...(desglose.length
      ? [...desglose].reverse().map(([tarifa, monto]) => [`Impuesto ${tarifaTexto(tarifa)}`, colones(monto)])
      : [['Impuesto', colones(0)]])
  ];
}

function totales(doc, f, ancho, y, F, observacion) {
  const renglones = renglonesDeTotales(f);
  const conPagos = num(f.cobrado) > 0 || num(f.acreditado) > 0;
  const alto = 105 + renglones.length * 15 + (conPagos ? 34 : 0);

  if (y + alto > doc.page.height - M - PIE_RESERVADO) {
    doc.addPage();
    y = M;
  }

  const anchoCaja = 236;
  const xCaja = doc.page.width - M - anchoCaja;
  let yy = y + 16;

  // EL MONTO EN LETRAS, a la izquierda y a la altura de los totales. Es lo
  // que impide que alguien retoque la cifra con un lapicero: "₡15.899" se
  // altera, "quince mil ochocientos noventa y nueve colones" no.
  const anchoIzq = ancho - anchoCaja - 24;
  const letras = montoEnLetrasDelTotal(f);
  doc.font(F.normal).fontSize(8).fillColor(MARCA.gris).text(letras, M, yy + 2, { width: anchoIzq });
  let yIzq = yy + 2 + doc.heightOfString(letras, { width: anchoIzq });

  // LA OBSERVACIÓN VA DEBAJO DEL MONTO EN LETRAS, y se dibuja acá, no antes:
  // estaba a su misma altura y las dos se escribían una encima de la otra;
  // y si los totales saltan de página, tiene que saltar con ellos.
  if (observacion) {
    yIzq += 10;
    doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.grisSuave)
      .text(observacion.titulo, M, yIzq, { characterSpacing: 1 });
    doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
      .text(observacion.texto, M, yIzq + 12, { width: anchoIzq });
    yIzq += 12 + doc.heightOfString(observacion.texto, { width: anchoIzq });
  }

  const renglon = (etiqueta, valor, color = MARCA.gris) => {
    doc.font(F.normal).fontSize(9).fillColor(color)
      .text(etiqueta, xCaja, yy, { width: anchoCaja - 110, align: 'right' })
      .text(valor, xCaja + anchoCaja - 106, yy, { width: 106, align: 'right' });
    yy += 15;
  };

  // Subtotal, Descuento e Impuesto: ver renglonesDeTotales.
  for (const [etiqueta, valor] of renglones) renglon(etiqueta, valor);

  yy += 5;
  const anulada = f.estado === 'anulada';
  doc.roundedRect(xCaja, yy, anchoCaja, 38, 6).fill(anulada ? MARCA.grisSuave : MARCA.naranja);
  doc.font(F.negrita).fontSize(9).fillColor('#FFFFFF')
    .text('TOTAL', xCaja + 14, yy + 14, { characterSpacing: 1 });
  doc.font(F.negrita).fontSize(17).fillColor('#FFFFFF')
    .text(colones(f.total), xCaja, yy + 10, { width: anchoCaja - 14, align: 'right' });
  yy += 38;

  // Lo ya abonado y lo que queda debiendo. Solo cuando hay algo: en una venta
  // de contado recién hecha, un "Saldo ₡0" sobra.
  if (conPagos) {
    yy += 8;
    if (num(f.cobrado) > 0) {
      // CON QUÉ pagó, no solo cuánto. Si el cliente pagó por SINPE, el papel
      // tiene que decirlo con su referencia: es lo que le permite comprobar
      // que su transferencia se aplicó a ESTA factura y no a otra.
      const vigentes = (f.cobros || []).filter(c => !c.anulado);
      const formas = [...new Set(vigentes.map(c => medioDePago(c.metodo)).filter(Boolean))];
      renglon(formas.length ? `Pagado (${formas.join(', ')})` : 'Pagado', `−${colones(f.cobrado)}`);

      // En su PROPIO renglón, debajo: `renglon()` ya adelantó `yy`, y restarle
      // para "subirla" la escribía encima del monto.
      const referencias = vigentes.map(c => c.referencia).filter(Boolean);
      if (referencias.length) {
        doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
          .text(`Ref. ${referencias.join(', ')}`, xCaja, yy, { width: anchoCaja, align: 'right' });
        yy += 12;
      }
    }
    if (num(f.acreditado) > 0) renglon('Nota de crédito', `−${colones(f.acreditado)}`);
    doc.font(F.negrita).fontSize(10).fillColor(MARCA.tinta)
      .text('SALDO', xCaja, yy, { width: anchoCaja - 110, align: 'right' })
      .text(colones(f.saldo), xCaja + anchoCaja - 106, yy, { width: 106, align: 'right' });
    yy += 16;
  }

  // Lo que venga después arranca debajo de las DOS columnas.
  return Math.max(yy, yIzq);
}

/** El sello de anulada, en diagonal, en cada página. */
function selloAnulada(doc) {
  const { width, height } = doc.page;
  doc.save();
  doc.rotate(-32, { origin: [width / 2, height / 2] });
  doc.font('Helvetica-Bold').fontSize(96).fillColor(MARCA.naranja).fillOpacity(0.13)
    .text('ANULADA', 0, height / 2 - 60, { width, align: 'center' });
  doc.restore();
}

function pie(doc, f, ancho, F, emisor = NEGOCIO) {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);

    // pdfkit agrega una página en blanco si se escribe por debajo del margen
    // inferior, y tanto el pie como el sello van justo ahí.
    const margenOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    if (f.estado === 'anulada') selloAnulada(doc);

    const yPie = doc.page.height - 32;
    doc.rect(M, yPie - 10, ancho, 0.5).fill(MARCA.linea);
    doc.font(F.normal).fontSize(6.8).fillColor(MARCA.grisSuave)
      .text(`${emisor.nombre}  ·  Céd. ${emisor.cedula}  ·  ${emisor.telefono}  ·  ${emisor.email}`,
        M, yPie, { width: ancho - 90, lineBreak: false })
      .text(`Página ${i + 1} de ${rango.count}`, M + ancho - 90, yPie, { width: 90, align: 'right', lineBreak: false });

    doc.page.margins.bottom = margenOriginal;
  }
}

/**
 * Arma el PDF y devuelve su contenido.
 *
 * @param {object} f lo que devuelve facturaConsulta.obtenerFactura()
 * @param {object} papel lo que este papel dice distinto (ver papelDeFactura)
 * @returns {Promise<Buffer>}
 */
function generarPdfFactura(f, empresa = null, papel = null) {
  if (!f || !Array.isArray(f.lineas)) {
    throw new Error('No se puede armar el PDF: el documento viene sin líneas.');
  }
  papel = papel || papelDeFactura(f);

  // Los datos del emisor salen de la CONFIGURACIÓN, no del código: la cédula,
  // la dirección, la actividad económica y las cuentas de pago cambian, y
  // cambiarlas no puede pedir un despliegue.
  const emisor = datosEmisor(f.fiscal?.empresa || empresa);

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: M, size: 'letter', bufferPages: true });

  const trozos = [];
  doc.on('data', t => trozos.push(t));
  const listo = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(trozos))));

  const F = registrarFuentes(doc);
  const ancho = doc.page.width - M * 2;
  const conDescuento = f.lineas.some(l => num(l.descuentoPorcentaje) > 0 || num(l.descuentoMonto) > 0);
  const col = columnas(ancho, conDescuento);

  let y = encabezado(doc, f, ancho, F, emisor, papel);
  y = bloqueCliente(doc, f, ancho, y, F, papel);
  y = cabeceraTabla(doc, col, ancho, y, F);
  const yTrasFilas = filas(doc, f, col, ancho, y, F, papel.fiscal);

  // La observación va a la IZQUIERDA de los totales, bajo el monto en letras:
  // son las cosas que se leen al final y comparten ese espacio.
  const yFinal = totales(doc, f, ancho, yTrasFilas, F, papel.observacion);

  // POR DÓNDE PAGA EL CLIENTE. Sin esto el papel no sirve para cobrar: son
  // las cuentas de SINPE y de banco, y viven en la configuración porque un
  // número de cuenta cambia y nadie debería tocar código para eso.
  let yPie = yFinal + 18;
  if (papel.terminos && emisor.terminos) {
    doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.gris)
      .text('TÉRMINOS Y CONDICIONES', M, yPie, { characterSpacing: 0.8 });
    doc.font(F.normal).fontSize(8).fillColor(MARCA.gris)
      .text(emisor.terminos, M, yPie + 11, { width: ancho * 0.6 });
    yPie += 13 + doc.heightOfString(emisor.terminos, { width: ancho * 0.6 });
  }

  // La letra chica va DEBAJO de los totales, no anclada al borde inferior:
  // escribir por debajo del margen le agrega a pdfkit una página en blanco.
  doc.font(F.normal).fontSize(7).fillColor(MARCA.grisSuave)
    .text(leyenda(papel, emisor), M, yPie + 8, { width: ancho * 0.62 });

  pie(doc, f, ancho, F, emisor);
  doc.end();
  return listo;
}

module.exports = {
  generarPdfFactura, papelDeFactura, leyenda, datosEmisor, datosDelCliente, medioDePago, impuestoPorTarifa, importeLinea,
  tarifaTexto, columnas, detalleLinea, subtotalMostrado, subtotalAntesDeDescuento, renglonesDeTotales,
  montoEnLetrasDelTotal
};
