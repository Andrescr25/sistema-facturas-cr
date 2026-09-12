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
 *   · NO DICE SER UN COMPROBANTE ELECTRÓNICO. No lo es. La emisión ante
 *     Hacienda está pospuesta y el papel no puede insinuar lo contrario.
 */

const fs = require('fs');
const {
  MARCA, LOGO, LOGO_RATIO, NEGOCIO,
  registrarFuentes, colones, colonesExacto, fechaLarga
} = require('../../utils/marcaPdf');

const M = 44;                 // margen
const ALTO_FILA = 26;
const PIE_RESERVADO = 56;

const num = (v) => Number(v) || 0;

/**
 * Lo que cuesta una línea antes del impuesto: cantidad × precio, menos el
 * descuento. Es lo que va en la columna IMPORTE, y la suma de todas tiene que
 * dar el Subtotal de los totales.
 */
function importeLinea(l) {
  return num(l.cantidad) * num(l.precioUnitario) - num(l.descuentoMonto);
}

/** "13 %", "1 %", "0 %" — sin decimales cuando no los necesita. */
function tarifaTexto(t) {
  const v = num(t);
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} %`;
}

/** Las columnas, con su ancho. `conDescuento` cambia el reparto. */
function columnas(ancho, conDescuento) {
  const anchoDesc = conDescuento ? 46 : 0;
  const fijas = 22 + 38 + 74 + anchoDesc + 34 + 84;
  const x = (desde) => M + ancho - desde;
  return {
    conDescuento,
    num:      { x: M, w: 22, titulo: '#' },
    desc:     { x: M + 22, w: ancho - fijas, titulo: 'DESCRIPCIÓN' },
    cant:     { x: x(38 + 74 + anchoDesc + 34 + 84), w: 38, titulo: 'CANT.' },
    precio:   { x: x(74 + anchoDesc + 34 + 84), w: 74, titulo: 'PRECIO UNIT.' },
    descuento:{ x: x(anchoDesc + 34 + 84), w: anchoDesc, titulo: 'DESC.' },
    iva:      { x: x(34 + 84), w: 34, titulo: 'IVA' },
    total:    { x: x(84), w: 84, titulo: 'IMPORTE' }
  };
}

function encabezado(doc, f, ancho, F) {
  let cursor = M;

  if (fs.existsSync(LOGO)) {
    const anchoLogo = 140;
    doc.image(LOGO, M, cursor - 4, { width: anchoLogo });
    cursor += anchoLogo * LOGO_RATIO + 2;
  } else {
    doc.font(F.negrita).fontSize(18).fillColor(MARCA.naranja).text('TACHI', M, cursor);
    doc.font(F.normal).fontSize(8).fillColor(MARCA.gris)
      .text('DISTRIBUIDORA', M, cursor + 21, { characterSpacing: 2 });
    cursor += 38;
  }

  const anulada = f.estado === 'anulada';
  const titulo = f.tipoDocumento === 'tiquete' ? 'TIQUETE' : 'FACTURA';
  const xDer = doc.page.width - M - 240;

  doc.font(F.negrita).fontSize(20).fillColor(anulada ? MARCA.grisSuave : MARCA.tinta)
    .text(titulo, xDer, M, { width: 240, align: 'right' });
  doc.font(F.negrita).fontSize(11).fillColor(anulada ? MARCA.grisSuave : MARCA.naranja)
    .text(`N° ${f.numero}`, xDer, M + 26, { width: 240, align: 'right' });
  doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
    .text(fechaLarga(f.fecha), xDer, M + 42, { width: 240, align: 'right' });

  // El motivo va junto al número, no al pie: quien recibe el papel tiene que
  // enterarse de que está anulada en el mismo golpe de vista que el número.
  let extra = 0;
  if (anulada) {
    doc.font(F.negrita).fontSize(9).fillColor(MARCA.naranjaOscuro)
      .text(`ANULADA — ${f.motivoAnulacion || 'sin motivo registrado'}`,
        xDer - 120, M + 58, { width: 360, align: 'right' });
    extra = 14;
  }

  const yRegla = Math.max(cursor + 16, M + 62 + extra);
  doc.rect(M, yRegla, ancho, 2.5).fill(anulada ? MARCA.grisSuave : MARCA.naranja);
  return yRegla + 20;
}

function bloqueCliente(doc, f, ancho, y, F) {
  const anchoCaja = 218;
  const xCaja = doc.page.width - M - anchoCaja;

  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
    .text('FACTURAR A', M, y, { characterSpacing: 1 });
  // El ancho del nombre se MIDE antes de poner la cédula debajo. Con una
  // altura fija, un nombre largo se parte en dos líneas y la segunda queda
  // escrita encima de la cédula: pasó con "CENTRO DE TORNILLOS PALMARES
  // LIMITADA", que salió pisando su propio número.
  const anchoNombre = ancho - anchoCaja - 20;
  const nombre = f.cliente?.nombre || 'Cliente de contado';
  doc.font(F.negrita).fontSize(14).fillColor(MARCA.tinta);
  const altoNombre = doc.heightOfString(nombre, { width: anchoNombre });
  doc.text(nombre, M, y + 12, { width: anchoNombre });

  let yIzquierda = y + 12 + altoNombre;
  if (f.cliente?.identificacion) {
    doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
      .text(`Céd. ${f.cliente.identificacion}`, M, yIzquierda + 2, { width: anchoNombre });
    yIzquierda += 14;
  }

  // La condición de venta y el vencimiento, destacados: son la única condición
  // del documento que se discute después ("¿esta era de contado o a 30 días?").
  const credito = f.condicionVenta && f.condicionVenta !== 'contado';
  doc.roundedRect(xCaja, y - 8, anchoCaja, 54, 6).fillAndStroke(MARCA.naranjaSuave, MARCA.naranjaSuave);
  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.naranjaOscuro)
    .text(credito ? 'CRÉDITO — VENCE' : 'CONDICIÓN DE VENTA', xCaja, y + 2,
      { width: anchoCaja, align: 'center', characterSpacing: 0.8 });
  doc.font(F.negrita).fontSize(credito ? 12 : 11).fillColor(MARCA.naranjaOscuro)
    .text(credito ? fechaLarga(f.fechaVencimiento || f.fecha) : (f.plazo || 'De contado'),
      xCaja, y + 18, { width: anchoCaja, align: 'center', lineBreak: false });

  // Lo que ocupe el lado más alto de los dos, nunca menos que la caja.
  return Math.max(y + 62, yIzquierda + 8);
}

function cabeceraTabla(doc, col, ancho, y, F) {
  doc.rect(M, y, ancho, 20).fill(MARCA.panel);
  doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.gris);
  doc.text(col.num.titulo, col.num.x + 5, y + 6.5);
  doc.text(col.desc.titulo, col.desc.x + 4, y + 6.5, { characterSpacing: 0.5 });
  doc.text(col.cant.titulo, col.cant.x, y + 6.5, { width: col.cant.w, align: 'center' });
  doc.text(col.precio.titulo, col.precio.x, y + 6.5, { width: col.precio.w - 6, align: 'right' });
  if (col.conDescuento) {
    doc.text(col.descuento.titulo, col.descuento.x, y + 6.5, { width: col.descuento.w - 4, align: 'right' });
  }
  doc.text(col.iva.titulo, col.iva.x, y + 6.5, { width: col.iva.w, align: 'center' });
  doc.text(col.total.titulo, col.total.x, y + 6.5, { width: col.total.w - 6, align: 'right' });
  return y + 20;
}

function filas(doc, f, col, ancho, yInicio, F) {
  let y = yInicio;

  f.lineas.forEach((l, i) => {
    // Cabecera repetida en cada página: una tabla cuya segunda hoja no dice
    // qué es cada columna obliga a devolverse.
    if (y + ALTO_FILA > doc.page.height - M - PIE_RESERVADO) {
      doc.addPage();
      y = cabeceraTabla(doc, col, ancho, M, F);
    }

    if (i % 2 === 1) doc.rect(M, y, ancho, ALTO_FILA).fill(MARCA.cebra);

    doc.font(F.normal).fontSize(8).fillColor(MARCA.grisSuave)
      .text(String(l.numeroLinea || i + 1), col.num.x + 5, y + 6);

    // El nombre se recorta midiendo, no con `ellipsis`: pdfkit lo parte en dos
    // líneas igual y la segunda pisa la referencia de abajo.
    doc.font(F.negrita).fontSize(8.5).fillColor(MARCA.tinta);
    const disponible = col.desc.w - 8;
    let nombre = String(l.nombre || '');
    if (doc.widthOfString(nombre) > disponible) {
      while (nombre.length > 3 && doc.widthOfString(`${nombre.trimEnd()}…`) > disponible) {
        nombre = nombre.slice(0, -1);
      }
      nombre = `${nombre.trimEnd()}…`;
    }
    doc.text(nombre, col.desc.x + 4, y + 4, { width: disponible, lineBreak: false });

    const alPie = [l.referencia ? `Ref. ${l.referencia}` : null, l.unidad || null]
      .filter(Boolean).join('  ·  ');
    if (alPie) {
      doc.font(F.normal).fontSize(6.5).fillColor(MARCA.grisSuave)
        .text(alPie, col.desc.x + 4, y + 15, { width: disponible, lineBreak: false, ellipsis: true });
    }

    doc.font(F.negrita).fontSize(9).fillColor(MARCA.tinta)
      .text(String(num(l.cantidad)), col.cant.x, y + 8, { width: col.cant.w, align: 'center' });
    doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
      .text(colonesExacto(l.precioUnitario), col.precio.x, y + 8, { width: col.precio.w - 6, align: 'right' });

    if (col.conDescuento) {
      const d = num(l.descuentoPorcentaje);
      doc.font(F.normal).fontSize(8).fillColor(d ? MARCA.naranjaOscuro : MARCA.linea)
        .text(d ? `${d}%` : '—', col.descuento.x, y + 8, { width: col.descuento.w - 4, align: 'right' });
    }

    doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
      .text(tarifaTexto(l.tarifa), col.iva.x, y + 8.5, { width: col.iva.w, align: 'center' });
    // El importe va SIN impuesto: cantidad × precio, menos el descuento.
    // `l.total` trae el impuesto adentro, y ponerlo acá dejaba un papel donde
    // 3 × ₡464,60 daba ₡1.575 — el cliente multiplica y no le cuadra. Así la
    // columna suma exactamente el Subtotal de abajo.
    const importe = importeLinea(l);
    doc.font(F.negrita).fontSize(9).fillColor(MARCA.tinta)
      .text(colones(importe), col.total.x, y + 8, { width: col.total.w - 6, align: 'right' });

    doc.rect(M, y + ALTO_FILA - 0.5, ancho, 0.5).fill(MARCA.linea);
    y += ALTO_FILA;
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

function totales(doc, f, ancho, y, F) {
  const desglose = impuestoPorTarifa(f.lineas);
  const conPagos = num(f.cobrado) > 0 || num(f.acreditado) > 0;
  const alto = 120 + desglose.length * 15 + (conPagos ? 34 : 0);

  if (y + alto > doc.page.height - M - PIE_RESERVADO) {
    doc.addPage();
    y = M;
  }

  const anchoCaja = 236;
  const xCaja = doc.page.width - M - anchoCaja;
  let yy = y + 16;

  const renglon = (etiqueta, valor, color = MARCA.gris) => {
    doc.font(F.normal).fontSize(9).fillColor(color)
      .text(etiqueta, xCaja, yy, { width: anchoCaja - 110, align: 'right' })
      .text(valor, xCaja + anchoCaja - 106, yy, { width: 106, align: 'right' });
    yy += 15;
  };

  renglon('Subtotal', colones(f.subtotal));
  if (num(f.descuento) > 0) renglon('Descuento', `−${colones(f.descuento)}`, MARCA.naranjaOscuro);

  // Una línea por tarifa: "IVA 13 %", "IVA 1 %". Si todo va a la misma, sale
  // una sola y se lee igual que antes.
  for (const [tarifa, monto] of desglose) renglon(`IVA ${tarifaTexto(tarifa)}`, colones(monto));
  if (desglose.length === 0) renglon('IVA', colones(0));

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
    if (num(f.cobrado) > 0) renglon('Pagado', `−${colones(f.cobrado)}`);
    if (num(f.acreditado) > 0) renglon('Nota de crédito', `−${colones(f.acreditado)}`);
    doc.font(F.negrita).fontSize(10).fillColor(MARCA.tinta)
      .text('SALDO', xCaja, yy, { width: anchoCaja - 110, align: 'right' })
      .text(colones(f.saldo), xCaja + anchoCaja - 106, yy, { width: 106, align: 'right' });
    yy += 16;
  }

  return yy;
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

function pie(doc, f, ancho, F) {
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
      .text(`${NEGOCIO.nombre}  ·  Céd. ${NEGOCIO.cedula}  ·  ${NEGOCIO.telefono}  ·  ${NEGOCIO.email}`,
        M, yPie, { width: ancho - 90, lineBreak: false })
      .text(`Página ${i + 1} de ${rango.count}`, M + ancho - 90, yPie, { width: 90, align: 'right', lineBreak: false });

    doc.page.margins.bottom = margenOriginal;
  }
}

/**
 * Arma el PDF y devuelve su contenido.
 *
 * @param {object} f lo que devuelve facturaConsulta.obtenerFactura()
 * @returns {Promise<Buffer>}
 */
function generarPdfFactura(f) {
  if (!f || !Array.isArray(f.lineas)) {
    throw new Error('No se puede armar el PDF: la factura viene sin líneas.');
  }

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: M, size: 'letter', bufferPages: true });

  const trozos = [];
  doc.on('data', t => trozos.push(t));
  const listo = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(trozos))));

  const F = registrarFuentes(doc);
  const ancho = doc.page.width - M * 2;
  const conDescuento = f.lineas.some(l => num(l.descuentoPorcentaje) > 0 || num(l.descuentoMonto) > 0);
  const col = columnas(ancho, conDescuento);

  let y = encabezado(doc, f, ancho, F);
  y = bloqueCliente(doc, f, ancho, y, F);
  y = cabeceraTabla(doc, col, ancho, y, F);
  const yTrasFilas = filas(doc, f, col, ancho, y, F);

  // La observación va a la IZQUIERDA, a la altura de los totales: son las dos
  // cosas que se leen al final y compiten por el mismo espacio.
  if (f.observaciones) {
    doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.grisSuave)
      .text('NOTA', M, yTrasFilas + 18, { characterSpacing: 1 });
    doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
      .text(f.observaciones, M, yTrasFilas + 30, { width: ancho - 260 });
  }

  const yFinal = totales(doc, f, ancho, yTrasFilas, F);

  // La letra chica va DEBAJO de los totales, no anclada al borde inferior:
  // escribir por debajo del margen le agrega a pdfkit una página en blanco.
  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
    .text('Documento emitido por Distribuidora Tachi. No constituye un comprobante ' +
      'electrónico autorizado por el Ministerio de Hacienda. Consérvelo para cualquier reclamo.',
      M, yFinal + 22, { width: ancho * 0.62 });

  pie(doc, f, ancho, F);
  doc.end();
  return listo;
}

module.exports = { generarPdfFactura, impuestoPorTarifa, importeLinea, tarifaTexto, columnas };
