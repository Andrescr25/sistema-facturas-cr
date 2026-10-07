# Contexto visible de rutas y semanas — 2026-10-06

Implementación desde **4e2542b**, únicamente en la migración local
`independencia-alegra`. Copia propia tmp/codex-contexto-operativo-20261006 y
clon tachi_codex_contexto_operativo_20261006 desde dump LOCAL052. Sin otra
copia/reserva ni commits nuevos de Claude al comenzar. Código **9fc8d8e**, integrado por avance sin fusión únicamente local;
respaldo y relevo confirmados abajo.

## Resultado

Al cambiar de selección, Pedidos y los reportes dejan de mostrar datos,
resúmenes y notas de la consulta anterior. Las respuestas tardías conservan
su selección original; volver A → B → A no acepta la primera respuesta A.
El contador de solicitudes sigue distinguiendo reintentos/Actualizaciones del
mismo ámbito. Se ignoran después de desmontar. Un error de nueva consulta
no deja filas anteriores ni afirma que la semana está vacía o todo al día.
Aviso persistente y reintento, conservando los filtros.

Pedidos escribe ruta/semana elegida fuera del selector, para verla completa
en celular. Proveedores muestra las notas de variantes en su vista de
faltantes por ciclo, antes omitidas: por producto y resumen del proveedor.
Las notas tienen la misma ruta/semana/fecha que el faltante y se ocultan
mientras llega su consulta. Cambiar selección cierra el detalle anterior.
Un rollback tardío de un ajuste del reporte Clientes no sustituye las
respuestas actuales; una confirmación pendiente de impresión/recuperación
no ejecuta la selección que ya se abandonó.

Bodega captura los filtros al iniciar el GET. Solo la consulta conjunta
puede guardar la copia conjunta del teléfono. Si falla otra selección,
filtra esa copia por el contexto fijo de cada documento, indicando última
sincronización. No guarda una respuesta filtrada como copia global ni borra
borradores. Sin copia/error oculta la conclusión de lista vacía. Abrir/cerrar
el despacho mantiene sus datos de ciclo y Maps originales.

Ficha del cliente: facturas recientes, TODAS las pendientes y pedidos de
portal/agente muestran ciclo/parada/anticipado o Sin ciclo. SQL reutiliza
JOIN_CICLO del documento, sin inferir de la ruta actual de la ficha. La ruta
actual queda en Información. No expone Maps en el DTO de contexto, ni altera
saldos o el límite de diez documentos recientes. Las pendientes conservan
su consulta completa. Sin cambios de schema, IndexedDB, claves o colas.

## Verificación

**2.213 pruebas/362 suites**, cero fallos/omitidas; dos casos nuevos de
PostgreSQL en operacionCiclos. **14 focalizadas** aprobadas y grafo12/build.
La ficha conserva documentos de semanas distintas y Sin ciclo después de
mover/renombrar cliente/ruta/Maps; saldo80/4facturas permanece. Promover la
próxima semana conserva ficha, faltantes7/4/2 y huella original. SAVEPOINT/
ROLLBACK, nunca pruebas escritas sobre la base habitual. El doble antiguo de
ficha se actualizó para reconocer el JOIN, manteniendo la prueba del saldo
no negativo. Logs iniciales y finales privados conservados.

Chromium **1440/390**, quince vistas y treinta capturas revisadas, sin
horizontal global ni errores JavaScript. Siete respuestas demoradas/reordenadas
con 503 y A→B→A; Pedidos descarta filas anteriores y reintenta, reportes no
muestran resumen viejo ni suponen semana vacía, notas AZUL/VERDE separadas.
Bodega recupera semana B desde copia conjunta aunque la consulta A la haya
reemplazado en RAM: copia y draft idénticos; detalle abre Maps guardado.
Teléfono sin copia/error no muestra Todo al día y Reintentar recupera la lista.
Ficha muestra ambas semanas y Sin ciclo con maestro movido; rutas distingue
actual/preventa, catálogo lee próxima semana sin preparar/enviar PDF.
Entregas navega hasta la página del histórico propio sin borrar otras filas,
conserva detalle y no deduce Maps/carga. **18 huellas iguales** después de
lecturas; HTTP del navegador solo GET/local, reporte legado de fondo0.
Enlace firmado de preventa oculto en capturas; sin sesión/secretos en informes.
Aplicación compartida comprobada al finalizar la integración local; datos y
proceso seguro registrados abajo.

| Vista | Contexto que conserva |
| --- | --- |
| Clientes / Rutas / recorrido | Maestro actual separado del recorrido guardado y de cada semana. |
| Preventa | Cliente y próxima semana explícitos; consulta sin preparar/enviar documentos. |
| Pedidos | Ruta/ciclo/origen/estado, texto completo y Sin ciclo; errores/reintentos sin filas anteriores. |
| Bodega | Semana de factura, Maps fijo, copia filtrada del teléfono y borradores intactos. |
| Reporte Clientes | Facturas/faltantes y ajustes de la selección; error no supone lista vacía. |
| Reporte Proveedores | Procedencia y notas de la semana, detalle anterior cerrado al cambiar. |
| Necesidades / órdenes | Mismo selector entre vistas, documentos originales y próximas compras separados. |
| Carga / Entregas | Ruta/semana del documento, detalle propio y Sin ciclo sin carga supuesta. |
| Ficha: facturas / pedidos | Contexto original en cada fila, separado de Información del maestro. |

## Alcance y relevo

Esta parte cierra **FIL-09**: operativo **89 listos/10 pendientes (99 IDs)**. RUT-08/FIL-11 siguen separados: se
requiere revisar integralmente documentos/históricos/colas, además de estas
pantallas. VAL-01/04–07 siguen abiertos; este ensayo no acredita el flujo
completo con todos sus permisos, conflictos, cantidades y migraciones.
RUT-03 necesita identificar la fuente LOCAL de Maps anteriores, sin consultar
producción ni inventar ubicaciones. CLI-10/VAL-08 son revisiones del usuario.
La aceptación real de Hacienda y el corte siguen en el checklist de
independencia (133/14), separado del operativo.

No hay migración nueva: **053 libre**. No Prisma/generate/install, producción,
developer/main, mensajes reales, limpieza semanal, push ni despliegue.
Catálogo de cuatro productos por hoja, Descargas, archivos fiscales, historial
y ensayos anteriores conservados. Las quince decisiones originales de memoria
se conservan literalmente; guardar instrucciones no acredita implementación.

Grafo: [contexto visible](../grafo/modulo/contexto-visible-operacion.md).
Lista vigente: [checklist](../checklist-rutas-ciclos-operativos.md).
El siguiente paso es completar **RUT-08/FIL-11** y luego la validación integral.

## Aplicación local y cierre

**9fc8d8e** aplicado por rebase y avance sin fusión desde4e2542b; rama limpia,
sin push/corte. Respaldo nuevo de tachi LOCAL5434, privado0600:
/private/tmp/codex-contexto-operativo-20261006/antes-contexto-local.dump.
No se aplica ninguna SQL ni se cambia la base habitual. **36 huellas
operativas +9 completas adicionales idénticas**, antes/después de integración
y GET de verificación: compras íntegras, pagos/caja, permisos y bitácora incluidos.
Stock/conteos/movimientos/eventos/órdenes/recepciones/cierres0; maestro/ruta/
ciclo cancelado del usuario conservados. Ningún dato ZZ insertado en habitual.

App5174→3002, backend seguro **42974**, Vite98892. Lanzador permanente
/private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs.
No arrancar server.js directo por IMAP/ping/Hacienda/salidas. Compartida sólo
GET/SQL READ ONLY: ficha200 muestra Sin ciclo en documentos no clasificados,
sin sesión401; helper frontend servido200. Salud/API/frontend200, necesidades
vacías200, tres Excel vacíos200/401 y detalles inexistentes404. Original3000/
PID5370, developer5013270/main e19c3e5 intactos; producción no conectada.

Base tachi_codex_contexto_operativo_20261006 y puertos propios3003/5175
RETIRADOS. Copia/rama tmp/codex-contexto-operativo-20261006 se retiran tras
integrar este relevo; evidencia/dumps/logs/30capturas permanecen privados en
/private/tmp/codex-contexto-operativo-20261006. Los guiones que usan su copia
retirada son evidencia, no lanzadores para otra sesión. No borrar otros ensayos,
archivos fiscales ni Descargas. Memoria de Claude: cuatro archivos actualizados,
reserva liberada al retiro y quince decisiones originales literalmente preservadas.

Sigue RUT-08/FIL-11 (documentos/históricos/colas), fuente LOCAL Maps RUT-03 y
validación integral VAL-01/04–07; CLI-10/VAL-08 del usuario. **89/10 operativo,
133/14 independencia**. No equivalen a salida a producción ni aceptación real
Hacienda. Revisar nuevos commits/status/worktrees antes de reservar otra parte.
