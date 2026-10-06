const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const { MARCA, LOGO, LOGO_RATIO, registrarFuentes, colonesExacto, fechaLarga } = require('../../utils/marcaPdf');

/** Catálogo de dos columnas: foto grande y datos debajo. Las promociones
 * conviven con su categoría/subcategoría, sin duplicar fichas ni precios. */
function generarPdfCatalogo(modelo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 38, bufferPages: true,
      info: { Title: `Catálogo · ${modelo.cliente} · ${modelo.ciclo.semana}`, Author: modelo.negocio } });
    const partes = [];
    doc.on('data', p => partes.push(p)); doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));
    const F = registrarFuentes(doc), M = 38, W = 536, LIMITE = 726, GAP = 18, CW = (W - GAP) / 2, INTERIOR = CW - 24;
    let y = 0, categoriaEnPagina = null;
    const texto = (s, x, py, ancho, tam = 9, negrita = false, color = MARCA.tinta, opciones = {}) => {
      doc.font(negrita ? F.negrita : F.normal).fontSize(tam).fillColor(color)
        .text(String(s), x, py, { width: ancho, ...opciones });
    };
    const altura = (s, ancho, tam = 9, negrita = false) => doc.font(negrita ? F.negrita : F.normal).fontSize(tam).heightOfString(String(s), { width: ancho });
    const cabecera = primera => {
      categoriaEnPagina = null;
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
    const datosGrupo = (seccion, continuacion = false) => {
      const mostrarCategoria = categoriaEnPagina !== seccion.titulo;
      const sub = (seccion.subcategoria || 'Otros') + (continuacion ? ' · continuación' : '');
      const altoCategoria = mostrarCategoria ? altura(seccion.titulo, W - 20, 11, true) + 4 : 0;
      return { mostrarCategoria, sub, altoCategoria, alto: altoCategoria + altura(sub, W - 20, 8.5) + 12 };
    };
    const encabezadoGrupo = (seccion, continuacion = false) => {
      const g = datosGrupo(seccion, continuacion);
      doc.roundedRect(M, y, W, g.alto, 7).fill(MARCA.naranjaSuave);
      if (g.mostrarCategoria) texto(seccion.titulo, M + 10, y + 5, W - 20, 11, true, MARCA.naranjaOscuro);
      texto(g.sub, M + 10, y + 5 + g.altoCategoria, W - 20, 8.5, false, MARCA.gris);
      categoriaEnPagina = seccion.titulo;
      y += g.alto + 8;
    };
    const medidas = p => {
      const detalle = `${p.codigo}${p.referencia ? ` · Ref. ${p.referencia}` : ''}`;
      const nombre = Math.max(25, altura(p.nombre, INTERIOR, 10, true));
      const hDetalle = altura(detalle, INTERIOR, 7.5);
      const precioY = 163 + nombre + 5 + hDetalle + 7;
      return { detalle, nombre, precioY, alto: precioY + 21 + 13 + 10 };
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
      if (p.foto) doc.image(p.foto, x + 12, py + 32, { fit: [INTERIOR, 122], align: 'center', valign: 'center' });
      else {
        doc.roundedRect(x + 12, py + 32, INTERIOR, 122, 6).fill(MARCA.panel);
        texto('Sin imagen', x + 12, py + 86, INTERIOR, 9, false, MARCA.gris, { align: 'center' });
      }
      texto(p.nombre, x + 12, py + 163, INTERIOR, 10, true, MARCA.tinta, { align: 'center' });
      texto(med.detalle, x + 12, py + 163 + med.nombre + 5, INTERIOR, 7.5, false, MARCA.gris, { align: 'center' });
      texto(colonesExacto(p.precio), x + 12, py + med.precioY, INTERIOR, 15, true, MARCA.naranjaOscuro, { align: 'center' });
      if (p.precioAnterior > p.precio) texto(colonesExacto(p.precioAnterior), x + 12, py + med.precioY + 23, INTERIOR, 8, false, MARCA.gris, { align: 'center', strike: true });
    };
    try {
      cabecera(true);
      for (const seccion of modelo.secciones) {
        const primeras = seccion.productos.slice(0,2).map(medidas);
        const hGrupo = datosGrupo(seccion).alto + 8;
        // Un encabezado no queda huérfano al pie: debe caber la primera fila.
        if (y + hGrupo + Math.max(...primeras.map(m => m.alto)) > LIMITE) { doc.addPage(); cabecera(false); }
        encabezadoGrupo(seccion);
        for (let i = 0; i < seccion.productos.length; i += 2) {
          const fila = seccion.productos.slice(i, i + 2), ms = fila.map(medidas), alto = Math.max(...ms.map(m => m.alto));
          if (y + alto > LIMITE) { doc.addPage(); cabecera(false); encabezadoGrupo(seccion, true); }
          fila.forEach((p, j) => tarjeta(p, M + j * (CW + GAP), y, alto, ms[j])); y += alto + 12;
        }
        y += 4;
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
