/** Diseño comercial de la orden, compartido con los documentos históricos. */
const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const { MARCA, LOGO, LOGO_RATIO, registrarFuentes, fechaLarga } = require('../../utils/marcaPdf');
const numero = n => Number(n).toLocaleString('es-CR', { maximumFractionDigits: 6 });

/**
 * Recibe datos ya resueltos: no consulta proveedor, mapping ni cantidades.
 *
 * SIN NÚMERO DE ORDEN (2026-10-20, el usuario: «quitemos el hecho de que las
 * órdenes de compra se guarden tipo OC-xx, esto da igual»). El papel dice
 * qué se pide, a quién y cuándo; la orden se sigue guardando por dentro para
 * tachar lo ya pedido, pero su número no sale en el PDF ni en el archivo.
 *
 * SIN FACTOR (2026-10-20, el usuario: «el pdf de orden de compra sale el
 * factor, eso quitalo, el proveedor no ocupa esa info, lo podría confundir»).
 * El factor convierte SUS unidades a las nuestras: es cuenta interna. El
 * proveedor solo necesita cuánto, qué y con qué código.
 */
function generarPdfCompra({ proveedor, fecha, lineas }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40, bufferPages: true,
      info: { Title: `Orden de compra${proveedor ? ` · ${proveedor}` : ''}`, Author: 'Distribuidora Tachi' } });
    const partes = [];
    doc.on('data', p => partes.push(p));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));
    const F = registrarFuentes(doc), M = 40, ANCHO = doc.page.width - M * 2;
    const CANT = { x: M + 6, w: 54 }, NOMBRE = { x: M + 74, w: ANCHO - 170 };
    const CODIGO = { x: M + ANCHO - 96, w: 96 }, LIMITE = doc.page.height - 52;
    const unidades = lineas.reduce((s, l) => s + Number(l.cantidad), 0);
    let y, cebra = false;
    const texto = (t, x, py, w, tam = 9, negrita = false, color = MARCA.tinta, opciones = {}) =>
      doc.font(negrita ? F.negrita : F.normal).fontSize(tam).fillColor(color)
        .text(String(t), x, py, { width: w, ...opciones });
    const altura = (t, w, tam = 9, negrita = false) =>
      doc.font(negrita ? F.negrita : F.normal).fontSize(tam).heightOfString(String(t), { width: w });

    function cabeceraTabla() {
      texto('CANT.', CANT.x, y, CANT.w, 7, false, MARCA.grisSuave, { align: 'center', characterSpacing: 0.8 });
      texto('PRODUCTO', NOMBRE.x, y, NOMBRE.w, 7, false, MARCA.grisSuave, { characterSpacing: 0.8 });
      texto('CÓDIGO', CODIGO.x, y, CODIGO.w, 7, false, MARCA.grisSuave, { align: 'right', characterSpacing: 0.8 });
      y += 12;
      doc.rect(M, y, ANCHO, 1).fill(MARCA.tinta);
      y += 6;
    }

    function paginaNueva() {
      doc.addPage();
      y = M;
      cabeceraTabla();
      cebra = false;
    }

    function cabecera() {
      let cursor = M;
      if (fs.existsSync(LOGO)) {
        doc.image(LOGO, M, cursor - 4, { width: 130 });
        cursor += 130 * LOGO_RATIO + 2;
      } else {
        texto('TACHI', M, cursor, 150, 17, true, MARCA.naranja);
        texto('DISTRIBUIDORA', M, cursor + 20, 150, 8, false, MARCA.gris, { characterSpacing: 2 });
        cursor += 36;
      }
      const xDer = M + ANCHO - 240;
      texto('ORDEN DE COMPRA', xDer, M + 2, 240, 15, true, MARCA.tinta, { align: 'right' });
      texto(fechaLarga(fecha), xDer, M + 22, 240, 10, true, MARCA.naranja, { align: 'right' });
      const regla = Math.max(cursor + 18, M + 56);
      doc.rect(M, regla, ANCHO, 2.5).fill(MARCA.naranja);
      y = regla + 18;
      texto('PROVEEDOR', M, y, ANCHO - 180, 7.5, false, MARCA.grisSuave, { characterSpacing: 1 });
      texto(proveedor || 'Sin especificar', M, y + 12, ANCHO - 180, 15, true);
      const xCaja = M + ANCHO - 168;
      doc.roundedRect(xCaja, y - 6, 168, 52, 5).strokeColor(MARCA.linea).stroke();
      texto(lineas.length, xCaja, y + 5, 84, 17, true, MARCA.naranja, { align: 'center' });
      texto(numero(unidades), xCaja + 84, y + 5, 84, 17, true, MARCA.naranja, { align: 'center' });
      texto('PRODUCTOS', xCaja, y + 28, 84, 7, false, MARCA.grisSuave, { align: 'center', characterSpacing: 0.5 });
      texto('UNIDADES', xCaja + 84, y + 28, 84, 7, false, MARCA.grisSuave, { align: 'center', characterSpacing: 0.5 });
      y = Math.max(regla + 76, y + 12 + altura(proveedor || 'Sin especificar', ANCHO - 180, 15, true) + 18);
      cabeceraTabla();
    }

    // Cada porción conserva el texto completo. Una descripción que ocupa más
    // de una hoja continúa sin convertir su cantidad en un segundo pedido.
    function porcion(t, w, disponible, tam, negrita) {
      if (!t || disponible < altura('Ag', w, tam, negrita)) return 0;
      if (altura(t, w, tam, negrita) <= disponible) return t.length;
      let a = 0, b = t.length;
      while (a < b) {
        const medio = Math.ceil((a + b) / 2);
        if (altura(t.slice(0, medio), w, tam, negrita) <= disponible) a = medio;
        else b = medio - 1;
      }
      const espacio = t.lastIndexOf(' ', a);
      return espacio > a / 2 ? espacio + 1 : a;
    }

    function renderProducto(l) {
      const notas = [l.descripcionFactura, l.observaciones].map(t => String(t || '').trim()).filter(Boolean).join('   ·   ');
      const segmentos = [
        { texto: String(l.descripcion || 'Sin descripción'), tam: 10.5, negrita: true, color: MARCA.tinta },
        ...(notas ? [{ texto: notas, tam: 8, color: MARCA.naranjaOscuro }] : [])
      ];
      let codigo = String(l.codigo || '—'), primera = true;
      while (segmentos.length || codigo.length) {
        const altoMinimo = Math.max(28, altura(numero(l.cantidad), CANT.w, 14, true) + 10);
        if (y + altoMinimo > LIMITE) paginaNueva();
        const disponibles = LIMITE - y - 12, dibujos = [];
        let usado = 0;
        while (segmentos.length) {
          const s = segmentos[0], n = porcion(s.texto, NOMBRE.w, disponibles - usado, s.tam, s.negrita);
          if (!n) break;
          const parte = s.texto.slice(0, n);
          dibujos.push({ ...s, texto: parte, dy: usado });
          usado += altura(parte, NOMBRE.w, s.tam, s.negrita) + 2;
          s.texto = s.texto.slice(n);
          if (s.texto) break;
          segmentos.shift();
        }
        const nCodigo = porcion(codigo, CODIGO.w, disponibles, 8.5, false);
        const parteCodigo = codigo.slice(0, nCodigo);
        const alto = Math.max(usado + 10, altura(parteCodigo, CODIGO.w, 8.5) + 12, altoMinimo);
        if (cebra) doc.rect(M, y - 2, ANCHO, alto).fill(MARCA.cebra);
        cebra = !cebra;
        if (primera) {
          doc.roundedRect(CANT.x, y + 1, CANT.w, alto - 8, 4).fill(MARCA.naranjaSuave);
          texto(numero(l.cantidad), CANT.x, y + (alto - 8) / 2 - 6, CANT.w, 14, true, MARCA.naranja, { align: 'center' });
        }
        dibujos.forEach(s => texto(s.texto, NOMBRE.x, y + 3 + s.dy, NOMBRE.w, s.tam, s.negrita, s.color));
        if (parteCodigo) texto(parteCodigo, CODIGO.x, y + 5, CODIGO.w, 8.5, false, MARCA.gris, { align: 'right' });
        codigo = codigo.slice(nCodigo);
        y += alto;
        doc.rect(M, y - 2, ANCHO, 0.5).fill(MARCA.linea);
        primera = false;
      }
    }

    function seccion(titulo, nota, lista) {
      if (!lista.length) return;
      if (titulo) {
        if (y + 66 > LIMITE) paginaNueva();
        y += 7;
        doc.rect(M, y, ANCHO, 20).fill(MARCA.naranjaSuave);
        texto(titulo, M + 8, y + 6, 300, 8, true, MARCA.naranjaOscuro, { characterSpacing: 0.5 });
        texto(nota, M + 308, y + 6.5, ANCHO - 316, 7.5, false, MARCA.naranjaOscuro, { align: 'right' });
        y += 25;
        cebra = false;
      }
      lista.forEach(renderProducto);
    }

    function cierre() {
      if (y + 52 > LIMITE) { doc.addPage(); y = M; }
      y += 8;
      doc.rect(M, y, ANCHO, 44).fill(MARCA.panel);
      doc.rect(M, y, 3, 44).fill(MARCA.naranja);
      texto(`${lineas.length} productos`, M + 16, y + 9, 110, 11, true);
      texto(`${numero(unidades)} unidades`, M + 130, y + 9, 160, 11, true);
      texto('Cualquier faltante, confirmarlo antes de despachar.', M + 16, y + 27, 260, 7.5, false, MARCA.gris);
      const xFirma = M + ANCHO - 220;
      doc.moveTo(xFirma, y + 27).lineTo(xFirma + 100, y + 27).lineWidth(0.5).stroke(MARCA.grisSuave);
      doc.moveTo(xFirma + 116, y + 27).lineTo(M + ANCHO - 12, y + 27).stroke(MARCA.grisSuave);
      texto('Recibido por', xFirma, y + 31, 100, 7, false, MARCA.grisSuave);
      texto('Fecha', xFirma + 116, y + 31, 100, 7, false, MARCA.grisSuave);
    }

    try {
      cabecera();
      seccion(null, null, lineas.filter(l => !l.seccion));
      seccion('SIN CÓDIGO DE PROVEEDOR', 'usar la referencia interna', lineas.filter(l => l.seccion === 'sin_codigo'));
      seccion('SIN EQUIVALENCIA REGISTRADA', 'confirmar antes de despachar', lineas.filter(l => l.seccion === 'sin_mapeo'));
      cierre();
      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(rango.start + i);
        // El pie queda fuera del margen del cuerpo, sin disparar una hoja vacía.
        const margen = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const pie = doc.page.height - 30;
        doc.rect(M, pie - 8, ANCHO, 0.5).fill(MARCA.linea);
        texto(`Orden de compra   ·   ${proveedor || ''}`, M, pie, ANCHO - 110, 7, false, MARCA.grisSuave, { lineBreak: false, ellipsis: true });
        texto(`Página ${i + 1} de ${rango.count}`, M + ANCHO - 110, pie, 110, 7, false, MARCA.grisSuave, { align: 'right' });
        doc.page.margins.bottom = margen;
      }
      doc.end();
    } catch (e) { doc.destroy(); reject(e); }
  });
}

module.exports = { generarPdfCompra };
