const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const { MARCA, LOGO, LOGO_RATIO, registrarFuentes, colonesExacto, fechaLarga } = require('../../utils/marcaPdf');

/** Papel de consulta: código estable para responder por WhatsApp, precio con
 * IVA y semana en cada hoja. No imprime saldos ni cantidades de compras. */
function generarPdfCatalogo(modelo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 38, bufferPages: true,
      info: { Title: `Catálogo · ${modelo.cliente} · ${modelo.ciclo.semana}`, Author: modelo.negocio } });
    const partes = [];
    doc.on('data', p => partes.push(p)); doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));
    const F = registrarFuentes(doc), M = 38, W = 536, LIMITE = 704;
    let y = 0;
    const texto = (s, x, py, ancho, tam = 9, negrita = false, color = MARCA.tinta, opciones = {}) => {
      doc.font(negrita ? F.negrita : F.normal).fontSize(tam).fillColor(color)
        .text(String(s), x, py, { width: ancho, ...opciones });
    };
    const altura = (s, ancho, tam = 9) => doc.font(F.normal).fontSize(tam).heightOfString(String(s), { width: ancho });
    const cabecera = primera => {
      if (fs.existsSync(LOGO)) doc.image(LOGO, M, 28, { width: 110, height: 110 * LOGO_RATIO });
      texto('CATÁLOGO DE PREVENTA', 290, 31, 284, 13, true, MARCA.naranja, { align: 'right' });
      texto(`${modelo.total} productos · IVA incluido`, 290, 53, 284, 9, false, MARCA.gris, { align: 'right' });
      y = 76;
      texto(modelo.cliente, M, y, W, 12, true); y += Math.max(20, altura(modelo.cliente, W, 12) + 5);
      const contexto = `${modelo.ciclo.rutaNombre} · Semana ${modelo.ciclo.semana.split('-').reverse().join('/')}`;
      texto(contexto, M, y, W, 10, true, MARCA.naranjaOscuro); y += Math.max(20, altura(contexto, W, 10) + 5);
      texto(`Referencia ${modelo.referencia} · Preparado el ${fechaLarga(modelo.fecha)}`, M, y, W, 8, false, MARCA.gris); y += 22;
      if (primera) {
        const nota = `Precios al preparar este catálogo; confirmamos disponibilidad y total al recibir tu pedido.${modelo.fallback ? ' Sin selección disponible: incluimos el catálogo completo.' : ''}`;
        texto(nota, M, y, W, 8, false, MARCA.gris); y += altura(nota, W, 8) + 18;
      }
    };
    const tituloSeccion = (titulo, continuacion = false) => {
      const nombre = titulo + (continuacion ? ' · continuación' : '');
      if (y + 70 > LIMITE) { doc.addPage(); cabecera(false); }
      const h = Math.max(30, altura(nombre, W - 20, 10) + 16);
      doc.roundedRect(M, y, W, h, 6).fill(MARCA.panel);
      texto(nombre, M + 10, y + 8, W - 20, 10, true); y += h + 10;
      texto('CÓDIGO', M, y, 75, 7, true, MARCA.gris);
      texto('PRODUCTO', M + 152, y, 232, 7, true, MARCA.gris);
      texto('PRECIO CON IVA', M + 394, y, 142, 7, true, MARCA.gris, { align: 'right' }); y += 18;
    };
    try {
      cabecera(true);
      for (const seccion of modelo.secciones) {
        tituloSeccion(seccion.titulo);
        for (const p of seccion.productos) {
          const detalle = p.referencia ? `Ref. ${p.referencia}` : '';
          const hNombre = altura(p.nombre, 232), hDetalle = detalle ? altura(detalle, 232, 7) + 3 : 0;
          const h = Math.max(66, hNombre + hDetalle + 12, p.precioAnterior ? 41 : 32);
          if (y + h > LIMITE) { doc.addPage(); cabecera(false); tituloSeccion(seccion.titulo, true); }
          texto(p.codigo, M, y + 4, 75, 8, true);
          if (p.foto) doc.image(p.foto, M + 78, y + 4, { fit: [64, 54], align: 'center', valign: 'center' });
          else texto('Sin imagen', M + 78, y + 23, 64, 7, false, MARCA.gris, { align: 'center' });
          texto(p.nombre, M + 152, y + 4, 232);
          if (detalle) texto(detalle, M + 152, y + 7 + hNombre, 232, 7, false, MARCA.gris);
          texto(colonesExacto(p.precio), M + 394, y + 4, 142, 10, true, MARCA.naranjaOscuro, { align: 'right' });
          if (p.precioAnterior) texto(`Antes ${colonesExacto(p.precioAnterior)}`, M + 394, y + 20, 142, 7, false, MARCA.gris, { align: 'right' });
          doc.moveTo(M, y + h).lineTo(M + W, y + h).strokeColor(MARCA.linea).stroke(); y += h + 3;
        }
        y += 15;
      }
      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(i);
        texto(`${modelo.referencia} · ${modelo.negocio}`, M, 733, 375, 7, false, MARCA.gris);
        texto(`${i + 1} / ${rango.count}`, M + 400, 733, 136, 8, false, MARCA.gris, { align: 'right' });
      }
      doc.end();
    } catch (e) { doc.destroy(); reject(e); }
  });
}
module.exports = { generarPdfCatalogo };
