---
id: modulo/ordenes-compra-por-ciclo
tipo: modulo
titulo: Órdenes por ciclo — PDF revisado, envío inmutable y cobertura; recepción pendiente
estado: vigente
archivos:
  - backend/migrations/independencia/046_ordenes_compra_por_ciclo.sql
  - backend/migrations/independencia/047_envio_orden_compra_ciclo.sql
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.pdf.js
  - backend/src/modules/orders-whatsapp/ordenesCicloEnvio.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.routes.js
  - backend/src/modules/orders-whatsapp/orders-whatsapp.routes.js
  - backend/src/integrations/whatsapp/whatsapp.client.js
  - backend/tests/ordenesCompraCiclo.test.js
  - backend/tests/ordenesCompraEnvio.test.js
  - backend/tests/ordenCompraEnvioGlobalRetirado.test.js
  - backend/tests/envioWhatsApp.test.js
  - frontend/src/components/reporte-proveedores/OrdenesCompraCiclo.jsx
  - frontend/src/components/reporte-proveedores/EnvioOrdenCiclo.jsx
  - frontend/src/components/reporte-proveedores/ProveedorDetalle.jsx
  - frontend/src/components/reporte-proveedores/FaltantesPorCiclo.jsx
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping, decision/ciclo-de-ruta-como-contexto, decision/orden-enviada-y-archivo-por-recepcion]
  relacionado: [modulo/faltantes, modulo/compras, modulo/inventario, modulo/permisos, modulo/whatsapp]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-06
---

IMPLEMENTADO, código local a929ca9. Reporte Proveedores → semana concreta o Sin ciclo → proveedor →
Preparar orden de este ciclo. Órdenes por ciclo conserva borradores, pendientes,
enviadas y cierres SIN envío, aunque el proveedor salga del reporte. No aplica
cantidades ni marcas globales antiguas. Envío global retirado de la pantalla
sin ciclo seleccionado y POST /api/orden-compra/enviar-whatsapp rechaza 409:
permitirlo eludiría la cobertura y compraría de nuevo lo ya solicitado. Sus
borradores/históricos siguen consultables; no convertirlos por suponer semana.

IDENTIDAD Y REVISIÓN (046). Proveedor.id y ciclo fijo o NULL histórico explícito;
snapshots de nombre/cédula/ruta/semana. Líneas por producto.id, aún con referencias
repetidas; origen por faltante/factura/cliente/parada y anticipado. Solo borrador
admite cambios. Cantidad entera del proveedor, factor con seis decimales y cantidad
propia calculada en SQL. Cajas redondeadas hacia arriba: excedente visible sin
asignarlo a otra ruta o a stock. Mapping/código/conversión guardados se conservan
si cambia el maestro. Clave UUID+cuerpo y revisión evitan duplicar/reescribir.

PDF REVISADO (047). En pendiente, elegir número y mensaje, preparar copia,
abrir/descargar y confirmar revisión antes de enviar. Número CR único normalizado,
referencia OC-id obligatoria en mensaje. PDFKit usa solamente snapshots de la
orden; cabecera/semana/conversión y cantidades propia/proveedor. Textos extensos
continúan con cabecera/pie sin truncar ni repetir cantidades. La propuesta inicial
se espera antes de habilitar edición, para no sobrescribir lo escrito.

orden_compra_ciclo_envio guarda PDF BYTEA privado, SHA-256 comprobado en SQL,
versión, número, mensaje, UUID, secuencia/actores/fechas/resultados. El backup de
PostgreSQL conserva estos documentos. DTO expone solo metadatos; descarga exige
permiso Reporte Proveedores, id de orden/copia correcto y private/no-store. Nunca
regenera bytes al consultar/enviar. Copias anteriores siguen en historial, pero
revisar una anterior no habilita enviar la actual. Máximo 5 MB; sin ruta pública.

ENVÍO DURABLE. Transacción con bloqueo de orden/faltantes + advisory 46005/1,
revalidación de versión/orígenes/proveedor/ciclo, intento enviando y enlace en
cabecera. COMMIT ANTES del transporte, fuera de la transacción. Una repetición
lee el resultado: no llama de nuevo, tampoco tras timeout o caída del proceso.
Índice único impide dos intentos activos y SQL protege bytes/resultado/header/
líneas. Confirmación positiva del adaptador al mismo número pasa a enviada;
transportar no confirma lectura ni recepción física. El estado no permite volver
a borrador, agregar productos o cerrar sin recepción; no hay ampliación automática.

INCERTIDUMBRE. Timeout/fallo tras iniciar conserva cobertura y bloqueo, con motivo
genérico sin copiar errores privados. No reenviar. Si hubo prueba de no inicio
antes del canal/sendMessage, el intento no_enviado conserva historial y solo otra
copia explícita permite reintentar. Fallo en DB después de transportar deja intento
enviando durable: consultar no retransmite. Incierto o enviando con más de cinco
minutos admite verificación explícita con proveedor + motivo/actor; confirmación
manual no inventa ACK de WhatsApp ni entrada de inventario. La UI solo hace GET
cada 3 s durante enviando. Guardas config/aislado permanecen cerradas en la app local.

COBERTURA. Apartado sin envío confirmado, solicitado y libre se muestran separados.
Por faltante se descuenta cobertura válida abierta una vez, aun si cambió la
asignación del proveedor. Pendiente de recibir TOTAL se muestra en la línea de
orden enviada; en sugerencia se muestra solo cobertura asignada a sus orígenes.
Ejemplo: 2 cajas × 6 = 12 pendientes, 10 asignadas a estas facturas, 2 excedentes
sin cobertura de la siguiente semana. 10 enviadas + 3 nuevas deja la primera
orden en 10 y ofrece 3 en otra; próximo ciclo conserva su necesidad independiente.
Pedido incierto queda apartado, no solicitado confirmado. Recepción física no
existe todavía: nunca escribir compra/stock/faltante para simular ese estado.

PERMISOS Y CIERRE. Rutas /por-ciclo heredan Reporte Proveedores, incluidos PDF y
verificación manual; selects usan metadatos del permiso propio. Ficha activa por
cédula o nombre EXACTO único. Ciclo cerrado/cancelado bloquea revisión comercial
y envío antes de reclamar. Cerrar SIN envío exige motivo, libera solo reservas y
conserva líneas/origen/bitácora. No es archivo 24 h ni cierre de enviada.

VALIDACIÓN. 23 pruebas nuevas de esta parte: copia/hash/DTO, idempotencia, exactitud,
SQL/API inmutable, 10+3 enviado, cambios de necesidad, incertidumbre/reinicio,
preflight, manual, conversiones, no stock, dos conexiones y retiro de envío global.
Chromium 1440/390 con transporte exclusivamente simulado; PDF nativo de una hoja
y 80 líneas/14 hojas con texto extenso, sin pérdida/duplicación/desborde. Informe
y validación final: docs/informes/envio-ordenes-ciclo-2026-10-06.md.
Suite completa 2.059/364 suites, cero fallos/omitidas; grafo 12 y build aprobados.
047 aplicada SOLO a tachi local 5434 con respaldo, 22 huellas idénticas y
tabla nueva vacía. No datos de prueba en compartida ni envíos reales.
API/lista/PDF y frontend compartidos comprobados solo GET, salidas bloqueadas;
5174→3002 con lanzador permanente seguro, PID 92846. Base privada/3003/5175
retirados; worktree/rama temporal se retiran al cierre, evidencia se conserva.

PENDIENTE REAL. Factura/PDF del proveedor, comparación pedido/facturado/físico,
recepción parcial/final idempotente integrada con registrarCompra (evitar doble
stock), cierre de enviada, carga/entrega y archivo 24 h. OC-03 y FAL-04 parciales;
FAL-03/07/08, REC, ENT y ARC siguen abiertos. Limpieza semanal pendiente POR
CÓDIGO; jamás ejecutarla. App local 5174→3002 usa lanzador seguro. Próxima SQL 048.
Preservar ruta/ciclo cancelado del usuario, inventario provisional cero e históricos.
