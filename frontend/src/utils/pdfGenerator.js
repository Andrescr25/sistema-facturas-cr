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
      mostrarCabys: true,
      colorPrimario: '#FF6B35' // Naranja por defecto
    }
  };
};

// Función para formatear moneda sin símbolo especial
const formatearMoneda = (valor) => {
  return `C${Math.round(valor).toLocaleString('es-CR')}`;
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

// Función para convertir color hex a RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 107, b: 53 }; // naranja por defecto
};

export const generarFacturaPDF = (facturaData) => {
  const doc = new jsPDF();
  const config = getEmpresaConfig();
  
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  let yPosition = 15;

  // Convertir color primario
  const colorPrimario = hexToRgb(config.factura.colorPrimario || '#FF6B35');

  // ==========================================
  // HEADER: Logo + Datos Empresa
  // ==========================================
  
  // Logo (si existe y está habilitado)
  const logoWidth = 35;
  const logoHeight = 35;
  const logoMargin = margin;
  
  if (config.factura.mostrarLogo && config.empresa.logo) {
    try {
      doc.addImage(config.empresa.logo, 'PNG', logoMargin, yPosition, logoWidth, logoHeight);
    } catch (error) {
      console.error('Error agregando logo:', error);
    }
  }

  // Datos de la empresa (derecha del logo con más espacio)
  const empresaX = config.factura.mostrarLogo && config.empresa.logo ? logoMargin + logoWidth + 8 : margin;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorPrimario.r, colorPrimario.g, colorPrimario.b);
  doc.text(config.empresa.nombre, empresaX, yPosition + 5);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Cedula Fisica ${config.empresa.cedula}`, empresaX, yPosition + 11);
  doc.text(config.empresa.direccion, empresaX, yPosition + 16);
  doc.text(config.empresa.email, empresaX, yPosition + 21);
  doc.text(config.empresa.telefono, empresaX, yPosition + 26);
  
  // Actividad económica (texto largo, ajustado)
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const actividadLines = doc.splitTextToSize(`Actividad Economica ${config.empresa.actividadEconomica}`, pageWidth - empresaX - margin - 60);
  doc.text(actividadLines, empresaX, yPosition + 31);

  // ==========================================
  // TÍTULO FACTURA (Esquina superior derecha)
  // ==========================================
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorPrimario.r, colorPrimario.g, colorPrimario.b);
  doc.text('Factura de venta', pageWidth - margin, yPosition + 5, { align: 'right' });
  
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(String(facturaData.invoice?.id || '001000012979'), pageWidth - margin, yPosition + 13, { align: 'right' });
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const fechaCreacion = facturaData.invoice?.fecha || new Date().toLocaleDateString('es-CR');
  doc.text(`Fecha de creacion: ${fechaCreacion}`, pageWidth - margin, yPosition + 20, { align: 'right' });
  doc.text(`Fecha de vencimiento: ${fechaCreacion}`, pageWidth - margin, yPosition + 25, { align: 'right' });

  yPosition += 50;

  // ==========================================
  // INFORMACIÓN DEL CLIENTE
  // ==========================================
  
  doc.setFillColor(colorPrimario.r, colorPrimario.g, colorPrimario.b);
  doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 7, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('INFORMACION DEL CLIENTE', margin + 2, yPosition);
  
  yPosition += 8;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
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
  
  // Columna izquierda
  doc.text(`Senor(es): ${clienteNombre}`, margin + 2, yPosition);
  doc.text(`Cedula fisica: ${clienteCedula}`, margin + 2, yPosition + 5);
  doc.text(`Telefono: ${clienteTelefono}`, margin + 2, yPosition + 10);
  doc.text(`Direccion: ${clienteDireccion}`, margin + 2, yPosition + 15);
  doc.text(`Email: ${clienteEmail}`, margin + 2, yPosition + 20);
  
  // Columna derecha
  const colDerechaX = pageWidth / 2 + 10;
  doc.text('Metodo de pago:', colDerechaX, yPosition);
  doc.text('Moneda: CRC', colDerechaX, yPosition + 5);

  yPosition += 30;

  // ==========================================
  // TABLA DE PRODUCTOS
  // ==========================================
  const tableColumn = ['Producto/Servicio', 'Cantidad', 'Precio Unitario', 'Descuento', 'Impuestos', 'Total linea'];
  const tableRows = [];

  let subtotalSinImpuestos = 0;
  let totalDescuentos = 0;
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
    totalDescuentos += descuentoMonto;
    totalImpuestos += impuesto;

    const nombre = String(item.name || 'Producto');
    const reference = getReference(item.reference) || getReference(item.code);
    
    // Obtener CABYS si existe
    const cabysText = config.factura.mostrarCabys && item.cabys 
      ? `\nCabys: ${item.cabys}` 
      : '';

    const productoTexto = `${nombre}${cabysText}`;

    tableRows.push([
      productoTexto,
      cantidad.toString(),
      formatearMoneda(precio),
      formatearMoneda(descuentoMonto),
      formatearMoneda(impuesto),
      formatearMoneda(totalLinea)
    ]);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: yPosition,
    theme: 'grid',
    headStyles: {
      fillColor: [colorPrimario.r, colorPrimario.g, colorPrimario.b],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 4,
      textColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 65, halign: 'left' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' }
    },
    margin: { left: margin, right: margin }
  });

  yPosition = doc.lastAutoTable.finalY + 12;

  // ==========================================
  // TOTAL EN LETRAS
  // ==========================================
  const totalFinal = subtotalSinImpuestos + totalImpuestos;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(60, 60, 60);
  const totalEnLetras = numeroATexto(totalFinal);
  doc.text(totalEnLetras.charAt(0).toUpperCase() + totalEnLetras.slice(1), margin, yPosition);

  yPosition += 10;

  // ==========================================
  // RESUMEN DE TOTALES (Derecha)
  // ==========================================
  const totalesX = pageWidth - margin - 60;
  const valoresX = pageWidth - margin - 5;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.text('subSubTotal', totalesX, yPosition);
  doc.text(formatearMoneda(subtotalSinImpuestos), valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('Descuento', totalesX, yPosition);
  doc.text(formatearMoneda(totalDescuentos), valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('Subtotal', totalesX, yPosition);
  doc.text(formatearMoneda(subtotalSinImpuestos), valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('IVA (13.00%)', totalesX, yPosition);
  doc.text(formatearMoneda(totalImpuestos), valoresX, yPosition, { align: 'right' });
  
  yPosition += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total a pagar', totalesX, yPosition);
  doc.text(formatearMoneda(totalFinal), valoresX, yPosition, { align: 'right' });
  
  // Valor restante
  yPosition += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Valor restante por pagar: ${formatearMoneda(totalFinal)}`, totalesX, yPosition);

  yPosition += 15;

  // ==========================================
  // TÉRMINOS Y CONDICIONES
  // ==========================================
  if (config.factura.terminosCondiciones) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Terminos y condiciones:', margin, yPosition);
    
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
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
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
