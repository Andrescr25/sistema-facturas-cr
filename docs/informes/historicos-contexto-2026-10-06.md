# Históricos y contexto de facturas — 2026-10-06

Implementación desde **387d2b7**, solo en `independencia-alegra` local.
Copia propia tmp/codex-historicos-contexto-20261006 y base desechable
tachi_codex_historicos_contexto_20261006 desde dump LOCAL052.
Sin nueva actividad de Claude al comenzar: commits/status/worktrees revisados.
Sin SQL nueva ni regeneración de Prisma; la 053 sigue libre.

## Resultado

Editar una factura devuelve su fotografía de ruta/semana dentro de la
transacción, incluso a una tablet sin copia descargada. El acuse de una clave
repetida incluye estado, procedencia histórica, ciclo y origen anticipado de
la factura guardada, aunque ya cerró la semana o cambió la ficha del cliente.
No valida el reintento contra el ciclo activo ni vuelve a emitir la factura.

`ciclo:null` confirma «Sin ciclo». Una copia antigua sin metadata muestra
«Ruta y semana sin descargar». Facturas emitidas, lista de edición, detalle,
edición rápida y pendientes muestran esta distinción. La ficha del cliente y
los módulos operativos mantienen la ruta actual separada del documento.
El dato canónico prevalece sobre una copia errónea; la ausencia de campos no
borra ruta/semana/anticipado/histórica ya descargados. Editar una copia
incompleta tampoco la transforma en Sin ciclo. Referencia Alegra conservada
como procedencia, nunca como id propio ni como autorización fiscal nueva.

Los tres caminos de reenvío combinan la fotografía local con el resultado
propio al cambiar de local-id al id definitivo. El acuse sin líneas preserva
las descargadas y la copia definitiva más reciente prevalece sobre el borrador.
La copia definitiva se guarda antes de confirmar/retirar la cola local; un
fallo conserva fotografía, cuerpo y UUID para reintentar. Un acuse sin id propio
mantiene la cola antigua pendiente con su motivo. No se modifican cuerpos,
huellas, claves, almacenes ni versión v4 de IndexedDB. La lectura opcional de
cache no hace fallar una venta online confirmada si IndexedDB no abre.

## Verificación

Pruebas nativas de PostgreSQL en SAVEPOINT/ROLLBACK y pruebas de los servicios
reales con dobles verifican edición sin cache, ciclo cerrado con misma clave,
Sin ciclo tras cambiar la ficha, transferencia de las copias, campos parciales,
error de guardado y acuses antiguos sin id propio. No ejecutan salidas reales.
**2.228 pruebas/362 suites**, fail0/skip0;15 casos nuevos:3 PostgreSQL,
3 conversión/merge y9 servicio real de colas. Grafo12 y build aprobados.

Chromium1440/390,6vistas/12capturas revisadas, sin desborde global ni errores
JavaScript. Una edición HTTP real solo en el clon, tras borrar su cache,
guarda contexto original. La semana anterior cerró y la próxima fue promovida;
cliente/ruta renombrados y movidos no cambian la lista/detalle. Tres caminos
con IndexedDB real conservan fotografía/cuerpo/UUID en acuses simulados;
Sin ciclo canónico prevalece, cola sin id propio queda pendiente y dos
ediciones sin red conservan semana/anticipado. La señal sin conexión se simula
al recargar y las fuentes externas se bloquean; no hay mensajes reales.
**16 huellas iguales** tras las pantallas/POST simulados. SQL de fixture y la
única edición física son propios del clon; la base habitual no se modifica.
Logs de ensayos iniciales/finales privados conservados. No equivalen a
validación integral ni revisiones manuales del usuario.

## Checklist y siguiente parte

FIL-11 cerrado: distinción explícita de históricos y copias incompletas.
**90 listos/9 pendientes (99 IDs)**. Independencia conserva **133/14 (147 IDs)**.
RUT-08 conserva la revisión integral de la cadena de compras/recepción/carga
con documentos y eventos existentes después de mover cliente/promover ciclos.
No se cierran VAL-01/04–07 con pruebas limitadas a facturas/copias.
CLI-10/VAL-08 siguen a cargo del usuario y RUT-03 requiere localizar la fuente
LOCAL de Maps anteriores. El checklist de independencia mantiene sus cifras
separadas; no acredita aceptación real Hacienda ni salida a producción.
