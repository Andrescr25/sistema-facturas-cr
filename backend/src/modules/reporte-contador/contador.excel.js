const { generarExcel } = require('../../utils/exportarExcel');
const c = (clave, titulo, tipo = 'texto', ancho) => ({ clave, titulo, tipo, ancho });
const comunes = [
  c('fecha', 'Fecha', 'fecha'),
  c('numero', 'Factura', 'texto', 26),
  c('clave', 'Clave', 'texto', 52),
  c('contraparte', 'Cliente / proveedor', 'texto', 35),
  c('cedula', 'Identificación'),
  c('moneda', 'Moneda'),
  c('documento_asociado', 'Documento asociado', 'texto', 45)
];
const importe = (clave, titulo) => ({ ...c(clave, titulo, 'numero', 22), formato: '#,##0.00' });
const etiquetas = {
  pendiente: 'Por revisar',
  deducible: 'Deducible',
  parcial: 'Parcial',
  no_deducible: 'No deducible',
  total: 'Total',
  sin_credito: 'Sin crédito',
  PAGADA: 'Pagado',
  PARCIAL: 'Pago parcial',
  PENDIENTE: 'Pendiente',
  VENCIDA: 'Pendiente vencido',
  CONTADO: 'Pendiente de registrar pago'
};
function excelMensual(mes) {
  return generarExcel({
    titulo: `Reporte Contador · ${mes.etiqueta}`,
    prefijo: `contador-${mes.anio}-${String(mes.mes).padStart(2, '0')}`,
    informacion: [
      ['Período', `${mes.desde} a ${mes.hasta}`],
      ['Estado', mes.finalizado ? 'Mes finalizado' : 'Mes en curso: cifras provisionales'],
      [
        'Gastos',
        'Incluye pendientes de revisión. Importes deducibles/créditos vacíos no están aprobados.'
      ],
      [
        'Impuestos',
        'Impuestos originales del comprobante; no todo impuesto es IVA ni todo IVA es acreditable.'
      ],
      ['Monedas', 'Cada importe conserva su moneda; no se suman monedas diferentes.'],
      [
        'Notas de proveedor',
        'Se muestran aparte. Su efecto en deducción/crédito debe revisarse, no se descuenta automáticamente del IVA aprobado de gastos.'
      ],
      ['Huella del reporte', mes.huella]
    ],
    hojas: [
      {
        nombre: 'Resumen',
        columnas: [
          c('moneda', 'Moneda'),
          importe('ventas', 'Ventas'),
          importe('devoluciones', 'Notas de crédito'),
          importe('compras', 'Compras'),
          importe('creditos_proveedores', 'Notas de crédito proveedor'),
          importe('gastos', 'Gastos operativos'),
          importe('gasto_deducible', 'Gasto revisado deducible'),
          importe('iva_credito_gastos', 'Crédito IVA gastos revisados')
        ],
        filas: mes.resumen
      },
      {
        nombre: 'Documentos',
        columnas: [
          c('tipo', 'Tipo'),
          ...comunes,
          importe('base', 'Base del detalle'),
          importe('impuestos', 'Impuestos'),
          importe('total', 'Total comprobante')
        ],
        filas: mes.documentos
      },
      {
        nombre: 'Detalle comercial',
        columnas: [
          c('tipo', 'Tipo'),
          ...comunes,
          c('descripcion', 'Descripción', 'texto', 45),
          c('cantidad', 'Cantidad', 'numero'),
          importe('precio', 'Precio unitario'),
          c('tarifa', 'Tarifa original (%)', 'numero'),
          importe('descuento', 'Descuento'),
          importe('base', 'Base'),
          importe('impuestos', 'Impuestos'),
          importe('total', 'Total línea')
        ],
        filas: mes.documentos.flatMap((d) => d.lineas.map((l) => ({ ...d, ...l })))
      },
      {
        nombre: 'Gastos operativos',
        columnas: [
          ...comunes,
          c('categoria_texto', 'Categoría'),
          c('descripcion', 'Descripción', 'texto', 40),
          importe('subtotal_original', 'Subtotal original'),
          importe('descuentos_originales', 'Descuentos originales'),
          importe('impuestos_originales', 'Impuestos originales'),
          importe('total', 'Total comprobante'),
          c('revision', 'Revisión'),
          c('validacion', 'Validación local'),
          c('motivo_validacion', 'Observación del comprobante', 'texto', 50),
          c('renta_texto', 'Tratamiento renta'),
          importe('gasto_deducible', 'Gasto deducible revisado'),
          c('iva_texto', 'Tratamiento IVA'),
          importe('iva_credito', 'IVA acreditable revisado'),
          c('respuesta_texto', 'Respuesta decidida'),
          c('estado_hacienda', 'Estado respuesta Hacienda'),
          c('motivo_fiscal', 'Justificación', 'texto', 50),
          c('pago_texto', 'Estado pago'),
          importe('pagado', 'Pagado'),
          importe('saldo', 'Saldo'),
          c('metodos', 'Métodos de pago'),
          c('empleado', 'Responsable'),
          c('placa', 'Placa'),
          c('xml', 'XML original'),
          c('pdf', 'PDF original')
        ],
        filas: mes.gastos.map((g) => ({
          ...g,
          subtotal_original: g.totales_originales?.venta ?? null,
          descuentos_originales: g.totales_originales?.descuentos ?? null,
          impuestos_originales: g.totales_originales?.impuesto ?? null,
          renta_texto: etiquetas[g.renta],
          iva_texto: etiquetas[g.iva],
          respuesta_texto:
            { 1: 'Aceptación', 2: 'Aceptación parcial', 3: 'Rechazo' }[g.respuesta] ||
            'Por decidir',
          pago_texto: etiquetas[g.estado_pago] || 'Por validar',
          metodos: g.metodos || '',
          xml: g.tiene_xml ? `gasto-${g.id}.xml` : 'Falta XML',
          pdf: g.tiene_pdf ? `gasto-${g.id}.pdf` : 'Sin PDF adjunto'
        }))
      }
    ]
  });
}
module.exports = { excelMensual };
