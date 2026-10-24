---
id: modulo/reporte-contador
tipo: modulo
titulo: Reporte Contador — ventas, compras y gastos del mes con sus comprobantes
estado: vigente
archivos:
  - docs/informes/contador-electronicas-2026-10-24.md
  - backend/src/modules/reporte-contador/desdeElSistema.js
  - backend/src/modules/reporte-contador/contador.mes.js
  - backend/src/modules/reporte-contador/contador.excel.js
  - backend/src/modules/reporte-contador/contador.excelDatos.js
  - backend/src/utils/excelPresentacion.js
  - backend/tests/contadorExcel.test.js
  - backend/src/modules/reporte-contador/contador.comprobantes.js
  - backend/src/modules/reporte-contador/contador.historico.js
  - backend/src/modules/reporte-contador/reporte-contador.service.js
  - backend/src/modules/reporte-contador/reporte-contador.controller.js
  - backend/src/modules/reporte-contador/reporte-contador.routes.js
  - frontend/src/pages/ReporteContador.jsx
  - frontend/src/hooks/useReporteContador.js
  - frontend/src/utils/reporteContadorUtils.js
  - frontend/src/components/reporte-contador/ResumenMes.jsx
  - frontend/src/components/reporte-contador/MovimientosMes.jsx
  - frontend/src/components/reporte-contador/DetalleMovimiento.jsx
  - frontend/src/components/reporte-contador/ModalEnviarContador.jsx
  - backend/tests/fixtures/contadorMes.js
  - backend/tests/reporteContadorPropio.test.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea, tabla/facturas-proveedores, tabla/cuentas-por-pagar]
  relacionado: [modulo/compras, modulo/facturacion, modulo/gastos-operativos, modulo/exportaciones-reportes, decision/la-ruta-no-el-contenido, bloqueo/impuestos-historicos-en-alegra]
medido: 2026-10-24
---

## El mes del sistema actual

Al abrir consulta el último mes completo de Costa Rica; Mes actual muestra
el avance. Cinco consultas por clase y la identificación de empresa dentro de REPEATABLE READ READ ONLY:
ventas emitidas, sus notas de crédito, compras vigentes, notas de proveedor
no eliminadas y gastos operativos. Sin importar Excel ni rellenar períodos.
Toda línea entra, también exenta o sin impuesto asignado. Identidad propia,
sin mezclar documentos del mismo número. Total del documento y detalle con
sus importes originales, sin redondear cada línea al colón ni adivinar crédito.
Cada moneda se suma aparte. Documentos sin líneas también se muestran.

## Gastos y entrega al contador

Gastos por mes de emisión (inclusive último segundo), no recepción/pago.
No se repiten en compras. Pendientes de validación/revisión también viajan:
deducción y crédito aprobados quedan vacíos. Anulados visibles fuera de sumas.
Saldo/pagado/métodos vienen de los pagos vigentes, sin crear movimientos.
Desde la decisión simple de Gastos (SQL062), rechazados se conservan con
etiqueta Rechazado y fuera de totales/deducciones/créditos. Aprobación y pago
de contado no convierten proporcionalidad pendiente en crédito aprobado.
Notas de proveedor aparte, sin compensar automáticamente el IVA de gastos.

## Pantalla y Excel resumido — 2026-10-24

El usuario separa la venta electrónica y aclara conservar Gastos operativos.
El ajuste posterior del mismo día retira Facturas y notas (sin electrónica)
de pantalla y Excel. Quedan tres clases, en este orden: Facturas y notas
electrónicas, Compras y Gastos operativos. La primera incluye tiquetes y
selecciona sólo `electronica=true`, la misma bandera que usa Facturación;
una nota se clasifica por su propia emisión, nunca por la factura acreditada,
el número o una clave.
Compras incluye todas sus emisiones y mantiene las notas de proveedor.

La pestaña inicial es electrónicas. Cada fila/detalle identifica factura,
tiquete o nota de crédito y agrega electrónica sólo cuando corresponde. Se
reutiliza la lectura mensual: el tipo de documento se incorpora al SELECT
existente y alternar pestañas no vuelve a consultar. Búsqueda y paginación
conservan su comportamiento. Los resúmenes generales no pierden importes.

Cada hoja muestra título, empresa/período y tabla
corta: concepto/tipo de impuesto, subtotal, descuento, impuestos y total. No
portada, guías, pendientes, soporte, detalle de facturas ni hoja de impuestos
adicional. Los originales siguen disponibles por el ZIP y en la interfaz.

Ventas electrónicas agrupa por tarifa guardada, neteando sólo sus notas
electrónicas, una vez. Compras conserva las
líneas gravadas/sin impuesto sin deducir una tarifa de un cociente; si falta
la tarifa, se identifica en un único grupo. Gastos agrupa combustible y
alimentación/viáticos. La columna dice Impuestos porque no todo impuesto
original es IVA, especialmente en combustible. No calcula crédito fiscal.

Subtotal es anterior al descuento; en ventas la base neta del encabezado se
reconstruye con su descuento, sin rebajarlo dos veces. Total del comprobante
manda: las diferencias quedan como un ajuste resumido, no se borran ni se
reparten inventando tarifas. Una columna desconocida queda vacía, inclusive
su total, no como un cero aprobado. Anulados/rechazados se excluyen de gastos.
Monedas en bloques separados dentro de las mismas tres hojas. Notas de
proveedor sin destino compra/gasto guardado se informan aparte del TOTAL de
Compras, sin compensarlas al azar. No se cambia esa clasificación al exportar.

Descarga y adjunto del correo usan el mismo generador. Se reutilizan SheetJS,
exportarExcel y excelPresentacion: números tipados, paleta, filas legibles,
encabezado/total destacados e impresión de un resumen por página. La opción
paginasAlto sólo modifica estas tres hojas; los otros exportadores conservan
su comportamiento. La fecha del período no pasa por la zona horaria local.

ZIP reutiliza CFB de SheetJS instalado; XML/PDF originales,
nombres por id de gasto y LEEME con faltantes. No inventa comprobantes ni
publica rutas privadas en JSON. Tope 32 MB originales y 18 MB adjuntos de
correo; al superarlo informa y conserva descargas individuales de Gastos.

Contactos y correo existentes, por acción explícita con mes/destino visibles.
Una huella evita enviar un mes cambiado desde su consulta: 409 para actualizar.
No hay envío programado, pago, aceptación fiscal ni declaración tributaria
al consultar/cerrar el mes. Sólo se totalizan deducciones/créditos revisados.

## Reportes anteriores

Períodos entregados y sus correcciones/exclusiones conservados y descargables
en Reportes guardados anteriormente. Exportador antiguo de sólo lectura en
contador.historico. Se retiran carga/reimportación que sobrescribía meses,
edición artificial de líneas y detector de duplicados de Alegra. No altera
históricos ni documentos fiscales. Se elimina la deuda del servicio de 964 líneas.

Depende de SQL061/062 de Gastos, ambas aplicadas en producción por Codex el
21/10. Este resumen no agrega SQL ni cambia datos.
[Alcance y verificación](../../informes/contador-mensual-2026-10-21.md).

[Publicación autorizada y respaldo](../../informes/despliegue-gastos-contador-2026-10-21.md).

[Formato contable y verificación](../../informes/contador-excel-2026-10-21.md).

El formato ampliado de [la entrega inicial](../../informes/contador-excel-2026-10-21.md)
quedó reemplazado por [el resumen solicitado](../../informes/contador-resumen-2026-10-21.md),
ampliado después a las cuatro clases de esta entrega.

Publicación del resumen autorizada después por «subelo al main»: 0a4e7ed de
Codex y su registro, sin SQL nuevo. En esa publicación descarga/adjunto usaban
tres hojas; los reportes históricos mantienen su formato. Evidencia en el informe
anterior y estado Render en el relevo compartido de publicaciones.

La separación del24/10 se entrega inicialmente en developer:19 pruebas dirigidas con
PostgreSQL/ROLLBACK,68 comprobaciones en navegador, build/lint/grafo/estructura
correctos. [Alcance y verificación](../../informes/contador-electronicas-2026-10-24.md).

El usuario autoriza después publicar a main. Codex publica c9f41e2 y el
registro de verificación, ambos propios y sin otros commits pendientes.
Suite completa local242archivos/2987correctas/0fallos/3omisiones históricas,
sin alterar el inventario del clon. No requiere migración ni acceso a la
base de producción para probar. Las cuatro hojas son comunes a descarga y correo.


## Etiqueta de tiquetes aceptados — 2026-10-24

El tipo comercial puede seguir siendo `factura` después de emitir un tiquete
con los ajustes de Hacienda/Impresión. La lectura mensual ahora resuelve el
tipo desde `factura.hacienda_comprobante_id`: comprobante propio, de producción
y aceptado. Para electrónicas,04 devuelve tiquete y01 factura. No consulta el
correo actual, no interpreta la clave ni lee XML por cada documento.

Un LEFT JOIN por clave primaria en la consulta existente evita peticiones
adicionales o duplicados. Documentos históricos sin ese vínculo conservan el
tipo persistido; preparados, rechazados y ambiente de pruebas no deciden la
etiqueta. `etiquetaMovimiento`, ya compartido por lista y detalle, presenta
«Tiquete electrónico». Ese ajuste de etiqueta conservaba las pestañas e importes; el retiro
posterior deja tres resúmenes Excel, como se describe arriba. Sin modificar facturas, archivos fiscales o esquema.

Verificado:20 pruebas de reporte/Excel (regresión con8 combinaciones de tipo
comercial y fiscal sobre PostgreSQL con ROLLBACK),71 comprobaciones Chromium
390/700/1440 y build correcto. Correo simulado; sin base de producción.


## Retiro de Facturas y notas — 2026-10-24

El usuario retira explícitamente la pestaña y su hoja de Excel. Se elimina
su opción y la rama de filtrado, sin mover esas ventas al grupo electrónico.
Descarga y adjunto reutilizan el mismo generador de tres hojas; el modal de
envío toma dinámicamente sus tres nombres y el correo identifica ventas
fiscales. La lectura mensual y el resumen general se conservan, igual que
los documentos, originales y reportes archivados. No hay borrado de datos
ni migración. La corrección anterior de etiqueta de tiquete sigue incluida.


## Centrado de tablas Excel — 2026-10-24

El usuario pide centrar los datos bajo Subtotal, Descuento, Impuestos y Total.
Las tres tablas activan `centrarTabla` en el presentador existente: encabezados,
conceptos, importes y totales quedan centrados horizontal/verticalmente, sin
sangría, desde la fila6. Título, empresa y período conservan la cabecera.
La caché de estilos incluye la alineación; formatos numéricos/colores y
valores se mantienen. Sin la opción, el presentador conserva texto a la
izquierda y números a la derecha para cualquier otro exportador. Descarga y
adjunto del correo usan el mismo generador. Sin consultas ni SQL nuevo.
