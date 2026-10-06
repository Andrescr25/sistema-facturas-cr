# Registro físico de carga y entrega — 2026-10-06

**Implementado, verificado e integrado solo local.** Código `5c9e90a`,
desde bde69c9; sin commits nuevos de Claude ni otra reserva al iniciar.
Rama propia tmp/codex-entrega-fisica-20261006, rebase y avance sin fusión a
independencia-alegra; sin push ni producción.

## Resultado

En Carga y Entregas, cada factura de una semana fija permite registrar
cantidades nuevas cargadas, entregadas o descargadas, además de incidencias
con motivo. Muestra acumulados, mercadería en camión, pendiente y eventos con
responsable/hora del servidor. Entrega parcial conserva el resto; completa
sale de carga sugerida, manteniendo recorrido e historial.

Preventa anticipada puede cargarse antes. Para entregar al cliente, Rutas debe
promover explícitamente SU ciclo a Entrega. No cambiar la semana próxima al
registrar lo ocurrido en la actual. Pedido facturado mantiene origen y ciclo,
sin duplicar pedido/factura en la parada; Sin ciclo sigue de consulta histórica.

Un cambio operativo de factura/bodega exige revisión física. Admin confirma
acumulados de todas las líneas actuales con motivo, conservando eventos/fotos
anteriores incluso si reimpresión reemplazó líneas. No reasignar cantidades
viejas automáticamente; no atribuir carga nueva a factura anulada. Descarga de
carga anterior sigue posible con motivo si factura/ciclo cambió o se cerró.

UUID/cuerpo/versiones evitan repetir eventos por una respuesta perdida. UI
conserva el mismo registro para reintentar; dos operadores no pueden confirmar
cargas distintas sobre la misma versión. Consulta solo lee; evento+bitácora
son transaccionales. Historia inmutable también por SQL, cantidades NUMERIC,
actor de sesión y fecha del servidor. Corrección exige admin en permiso,
servicio y SQL; acción revision no entra por el endpoint ordinario.

SQL051 crea entrega_evento y funciones, sin backfill. Registro físico no crea
venta/cobro/compra ni vuelve a descontar inventario. Stock provisional del
origen local permanece cero; fixtures solo en clon propio desechable.

## Verificación y aplicación local

**2.148 pruebas/362 suites, cero fallos/omitidas**, grafo12 y build aprobados.
23 casos nuevos (22 PostgreSQL + permiso);72focalizados. Suite completa sobre
clon restaurado desde fuente local y SQL051 completa; antes del navegador se
restauró SOLO ese clon para descartar fixtures confirmados de concurrencia.

SAVEPOINT/ROLLBACK para casos ordinarios. Dos conexiones requieren fixtures
confirmados en clon propio: UUID igual produce un evento, cargas distintas
de igual revisión dejan una y409. GET real comprueba READ ONLY/REPEATABLE READ
sin bloqueos de escritura. SQL protege historia/balances, revisión anulada y
hora del servidor. Fallo de bitácora revierte evento/versiones/cantidades.
Fracciones no dejan residuos binarios; cambio de precio no exige revisión
física, cambio de faltantes sí. Actor/fecha del cuerpo se ignoran.

Chromium1440/390: respuesta perdida DESPUÉS del commit, botón reintenta mismo
UUID/cuerpo y conserva carga4 una sola vez. Entrega3, incidencia, descarga1,
recarga7+2,25 y entrega final conservan seis eventos; completa sale de carga.
Anticipado facturado aparece una vez con pedido de origen. Próxima semana
permite carga y bloquea entrega sin promoción; avance actual intacto.
Reimpresión reemplaza línea1 por7, muestra Requiere revisión y bloquea
entrega; chofer no ve corrección, admin confirma acumulados actuales con
motivo y conserva producto/línea/cantidades originales en historia.
**20 huellas comerciales idénticas** durante eventos físicos, antes y después
de la edición de factura hecha deliberadamente SOLO en clon. Permisos
401/403/400 reales, chofer sin Clientes. Sin errores JS ni desborde; capturas
inspeccionadas. Navegador permite solo GET y POST de eventos/revisión en
puertos propios3003/5175, bloqueando otras escrituras y destinos.

ENT-06/PRE-08/FIL-07 cerrados: **82 listos/17 pendientes (99 IDs)**.
Independencia **133/14 (147 IDs)** aparte. Estas pruebas no acreditan todavía
la validación integral de partes de compras/stock/filtros pendientes.

## Cierre local y relevo

SQL051 aplicada exclusivamente a tachi LOCAL localhost5434 con respaldo
nuevo antes-051-local.dump0600. entrega_evento vacía, sin backfill ni cambio
en filas de negocio. Backend local3002 detenido durante SQL/avance de código
y reiniciado con lanzador permanente seguro, **PID18962**; Vite98892/app5174.
No levantar server.js directo por trabajos IMAP/ping/Hacienda/salidas de otros
módulos. Limpieza global ya retirada050; nunca ejecutar implementación vieja.

**36 huellas operativas idénticas** al comienzo y después de integrar, más
**7 huellas completas adicionales idénticas** de compra, pagos/aplicaciones,
caja, bitácora y permisos. Usuario/ruta/ciclo cancelado/cliente conservados;
stock/conteos/movimientos0, órdenes/recepciones/eventos vacíos, sin demo.
Compartida verificada solo GET/SQL READ ONLY: salud/plan/frontend200, registro
físico de id inexistente404 y sin sesión401, función/resumen nuevo disponible.
No probar endpoint que escriba sobre registros reales ni Reporte Proveedores
sin filtros, que puede asignar proveedores.

Producción/backendoriginal3000/PID5370, developer5013270/main e19c3e5 intactos.
No producción, Prisma/generate/instalación, mensajes reales, Hacienda/IMAP
reales ni limpieza ejecutada. Catálogo cuatro fichas/hoja, Descargas, archivo
fiscal y ensayos anteriores preservados. Las15 decisiones no se modifican.

Procesos propios3003/5175 y base tachi_codex_entrega_fisica_20261006 retirados
tras verificar. Copia/rama temporal se retiran al cerrar documentación y
memoria; reserva liberada en el relevo final. Evidencia, dumps y capturas
privados en /private/tmp/codex-entrega-fisica-20261006 se conservan. Los guiones
que dependan del worktree retirado son evidencia, no lanzadores reutilizables.

## Pendientes de la solicitud

Los17IDs abiertos se agrupan así:

- RUT-03/08: fuente local de Maps anteriores y conservación integral del
  contexto tras cambios de ruta/ciclo, más allá de la parte ya comprobada.
- CLI-10/VAL-08: revisiones manuales del usuario.
- FIL-09/10/11: propagación final a pantallas/exportaciones/históricos.
- FAL-01/03/04: procedencia de toda necesidad, stock/requerido/comprometido y
  cobertura/pedido/pendiente/recibido en una vista coherente.
- FAL-08/OC-03: cierre de enviada con motivo y liberación únicamente de
  cobertura no recibida. No modificar su documento enviado ni borrar historia.
- VAL-01/04/05/06/07: validación integral después de completar esas partes.

Siguiente parte recomendada: vista de stock/requerido/comprometido/cobertura;
SQL052 solo si esa implementación necesita esquema nuevo.
Independencia y aceptación fiscal/corte permanecen en su checklist separado.
