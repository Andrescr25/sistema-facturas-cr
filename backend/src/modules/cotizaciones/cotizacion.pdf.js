/**
 * El PDF de una cotización, con el formato de la casa.
 *
 * POR QUÉ NO SE USA EL DE ALEGRA
 * Alegra genera un PDF propio y era el que se le mandaba al cliente. Se ve
 * viejo y no lleva nada de la marca: para una cotización —que muchas veces es
 * lo PRIMERO que un cliente nuevo ve del negocio— ese papel es la carta de
 * presentación.
 *
 * Se arma con pdfkit, igual que la orden de compra al proveedor, y comparte
 * con ella la paleta y el logo (src/utils/marcaPdf.js).
 *
 * DECISIONES QUE NO SON DE GUSTO
 *   · Los precios se muestran SIN IVA en la tabla y el impuesto va en el
 *     bloque de totales. Es como lo lee un negocio que revende, que es a
 *     quien se le cotiza, y coincide con la factura que va a recibir después.
 *   · La fecha de vencimiento va destacada: es lo que evita el reclamo de
 *     "pero usted me había cotizado a este precio" seis meses más tarde.
 *   · El naranja se usa solo en el total y en la regla del encabezado. Un
 *     documento donde todo resalta es un documento donde nada resalta.
 */

const fs = require('fs');
const { MARCA, LOGO, LOGO_RATIO, NEGOCIO, registrarFuentes, colones, colonesExacto, fechaLarga } = require('../../utils/marcaPdf');

const M = 44;                 // margen
const ALTO_FILA = 26;
// Solo el pie de página: el bloque de totales pide su propio espacio cuando
// le toca (ver totales()). Reservando los 120 del bloque en TODAS las páginas,
// las intermedias cortaban a media hoja y quedaban con un vacío enorme.
const PIE_RESERVADO = 56;

/** Las columnas de la tabla, con su ancho. Suman el ancho útil de la página. */
function columnas(ancho) {
  return {
    // La descripción se lleva lo que sobra, y sobra a propósito: los nombres
    // del catálogo son largos ("DESINFECTANTE MANZANA CANELA EN GALON
    // SALAZAR") y cortarlos con puntos suspensivos deja al cliente
    // adivinando cuál de los diez olores es.
    num:   { x: M, w: 24, titulo: '#' },
    desc:  { x: M + 24, w: ancho - 24 - 42 - 82 - 92, titulo: 'DESCRIPCIÓN' },
    cant:  { x: M + ancho - 42 - 82 - 92, w: 42, titulo: 'CANT.' },
    precio:{ x: M + ancho - 82 - 92, w: 82, titulo: 'PRECIO UNIT.' },
    total: { x: M + ancho - 92, w: 92, titulo: 'IMPORTE' }
  };
}

function encabezado(doc, cot, ancho, F) {
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

  const xDer = doc.page.width - M - 240;
  doc.font(F.negrita).fontSize(20).fillColor(MARCA.tinta)
    .text('COTIZACIÓN', xDer, M, { width: 240, align: 'right' });
  doc.font(F.negrita).fontSize(11).fillColor(MARCA.naranja)
    .text(`N° ${cot.numero}`, xDer, M + 26, { width: 240, align: 'right' });
  doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
    .text(fechaLarga(cot.fecha), xDer, M + 42, { width: 240, align: 'right' });

  const yRegla = Math.max(cursor + 16, M + 62);
  doc.rect(M, yRegla, ancho, 2.5).fill(MARCA.naranja);
  return yRegla + 20;
}

function bloqueCliente(doc, cot, ancho, y, F) {
  // 218 y no 190: DejaVu es más ancha que Helvetica y la fecha larga se
  // partía en dos líneas dentro de la caja.
  const anchoCaja = 218;
  const xCaja = doc.page.width - M - anchoCaja;

  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
    .text('COTIZACIÓN PARA', M, y, { characterSpacing: 1 });
  doc.font(F.negrita).fontSize(14).fillColor(MARCA.tinta)
    .text(cot.clienteNombre || 'Cliente', M, y + 12, { width: ancho - anchoCaja - 20 });

  // La validez, destacada: es la única condición del documento que importa.
  doc.roundedRect(xCaja, y - 8, anchoCaja, 54, 6).fillAndStroke(MARCA.naranjaSuave, MARCA.naranjaSuave);
  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.naranjaOscuro)
    .text('PRECIOS VÁLIDOS HASTA', xCaja, y + 2, { width: anchoCaja, align: 'center', characterSpacing: 0.8 });
  doc.font(F.negrita).fontSize(12).fillColor(MARCA.naranjaOscuro)
    .text(fechaLarga(cot.vence), xCaja, y + 18, { width: anchoCaja, align: 'center', lineBreak: false });

  return y + 62;
}

function cabeceraTabla(doc, col, ancho, y, F) {
  doc.rect(M, y, ancho, 20).fill(MARCA.panel);
  doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.gris);
  doc.text(col.num.titulo, col.num.x + 6, y + 6.5);
  doc.text(col.desc.titulo, col.desc.x + 4, y + 6.5, { characterSpacing: 0.5 });
  doc.text(col.cant.titulo, col.cant.x, y + 6.5, { width: col.cant.w, align: 'center' });
  doc.text(col.precio.titulo, col.precio.x, y + 6.5, { width: col.precio.w - 6, align: 'right' });
  doc.text(col.total.titulo, col.total.x, y + 6.5, { width: col.total.w - 6, align: 'right' });
  return y + 20;
}

function filas(doc, cot, col, ancho, yInicio, F) {
  let y = yInicio;

  cot.lineas.forEach((l, i) => {
    // Salto de página con la cabecera repetida: una tabla cuya segunda página
    // no dice qué es cada columna obliga a volver atrás.
    if (y + ALTO_FILA > doc.page.height - M - PIE_RESERVADO) {
      doc.addPage();
      y = cabeceraTabla(doc, col, ancho, M, F);
    }

    if (i % 2 === 1) doc.rect(M, y, ancho, ALTO_FILA).fill(MARCA.cebra);

    const importe = (Number(l.cantidad) || 0) * (Number(l.precio) || 0);

    doc.font(F.normal).fontSize(8).fillColor(MARCA.grisSuave)
      .text(String(i + 1), col.num.x + 6, y + 6);

    // El nombre se recorta en JS y no con `ellipsis`: pdfkit lo partía en dos
    // líneas igual y la segunda pisaba la referencia de abajo (pasó con
    // "DESINFECTANTE MANZANA CANELA EN GALON SALAZAR").
    doc.font(F.negrita).fontSize(8.5).fillColor(MARCA.tinta);
    const anchoDisponible = col.desc.w - 8;
    const nombreCompleto = String(l.nombre || '');
    let nombre = nombreCompleto;
    // Primero se pregunta si cabe ENTERO. Medir siempre con los puntos
    // suspensivos recortaba nombres que sí entraban: "DESINFECTANTE MANZANA
    // CANELA EN GALON SALAZAR" mide 268 y la columna da 276, pero con el "…"
    // se pasaba y salía cortado sin necesidad.
    if (doc.widthOfString(nombre) > anchoDisponible) {
      while (nombre.length > 3 && doc.widthOfString(`${nombre.trimEnd()}…`) > anchoDisponible) {
        nombre = nombre.slice(0, -1);
      }
      nombre = `${nombre.trimEnd()}…`;
    }
    doc.text(nombre, col.desc.x + 4, y + 4, { width: anchoDisponible, lineBreak: false });
    if (l.referencia) {
      doc.font(F.normal).fontSize(6.5).fillColor(MARCA.grisSuave)
        .text(`Ref. ${l.referencia}`, col.desc.x + 4, y + 15, { width: col.desc.w - 8, lineBreak: false, ellipsis: true });
    }

    doc.font(F.negrita).fontSize(9).fillColor(MARCA.tinta)
      .text(String(l.cantidad), col.cant.x, y + 8, { width: col.cant.w, align: 'center' });
    doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
      .text(colonesExacto(l.precio), col.precio.x, y + 8, { width: col.precio.w - 6, align: 'right' });
    doc.font(F.negrita).fontSize(9).fillColor(MARCA.tinta)
      .text(colones(importe), col.total.x, y + 8, { width: col.total.w - 6, align: 'right' });

    doc.rect(M, y + ALTO_FILA - 0.5, ancho, 0.5).fill(MARCA.linea);
    y += ALTO_FILA;
  });

  return y;
}

function totales(doc, cot, ancho, y, F) {
  // El bloque mide unos 120 puntos entre subtotal, IVA y la caja del total.
  // Si no caben en lo que queda de página, se pasa a la siguiente en vez de
  // escribirlos por debajo del margen (que además agrega una página vacía).
  if (y + 130 > doc.page.height - M - PIE_RESERVADO) {
    doc.addPage();
    y = M;
  }

  const subtotal = cot.lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);
  const impuesto = cot.lineas.reduce(
    (s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio) || 0) * ((Number(l.taxPercentage) || 0) / 100), 0);
  const total = subtotal + impuesto;

  const anchoCaja = 236;
  const xCaja = doc.page.width - M - anchoCaja;
  let yy = y + 16;

  doc.font(F.normal).fontSize(9).fillColor(MARCA.gris)
    .text('Subtotal', xCaja, yy, { width: anchoCaja - 110, align: 'right' })
    .text(colones(subtotal), xCaja + anchoCaja - 106, yy, { width: 106, align: 'right' });
  yy += 15;
  doc.text('IVA', xCaja, yy, { width: anchoCaja - 110, align: 'right' })
    .text(colones(impuesto), xCaja + anchoCaja - 106, yy, { width: 106, align: 'right' });
  yy += 20;

  doc.roundedRect(xCaja, yy, anchoCaja, 38, 6).fill(MARCA.naranja);
  doc.font(F.negrita).fontSize(9).fillColor('#FFFFFF')
    .text('TOTAL', xCaja + 14, yy + 14, { characterSpacing: 1 });
  doc.font(F.negrita).fontSize(17).fillColor('#FFFFFF')
    .text(colones(total), xCaja, yy + 10, { width: anchoCaja - 14, align: 'right' });

  return yy + 38;
}

function pie(doc, cot, ancho, F) {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);

    // pdfkit agrega una página en blanco si se escribe por debajo del margen
    // inferior, y el pie va justo ahí. Sin esto, una cotización de 9 líneas
    // salía en 3 páginas: dos en blanco por los dos textos del pie.
    const margenOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

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
 * @param {object} cot lo que devuelve cotizaciones.service.detalle()
 * @returns {Promise<Buffer>}
 */
function generarPdfCotizacion(cot) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: M, size: 'letter', bufferPages: true });

  const trozos = [];
  doc.on('data', t => trozos.push(t));
  const listo = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(trozos))));

  const F = registrarFuentes(doc);
  const ancho = doc.page.width - M * 2;
  const col = columnas(ancho);

  let y = encabezado(doc, cot, ancho, F);
  y = bloqueCliente(doc, cot, ancho, y, F);
  y = cabeceraTabla(doc, col, ancho, y, F);
  const yTrasFilas = filas(doc, cot, col, ancho, y, F);

  // La nota del vendedor va a la IZQUIERDA, a la misma altura que los
  // totales: son las dos cosas que se leen al final y compiten por el mismo
  // espacio.
  if (cot.observaciones) {
    doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.grisSuave)
      .text('NOTA', M, yTrasFilas + 18, { characterSpacing: 1 });
    doc.font(F.normal).fontSize(8.5).fillColor(MARCA.gris)
      .text(cot.observaciones, M, yTrasFilas + 30, { width: ancho - 260 });
  }

  const yFinal = totales(doc, cot, ancho, yTrasFilas, F);

  // La letra chica va DEBAJO de los totales, no anclada al borde inferior.
  // Escribir por debajo del margen hace que pdfkit agregue una página en
  // blanco: la primera versión salía en 3 páginas con 9 líneas.
  doc.font(F.normal).fontSize(7.5).fillColor(MARCA.grisSuave)
    .text('Esta cotización no es un documento fiscal. Los precios se mantienen hasta la fecha ' +
      'indicada y están sujetos a disponibilidad de inventario.',
      M, yFinal + 22, { width: ancho * 0.62 });

  pie(doc, cot, ancho, F);
  doc.end();
  return listo;
}

module.exports = { generarPdfCotizacion };
