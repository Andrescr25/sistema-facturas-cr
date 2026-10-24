// Sólo datos ficticios para probar el archivo y mostrar su formato sin datos de negocio.
function mesDeMuestra() {
  const clave = '0'.repeat(51) + '1';
  const documento = (id, tipo, total, base, impuestos, moneda = 'CRC') => ({
    id, identidad: `${tipo}-${id}`, tipo, numero: `00000000${id}`, fecha: '2026-09-15',
    contraparte: tipo === 'Venta' ? 'ZZ Cliente de demostración' : 'ZZ Proveedor de demostración',
    cedula: '0012345678', clave, moneda, total, base, impuestos,
    electronica: [1, 3, 4].includes(id), tipo_documento: id === 4 ? 'tiquete' : 'factura',
    documento_asociado: tipo.includes('Nota') ? '000000001' : null,
    lineas: base == null ? [] : [{ descripcion: 'ZZ Producto de muestra', cantidad: 10, precio: base / 10,
      descuento: 0, base, impuestos, total, tarifa: moneda === 'USD' ? 13 : impuestos / base * 100 }]
  });
  const gasto = (id, categoria, total, revision, moneda = 'CRC') => ({
    id, categoria, categoria_texto: categoria === 'combustible' ? 'Combustible' : 'Alimentación y viáticos',
    numero: `00000000${id}`, fecha: '2026-09-20', contraparte: 'ZZ Estación / restaurante de muestra',
    descripcion: categoria === 'combustible' ? 'Combustible para reparto de ruta' : 'Alimentación durante reparto',
    cedula: '0034567890', clave, moneda, total, revision,
    estado: revision === 'Anulado' ? 'anulada' : 'registrada',
    totales_originales: { venta: total, descuentos: 0, impuesto: 0 },
    gasto_deducible: revision === 'Revisado' ? total : null, iva_credito: revision === 'Revisado' ? 0 : null,
    validacion: 'validado', renta: 'deducible', iva: 'sin_credito',
    respuesta: revision === 'Revisado' ? 1 : null, estado_hacienda: revision === 'Revisado' ? 'aceptado' : null,
    estado_pago: 'PAGADA', pagado: total, saldo: 0, metodos: 'SINPE',
    tiene_xml: true, tiene_pdf: true, empleado: 'ZZ Repartidor', placa: 'ZZ0001'
  });
  return {
    anio: 2026, mes: 9, desde: '2026-09-01', hasta: '2026-09-30', etiqueta: '09/2026', finalizado: true,
    empresa: { nombre: 'ZZ Empresa de demostración S.A.', nombre_comercial: 'CATÁLOGO DEMOSTRACIÓN', identificacion: '0031010000' },
    huella: 'muestra-sin-datos-reales',
    resumen: [
      { moneda: 'CRC', ventas: 113000, devoluciones: 11300, compras: 226000, creditos_proveedores: 9000, gastos: 56300, gasto_deducible: 45000, iva_credito_gastos: 0 },
      { moneda: 'USD', ventas: 113, devoluciones: 0, compras: 0, creditos_proveedores: 0, gastos: 22.6, gasto_deducible: 22.6, iva_credito_gastos: 0 }
    ],
    documentos: [documento(1, 'Venta', 113000, 100000, 13000), documento(2, 'Venta', 50500, 50000, 500),
      documento(3, 'Nota de crédito', 11300, 10000, 1300), documento(4, 'Venta', 113, 100, 13, 'USD'),
      documento(5, 'Compra', 226000, 200000, 26000), documento(6, 'Nota de crédito proveedor', 9000, null, null)],
    gastos: [gasto(7, 'combustible', 45000, 'Revisado'), gasto(8, 'alimentacion', 11300, 'Por revisar'),
      gasto(9, 'alimentacion', 5000, 'Anulado'), gasto(10, 'alimentacion', 22.6, 'Revisado', 'USD')]
  };
}
module.exports = { mesDeMuestra };
