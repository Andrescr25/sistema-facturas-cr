# Contexto en toda la cadena operativa — 2026-10-06

Verificación desde **8d149d0**, solo en la migración local independencia-alegra.
Copia tmp/codex-contexto-cadena-20261006 y clon propio
tachi_codex_contexto_cadena_20261006 desde dump LOCAL052 actualizado.
Commits/status/worktrees/reservas revisados; sin nuevo trabajo de Claude.
Sin nueva SQL, Prisma, instalaciones ni cambios de producción. La 053 sigue libre.

## Resultado

La cadena conserva el contexto de sus documentos después de mover el cliente,
renombrar cliente/ruta, cambiar Maps y cerrar/promover semanas. El ensayo usa
los servicios reales para: cliente/ruta/ciclo → portal/agente → factura →
bodega/faltantes → orden/PDF/envío simulado → factura comercial/PDF → compra →
recepción parcial → carga/entrega. Dos semanas de la misma ruta, más histórico
Sin ciclo. Un ciclo nuevo refleja el maestro nuevo sin reescribir los previos.

No fue necesario cambiar los servicios: sus snapshots e invariantes existentes
conservaron las operaciones. Se añade la prueba de integración que faltaba,
con fixture reutilizable que exige namespace de clon/loopback/node--test y
sustituye únicamente avisos/transporte externos. No se envían mensajes reales.

## Verificación de la cadena

Nueve casos nuevos PostgreSQL con SAVEPOINT/ROLLBACK comprueban:

- Portal y agente mantienen su origen y semana al facturar; bodega/compra y
  acumulados físicos pertenecen a esos mismos documentos.
- Mover/renombrar/Maps y promover conserva 17 tablas completas de documentos,
  líneas, orígenes, envío/PDF, compras, recepciones, eventos y kardex.
- Recibir 6 nuevas después de cerrar ciclo conserva las 4 anteriores y acredita
  solo el delta en la orden original de 10; próximo conserva 1 de 4 recibida.
- Cierre de enviada después del cambio conserva 4 y libera 6 del mismo origen,
  sin tocar stock ni cantidades/cobertura de próxima semana. Reintento único.
- Carga anticipada se conserva; entrega requiere promoción explícita. Entregar
  reduce compromiso de ese ciclo sin otra salida de inventario.
- Respuesta perdida de carga se reconoce tras cierre; carga nueva rechaza 409,
  devolución con motivo conserva fotografía y no toca compras/stock.
- Bytes PDF de envío/factura y comparación son idénticos tras los cambios;
  no se regenera ni retransmite el documento.
- Histórico Sin ciclo no obtiene Maps, carga ni eventos de la ficha actual.
- Consultas/Excel guardan origen/cobertura/avance y mantienen 17 huellas iguales.

## Verificación final

**2.237 pruebas / 362 suites**, sin fallos ni omitidas. Nueve casos nuevos de
la cadena PostgreSQL, todos con ROLLBACK; grafo 12 y build aprobados.
Dentro de la transacción del caso se sustituyen BEGIN/COMMIT por SAVEPOINT;
las consultas de los servicios conservan su SQL, pero READ ONLY/REPEATABLE
READ se comprueban por la vía HTTP real del servidor propio, fuera de ella.

Chromium a 1440 y 390: **11 vistas / 22 capturas**, sin desborde global ni
errores JavaScript. Revisión de bodega desde Historial, necesidades/órdenes,
recepción parcial/final, carga/entrega, Maps y consulta histórica Sin ciclo.
Las pantallas conservan nombres, ruta, semana, paradas y cantidades originales
tras los cambios. Recepción final en ciclo cerrado conserva 4 y acredita solo
6 nuevas a su orden; la próxima mantiene 1 recibida y 3 pendientes.

Las solicitudes del navegador son solo GET: cero escrituras HTTP y cero
consultas al reporte global legado. **17 huellas completas idénticas** antes/
después de las lecturas y del cambio de maestro/promoción. Las mutaciones de
fixture y recepción se hacen por los servicios reales exclusivamente en el
clon. SHA-256 conserva los cuatro PDF guardados (dos envíos y dos facturas);
un PDF se descarga también por HTTP y coincide. La representación del buzón
se identifica como tal: no equivale a un PDF original adjunto por el proveedor.
El visor y su descarga se verifican; Chromium headless no renderiza el contenido
incrustado en las capturas. Tres transportes confirmados son dobles en memoria.

Los logs privados conservan ensayos iniciales de fixture/selección de controles,
además de la ejecución final aprobada. No se detectó un fallo del sistema que
requiriera cambiar los servicios. Las verificaciones de permisos/concurrencia/
unidades globales y correcciones manuales tienen sus casillas separadas.

## Checklist y siguiente parte

**RUT-08 y VAL-01 cerrados: 92 listos / 7 pendientes (99 IDs).** Independencia
conserva **133 / 14 (147 IDs)** como checklist separado. Sigue VAL-04: matriz
global de permisos, reintentos/concurrencia y unidades a través de la cadena.
VAL-05–07 siguen para la revisión global de pantallas/build, aislamiento de
migraciones/aplicación y preservación de inventario/históricos/salidas.
RUT-03 requiere identificar la fuente LOCAL de Maps anteriores; CLI-10 y
VAL-08 corresponden a las revisiones del usuario. No consultar producción para
cerrar Maps ni acreditar aceptación Hacienda real, conteo físico o corte.

## Aplicación local y relevo

Pruebas y documentación **1bea785**, integradas por rebase y avance sin fusión
desde 8d149d0, solo en independencia-alegra local y sin push. No cambian
backend/src ni frontend/src; no se reinicia el servidor compartido ni se aplica
SQL. Respaldo nuevo de tachi LOCAL5434, protegido 0600:
/private/tmp/codex-contexto-cadena-20261006/antes-contexto-cadena-local.dump.

Antes de las lecturas finales se comprobaron **36 huellas operativas + 9
completas adicionales idénticas**. Al cerrar permanecen **36 + 8 idénticas**;
usuario tiene un cambio de ultimo_ingreso. Auditoría por columnas contra el
dump previo: no cambiaron sus otras columnas, filas ni permisos. Es compatible
con un acceso local concurrente: el único UPDATE de ese campo está en login,
y el ensayo habitual usó un token en memoria, solo GET y SQL READ ONLY.
No se revierte actividad ajena ni se sustituye la referencia previa para
ocultar la diferencia. Evidencia privada en auditoria-usuario.json.

Stock/conteos/movimientos/eventos/órdenes/recepciones/cierres en cero; cliente,
ruta y ciclo cancelado del usuario conservados, sin demo ni nuevas filas ZZ
en la base habitual.

App 5174→3002 conserva backend seguro **49572** y Vite **98892**. Lanzador
permanente /private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs;
no usar server.js directo por sus trabajos IMAP/ping/Hacienda y salidas.
Comprobación habitual solo GET/SQL READ ONLY: salud/API/frontend 200,
ficha con contexto Sin ciclo 200 y sin sesión 401, necesidades vacías,
tres Excel vacíos 200/401 y detalles inexistentes 404. Original 3000/PID5370,
developer 5013270 y main e19c3e5 intactos. No se conecta producción.

Clon tachi_codex_contexto_cadena_20261006 y puertos propios 3003/5175
**RETIRADOS**, comprobados por lectura. La copia/rama temporal se retiran tras
integrar este relevo. Evidencia, dumps, logs y 22 capturas privados 0700/0600
en /private/tmp/codex-contexto-cadena-20261006; los guiones que dependen de
la copia retirada sirven como evidencia, no como lanzadores reutilizables.
Conservar ensayos ajenos, datos fiscales y ejemplos de Descargas. La memoria
mantiene literalmente las quince decisiones del usuario y libera solo esta
reserva al cerrar. Grafo y checklist actualizados en la misma entrega.
