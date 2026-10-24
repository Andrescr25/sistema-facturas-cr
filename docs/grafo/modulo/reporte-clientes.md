---
id: modulo/reporte-clientes
tipo: modulo
titulo: Reporte de clientes — faltantes por ruta actual y próxima visita
estado: vigente
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - backend/src/modules/reports/reporteClientes.service.js
  - backend/src/modules/rutas/rutaActual.service.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/reports/report.controller.js
  - backend/src/modules/reports/report.routes.js
  - backend/src/modules/reports/report.excel.js
  - backend/src/modules/clientes/rotacion.js
  - frontend/src/hooks/useFiltroRutaReporteCliente.js
  - frontend/src/hooks/useReporteClientes.js
  - frontend/src/pages/ReporteClientes.jsx
  - frontend/src/components/reporte-clientes/FiltroRuta.jsx
  - frontend/src/components/reporte-clientes/VisitaCliente.jsx
  - frontend/src/components/reporte-clientes/ListaClientes.jsx
  - frontend/src/components/reporte-clientes/ClienteDetalle.jsx
  - frontend/src/utils/reporteClientesUtils.js
  - backend/tests/reporteClientesPorRuta.test.js
  - backend/tests/dobles/reporteClientesPorRuta.js
  - docs/informes/reporte-clientes-por-ruta-2026-10-13.md
  - backend/src/modules/reports/historialClientes.sql.js
  - backend/tests/historialReporteClientes.test.js
  - frontend/src/hooks/useActualizacionReporteClientes.js
  - frontend/src/components/reporte-clientes/FacturaEnviadaCard.jsx
  - docs/informes/reporte-clientes-historial-2026-10-15.md
aristas:
  relacionado: [modulo/preventa-agenda, decision/rotacion-por-cliente-sin-ciclos, modulo/rutas-clientes, modulo/faltantes, modulo/exportaciones-reportes, modulo/permisos, modulo/facturacion, leccion/fecha-utc-costa-rica]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


ROT-03 del pedido del usuario: rutas se mantienen, rotación individual,
retiro de ciclos por partes. Este reporte conserva su trabajo de revisión de
faltantes e impresión. La agenda de TODOS los clientes vive en
[Preventa (ROT-04)](preventa-agenda.md); no se inventan faltantes para hacer que una ficha aparezca acá.

## Ruta e identidad

`GET /reportes/faltantes/cliente` y su Excel filtran `rutaId` por
`factura.cliente_id → cliente.ruta_id` de HOY. No filtran por semana, y desde
el 2026-10-20 un `cicloId` de una pestaña vieja se ignora. `sin-ruta` incluye clientes
sin asignación y documentos históricos sin ficha propia. La ruta inexistente
pero válida devuelve vacío, nunca la vista conjunta por omisión.

`GET /reportes/faltantes/cliente/rutas` reemplaza el selector de ciclos del
reporte. Devuelve únicamente id/nombre/activo bajo permiso Reporte Clientes;
no pide Clientes ni expone cuentas, saldo o Maps. Incluye rutas activas aunque
no tengan ciclos, e inactivas que aún tienen clientes asignados.

La agrupación y navegación usan el id PROPIO, no nombre. Dos clientes
homónimos tienen tarjetas, frecuencias y facturas separadas. Un documento sin
ficha conserva su clave por factura y no se atribuye a una ficha por nombre.
El nombre/contacto del cliente viene de la ficha vigente; la factura y su
recorrido original no se reescriben al cambiar nombre o ruta.

## Próxima visita y lectura

La rotación se calcula con el helper de Clientes para todas las facturas
vigentes, incluso las que no tienen faltantes. Una consulta por el conjunto
de ids evita una consulta por línea. Ordena por próxima visita, vencidas
primero, luego hoy y próximas; sin fecha al final. Empates por nombre y clave.
La pantalla conserva ese orden dentro de pendientes y listos, y mantiene
visibles las alertas sin caja. Desde el ajuste pedido el 2026-10-14, las
tarjetas muestran la ruta y el progreso de revisión, sin frecuencia, estado
de visita ni próxima visita: la agenda vive en Preventa. El detalle conserva
la información de visita; el cálculo del servidor y el Excel no cambian.

Consultar clientes/rutas/Excel no asigna proveedores ni guarda respuestas.
Bodega y la asignación explícita conservan ese trabajo. El servicio del
reporte se separa de Proveedores; la cuenta de rotación sigue en un solo
lugar. La lectura de contexto de ciclo queda únicamente para la historia de
cada documento, que se conserva mientras llega ROT-08.

El hook conserva la protección de identidad de selección: resultados o
guardados anteriores no pisan la ruta actual, incluso A → B → A. Al cambiar
ruta cierra el detalle; al volver de una ficha conserva búsquedas y ruta.
Errores de datos y metadatos tienen reintento independiente.

## Excel y límites

La descarga del detalle selecciona `clienteId` exacto (o `facturaId` para un
documento sin ficha), evitando descargar la ficha homónima. Conserva filtros
de nombre/producto/proveedor, las respuestas/revisión guardadas y todas las
líneas del cliente elegido. Añade ruta actual, frecuencia, última atención,
próxima visita y estado; distingue ruta histórica del documento.

No hay nueva migración: usa la 056 ya existente en developer. No se
ejecutan limpiezas. ROT-06/07 estaban pendientes en esa entrega y se completan
el 2026-10-15, según la sección siguiente. [Pruebas y alcance](../../informes/reporte-clientes-por-ruta-2026-10-13.md).


## Historial por factura tras 24 h sin movimiento — 2026-10-15

El reporte no retiraba nunca las listas: no existía regla por antigüedad ni
pestaña Historial. `vista=activos` (por omisión) y `vista=historial` seleccionan
documentos distintos ANTES de agrupar por cliente/ruta. Un cliente puede tener
una factura nueva activa y otra archivada sin mezclar productos ni totales.
Una vista inválida responde 400; mismo permiso privado de Reporte Clientes.

`historialClientes.sql.js` toma la última gestión entre faltantes, ajustes,
actualización/despacho de factura, envío y procesamiento en Impresión. Solo
archiva tras envío comprobado (cola pendiente o todos sus faltantes procesados)
y **al cumplir 24 horas** desde esa gestión. Un procesado antiguo sin fila de
cola también conserva historia. Una factura sólo revisada, sin envío, sigue
activa. Una gestión nueva reinicia el plazo; una lectura no lo cambia.

El archivo se calcula al leer; no mueve ni borra filas, no usa cron y no toca
la cola de Impresión. Una factura en historial puede estar **En impresión** o
**Procesada**: nunca se presenta como impresa por el simple paso del tiempo.
`historial_desde` es el instante en que cumplió las 24 h, y los instantes de
envío/proceso/gestión/archivo salen con zona explícita de Costa Rica. La zona
de la sesión UTC/CR no cambia el corte.

La lista se renueva cada minuto visible y al volver a la pestaña del navegador;
no consulta en segundo plano mientras se edita un detalle. Volver a la lista
recarga. Ruta, búsquedas y exportación conservan la vista; el detalle histórico
muestra documentos, productos, cantidades/respuestas, fechas y recuperación,
sin ruido de rotación/próxima visita. Historial ordena por última gestión.

Recuperar una pendiente quita su cola; recuperar una procesada conserva la
fila procesada pero reabre sus faltantes. Esta última NO regresa al historial
por tener una cola vieja: necesita enviarse de nuevo. La interfaz vuelve a
Activos, y el siguiente envío reinicia el plazo. No se borran documentos,
respuestas ni cantidades ya rebajadas. No es una bitácora nueva de cada clic:
conserva el registro y las fechas de gestión disponibles en las tablas propias.

Sin SQL nuevo ni acceso a producción para probar.
[Verificación](../../informes/reporte-clientes-historial-2026-10-15.md).

## Plazos: 24 h para recuperar, 48 h en el historial — 2026-10-24

Pedido del usuario: «que después de 24 horas no se pueda recuperar la factura
… y la que tenga 48 horas en el historial, eliminarla; solo el historial, lo
que está en el módulo normal dejarlo en cola hasta que se procese». Reemplaza
lo de arriba sobre recuperar desde el historial.

- Los plazos viven en un solo lugar, `historialClientes.sql.js`
  (`PLAZO_RECUPERAR`, `PLAZO_EN_HISTORIAL`, `impresaFueraDePlazo`), y los usa
  también Impresión.
- **Recuperar**, solo mientras la factura está en Activos y no lleva 24 h
  impresa: `devolverAlReporte` responde 409 si está en el historial o si su
  última fila de cola se imprimió hace 24 h o más (aunque una gestión reciente
  la haya traído a Activos). La pantalla lo sabe por `puede_recuperar` y deja
  de ofrecer el botón. Después se corrige con nota de crédito o factura nueva
  (ver la regla de Bodega en [[modulo/facturas-bodega]]).
- **48 h en el historial** (desde `historial_desde`): sale de la vista y del
  Excel. Se OCULTA, no se borra: factura, faltantes, respuestas y fila de la
  cola siguen; si todavía está pendiente en Impresión, ahí sigue esperando.
  Borrar faltantes los devolvería a «por pedir».
- La fila más reciente de la cola es `ULTIMA_COLA`, compartida por el reporte
  y por la revisión del recuperar.

Pruebas en `historialReporteClientes.test.js` (bordes exactos de 24 h y 48 h,
contra la base local). Sin SQL nuevo.
