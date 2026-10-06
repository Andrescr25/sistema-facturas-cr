# Recorrido y carga sugerida por ciclo — 2026-10-06

**Implementado, verificado e integrado solo local.** Código `393ee66`,
desde450e296, sin push.
Rama tmp/codex-carga-ciclos-20261006, sin commits nuevos de Claude ni otra
reserva al iniciar. Solo independencia-alegra local, sin producción.

## Resultado de esta parte

Nuevo módulo **Carga y Entregas** bajo Ventas, permiso propio entregas.
Elegir una semana explícita; clientes/documentos en orden real del recorrido
fijo, enlace Maps, origen anticipado y pedido adicional identificados.
Consulta de factura/líneas y pedido pendiente sin exponer precios/cuentas.
Mover cliente/nombre/Maps del maestro no cambia su parada histórica.

Sugerencia de carga inversa en toda la ruta, no solo página visible; primer
pedido de entrega se carga al final para quedar accesible. Solo facturas con
revisión de bodega registrada. Faltantes visibles y cantidades FACTURADAS:
no afirmar paquete completo, carga confirmada o entrega real. Pendientes por
facturar se distinguen y no entran en carga. Facturado no duplica pedido.
Sin ciclo conserva históricos sin adivinar Maps ni orden.

Listado paginado20, máximo50 por petición. Abrir desde carga lleva al detalle
de cualquier página. Semana/ruta visibles incluso en celular; respuestas
lentas de otro contexto no reemplazan la selección nueva.

Solo GET en nuevo módulo. Plan/detalle usan READ ONLY/REPEATABLE READ para
leer cabeceras y líneas coherentes, sin escrituras de negocio. Selector/
plan/Maps/detalle exigen permiso Entregas, sin requerir Clientes. Las cuentas
actuales mantienen sus permisos; administrador asigna el nuevo módulo por
Usuarios. No concederlo automáticamente ni compartir API entre módulos.

## Límites y siguiente parte

Esta parte cierra consulta del recorrido/carga/Maps/contexto, no la entrega
física. ENT-06 requiere registrar carga/entrega con versiones, actor/fecha,
eventos y reintentos; revisar alteraciones de factura tras reimpresión sin
perder trazabilidad. PRE-08 y FIL-07 completo esperan ese avance. Próxima051
reservada para esquema de esa parte; esta consulta no necesita migración.

Conservar15 decisiones, catálogo4 productos/hoja, Descargas/archivo fiscal,
stock/conteos/movimientos0 y ruta/ciclo cancelado/cliente del usuario. Demo
Proveedores no recreada; solo fixtures ZZ en copia propia desechable.
developer/main/producción, mensajes reales, Hacienda/IMAP real, Prisma e
instalación fuera. Revisiones manuales continúan a cargo del usuario.

## Verificación

**2.125 pruebas / 362 suites, cero fallos y omitidas**. 14 casos nuevos
(13 PostgreSQL + permiso), grafo12/build aprobados. Suite completa ejecutada
sobre clon propio restaurado, stock de partida0, antes de fixtures de navegador.
Primer intento encontró error IPC de Node: Unable to deserialize cloned data
in faltantesIdsPropios. Ese archivo se comprobó solo (29/29); luego se restauró
únicamente el clon y la suite completa pasó. No relajar tests ni restaurar
base habitual; conservar evidencia del primer intento.

Chromium1440/390: usuario SOLO Entregas sin Clientes abre23paradas, ve carga
23→2→1 de toda la semana, abre detalle de parada23 en página2 y vuelve allí.
Maps original después de mover nombre/ruta/ubicación del maestro; anticipado
sin factura identificado por revisar, fuera de carga. Siguiente semana,
otra ruta/Sin ciclo separados; respuestas lentas anteriores ignoradas.
ACL401/403, API de Clientes403 para chofer; mismo contexto de Reporte Clientes.
14 huellas comerciales iguales, sin errores JS/desborde. Solo GET permitidos
al navegador y puertos propios3003/5175; ninguna salida real ni fixture compartido.

Sobre READ ONLY/REPEATABLE READ comprobado directamente con SHOW en dos
transacciones PostgreSQL reales sobre fixtures propios confirmados: plan y
detalle. Los tests con rollback sustituyen SOLO el sobre transaccional para
poder leer sus propios fixtures no confirmados; SQL de negocio real.

ENT-01/03/04/05 cerrados: **79 listos / 20 pendientes (99 IDs)**.
ENT-06, PRE-08 y FIL-07 siguen por registro físico. VAL-04–07 integrales
esperan ese flujo completo; independencia133/14 (147 IDs) permanece aparte.

## Cierre local y relevo

Código `393ee66` integrado con rebase y avance sin fusión en independencia-alegra.
Respaldo nuevo antes-carga-local.dump (0600), exclusivamente tachi LOCAL5434;
esta parte no requiere SQL nueva ni cambia el esquema/filas de negocio.
Backend local3002 detenido durante avance y reiniciado con lanzador seguro,
PID **14177**, Vite98892/app5174. No levantar server.js directo por IMAP/ping/
Hacienda y otras salidas; limpieza antigua ya retirada, no restaurarla.

**36 huellas operativas iguales** al inicio, antes y después de integrar:
clientes/rutas/ciclos/carrito, pedidos/facturas, faltantes/ajustes, compras/
precios/CxP/buzón, envíos/comprobantes, cantidades/corte histórico/mapeos y
stock. Ruta/ciclo cancelado/cliente del usuario conservados, sin demo.
Stock/conteos/movimientos0, órdenes y recepciones vacías; ciclo existente sin
documentos nuevos. Verificación compartida solo GET/SQL READ ONLY:
salud/plan/frontend200, API de Entregas sin sesión401. Sin cambios de permisos
en cuentas existentes ni migración; el administrador puede asignar entregas.

developer5013270, main e19c3e5 y backendoriginal3000/PID5370 intactos.
Sin producción, Prisma/instalación, mensajes reales, Hacienda/IMAP reales ni
limpieza ejecutada. No consultar Reporte Proveedores sin filtros para verificar:
puede asignar proveedores. Catálogo/Descargas/archivo fiscal/ensayos conservados.

Base tachi_codex_carga_ciclos_20261006 y procesos propios3003/5175 retirados;
evidencia/dumps/capturas privados en /private/tmp/codex-carga-ciclos-20261006.
Copia/rama temporal se retiran al cerrar la documentación y memoria, reserva
liberada en el relevo final. Guiones que referencian trabajo retirado no son
lanzadores reutilizables. Las15 decisiones conservadas sin cambios.

**Siguiente: registro de carga y entrega (051)**, ENT-06/PRE-08/FIL-07.
Eventos por factura/partidas con ciclo fijo, versión/snapshot, actor/hora/
clave de reintento; bloqueos para revisión posterior de facturas y corrección
explícita con motivo. Parcial/fallida/retorno requieren cantidades y causa,
sin vender/facturar/cobrar ni descontar stock otra vez al marcar entrega.
Una acción de un ciclo no debe cerrar ni modificar la siguiente semana.
Definir y comprobar ese contrato antes de cerrar las casillas. Después,
stock/requerido/comprometido y cierre de enviada/FAL-08, filtros/exportaciones/
históricos/Maps y validaciones integrales; revisiones manuales del usuario.
