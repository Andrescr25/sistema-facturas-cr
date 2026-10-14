---
id: modulo/ordenes-compra-por-ciclo
tipo: modulo
titulo: Órdenes por proveedor — envío inmutable, origen e historia conservada
estado: vigente
archivos:
  - backend/src/modules/orders-whatsapp/destinoProveedor.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloLineas.service.js
  - backend/tests/proveedoresRendimiento.test.js
  - docs/informes/proveedores-rendimiento-2026-10-14.md
  - backend/migrations/independencia/059_telefonos_whatsapp_proveedor.sql
  - backend/src/utils/telefonosProveedor.js
  - docs/informes/proveedores-telefonos-2026-10-14.md
  - backend/src/modules/orders-whatsapp/ordenProveedor.pdf.js
  - backend/tests/ordenProveedorPdf.test.js
  - docs/informes/proveedores-correccion-2026-10-14.md
  - backend/tests/proveedoresCritico.test.js
  - backend/src/modules/orders-whatsapp/envioDesdeReporte.service.js
  - backend/src/modules/orders-whatsapp/temporalesVisibles.sql.js
  - backend/src/modules/orders-whatsapp/ordenesReporte.service.js
  - backend/tests/envioReporteProveedor.test.js
  - backend/tests/proveedoresInterfaz.test.js
  - frontend/src/utils/proveedoresVista.js
  - frontend/src/components/reporte-proveedores/OrdenEnviadaDetalle.jsx
  - docs/informes/despliegue-main-2026-10-13.md
  - docs/informes/proveedores-simplificados-2026-10-13.md
  - backend/migrations/independencia/058_ordenes_proveedor_sin_ciclos.sql
  - backend/src/modules/orders-whatsapp/ordenesProveedor.service.js
  - backend/src/modules/orders-whatsapp/ordenesProveedor.controller.js
  - backend/src/modules/orders-whatsapp/ordenesProveedor.routes.js
  - backend/tests/proveedoresSimple.test.js
  - backend/tests/dobles/ordenesAutomaticas.js
  - frontend/src/hooks/useEnvioOrdenProveedor.js
  - backend/src/modules/orders-whatsapp/ordenesAutomaticas.service.js
  - backend/src/modules/orders-whatsapp/comprasProveedores.service.js
  - backend/src/modules/orders-whatsapp/comprasProveedores.controller.js
  - backend/tests/ordenesAutomaticas.test.js
  - docs/informes/ordenes-automaticas-proveedores-2026-10-13.md
  - backend/migrations/independencia/049_recepcion_orden_compra_ciclo.sql
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
  - frontend/src/components/reporte-proveedores/ProveedorDetalle.jsx
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping, decision/ciclo-de-ruta-como-contexto, decision/orden-enviada-y-archivo-por-recepcion]
  relacionado: [modulo/reporte-proveedores, modulo/validacion-cadena-operativa, modulo/contexto-cadena-operativa, modulo/exportaciones-operativas-ciclo, modulo/cierre-ordenes-compra, modulo/necesidades-por-ciclo, modulo/archivo-ordenes-compra, modulo/recepcion-ordenes-compra, modulo/facturas-ordenes-compra, modulo/faltantes, modulo/compras, modulo/inventario, modulo/permisos, modulo/whatsapp]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-14
---

## Envío desde el reporte — 2026-10-14

Optimización posterior limitada a developer: contactos en lectura independiente
sin advisory ni preparación, para mostrar el número de inmediato. Preparar
mantiene bloqueos/versiones/huella; cantidades se insertan en dos consultas de
lote usando las mismas restricciones de PostgreSQL y aritmética de micros.
La acumulación lee necesidades por proveedor, no por cada línea; mantiene
el límite500 y reserva cada origen una vez. Un rechazo revierte todo el lote.
No modifica enviada/incierta ni reintentos guardados. Sin SQL nuevo.

Solicitud posterior: varios WhatsApp en la ficha, uno elegido por envío.
Sin contacto único ni número explícito, /revisar-envio devuelve opciones y
pendiente_destino sin escribir una copia; /enviar directo exige elegir.
Un número escrito se valida como un destino único y no actualiza la ficha.
La copia guarda ese número exacto; otra selección requiere UUID/revisión
nuevas. El cuerpo original mantiene su firma incluso si antes no incluía
telefono. Una enviada o incierta conserva su número y no se retransmite.

La revisión es el detalle de Faltantes. POST /proveedor/enviar valida la huella
del reporte, reemplaza únicamente el borrador/pendiente abierto con las
cantidades revisadas y prepara su PDF en la misma transacción. Nombre/código
son del maestro/mapping propio; extras manuales resuelven identidad única y
conversión decimal exacta de seis decimales, sin procedencia ficticia. La bitácora revisar_reporte guarda UUID
y huella del cuerpo; un reintento reutiliza la copia. La reclamación durable
existente sigue ocurriendo antes del transporte; resultado perdido/incierto
no habilita retransmitir. Destino único revisado y mensaje predeterminado.
El texto nuevo solicitado es «Hola buenas, adjunto pedido» y en la siguiente
línea «gracias», sin referencia en el cuerpo. Una constante común sirve a la
propuesta y al reporte. Preparar acepta este texto exacto; los mensajes
personalizados conservan la validación de referencia. La copia y el PDF
identifican la orden, y las copias ya guardadas no cambian su mensaje.
El botón abre un modal para confirmar el número y el mensaje exactos. Revisar
prepara y guarda el PDF sin transportar; confirmar reutiliza el mismo
UUID/cuerpo y snapshot, sin reconstruir el pedido.
Bloqueo factura → faltante y segunda lectura de huella antes de escribir;
el claim revalida bajo bloqueo de factura. Los borradores históricos
adicionales sin intento se cierran con motivo/bitácora, conservando líneas y
PDF; se reúnen únicamente al clic de envío, sin mutación desde GET.

El reporte separa cobertura enviada de necesidad nueva: Sin enviar arriba,
snapshots enviados tachados abajo. Relación con compra registrada/indicadores
se describe en [[modulo/facturas-ordenes-compra]]. Sin tablas/SQL nuevos;
[verificación](../../informes/proveedores-correccion-2026-10-14.md).

## Formato comercial recuperado — 2026-10-14

El usuario pide recuperar el PDF anterior: logo, referencia/fecha, proveedor,
totales, cantidad destacada, descripción y código del proveedor. El factor
permanece visible junto a la descripción, incluso cuando vale 1. La cantidad
mostrada y los totales son del proveedor; se retiran columnas/cuentas internas
y rótulos de revisión. Referencias faltantes conservan las bandas anteriores
de código/equivalencia, sin inventar identificadores P-id.

ordenProveedor.pdf.js comparte ese diseño con el generador histórico, usando
marcaPdf y sus fuentes. ordenesCiclo.pdf.js traduce únicamente los snapshots
guardados: no consulta mapping, fichas, faltantes ni cantidades actuales. La
descarga y el transporte conservan los bytes preparados, incluidos documentos
anteriores. No se regeneran órdenes ya enviadas ni cambian cantidades, factores,
reservas o stock. Notas del generador antiguo continúan separadas del nombre;
no se atribuyen al snapshot si no existen allí.

Cinco regresiones con PDFKit real validan una hoja, 80 productos, fallback de
referencias y textos mayores que una hoja sin truncar, repetir cantidades ni
perder factor. Extracción y raster PDFKit nativos comprueban una hoja, seis
hojas con 80 líneas y descripción extensa en siete hojas. Cero consultas de
base o mensajes para esas verificaciones.


## Regla vigente — sin ciclos, 2026-10-13

El usuario deja solo Faltantes y fichas en [[modulo/reporte-proveedores]].
Órdenes se revisan dentro del proveedor, sin semanas ni áreas adicionales.
Buscar cualquier orden abierta del proveedor en borrador/pendiente, sin intento
activo; reutilizar también borradores históricos con ciclo fijo, sin cambiar
sus metadatos. Orden nueva guarda ciclo/ruta/semana NULL. Nuevo faltante tras
envío/incierto crea otra orden independiente. Cerrar/promover una semana no
bloquea preparar, editar ni enviar la compra; estos guardas dejan de depender
operativamente de ciclos. El proveedor sigue activo/inequívoco, con versión,
identidad producto/factura/cliente y cobertura/cantidad protegidas.

058 sustituye únicamente validar_reserva_orden_compra para permitir orígenes
de distintas semanas: no cambia filas, FK, snapshots, stock ni triggers de
inmutabilidad. Editar/revalidar trabaja con todas las necesidades del proveedor.
Una nueva copia PDF y la propuesta de mensaje omiten ciclos; los bytes y mensajes
ya guardados no se regeneran. /por-ciclo y tablas conservan su nombre por
compatibilidad histórica; GET /proveedor/ordenes no escribe y POST /proveedor/preparar
es explícito. Las recepciones/facturas/cierres existentes siguen en backend,
retirados de la pantalla por el pedido del usuario. SQL 058 aplicada en producción en el despliegue autorizado del 13 de octubre. Evidencia vigente: docs/informes/proveedores-simplificados-2026-10-13.md.

## Etapas históricas anteriores a esta simplificación

Los contratos de PDF/envío/versiones/cobertura continúan; los requisitos de
semana y la navegación por paneles que siguen describen el sistema anterior.


ENVÍO IMPLEMENTADO, código local a929ca9; validación histórica de 047 abajo.
048/f41ce85 añade factura/PDF/comparación, ver [[modulo/facturas-ordenes-compra]].
La validación 2.081 y PID97018 corresponden a etapa048; ver recepción vigente049. Reporte Proveedores → semana concreta o Sin ciclo → proveedor →
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
Pedido incierto queda apartado, no solicitado confirmado. La etapa047 no
registraba físico; 049 lo añade con eventos explícitos, sin simularlo desde envío.

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

FACTURA (048). [[modulo/facturas-ordenes-compra]] añade vínculo revisado, PDF
privado adjuntado o representación identificada, comparación pedido/facturado,
exceso y corrección conservada. No crea compra ni recepción ni cambia esta orden.

RECEPCIÓN (049). [[modulo/recepcion-ordenes-compra]] añade parcial/recibida,
recibido por línea y comparación, cobertura final solo por cantidad física.
Cabecera comercial/bytes/orígenes conservados. Sugerencia distingue recibido y
pendiente asignados a necesidades; un excedente no compra/cubre próxima semana.

ARCHIVO (050). [[modulo/archivo-ordenes-compra]] oculta recibida a las 24 h
desde final, conserva documentos/cobertura e incluye en Historial. Retiro global
por código, sin ejecutar limpieza. No transforma recibida en cerrada.

PENDIENTE REAL. Cierre de enviada, FAL-03/04/08 y carga/entrega. OC-03 parcial
por cierre de enviada. Preservar ruta/ciclo cancelado y stock provisional 0.
Relevo vigente en informe archivo; validaciones anteriores son históricas.

Vista operativa de stock/demanda/faltantes/compras: [[modulo/necesidades-por-ciclo]],
consulta por semana y producto con procedencia. No reservar/descontar stock
otra vez ni considerar borrador/incierto como solicitado confirmado. Consulta
nueva no asigna proveedores; no llamar reporte legado de fondo. Evidencia y
estado vigente en informe necesidades-cobertura-2026-10-06.

CIERRE ENVIADO (052). [[modulo/cierre-ordenes-compra]] sustituye la limitación
anterior de cierre: confirmación/motivo, recibido conservado y solo pendiente
liberado. No cambiar PDF, recepción física, compra, CxP ni archivo24h.
Necesidades incluye originales y recibido de enviada cerrada con pendiente0.

EXPORTACIÓN OPERATIVA. [[modulo/exportaciones-operativas-ciclo]] añade
Excel de necesidades/órdenes/recorrido, filtros completos y detalle con
procedencia, sin paginación truncada ni escrituras de negocio. Los textos
de etapas anteriores son históricos; archivo/cierre/avance actuales se
conservan al descargar. Sin migración nueva.

CONTINUIDAD 2026-10-06. [[modulo/contexto-cadena-operativa]] verifica la cadena
con dos semanas, cliente/Maps movidos y promoción: documentos/recepciones/
PDF/cobertura/eventos previos conservados, operaciones continuadas en su origen.
Cifras/relevo vigentes en el informe contexto-cadena-2026-10-06; los anteriores
son históricos. Permisos/concurrencia/unidades y VAL global siguen separados.

2026-10-06: matriz de permisos, reintentos/conexiones reales y unidades de
la cadena completa en [[modulo/validacion-cadena-operativa]]. Stock general
se distingue de demanda/cobertura por semana. Informe validacion-cadena-
2026-10-06 mantiene el cierre y sus límites; etapas anteriores históricas.


## Presentación anterior — 2026-10-07

Órdenes en tarjetas, activas/historial y detalle con navegación de secciones.
Productos, PDF/envío, factura, recepción y cierre se muestran según estado;
los paneles permanecen montados al ocultarlos para conservar PDF y formularios
sin guardar. Se conserva el bloqueo tras envío y los componentes de cada paso.
Ver [[modulo/reporte-proveedores]]: 28 escenarios visuales1440/390, sin escribir
ni enviar; no sustituye la validación de negocio de los párrafos anteriores.

## Primera acumulación automática — antes de simplificar la pantalla

Bodega guarda el faltante, asigna el proveedor conocido y prepara la compra en
la misma transacción. Asignar un proveedor manualmente también prepara lo libre.
Buscar por proveedor propio y ciclo fijo (incluido Sin ciclo), únicamente
borrador/pendiente sin intento de envío. Acumular nuevos productos y el aumento
real de cantidades; enviada/parcial/recibida/cerrada e intento incierto quedan
fuera. El caso A10/B5 enviado seguido de C8/A3 genera una orden independiente.

Pendiente vuelve internamente a borrador y recupera pendiente dentro del mismo
COMMIT; cambia su revisión, invalida el PDF anterior sin borrar sus bytes y exige
preparar/revisar otra copia. Repetir un faltante no cambia cantidades ni revisión.
Conservar ajustes manuales y snapshots de conversión; aprovechar excedente de
caja solo antes de enviar. El excedente enviado no compra un faltante posterior.
Advisory46005/1 antes de factura/faltantes evita reservas duplicadas y órdenes
dobles. Sin proveedor inequívoco/activo o conversión válida, conservar necesidad
visible sin inventar una orden. Un ciclo cerrado no admite compras nuevas.

GET/resumen es READ ONLY/REPEATABLE READ y separa sin orden, por enviar, por
verificar, por recibir y recibido. POST/sincronizar prepara explícitamente
faltantes anteriores o liberados; nunca se invoca en segundo plano al consultar.
Cancelar sin enviar conserva el estado histórico cerrada y se rotula Cancelada;
cerrar enviada sigue su revisión comercial. Sin cambio de esquema ni mensajes
reales en pruebas. Ver el informe de 2026-10-13; etapas anteriores históricas.


## Despliegue autorizado — 2026-10-13

El usuario pide llevar todo a main. Codex aplica 055/057/058 en producción
con respaldo restaurable y ensayo local: 144 tablas conservadas y los seis
cuerpos de función verificados. 056 ya estaba aplicada. El bloqueo anterior
por migraciones queda resuelto; la publicación incluye rotación, Reporte
Clientes, Preventa, Carga/entregas y Proveedores. Ver
[registro del despliegue](../../informes/despliegue-main-2026-10-13.md).
Los párrafos de entregas previas describen su estado histórico al publicarlas.
