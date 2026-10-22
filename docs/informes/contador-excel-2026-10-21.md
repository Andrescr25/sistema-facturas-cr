# Excel mensual para el contador — 2026-10-21

El usuario pide investigar qué necesita el contador y rehacer el Excel que
descarga Reporte Contador: claro, resumido, con colores, tamaños y buen formato.
Codex trabaja en copia propia sobre developer; ninguna consulta de desarrollo
o prueba se dirige a producción. No requiere SQL nuevo ni paquetes adicionales.

## Información y fuentes

El formato es un papel de trabajo para revisión, no una plantilla oficial de
declaración. Se consultaron las fuentes oficiales el 21/10/2026:

- [Hacienda, Anexos y Estructuras v4.4](https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf):
  identificación de las partes, fecha, número/clave, moneda, detalle, descuentos,
  impuestos, total y referencias permiten reconocer y conciliar cada comprobante.
- [Hacienda, Crédito Fiscal del IVA](https://www.hacienda.go.cr/docs/CreditosFiscales.pdf):
  el crédito depende del respaldo y de condiciones de aplicación; no se puede
  convertir todo impuesto de compra/gasto en crédito automáticamente.

De ahí se priorizan identificación de empresa/período, totales por moneda,
base e impuestos de ventas descontando sus notas, clasificación de compras y
gastos, decisiones fiscales guardadas y una lista de lo que falta revisar.
Los campos largos de auditoría se conservan en una hoja de soporte.

## Organización y presentación

1. **Resumen:** empresa/cédula/período, mes finalizado o provisional, ventas
   netas/base/impuestos, compras, notas de proveedor separadas, gastos y
   deducción/crédito revisados. Cada moneda tiene su propio bloque. Gastos
   pendientes/anulados y navegación a las hojas del libro.
2. **Ventas:** un documento por fila, con base/impuestos/total y referencia
   de las notas. Importes originales positivos; el resumen resta las notas.
3. **Compras:** mercadería y notas de proveedor, sin repetir gastos.
4. **Gastos operativos:** concepto/categoría, originales y revisión fiscal.
   Pendiente/anulado mantiene importes aprobados vacíos, no cero.
5. **Pendientes:** documento una vez y todos sus motivos: revisión/validación,
   XML faltante, nota de proveedor por clasificar, falta de detalle o diferencia
   entre líneas y total. No bloquea ni cambia su tratamiento al exportar.
6. **Impuestos de ventas:** líneas por moneda/tarifa registrada, bases netas,
   impuestos de venta/notas/netos. Sin inferir tarifas faltantes ni clasificar
   por sí solo 0 % como exento. No suma documentos de grupos como documentos
   únicos: un comprobante con varias tarifas figura en cada grupo.
7. **Detalle comercial:** líneas originales para conciliar.
8. **Soporte documental:** claves completas/referencias y respaldo/revisión/
   pago actual de gastos, responsable y placa. Archivos corresponden al ZIP.
9. **Guía:** alcance, criterios, huella y fuentes oficiales.

Roles de la paleta del sistema: primario en encabezados, bandas neutras,
totales destacados, alerta/exito/peligro para revisión. Tipografía Aptos,
anchos explícitos, texto ajustado, fechas de calendario, importes numéricos
con dos decimales de presentación, ceros iniciales conservados. Encabezados
y primeras columnas fijos, filtros sólo en las tablas, cuadrícula oculta,
vínculos internos y configuración de impresión con repetición de encabezados
y una página de ancho. No agrega fórmulas ni macros.

Reutiliza el generador de tablas/celdas de `utils/exportarExcel`. SheetJS CE
no serializa rellenos ni paneles: un ayudante optativo completa el SpreadsheetML
recién generado mediante CFB instalado. Se reemplazan entradas ZIP existentes
con rutas absolutas para evitar duplicados interpretados de distinta forma por
los lectores. Formato histórico y demás exportaciones conservados. La lectura
de empresa comparte la transacción READ ONLY del mes y forma parte de su huella.
Descarga y correo usan exactamente el mismo generador.

## Límites conservados

No convierte monedas, calcula impuesto a pagar ni aprueba renta/IVA al exportar.
Notas de proveedor sin desglose guardado conservan base/impuestos vacíos y
requieren revisión de su aplicación a mercadería o gastos. La agrupación por
tarifa usa líneas de ventas, mientras los totales de documentos conservan lo
guardado en su cabecera; diferencias se señalan. Pagos de gastos son el estado
actual al generar el libro, no movimientos bancarios exclusivos del mes.
Pagos manuales sin comprobante de gasto operativo siguen fuera del reporte;
ese alcance aparece expresamente en Resumen y Guía.

## Verificación local

Evidencia privada: `/private/tmp/codex-contador-excel-20261021/`.
Base desechable propia a partir de una copia local con SQL061; salidas remotas
bloqueadas. PostgreSQL/ROLLBACK y correo simulado, sin mensajes reales,
regenerar Prisma ni ejecutar limpieza semanal.

- 25 pruebas dirigidas correctas: tipos/precisión/ceros/fechas, null pendiente,
  notas, monedas/anulados, desglose por tarifa, seguridad de textos, XML completo,
  estilos/paneles/filtros/impresión y ZIP sin entradas duplicadas. Incluye los
  reportes operativos que comparten el ayudante de Excel.
- Suite completa final: 236 archivos, 2923 casos; **2920 correctos, 0 fallos y
  3 omisiones históricas** que exigen stock cero. En el primer recorrido falló
  un fixture de confirmación de proveedores al contar una referencia
  preexistente; las 12 pruebas de ese archivo y la suite completa final pasan
  al repetir sin cambiar ese código. El último ajuste de encabezado de empresa
  y presentación se comprobó además en el grupo dirigido de 25 pruebas.
- Chromium: 23 comprobaciones correctas, sin errores JS, 390/700/1440 px;
  descarga XLSX/ZIP, factura pendiente, empresa, permisos y adjunto de correo
  simulado con las nueve hojas del formato nuevo.
- Relectura independiente con openpyxl: hojas, paneles, estilos y áreas de
  impresión válidos. Vista previa nativa macOS del XLSX inspeccionada.
- Build frontend y `git diff --check` correctos. Estructura/grafo: 23 pruebas
  correctas con el informe y las aristas actualizados.
- Vista local 5173/3000 contra el clon limpio: descarga autenticada de septiembre
  con 101 documentos, nueve hojas, 240.902 bytes y 211 ms en este equipo.
  Generación con 2.000 documentos ficticios: 318 ms y 791.294 bytes.
  Son mediciones locales, no de producción.

Muestra generada sólo con datos ficticios ZZ, nunca documentos reales del
negocio. Se conserva fuera de Git para que el usuario pueda abrir el formato:
`~/.local/share/sistema-facturas-cr/muestras/reporte-contador-ejemplo.xlsx`.

Vista local conservada en `http://localhost:5173/reporte-contador`, backend
3000, base limpia `tachi_codex_gastos_preview_20261021`; el trabajo se publica
sólo en developer. La base desechable de las pruebas se retira al terminar.
