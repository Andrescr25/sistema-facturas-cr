const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const { MARCA, LOGO, LOGO_RATIO, registrarFuentes, colonesExacto, fechaLarga } = require('../../utils/marcaPdf');

/** Catálogo de cuatro fichas por página: foto grande y datos debajo.
 * Categorías, subcategorías y promociones comparten la cuadrícula en su orden. */
function generarPdfCatalogo(modelo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 38, bufferPages: true,
      info: { Title: `Catálogo · ${modelo.cliente} · ${modelo.ciclo.semana}`, Author: modelo.negocio } });
    const partes = [];
    doc.on('data', p => partes.push(p)); doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));
    const F = registrarFuentes(doc), M = 38, W = 536, LIMITE = 726, GAP = 18, CW = (W - GAP) / 2, INTERIOR = CW - 24;
    let y = 0;
    const texto = (s, x, py, ancho, tam = 9, negrita = false, color = MARCA.tinta, opciones = {}) => {
      doc.font(negrita ? F.negrita : F.normal).fontSize(tam).fillColor(color)
        .text(String(s), x, py, { width: ancho, ...opciones });
    };
    const altura = (s, ancho, tam = 9, negrita = false) => doc.font(negrita ? F.negrita : F.normal).fontSize(tam).heightOfString(String(s), { width: ancho });
    const cabecera = primera => {
      if (fs.existsSync(LOGO)) doc.image(LOGO, M, 28, { width: 110, height: 110 * LOGO_RATIO });
      texto('CATÁLOGO DE PRODUCTOS', 272, 29, 302, 13, true, MARCA.naranja, { align: 'right' });
      texto(`Preventa · ${modelo.total} productos · IVA incluido`, 272, 52, 302, 8.5, false, MARCA.gris, { align: 'right' });
      y = 76;
      texto(modelo.cliente, M, y, W, 11, true); y += Math.max(19, altura(modelo.cliente, W, 11, true) + 5);
      const contexto = `${modelo.ciclo.rutaNombre} · Semana ${modelo.ciclo.semana.split('-').reverse().join('/')}`;
      texto(contexto, M, y, W, 9, true, MARCA.naranjaOscuro); y += Math.max(18, altura(contexto, W, 9, true) + 5);
      texto(`${modelo.referencia} · Preparado el ${fechaLarga(modelo.fecha)}`, M, y, W, 7.5, false, MARCA.gris); y += 19;
      if (primera) {
        // El usuario retiró el bloque de instrucciones: vive en el mensaje WA.
        const nota = `Precios con IVA al preparar el catálogo; disponibilidad por confirmar.${modelo.fallback ? ' Sin selección disponible: catálogo completo.' : ''}`;
        texto(nota, M, y, W, 7.5, false, MARCA.gris); y += altura(nota, W, 7.5) + 13;
      }
    };
    const medidas = (p, seccion, alto) => {
      const detalle = `${p.codigo}${p.referencia ? ` · Ref. ${p.referencia}` : ''}`;
      // Medimos los textos completos con la fuente real. Un nombre o título
      // largo ajusta su ficha, sin expulsar productos a otra hoja ni recortarlos.
      for (let ajuste = 0; ajuste <= 7; ajuste++) {
        const tamCategoria = Math.max(7, 10 - ajuste * 0.5), tamSubcategoria = Math.max(6, 8 - ajuste * 0.5);
        const tamNombre = Math.max(7, 10 - ajuste * 0.5), tamDetalle = Math.max(6.5, 7.5 - ajuste * 0.25);
        const compacto = ajuste > 0, fotoY = compacto ? 27 : 32, anteriorY = compacto ? 20 : 23;
        const hCategoria = altura(seccion.titulo, INTERIOR, tamCategoria, true) + (compacto ? 3 : 4);
        const hEncabezado = hCategoria + altura(seccion.subcategoria || 'Otros', INTERIOR, tamSubcategoria) + (compacto ? 10 : 12);
        const hTarjeta = alto - hEncabezado - 7;
        const nombre = Math.max(23, altura(p.nombre, INTERIOR, tamNombre, true));
        const hDetalle = altura(detalle, INTERIOR, tamDetalle);
        const espacioFoto = hTarjeta - (fotoY + (compacto ? 5 : 9) + nombre + (compacto ? 3 : 5)
          + hDetalle + (compacto ? 4 : 7) + anteriorY + altura(colonesExacto(p.precioAnterior || p.precio), INTERIOR, 8) + (compacto ? 8 : 10));
        if (espacioFoto < 60) continue;
        const hFoto = Math.min(122, espacioFoto), nombreY = fotoY + hFoto + (compacto ? 5 : 9);
        const detalleY = nombreY + nombre + (compacto ? 3 : 5);
        return { detalle, nombreY, detalleY, precioY: detalleY + hDetalle + (compacto ? 4 : 7), anteriorY,
          fotoY, hFoto, hCategoria, hEncabezado, hTarjeta, tamCategoria, tamSubcategoria, tamNombre, tamDetalle };
      }
      throw new Error('El texto de una ficha excede el espacio del catálogo de cuatro productos por página');
    };
    const encabezado = (seccion, x, py, med) => {
      doc.roundedRect(x, py, CW, med.hEncabezado, 7).fill(MARCA.naranjaSuave);
      texto(seccion.titulo, x + 12, py + 5, INTERIOR, med.tamCategoria, true, MARCA.naranjaOscuro);
      texto(seccion.subcategoria || 'Otros', x + 12, py + 5 + med.hCategoria, INTERIOR, med.tamSubcategoria, false, MARCA.gris);
    };
    const tarjeta = (p, x, py, alto, med) => {
      doc.roundedRect(x, py, CW, alto, 10).lineWidth(0.7).strokeColor(MARCA.linea).stroke();
      let bx = x + 12;
      for (const etiqueta of p.etiquetas || []) {
        doc.font(F.negrita).fontSize(8);
        const ancho = doc.widthOfString(etiqueta) + 18;
        doc.roundedRect(bx, py + 9, ancho, 17, 5).fill(etiqueta === 'Liquidación' ? '#B91C1C' : MARCA.naranja);
        texto(etiqueta, bx + 9, py + 12, ancho - 18, 8, true, '#FFFFFF'); bx += ancho + 6;
      }
      if (p.foto) doc.image(p.foto, x + 12, py + med.fotoY, { fit: [INTERIOR, med.hFoto], align: 'center', valign: 'center' });
      else {
        doc.roundedRect(x + 12, py + med.fotoY, INTERIOR, med.hFoto, 6).fill(MARCA.panel);
        texto('Sin imagen', x + 12, py + med.fotoY + (med.hFoto - 11) / 2, INTERIOR, 9, false, MARCA.gris, { align: 'center' });
      }
      texto(p.nombre, x + 12, py + med.nombreY, INTERIOR, med.tamNombre, true, MARCA.tinta, { align: 'center' });
      texto(med.detalle, x + 12, py + med.detalleY, INTERIOR, med.tamDetalle, false, MARCA.gris, { align: 'center' });
      texto(colonesExacto(p.precio), x + 12, py + med.precioY, INTERIOR, 15, true, MARCA.naranjaOscuro, { align: 'center' });
      if (p.precioAnterior > p.precio) texto(colonesExacto(p.precioAnterior), x + 12, py + med.precioY + med.anteriorY, INTERIOR, 8, false, MARCA.gris, { align: 'center', strike: true });
    };
    try {
      const fichas = modelo.secciones.flatMap(seccion => seccion.productos.map(producto => ({ seccion, producto })));
      cabecera(true);
      // Se pagina el catálogo completo, no cada subcategoría: incluso los
      // grupos impares comparten fila. Solo la última hoja puede quedar parcial.
      for (let i = 0; i < fichas.length; i += 4) {
        if (i) { doc.addPage(); cabecera(false); }
        const alto = (LIMITE - y - 12) / 2;
        fichas.slice(i, i + 4).forEach(({ seccion, producto }, j) => {
          const x = M + (j % 2) * (CW + GAP), py = y + Math.floor(j / 2) * (alto + 12);
          const med = medidas(producto, seccion, alto);
          encabezado(seccion, x, py, med);
          tarjeta(producto, x, py + med.hEncabezado + 7, med.hTarjeta, med);
        });
      }
      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(i);
        texto(`${modelo.referencia} · ${modelo.negocio}`, M, 740, 390, 7, false, MARCA.gris);
        texto(`${i + 1} / ${rango.count}`, M + 400, 740, 136, 8, false, MARCA.gris, { align: 'right' });
      }
      doc.end();
    } catch (e) { doc.destroy(); reject(e); }
  });
}
module.exports = { generarPdfCatalogo };
