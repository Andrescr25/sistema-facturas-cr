/**
 * 📄 Generador de PDF para Facturas
 * 
 * Genera PDFs con diseño similar a Alegra
 * Funciona completamente en el cliente sin necesidad de backend
 */

import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Generar PDF de factura
 * 
 * @param {Object} facturaData - Datos de la factura
 * @param {Object} facturaData.invoice - Información de la factura
 * @param {Object} facturaData.client - Información del cliente
 * @param {Array} facturaData.items - Productos de la factura
 * @param {Object} facturaData.empresa - Información de la empresa
 */
export const generarFacturaPDF = (facturaData) => {
  const doc = new jsPDF();

  // Configuración
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  let yPosition = margin;

  // Colores
  const primaryColor = [37, 99, 235]; // Azul
  const secondaryColor = [107, 114, 128]; // Gris
  const headerBg = [239, 246, 255]; // Azul claro

  // ==========================================
  // HEADER - Información de la Empresa
  // ==========================================
  doc.setFillColor(...headerBg);
  doc.rect(0, 0, pageWidth, 50, 'F');

  // Logo/Nombre de la empresa (izquierda)
  doc.setFontSize(22);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text(facturaData.empresa?.nombre || 'DISTRIBUIDORA TACHI', margin, 20);

  doc.setFontSize(10);
  doc.setTextColor(...secondaryColor);
  doc.setFont('helvetica', 'normal');
  if (facturaData.empresa?.cedula) {
    doc.text(`Cédula Jurídica: ${facturaData.empresa.cedula}`, margin, 28);
  }
  if (facturaData.empresa?.direccion) {
    doc.text(facturaData.empresa.direccion, margin, 34);
  }
  if (facturaData.empresa?.telefono) {
    doc.text(`Tel: ${facturaData.empresa.telefono}`, margin, 40);
  }
  if (facturaData.empresa?.email) {
    doc.text(`Email: ${facturaData.empresa.email}`, margin, 46);
  }

  // Título FACTURA (derecha)
  doc.setFontSize(24);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  const facturaTitle = facturaData.invoice?.electronica ? 'FACTURA ELECTRÓNICA' : 'FACTURA';
  const titleWidth = doc.getTextWidth(facturaTitle);
  doc.text(facturaTitle, pageWidth - margin - titleWidth, 20);

  // Número de factura y fecha
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  if (facturaData.invoice?.id) {
    const facturaNumText = `# ${facturaData.invoice.id}`;
    const facturaNumWidth = doc.getTextWidth(facturaNumText);
    doc.text(facturaNumText, pageWidth - margin - facturaNumWidth, 30);
  }
  if (facturaData.invoice?.fecha) {
    const fechaText = `Fecha: ${new Date(facturaData.invoice.fecha).toLocaleDateString('es-CR')}`;
    const fechaWidth = doc.getTextWidth(fechaText);
    doc.text(fechaText, pageWidth - margin - fechaWidth, 36);
  }

  yPosition = 60;

  // ==========================================
  // INFORMACIÓN DEL CLIENTE
  // ==========================================
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 35, 'F');

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', margin + 5, yPosition + 8);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(facturaData.client?.name || 'Cliente', margin + 5, yPosition + 15);
  
  if (facturaData.client?.identification) {
    doc.text(`Cédula: ${facturaData.client.identification}`, margin + 5, yPosition + 21);
  }

  if (facturaData.client?.email) {
    doc.text(`Email: ${facturaData.client.email}`, margin + 5, yPosition + 27);
  }

  if (facturaData.client?.phone) {
    const phoneText = `Tel: ${facturaData.client.phone}`;
    const phoneWidth = doc.getTextWidth(phoneText);
    doc.text(phoneText, pageWidth - margin - phoneWidth - 5, yPosition + 21);
  }

  if (facturaData.client?.address) {
    doc.text(facturaData.client.address, margin + 5, yPosition + 33);
  }

  yPosition += 45;

  // ==========================================
  // TABLA DE PRODUCTOS
  // ==========================================
  const tableColumn = ['#', 'Código', 'Descripción', 'Cantidad', 'Precio Unit.', 'Descuento', 'Subtotal'];
  const tableRows = [];

  let subtotal = 0;

  facturaData.items?.forEach((item, index) => {
    const cantidad = item.quantity || 0;
    const precio = item.price || 0;
    const descuentoPorcentaje = item.discount || 0;
    
    const subtotalItem = cantidad * precio;
    const descuentoMonto = (subtotalItem * descuentoPorcentaje) / 100;
    const subtotalConDescuento = subtotalItem - descuentoMonto;
    
    subtotal += subtotalConDescuento;

    const row = [
      (index + 1).toString(),
      item.reference || item.code || '-',
      item.name || item.description || 'Producto',
      cantidad.toString(),
      `₡${precio.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`,
      descuentoPorcentaje > 0 ? `${descuentoPorcentaje}%` : '-',
      `₡${subtotalConDescuento.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`
    ];

    tableRows.push(row);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: yPosition,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: 255,
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 25 },
      2: { halign: 'left', cellWidth: 60 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'center', cellWidth: 20 },
      6: { halign: 'right', cellWidth: 30 }
    },
    margin: { left: margin, right: margin }
  });

  yPosition = doc.lastAutoTable.finalY + 10;

  // ==========================================
  // TOTALES
  // ==========================================
  const totalsX = pageWidth - margin - 60;
  let totalsY = yPosition;

  // Subtotal
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totalsX, totalsY);
  doc.text(`₡${subtotal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`, totalsX + 50, totalsY, { align: 'right' });
  totalsY += 7;

  // Descuento global (si existe)
  if (facturaData.invoice?.descuentoGlobal > 0) {
    const descuentoGlobal = (subtotal * facturaData.invoice.descuentoGlobal) / 100;
    doc.text(`Descuento (${facturaData.invoice.descuentoGlobal}%):`, totalsX, totalsY);
    doc.text(`-₡${descuentoGlobal.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`, totalsX + 50, totalsY, { align: 'right' });
    subtotal -= descuentoGlobal;
    totalsY += 7;
  }

  // Impuestos
  const impuestoPorcentaje = facturaData.invoice?.impuestoPorcentaje || 13;
  const impuesto = (subtotal * impuestoPorcentaje) / 100;
  doc.text(`Impuesto (${impuestoPorcentaje}%):`, totalsX, totalsY);
  doc.text(`₡${impuesto.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`, totalsX + 50, totalsY, { align: 'right' });
  totalsY += 10;

  // Total
  const total = subtotal + impuesto;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', totalsX, totalsY);
  doc.text(`₡${total.toLocaleString('es-CR', { minimumFractionDigits: 2 })}`, totalsX + 50, totalsY, { align: 'right' });

  // ==========================================
  // OBSERVACIONES
  // ==========================================
  if (facturaData.invoice?.observaciones) {
    totalsY += 15;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones:', margin, totalsY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const observacionesLines = doc.splitTextToSize(facturaData.invoice.observaciones, pageWidth - 2 * margin);
    doc.text(observacionesLines, margin, totalsY + 7);
  }

  // ==========================================
  // FOOTER
  // ==========================================
  const footerY = pageHeight - 20;
  doc.setFontSize(8);
  doc.setTextColor(...secondaryColor);
  doc.setFont('helvetica', 'italic');
  
  const footerText = facturaData.invoice?.electronica 
    ? 'Factura Electrónica - Documento generado electrónicamente'
    : 'Documento generado por Sistema de Facturación';
  
  const footerWidth = doc.getTextWidth(footerText);
  doc.text(footerText, (pageWidth - footerWidth) / 2, footerY);

  // Número de página
  doc.text(`Página 1 de 1`, pageWidth / 2, footerY + 5, { align: 'center' });

  return doc;
};

/**
 * Descargar PDF
 */
export const descargarFacturaPDF = (facturaData, nombreArchivo) => {
  const doc = generarFacturaPDF(facturaData);
  const fileName = nombreArchivo || `factura-${facturaData.invoice?.id || Date.now()}.pdf`;
  doc.save(fileName);
};

/**
 * Obtener PDF como Blob (para preview o envío)
 */
export const obtenerFacturaPDFBlob = (facturaData) => {
  const doc = generarFacturaPDF(facturaData);
  return doc.output('blob');
};

/**
 * Obtener PDF como Data URL (para preview en iframe)
 */
export const obtenerFacturaPDFDataURL = (facturaData) => {
  const doc = generarFacturaPDF(facturaData);
  return doc.output('dataurlstring');
};

export default {
  generarFacturaPDF,
  descargarFacturaPDF,
  obtenerFacturaPDFBlob,
  obtenerFacturaPDFDataURL
};

