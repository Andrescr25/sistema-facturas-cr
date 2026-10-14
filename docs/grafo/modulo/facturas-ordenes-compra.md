---
id: modulo/facturas-ordenes-compra
tipo: modulo
titulo: Factura del proveedor en la orden — vínculo revisado, PDF privado y comparación; recepción física separada
estado: vigente
archivos:
  - backend/src/modules/orders-whatsapp/facturacionOrdenProveedor.service.js
  - backend/src/modules/orders-whatsapp/ordenesFacturacionReporte.service.js
  - backend/src/modules/compras/compras.service.js
  - backend/tests/facturacionOrdenProveedor.test.js
  - backend/migrations/independencia/049_recepcion_orden_compra_ciclo.sql
  - backend/migrations/independencia/048_factura_orden_compra_ciclo.sql
  - backend/src/modules/orders-whatsapp/ordenesCicloFactura.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloFactura.pdf.js
  - backend/src/modules/orders-whatsapp/ordenesCicloFactura.archivos.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.routes.js
  - backend/tests/ordenesCompraFactura.test.js
aristas:
  depende_de: [modulo/ordenes-compra-por-ciclo, tabla/facturas-proveedores, tabla/compra-linea, tabla/supplier-product-mapping, decision/la-ruta-no-el-contenido]
  relacionado: [modulo/cierre-ordenes-compra, modulo/recepcion-ordenes-compra, modulo/compras, modulo/inventario, modulo/permisos, decision/orden-enviada-y-archivo-por-recepcion, decision/el-total-manda-sobre-las-lineas]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-14
---

## Revisión de precios → indicación en la lista de proveedores (2026-10-14)

El usuario permite vincular automáticamente únicamente cuando hay **una orden
enviada posible y confiable** del proveedor propio exacto. Un comprobante parcial
no cierra la facturación del pedido: 6 + 4 puede completar la misma orden de 10.
Sólo las cantidades registradas que cubren todos los productos, sin fuentes
inciertas, retiran la orden de candidatas. Si hay varias, elige una en Revisión de
precios antes de Registrar compra; una sola con fuente incierta también exige
selección explícita. Una orden nueva al lado de una parcialmente facturada nunca
recibe automáticamente el comprobante destinado a la anterior.
Con cero candidatas la compra sigue normal. No elegir por parecido de producto,
nombre, fecha ni total. Un vínculo explícito anterior conserva su identidad e
historia. No reasignar una factura completa ni repartirla entre pedidos.

Registrar compra revalida candidatas bajo el advisory común 46005/1. Una candidata
única en pantalla se vuelve a decidir al guardar: si apareció otra, 409 exige
elección y la pantalla conserva sus precios. `ordenCompraAutomaticaId` conserva
la identidad mostrada (NULL si no había candidata): si la parcial anterior se
completó y ahora queda otra única orden, exige actualizar antes de guardar.
No desviar automáticamente ese comprobante al pedido nuevo. El vínculo se inserta en la misma
transacción, después del estado final ENVIADA, desde compra_linea y su conversión
histórica. Un fallo revierte también compra, costos, precios, CxP y kardex. El PDF,
líneas y cantidades del pedido enviado quedan idénticos. No hay SQL nuevo.

El lector `ordenesFacturacionReporte.comparacionEn(db, ordenId)` acepta READ ONLY
y devuelve por producto estado y cantidad facturada en unidades propias. Sin
vínculo vigente **y compra registrada**, `sin_revisar` con cantidad NULL. Después
de revisar: `facturado`, `parcial` o `no_facturado`; fuente alterada/desconocida es
`por_identificar`, nunca una ausencia afirmada. No deriva recepción física de la
factura. No prepara pedidos, llama transporte ni modifica documentos al consultar.
Un vínculo antiguo del buzón conserva el snapshot y usa la compra final revisada.

La nueva asociación después de crear la compra conserva su modalidad comercial
de inventario (false). Un vínculo físico anterior conserva la modalidad true
establecida por SQL049. Ninguna consulta ni asociación cambia esa decisión fija.

La selección comercial considera enviadas y parcialmente_recibidas. Recibida y
cerrada conservan sus comparaciones y vínculos; SQL052 impide insertar vínculos
nuevos en esos estados, y este cambio no altera esa protección. Recibida con seis
facturadas de diez sigue diciendo parcial, aunque el evento físico haya finalizado.
`requiereSeleccion` en el DTO permite elegir también una única fuente incierta.
Un vínculo vigente previo prevalece sobre cualquier candidata; no se reasigna.

Verificación: dieciocho casos con PostgreSQL local y ROLLBACK cubren única/múltiple,
proveedor ajeno/borrador, conversiones, faltantes, cantidades históricas, fuente
alterada, compra anulada, permisos, fallo del vínculo y READ ONLY real. Chromium
390/1440 recorre selección, registro real local, carrera, conservación de precios
y error/reintento de consulta; transporte y Hacienda simulados, sin salidas. La
ampliación cubre 6+4, parcial junto a una nueva, completa sin recepción, fuentes
alteradas, buzón pendiente, varios vínculos históricos y recepción física final
con facturación parcial. También verifica la carrera parcial completada → otra
candidata única y ninguna candidata → nueva enviada. No necesita migración ni
modifica pedidos enviados.

Los apartados siguientes conservan el contrato histórico del vínculo explícito.

**2026-10-13, simplificación de proveedores:** el usuario retira las áreas y
paneles de ciclos/necesidades/factura/recepción/cierre de Reporte Proveedores.
Solo Faltantes y fichas; órdenes se revisan dentro del proveedor, acumulando sin
semanas. El detalle técnico/histórico de este nodo y sus APIs/documentos siguen
conservados. Presentación vigente: [[modulo/reporte-proveedores]].


IMPLEMENTADO, código f41ce85, solo local.

ALCANCE. Orden enviada → Factura del proveedor y comparación. Buscar por
número/clave entre comprobantes del proveedor guardado, revisar cantidades y
confirmar vínculo explícito. No deducir orden por nombre, fecha, semana o total.
No invoca registrarCompra, Hacienda, correo o WhatsApp; no registra recepción,
compra, CxP, costos/precios, entradas de stock ni resolución de faltantes.

IDENTIDAD. 048 añade orden_compra_ciclo_factura y su tabla de PDF. Vínculo por
UUID, orden.id, factura_proveedor.id, solicitud/version/firma y snapshot de
encabezado/líneas. Proveedor normalizado debe coincidir; clave electrónica de
50 dígitos y estado utilizable, excluyendo gastos recurrentes. Índice único:
una factura COMPLETA solo pertenece a una orden vigente, aunque compitan dos
conexiones o ciclos. Una orden admite varias facturas, sumadas una sola vez.
LÍMITE: factura que reúne varias órdenes requiere una futura asignación explícita
por línea/cantidad. No repartirla automáticamente ni contarla en dos ciclos.

FUENTE Y UNIDADES. Si ya existe compra registrada, usar sus cantidades y
conversiones históricas; compra anulada o de otro proveedor rechazada. Sin
compra, usar líneas del buzón y relación explícita por producto.id/mapeo.
La conversión solo vale con proveedor/producto coherentes y factor positivo;
no asumir factor 1 ni relacionar por descripción/código. Redondeo NUM14,4 con
factor NUM14,6 como compra_linea. Comparación en unidades propias y suma decimal
exacta; cajas del proveedor no se comparan crudas contra unidades vendidas.

COMPARACIÓN. Cantidad solicitada guardada, facturada, diferencia sin facturar,
cantidad adicional facturada y productos fuera de la orden. Líneas desconocidas
se conservan para relacionar, no se descartan ni prueban faltantes. Sin
comprobante, diferencias quedan sin confirmar. No afirmar «agotado» por una
línea ausente. Recibido físico sigue pendiente y no se deriva de la factura.
El total es el del encabezado, no la suma reconstruida de líneas.

REVISIÓN E HISTORIA. Firma canónica de datos y contexto de vínculos vigentes;
se revalida antes de insertar. Cambio de fuente/vínculos exige revisar otra
vez. Reintento UUID+cuerpo no añade cantidades/documentos. Snapshot inmutable
por SQL; consultar detecta fuente cambiada sin reescribir la revisión anterior.
Corregir retira el vínculo con motivo/actor/fecha, conserva cantidades/PDF y
permite un nuevo vínculo revisado. El retirado no suma. No borrar historial.
Advisory 46005/1 común con órdenes y bloqueo de filas protege concurrencia.

PDF DENTRO DE ORDEN. Adjuntar archivo hasta 5 MB exige confirmar factura y
proveedor. Tipo «PDF adjuntado como original»: declaración del usuario, no
verificación criptográfica de firma/contenido. Cuando falta, generar
«Representación de datos del sistema» desde el snapshot revisado, identificada
como NO original del proveedor. No pretende recuperar XML histórico ausente.
PDFKit conserva total original, cabeceras/paginación y descripciones extensas
sin truncarlas ni repetir cantidades en sus continuaciones.

ARCHIVOS PRIVADOS. Tabla guarda ruta/bytes/SHA-256/tipo/actor/fecha; bytes en
ALMACENAMIENTO_PRIVADO_DIR/ordenes-facturas, archivos 0600/carpeta 0700. Sin
ruta en DTO ni montaje HTTP; GET protegido por Reporte Proveedores exige
orden/vínculo/PDF correctos, private/no-store y nosniff. XHR autenticado crea
blob para visor dentro de orden, abrir y descargar; revoca URL al cerrar.
Copias anteriores permanecen. Descarga comprueba archivo regular, tamaño y
huella; rechaza enlaces simbólicos/bytes alterados/ausencia, nunca regenera.
Guardar archivo antes de fila; si INSERT no sucede borrar solo ese archivo.
Tras insertar, conservar aunque falle bitácora/COMMIT: un huérfano es preferible
a borrar una copia que la DB pudo confirmar. Respaldar DB y carpeta juntos.

PERMISOS. API bajo /api/orden-compra/por-ciclo/:id/facturas, GET/lista/propuesta,
POST vínculo/retiro/archivo y GET PDF, todas con permiso Reporte Proveedores.
Su usuario no necesita permiso Clientes; sin sesión 401 y otro módulo 403,
incluido multipart. Envío y factura usan keys distintas en React para conservar
una sola instancia de cada panel al actualizar y evitar nodos duplicados.

VALIDACIÓN. 22 pruebas SQL/servicio: revisión, proveedor, unidades/fracciones,
varias facturas, duplicaciones/concurrencia, cambios de fuente, SQL inmutable,
PDF exacto/historia/límites/hash y ausencia de efectos de
negocio. Chromium 1440/390 verifica búsqueda, revisión, vínculo, original
multipart, representación, visor, corrección e historia. Once huellas de
negocio y orden enviada idénticas. PDF nativo de una hoja y 80 líneas/12 hojas
con texto extenso, sin pérdida/duplicación ni desborde. Informe y validación
final: docs/informes/facturas-ordenes-2026-10-06.md.
Suite completa 2.081/364 suites, cero fallos/omitidas; grafo 12 y build aprobados.
048 aplicada solo a tachi LOCAL 5434 con respaldo y dos tablas vacías; 23 huellas
iguales antes/después de integrar. Stock/conteos/movimientos cero, sin demo.
App 5174→3002 con lanzador permanente seguro, PID 97018; comprobación solo GET.
Copia de pruebas y 3003/5175 retirados; evidencia y respaldos conservados.

RECEPCIÓN VIGENTE (049). [[modulo/recepcion-ordenes-compra]] añade cantidades
físicas separadas, parcial/final, motivo confirmado y kardex idempotente. Vincular
en enviada/parcial permite otra factura. Retirar vínculo usado en recepción
rechaza por servicio y SQL; recibida no admite nueva vinculación/retiro. PDF
permanece consultable/adjuntable. Cambios materiales de compra bloquean recepción;
aceptación comercial sin cambiar cantidades/factor/producto se conserva válida.
Las afirmaciones «recepción pendiente» anteriores describen la etapa048.
Próxima parte: archivo 24h y retirar limpieza semanal por código; luego entregas.

CIERRE ENVIADO (052). [[modulo/cierre-ordenes-compra]] sustituye la limitación
anterior de cierre: confirmación/motivo, recibido conservado y solo pendiente
liberado. No cambiar PDF, recepción física, compra, CxP ni archivo24h.
Necesidades incluye originales y recibido de enviada cerrada con pendiente0.
