# Excel del contador: tres resúmenes — 2026-10-21

El usuario considera excesivo el formato de nueve hojas y adjunta una imagen
con título, período, tabla corta por tipo de IVA y total. Pide únicamente
Ventas, Compras y Gastos operativos, con un resumen en cada hoja. Reemplaza
la presentación ampliada anterior, sin volver a importar ni corregir datos.

## Resultado

Exactamente tres hojas. Empresa/período, moneda y cinco columnas: tipo de
impuesto o concepto, Subtotal, Descuento, Impuestos y Total. Una línea por
grupo, con encabezados/totales destacados, números alineados y formato de
dos decimales; cada hoja cabe en una página de impresión horizontal.
Se conservan importes numéricos originales, no textos redondeados.

Ventas por tarifa registrada y notas restadas una vez. Compras por impuesto
conocido; no se calcula una tarifa dividiendo impuesto entre base. Gastos
por Combustible/Alimentación y viáticos, sin anulados ni rechazados. La columna
dice Impuestos porque también puede contener el impuesto único de combustible;
no se convierte en IVA ni se presenta como crédito aprobado.

Subtotal anterior a descuentos. La consulta de ventas incluye el descuento
del encabezado para no rebajarlo dos veces ni perderlo en documentos sin
detalle. Las diferencias entre encabezado y líneas se conservan como ajuste
agregado: el total del comprobante continúa mandando. Los valores desconocidos
quedan vacíos. Cada moneda tiene su bloque, sin un total combinado.

Notas de proveedor aún sin clasificar entre compra/gasto: importe agregado
informativo después del TOTAL de Compras, sin compensarlo contra mercadería
al azar. No se crean asociaciones ni revisiones fiscales desde el exportador.
Los respaldos y el detalle siguen en sus módulos/ZIP; el Excel no lleva claves,
filas por factura, saldos, métodos de pago, guías ni hojas auxiliares.

Se reutilizan el lector mensual y el mismo generador de descarga/adjunto,
SheetJS, exportarExcel y excelPresentacion. Se eliminan los constructores
anteriores sin consumidores. La opción de impresión de una página sólo se
activa para este resumen; otros exportadores mantienen su comportamiento.
Reportes históricos conservan su formato. Sin SQL nuevo, pagos, emisiones,
mensajes reales, Prisma o dependencias nuevas.

## Verificación local

Pruebas puras del libro y PostgreSQL con BEGIN/ROLLBACK: tres hojas exactas,
descuentos/notas, monedas, cifras desconocidas, total real distinto del detalle,
rechazados/anulados fuera, período vacío y estilos OOXML válidos. La integración
comprueba que una venta de 113,37 con nota de 10 exporta 103,37 netos.

Chromium: 23 comprobaciones en 390/700/1440 px, descarga real y correo simulado
con las mismas tres hojas, sin errores JS. Build/lint correctos. Vista nativa
Quick Look del XLSX y capturas de las tres hojas para revisar el resultado.
Suite completa: 237 archivos, **2946 pruebas correctas, cero fallos y 3
omisiones históricas de corte** que requieren inventario provisional en cero.
Cierre dirigido: 17 correctas, incluidas las pruebas con PostgreSQL. Las tres
hojas se abrieron con Quick Look y se inspeccionaron sus capturas. Descarga
autenticada de la vista local: 200 y las mismas tres hojas, sin cambios de datos.

Muestra sólo con datos ficticios: `~/.local/share/sistema-facturas-cr/muestras/reporte-contador-resumen.xlsx`.
Evidencia privada: `/private/tmp/codex-contador-resumen-20261021/`.
Desarrollo y ensayos en clones locales; producción no se conecta ni se modifica.
Entrega en developer y vista 5173/3000; main conserva la publicación anterior.
