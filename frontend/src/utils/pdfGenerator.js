import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { alegraService } from '../services/alegraService';

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
      nombre: 'Distribuidora Tachi',
      cedula: '204050474',
      direccion: 'Contiguo al mirador Call vazquez, Palmares',
      telefono: '+506-86477036',
      email: 'tachifacturas@gmail.com',
      actividadEconomica: '4752.1 - Venta al por menor de artículos de ferretería y pinturas en comercios especializados',
      logo: null
    },
    bancos: [
      { nombre: 'SINPE', cuenta: '86477036 TARCICIO VARGAS CHAVARRIA' },
      { nombre: 'Banco Nacional', cuenta: '5518980336453110' },
      { nombre: 'BAC', cuenta: '4745812311852180' }
    ],
    factura: {
      terminosCondiciones: '',
      notaPie: '',
      mostrarLogo: true,
      mostrarCabys: false,
      colorPrimario: '#000000'
    }
  };
};

// Función para formatear moneda
const formatearMoneda = (valor) => {
  return `₡ ${Math.round(valor).toLocaleString('es-CR')}`;
};

// Función para convertir color hex a RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

// Función para obtener el siguiente consecutivo
export const getSiguienteConsecutivo = async () => {
  try {
    const result = await alegraService.getSiguienteConsecutivo();
    return result.siguienteConsecutivo || '001000012980';
  } catch (error) {
    console.error('Error obteniendo consecutivo:', error);
    return '001000012980';
  }
};

export const generarFacturaPDF = async (facturaData) => {
  const doc = new jsPDF();
  const config = getEmpresaConfig();
  
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  let yPosition = 20;

  // Convertir color primario
  const colorPrimario = hexToRgb(config.factura.colorPrimario || '#000000');

  // ==========================================
  // HEADER SIMPLE: Logo + Nombre + CF + Email + No.
  // ==========================================
  
  const headerLeftX = margin;
  const headerRightX = pageWidth - margin;

  // Logo (si existe y está habilitado)
  if (config.factura.mostrarLogo && config.empresa.logo) {
    try {
      doc.addImage(config.empresa.logo, 'PNG', headerLeftX, yPosition - 5, 20, 20);
    } catch (error) {
      console.error('Error agregando logo:', error);
    }
  }

  // Nombre de la empresa (alineado a la izquierda)
  const empresaTextX = config.factura.mostrarLogo && config.empresa.logo ? headerLeftX + 25 : headerLeftX;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(config.empresa.nombre, empresaTextX, yPosition);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`CF: ${config.empresa.cedula}`, empresaTextX, yPosition + 5);
  doc.text(config.empresa.email, empresaTextX, yPosition + 10);

  // Número de factura (alineado a la derecha)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('No.', headerRightX, yPosition, { align: 'right' });
  
  doc.setFontSize(12);
  const numeroFactura = facturaData.invoice?.id || await getSiguienteConsecutivo();
  doc.text(String(numeroFactura), headerRightX, yPosition + 6, { align: 'right' });

  yPosition += 25;

  // ==========================================
  // TABLA DE INFORMACIÓN DEL CLIENTE
  // ==========================================
  
  const clienteNombre = String(facturaData.client?.name || '');
  const clienteCedula = String(facturaData.client?.identification || '');
  const clienteTelefono = String(facturaData.client?.phone || '');
  
  let clienteDireccion = '';
  if (facturaData.client?.address) {
    clienteDireccion = typeof facturaData.client.address === 'string' 
      ? facturaData.client.address 
      : facturaData.client.address?.address || '';
  }

  const fechaCreacion = facturaData.invoice?.fecha || new Date().toLocaleDateString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const clienteData = [
    ['Cliente', clienteNombre, 'Creacion', fechaCreacion],
    ['Cedula Fisica', clienteCedula, 'Vencimiento', fechaCreacion],
    ['Telefono', clienteTelefono, 'Plazo de pago', 'De contado']
  ];

  doc.autoTable({
    body: clienteData,
    startY: yPosition,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 25, fillColor: [245, 245, 245] },
      1: { cellWidth: 70 },
      2: { fontStyle: 'bold', cellWidth: 25, fillColor: [245, 245, 245] },
      3: { cellWidth: 70 }
    },
    margin: { left: margin, right: margin }
  });

  yPosition = doc.lastAutoTable.finalY + 10;

  // ==========================================
  // TABLA DE PRODUCTOS
  // ==========================================
  
  const tableColumn = ['Item', 'Referencia', 'Precio', 'Descuento', 'Impuesto', 'Descripcion', 'Cantidad', 'Total'];
  const tableRows = [];

  let subtotal = 0;
  let totalDescuentos = 0;
  let totalImpuestos = 0;

  // Helper para obtener reference como string
  const getReference = (ref) => {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.reference) return String(ref.reference);
    return String(ref);
  };

  facturaData.items?.forEach((item, index) => {
    const cantidad = item.quantity || 0;
    const precioUnitario = item.price || 0;
    const descuentoPorcentaje = item.discount || 0;
    
    const subtotalLinea = cantidad * precioUnitario;
    const descuentoMonto = (subtotalLinea * descuentoPorcentaje) / 100;
    const baseImponible = subtotalLinea - descuentoMonto;
    
    // Calcular impuesto (13%)
    const impuesto = baseImponible * 0.13;
    const totalLinea = baseImponible;
    
    subtotal += baseImponible;
    totalDescuentos += descuentoMonto;
    totalImpuestos += impuesto;

    const nombre = String(item.name || 'Producto');
    const reference = getReference(item.reference) || getReference(item.code) || '';

    tableRows.push([
      String(index + 1),
      reference,
      formatearMoneda(precioUnitario),
      descuentoPorcentaje > 0 ? `${descuentoPorcentaje} %` : '0 %',
      '13 %',
      nombre,
      String(cantidad),
      formatearMoneda(totalLinea)
    ]);
  });

  // Agregar fila vacía para "ELABORADO POR"
  tableRows.push(['', '', '', '', '', 'ELABORADO POR', '', '']);

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: yPosition,
    theme: 'grid',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center',
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [0, 0, 0],
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },    // Item
      1: { cellWidth: 22, halign: 'left' },      // Referencia
      2: { cellWidth: 22, halign: 'right' },     // Precio
      3: { cellWidth: 20, halign: 'center' },    // Descuento
      4: { cellWidth: 18, halign: 'center' },    // Impuesto
      5: { cellWidth: 45, halign: 'left' },      // Descripcion
      6: { cellWidth: 18, halign: 'center' },    // Cantidad
      7: { cellWidth: 25, halign: 'right' }      // Total
    },
    margin: { left: margin, right: margin }
  });

  yPosition = doc.lastAutoTable.finalY + 5;

  // ==========================================
  // RESUMEN DE TOTALES (Derecha)
  // ==========================================
  
  const totalFinal = subtotal + totalImpuestos;
  const totalesX = pageWidth - margin - 60;
  const valoresX = pageWidth - margin - 5;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  // Línea horizontal antes de los totales
  doc.setDrawColor(200, 200, 200);
  doc.line(totalesX - 5, yPosition, valoresX, yPosition);
  yPosition += 5;
  
  doc.text('Subtotal', totalesX, yPosition);
  doc.text(formatearMoneda(subtotal), valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('Descuento', totalesX, yPosition);
  doc.text(`-${formatearMoneda(totalDescuentos)}`, valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('Subtotal', totalesX, yPosition);
  doc.text(formatearMoneda(subtotal), valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.text('IVA (13.00%)', totalesX, yPosition);
  doc.text(formatearMoneda(totalImpuestos), valoresX, yPosition, { align: 'right' });
  
  yPosition += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Impuestos', totalesX, yPosition);
  doc.text(formatearMoneda(totalImpuestos), valoresX, yPosition, { align: 'right' });
  
  yPosition += 6;
  doc.setFontSize(11);
  doc.text('Total', totalesX, yPosition);
  doc.text(formatearMoneda(totalFinal), valoresX, yPosition, { align: 'right' });

  yPosition += 10;

  // ==========================================
  // INFORMACIÓN ADICIONAL
  // ==========================================
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Informacion adicional', margin, yPosition);
  
  yPosition += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  // Tabla de información adicional
  const infoAdicionalData = [
    ['Actividad economica', config.empresa.actividadEconomica],
    ['Tipo de factura', 'Factura de venta']
  ];

  doc.autoTable({
    body: infoAdicionalData,
    startY: yPosition,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40, fillColor: [245, 245, 245] },
      1: { cellWidth: pageWidth - 2 * margin - 40 }
    },
    margin: { left: margin, right: margin }
  });

  yPosition = doc.lastAutoTable.finalY + 8;

  // ==========================================
  // TÉRMINOS Y CONDICIONES
  // ==========================================
  
  if (config.factura.terminosCondiciones) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Terminos y condiciones', margin, yPosition);
    
    yPosition += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const terminosLines = doc.splitTextToSize(config.factura.terminosCondiciones, pageWidth - 2 * margin);
    doc.text(terminosLines, margin, yPosition);
    
    yPosition += (terminosLines.length * 4) + 5;
  }

  // ==========================================
  // CUENTAS BANCARIAS
  // ==========================================
  
  if (config.bancos && config.bancos.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    
    const cuentasTexto = config.bancos
      .filter(banco => banco.nombre && banco.cuenta)
      .map(banco => `${banco.nombre}_${banco.cuenta}`)
      .join(' ');
    
    doc.text(cuentasTexto, margin, yPosition);
  }

  return doc;
};

export const descargarFacturaPDF = async (facturaData) => {
  try {
    const doc = await generarFacturaPDF(facturaData);
    const numeroFactura = facturaData.invoice?.id || await getSiguienteConsecutivo();
    const nombreArchivo = `Factura_${numeroFactura}_${new Date().getTime()}.pdf`;
    doc.save(nombreArchivo);
    console.log('✅ PDF generado exitosamente');
  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    throw error;
  }
};
