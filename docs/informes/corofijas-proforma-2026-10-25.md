# Llaves corofijas de la proforma00397028 — 2026-10-25

El usuario entrega2610211051proforma_397028.PDF, emitida el21/10 por IMPAFESA,
y pide nombres exactos y margen28%. Confirma completar las25 medidas y permite
retirar/recrear las dos fichas confusas. El PDF se leyó con PDFKit y se
inspeccionó visualmente; el documento y los planes privados no van a Git.

## Datos y correspondencia

Son25 medidas:6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,26,27,
28,29,30,32mm. Los códigos sonYOV606…YOV632 (sin25 ni31). El nombre se copia
literal, incluidos FERRAWY, ceros iniciales y `(C…)(M…)`.

Se conservan8 productos:8/9/10/11/12/14/15/17mm. Se desactivan1247 (referencia
1107, llamado13 pero relacionado con compra17) y1250 (1115, otro15 sin
correspondencia demostrada); salen de la marca sin borrar registros ni
reapuntar documentos. Se crean17 medidas. La llave Stanley9/16 inactiva,
de otro proveedor, se conserva fuera del lote. La agrupación82 conserva foto
pero se llama FERRAWY LLAVE COROFIJA; contiene las25 presentaciones vigentes.

## Cálculo

El precio unitario bruto tiene10% de descuento. Se toma «Precio desc», que
ya lo incluye: no se vuelve a descontar. La suma de esos25 costos es
₡27.261,26; el IVA de la proforma es₡3.543,95 y el total₡30.805,21.
Cantidad1 en cada línea: C/M indican empaques, no divisores del costo.

- costo_sin_iva = Precio desc del PDF.
- costo_con_iva = costo_sin_iva × (1 + tarifa/100).
- precio_sin_iva = costo_sin_iva / (1 − 28/100).
- Guardado a5 decimales y precio público a2, con el ayudante existente de IVA.

Ejemplo10mm:YOV610, costo neto₡299,25, costo con IVA₡338,15250,
venta neta₡415,62500 y venta pública₡469,66. Margen28% antes de descuentos
eventuales de venta. No se aplica redondeo psicológico. El nuevo margen
pedido autoriza que algunos precios bajen respecto del maestro anterior.

## Operación

El corrector utiliza los servicios existentes para crear/editar producto,
retirar estados, asignar subcategoría, guardar la marca y relacionar los
códigos del proveedor. Conserva el historial de precio y la bitácora. La
conexión compartida convierte BEGIN/COMMIT internos en SAVEPOINT: todo el
lote se confirma o revierte junto. Ese adaptador se extrae sin cambiar su
lógica del doble PostgreSQL existente; las pruebas siguen importándolo desde
su ruta habitual para mantener una sola implementación.

Antes de mutar, comprueba nombres, referencias, costos/precios, clasificación,
estados e impuesto esperados. Una referencia o relación ajena detiene el
lote; también un fallo al guardar el respaldo. Se guarda la fotografía de
productos, marca, relaciones y saldos. Se conserva el resultado con ids nuevos
para verificar y deshacer. No se debe repetir el plan sobre el resultado: los
controles lo rechazan antes de duplicar medidas.

No se registra compra real, costo histórico de compra, pagos, CxP, recepción,
aceptación fiscal ni mensajes a proveedores. Las nuevas fichas no reciben
existencias. Las existencias y documentos anteriores se conservan.

## Verificación y estado

Seis casos con PostgreSQL/ROLLBACK: margen e IVA real, creación/retiro,
relación por unidad, historial/bitácora y ninguna compra/stock; fallo después
de editar revierte todo; edición posterior, falta de respaldo o código ajeno
se rechazan; también una presentación añadida concurrentemente. Ensayo local completo25:8 editados,17 creados,2 retirados.
Suite completa250 archivos:3053correctas/0fallos/0canceladas y3omisiones
históricas. Las48 dirigidas iniciales y los6 casos de negocio finales son
correctos.30 comprobaciones Chromium390/700/1440:25 nombres y medidas en
Gestión, selección de marca, agente y cliente; vistas previas, foco y recarga
sin red, sin errores JS ni desbordes. Ambos builds correctos. Excel privado
verificado con las25 filas. Aplicación respaldada pendiente de registrar.
