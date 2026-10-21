---
id: modulo/archivo-ordenes-compra
tipo: modulo
titulo: Archivo individual por recepción final, sin borrado ni reinicio semanal
estado: retirado
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - backend/migrations/independencia/050_archivo_individual_ordenes.sql
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/cicloPedidos.js
  - backend/src/modules/orders-whatsapp/orders-whatsapp.service.js
  - backend/src/modules/orders-whatsapp/orders-whatsapp.controller.js
  - backend/src/modules/reports/report.service.js
  - backend/services/scheduledCleanup.js
  - backend/server.js
  - frontend/src/components/configuracion/Mantenimiento.jsx
  - frontend/src/services/alegraService.js
  - backend/tests/cicloPedidos.test.js
  - docs/informes/archivo-ordenes-2026-10-06.md
aristas:
  depende_de: [modulo/recepcion-ordenes-compra, modulo/ordenes-compra-por-ciclo]
  relacionado: [modulo/cierre-ordenes-compra, decision/orden-enviada-y-archivo-por-recepcion, modulo/facturas-ordenes-compra, modulo/faltantes, modulo/permisos, decision/ciclo-de-ruta-como-contexto]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Este flujo por semana u orden numerada está retirado. Los párrafos siguientes
describen la implementación anterior; las tablas, documentos y restricciones
históricas se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


**2026-10-13, simplificación de proveedores:** el usuario retira las áreas y
paneles de ciclos/necesidades/factura/recepción/cierre de Reporte Proveedores.
Solo Faltantes y fichas; órdenes se revisan dentro del proveedor, acumulando sin
semanas. El detalle técnico/histórico de este nodo y sus APIs/documentos siguen
conservados. Presentación vigente: [[modulo/reporte-proveedores]].


CONTRATO. Solo estado recibida con recepción final del servidor inicia las
24 horas. SQL050, vista orden_compra_ciclo_operativa: archivada y fechas
derivadas de TIMESTAMPTZ y CURRENT_TIMESTAMP. Intervalo 24 hours, inclusive
en el límite; no fecha del navegador/cliente ni calendario domingo/lunes.
Sin escritura, cron, borrado ni nuevo estado comercial. Parcial sigue activa.

HISTORIA. Lista Activas excluye archivadas y cerradas sin envío; Historial
incluye ambas. Misma ruta/ciclo/proveedor y Sin ciclo; id del detalle y PDF
continúan autorizados. Recibida conserva estado, versión, cantidad solicitada,
envío/PDF, factura, comparación y recepciones inmutables. Cobertura recibida
permanece en su necesidad: ocultar 6 recibidas de 10 no sugiere comprar otras
10, solo las 4 faltantes. Nunca liberar cobertura al archivar ni mezclar ciclos.

PANTALLA. Orden indica fecha programada o Archivada; Historial conserva los
paneles de factura/envío/recepción. Lista abierta consulta al vencer el tiempo
calculado entre fecha programada y hora del servidor; recupera al volver foco.
No sobrescribir formulario abierto. Configuración → Mantenimiento explica
el historial sin botón de limpieza. Actualizar una página suspendida al retomarla.

RETIRO GLOBAL. server.js no importa/programa scheduledCleanup. El archivo
permanece solo como compatibilidad que rechaza 410, sin importar cron/DB.
DELETE /reportes/faltantes/proveedor/limpiar y /orden-compra/cantidades
rechazan 410 sin consultar/modificar; conservan ACL original (401/403).
Reinicio antiguo cicloPedidos.reiniciar también 410. La consulta del envío
histórico conserva corte ya anotado/fecha explícita; sin corte lee toda la
historia (-infinity), nunca lunes actual ni DDL desde un GET. SQL050 asegura
tabla antigua si faltaba, sin cambiar cortes/filas anteriores. Ajustes
individuales explícitos y otros trabajos programados continúan en su módulo.

VERIFICACIÓN. Pruebas nuevas usan PostgreSQL y ROLLBACK, fechas pasadas solo
al insertar eventos de fixtures propios. Límite antes/exacto/después en
microsegundos, zona UTC/CR, parcial antigua, PDF/factura conservados, cobertura,
historia filtrada y huellas operativas iguales. Tests anteriores de limpieza
se sustituyeron por rechazo/inmutabilidad; jamás ejecutar implementación vieja.
Evidencia y cierre local en el informe. Carga/entregas y cierre de enviada
permanecen pendientes. Producción/developer/main, mensajes y Hacienda reales fuera.

CIERRE LOCAL. Código e8b1b67; SQL050 local5434 con respaldo, 36 huellas iguales
incluyen asignaciones/fechas/cantidades históricas. 2.111 pruebas/362 suites,
cero fallos/omitidas; grafo12/build/Chromium1440/390 aprobados. Backend seguro
8366/app5174→3002, salidas bloqueadas, stock/conteos/movimientos0, sin PO/demo.
75/24 operativo, 133/14 independencia aparte. Base/puertos propios retirados;
reserva/copia temporal se liberan al cerrar. Próxima carga/entregas, SQL051.

CIERRE ENVIADO (052). [[modulo/cierre-ordenes-compra]] sustituye la limitación
anterior de cierre: confirmación/motivo, recibido conservado y solo pendiente
liberado. No cambiar PDF, recepción física, compra, CxP ni archivo24h.
Necesidades incluye originales y recibido de enviada cerrada con pendiente0.
