# Llaves corofijas de la proforma 00397028 — 2026-10-25

El usuario entrega 2610211051proforma_397028.PDF, emitida el 21/10 por IMPAFESA,
y pide nombres exactos y margen del 28 %. Confirma completar las 25 medidas y
permite retirar/recrear las dos fichas confusas. El PDF se leyó con PDFKit y
se inspeccionó visualmente; documento, planes y respaldos privados no van a Git.

## Datos y correspondencia

Son 25 medidas: 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
22, 23, 24, 26, 27, 28, 29, 30 y 32 mm. Los códigos son YOV606…YOV632
(sin 25 ni 31). Se copia el nombre literal, incluidos FERRAWY, los ceros
iniciales y `(C …)(M …)`.

Se conservan 8 productos: 8/9/10/11/12/14/15/17 mm. Se desactivan 1247
(referencia 1107, llamado 13 pero relacionado con compra 17) y 1250 (1115,
otro 15 sin correspondencia demostrada); salen de la marca sin borrar
registros ni reapuntar documentos. Se crean 17 medidas. La llave Stanley
9/16 inactiva, de otro proveedor, se conserva fuera del lote. La agrupación
82 conserva su foto y se llama FERRAWY LLAVE COROFIJA; contiene las 25
presentaciones vigentes.

## Cálculo

El precio unitario bruto tiene un 10 % de descuento. Se toma «Precio desc»,
que ya lo incluye: no se vuelve a descontar. La suma de los 25 costos es
₡27.261,26; el IVA de la proforma es ₡3.543,95 y el total ₡30.805,21.
Cantidad 1 en cada línea: C/M indican empaques, no divisores del costo.

- costo_sin_iva = Precio desc del PDF.
- costo_con_iva = costo_sin_iva × (1 + tarifa/100).
- precio_sin_iva = costo_sin_iva / (1 − 28/100).
- Guardado a 5 decimales y precio público a 2, con el ayudante existente de IVA.

Ejemplo de 10 mm: YOV610, costo neto ₡299,25, costo con IVA ₡338,15250,
venta neta ₡415,62500 y venta pública ₡469,66. Margen del 28 % antes de los
descuentos eventuales de venta. No se aplica redondeo psicológico. El margen
pedido autoriza que algunos precios bajen respecto del maestro anterior.

## Operación

El corrector utiliza los servicios existentes para crear/editar productos,
retirar estados, asignar subcategoría, guardar la marca y relacionar códigos
del proveedor. Conserva el historial de precios y la bitácora. La conexión
compartida convierte BEGIN/COMMIT internos en SAVEPOINT: todo el lote se
confirma o revierte junto. El adaptador se extrae sin cambiar su lógica del
doble PostgreSQL existente; las pruebas siguen importándolo desde su ruta
habitual para mantener una sola implementación.

Antes de mutar, comprueba nombres, referencias, costos/precios, clasificación,
estados e impuesto esperados. Una referencia o relación ajena detiene el
lote; también un fallo al guardar el respaldo. Se guarda la fotografía de
productos, marca, relaciones y saldos, además del resultado con los IDs nuevos
para verificar y deshacer. Repetir el plan sobre el resultado se rechaza
antes de duplicar medidas.

La proforma actualiza el catálogo. No registra compra real, costo histórico
de compra, pagos, CxP, recepción, aceptación fiscal ni mensajes. Las nuevas
fichas no reciben existencias. Se conservan existencias y documentos previos.

## Verificación y aplicación

Seis casos con PostgreSQL/ROLLBACK: margen e IVA real, creación/retiro,
relación por unidad, historial/bitácora y ninguna compra/stock; un fallo
después de editar revierte todo. Una edición posterior, falta de respaldo,
código ajeno o presentación añadida concurrentemente detiene el lote.
Ensayo local completo: 25 medidas, 8 editadas, 17 creadas y 2 retiradas.

Suite completa de 250 archivos: 3053 pruebas correctas, 0 fallos, 0
cancelaciones y 3 omisiones históricas. Las 48 dirigidas iniciales y los 6
casos de negocio finales son correctos. 30 comprobaciones Chromium a
390/700/1440: nombres y medidas en Gestión, selección de marca, agente y
cliente; vistas previas, foco y recarga sin red, sin errores JS ni desbordes.
Ambos builds correctos y Excel privado verificado con las 25 filas.

Codex aplicó el lote autorizado en producción el 25/10/2026, con una sola
transacción y respaldo previo: 25 presentaciones vigentes (8 actualizadas,
17 nuevas) y 2 fichas ambiguas inactivas, ambas con existencia cero. La
lectura posterior confirmó nombres exactos, costos descontados, precios y
margen del 28 %, clasificación, relaciones del proveedor con factor 1 y foto
de marca conservada. Los demás campos de las 8 fichas originales, los saldos,
las líneas históricas y las relaciones de otros proveedores son iguales a
los respaldados. La Stanley quedó intacta. No requiere migración SQL.

Los archivos privados viven en
`~/.local/share/sistema-facturas-cr/respaldos/20261025-corofijas-proforma-codex/`:
plan y fuente con SHA-256 del PDF, captura previa, filas inmediatamente
anteriores, resultado con IDs, captura posterior, verificación y plan inverso.
La reversión exige revisar cambios posteriores y usar servicios con bitácora:
desactivar las 17 nuevas, restaurar los campos anteriores de las 10 fichas,
la selección/nombre de marca y las relaciones correspondientes, conservando
fotos, existencias y documentos. No se ejecuta automáticamente.
