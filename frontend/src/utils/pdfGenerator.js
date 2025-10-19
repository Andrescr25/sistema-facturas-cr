import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Función para cargar configuración de empresa
const getEmpresaConfig = () => {
  try {
    const config = localStorage.getItem('empresa_config');
    if (config) {
      return JSON.parse(config);
    }
  } catch (error) {
    console.error('Error cargando configuración:', error);
  }

  // Configuración por defecto
  return {
    empresa: {
      nombre: 'DISTRIBUIDORA TACHI',
      cedula: '204050474',
      direccion: 'Contiguo al mirador Call vazquez, Palmares',
      telefono: '+506-86477036',
      email: 'tachifacturas@gmail.com',
      actividadEconomica: '523402 - Venta al por menor artículos de ferretería pinturas madera y materiales',
      logo: null
    },
    bancos: [
      { nombre: 'SINPE', cuenta: '86477036 TARCICIO VARGAS CHAVARRIA' },
      { nombre: 'Banco Nacional', cuenta: '5518980336453110' },
      { nombre: 'BAC', cuenta: '4745812311852180' }
    ],
    factura: {
      terminosCondiciones: 'Gracias por su compra. Garantía según términos del fabricante.',
      notaPie: 'Factura autorizada por Hacienda',
      mostrarLogo: true,
      mostrarCabys: true
    }
  };
};

// Función para convertir número a texto (español CR)
const numeroATexto = (numero) => {
  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  if (numero === 0) return 'cero';
  if (numero === 100) return 'cien';

  let texto = '';
  const parteEntera = Math.floor(numero);
  
  if (parteEntera >= 1000) {
    const miles = Math.floor(parteEntera / 1000);
    if (miles === 1) {
      texto += 'mil ';
    } else {
      texto += numeroATexto(miles) + ' mil ';
    }
  }

  const resto = parteEntera % 1000;
  if (resto >= 100) {
    texto += centenas[Math.floor(resto / 100)] + ' ';
  }

  const restoDecenas = resto % 100;
  if (restoDecenas >= 10 && restoDecenas < 20) {
    texto += especiales[restoDecenas - 10];
  } else {
    if (restoDecenas >= 20) {
      texto += decenas[Math.floor(restoDecenas / 10)];
      if (restoDecenas % 10 > 0) {
        texto += ' y ' + unidades[restoDecenas % 10];
      }
    } else if (restoDecenas > 0) {
      texto += unidades[restoDecenas];
    }
  }

  return texto.trim() + ' colones costarricenses';
};

export const generarFacturaPDF = (facturaData) => {
  const doc = new jsPDF();
  const config = getEmpresaConfig();
  
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  let yPosition = 20;

  // ==========================================
  // HEADER: Logo + Datos Empresa
  // ==========================================
  
  // Logo (si existe y está habilitado)
  if (config.factura.mostrarLogo && config.empresa.logo) {
    try {
      doc.addImage(config.empresa.logo, 'PNG', margin, yPosition - 5, 30, 30);
    } catch (error) {
      console.error('Error agregando logo:', error);
    }
  }

  // Datos de la empresa (derecha del logo)
  const empresaX = config.factura.mostrarLogo && config.empresa.logo ? margin + 35 : margin;
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(config.empresa.nombre, empresaX, yPosition);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cédula Física ${config.empresa.cedula}`, empresaX, yPosition + 5);
  doc.text(config.empresa.direccion, empresaX, yPosition + 10);
  doc.text(config.empresa.email, empresaX, yPosition + 15);
  doc.text(config.empresa.telefono, empresaX, yPosition + 20);
  
  // Actividad económica (texto largo, ajustado)
  doc.setFontSize(8);
  const actividadLines = doc.splitTextToSize(`Actividad Económica ${config.empresa.actividadEconomica}`, pageWidth - empresaX - margin);
  doc.text(actividadLines, empresaX, yPosition + 25);

  yPosition += 45;

  // ==========================================
  // TÍTULO FACTURA (Esquina superior derecha)
  // ==========================================
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 102, 204);
  doc.text('Factura de venta', pageWidth - margin, 20, { align: 'right' });
  
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(String(facturaData.invoice?.id || '001000012979'), pageWidth - margin, 27, { align: 'right' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const fechaCreacion = facturaData.invoice?.fecha || new Date().toLocaleDateString('es-CR');
  doc.text(`Fecha de creación: ${fechaCreacion}`, pageWidth - margin, 33, { align: 'right' });
  doc.text(`Fecha de vencimiento: ${fechaCreacion}`, pageWidth - margin, 38, { align: 'right' });

  // ==========================================
  // INFORMACIÓN DEL CLIENTE
  // ==========================================
  yPosition += 5;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 7, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMACIÓN DEL CLIENTE', margin + 2, yPosition);
  
  yPosition += 7;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const clienteNombre = String(facturaData.client?.name || 'Cliente');
  const clienteCedula = String(facturaData.client?.identification || '');
  const clienteTelefono = String(facturaData.client?.phone || '');
  const clienteEmail = String(facturaData.client?.email || '');
  
  // Dirección (manejo especial si es objeto)
  let clienteDireccion = '';
  if (facturaData.client?.address) {
    clienteDireccion = typeof facturaData.client.address === 'string' 
      ? facturaData.client.address 
      : facturaData.client.address?.address || '';
  }
  
  doc.text(`Señor(es): ${clienteNombre}`, margin + 2, yPosition);
  doc.text(`Cédula física: ${clienteCedula}`, margin + 2, yPosition + 5);
  doc.text(`Teléfono: ${clienteTelefono}`, margin + 2, yPosition + 10);
  doc.text(`Dirección: ${clienteDireccion}`, margin + 2, yPosition + 15);
  doc.text(`Email: ${clienteEmail}`, margin + 2, yPosition + 20);
  
  // Método de pago y moneda
  doc.text('Método de pago:', pageWidth / 2, yPosition);
  doc.text('Moneda: CRC', pageWidth / 2, yPosition + 5);

  yPosition += 30;

  // ==========================================
  // TABLA DE PRODUCTOS
  // ==========================================
  const tableColumn = ['Producto/Servicio', 'Cantidad', 'Precio Unitario', 'Descuento', 'Impuestos', 'Total línea'];
  const tableRows = [];

  let subtotalSinImpuestos = 0;
  let totalImpuestos = 0;

  // Helper para obtener reference como string
  const getReference = (ref) => {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.reference) return String(ref.reference);
    return String(ref);
  };

  facturaData.items?.forEach((item) => {
    const cantidad = item.quantity || 0;
    const precio = item.price || 0;
    const descuentoPorcentaje = item.discount || 0;
    
    const subtotalLinea = cantidad * precio;
    const descuentoMonto = (subtotalLinea * descuentoPorcentaje) / 100;
    const baseImponible = subtotalLinea - descuentoMonto;
    
    // Calcular impuesto (13%)
    const impuesto = baseImponible * 0.13;
    const totalLinea = baseImponible + impuesto;
    
    subtotalSinImpuestos += baseImponible;
    totalImpuestos += impuesto;

    const nombre = String(item.name || 'Producto');
    const reference = getReference(item.reference) || getReference(item.code);
    
    // Obtener CABYS si existe
    const cabysText = config.factura.mostrarCabys && item.cabys 
      ? `\nCabys: ${item.cabys}` 
      : '';

    const productoTexto = reference 
      ? `${nombre}${cabysText}`
      : `${nombre}${cabysText}`;

    tableRows.push([
      productoTexto,
      cantidad.toString(),
      `₡${Math.round(precio)}`,
      descuentoMonto > 0 ? `₡${Math.round(descuentoMonto)}` : '₡0',
      `₡${Math.round(impuesto)}`,
      `₡${Math.round(totalLinea)}`
    ]);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: yPosition,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 102, 204],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3
    },
    columnStyles: {
      0: { cellWidth: 60, halign: 'left' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 25, halign: 'right' }
    },
    margin: { left: margin, right: margin }
  });

  yPosition = doc.lastAutoTable.finalY + 10;

  // ==========================================
  // TOTAL EN LETRAS
  // ==========================================
  const totalFinal = subtotalSinImpuestos + totalImpuestos;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const totalEnLetras = numeroATexto(totalFinal);
  doc.text(totalEnLetras.charAt(0).toUpperCase() + totalEnLetras.slice(1), margin, yPosition);

  yPosition += 8;

  // ==========================================
  // RESUMEN DE TOTALES (Derecha)
  // ==========================================
  const totalesX = pageWidth - margin - 50;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  doc.text('Subtotal', totalesX - 20, yPosition);
  doc.text(`₡${Math.round(subtotalSinImpuestos)}`, totalesX + 30, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('Descuento', totalesX - 20, yPosition);
  doc.text('₡0', totalesX + 30, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('Subtotal', totalesX - 20, yPosition);
  doc.text(`₡${Math.round(subtotalSinImpuestos)}`, totalesX + 30, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('IVA (13.00%)', totalesX - 20, yPosition);
  doc.text(`₡${Math.round(totalImpuestos)}`, totalesX + 30, yPosition, { align: 'right' });
  
  yPosition += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total a pagar', totalesX - 20, yPosition);
  doc.text(`₡${Math.round(totalFinal)}`, totalesX + 30, yPosition, { align: 'right' });
  
  // Valor restante
  yPosition += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Valor restante por pagar: ₡${Math.round(totalFinal)}`, totalesX - 20, yPosition);

  yPosition += 15;

  // ==========================================
  // TÉRMINOS Y CONDICIONES
  // ==========================================
  if (config.factura.terminosCondiciones) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Términos y condiciones:', margin, yPosition);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const terminosLines = doc.splitTextToSize(config.factura.terminosCondiciones, pageWidth - 2 * margin);
    doc.text(terminosLines, margin, yPosition + 5);
    
    yPosition += 5 + (terminosLines.length * 4);
  }

  // ==========================================
  // CUENTAS BANCARIAS
  // ==========================================
  if (config.bancos && config.bancos.length > 0) {
    yPosition += 5;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    config.bancos.forEach((banco, index) => {
      if (banco.nombre && banco.cuenta) {
        const texto = `${banco.nombre}_${banco.cuenta}`;
        doc.text(texto, margin, yPosition + (index * 4));
      }
    });
  }

  // ==========================================
  // PIE DE PÁGINA
  // ==========================================
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  
  const footerY = pageHeight - 15;
  const footerText = config.factura.notaPie || 'Factura autorizada por Hacienda';
  const footerWidth = doc.getTextWidth(footerText);
  doc.text(footerText, (pageWidth - footerWidth) / 2, footerY);

  return doc;
};

export const descargarFacturaPDF = (facturaData) => {
  try {
    const doc = generarFacturaPDF(facturaData);
    const nombreArchivo = `Factura_${facturaData.invoice?.id || 'SinNumero'}_${new Date().getTime()}.pdf`;
    doc.save(nombreArchivo);
    console.log('✅ PDF generado exitosamente');
  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    throw error;
  }
};
