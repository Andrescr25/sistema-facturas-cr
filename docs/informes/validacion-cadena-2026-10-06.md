# Permisos, concurrencia y unidades de la cadena — 2026-10-06

Desde **fc19546**, exclusivamente en independencia-alegra local. Commits,
status, worktrees y reservas revisados; sin nuevo trabajo de Claude.
Copia tmp/codex-validacion-cadena-20261006, clon propio
tachi_codex_validacion_cadena_20261006 desde dump actualizado de tachi LOCAL052.
Sin migración nueva, Prisma, instalaciones ni conexión de producción; 053 libre.

## Resultado comprobado

Veinte casos nuevos usan la cadena real portal/agente → factura → bodega/
faltantes → orden/PDF → compra → recepción → carga/entrega, en dos semanas
de la misma ruta. Se amplía el fixture para conversiones y concurrencia,
conservando su comportamiento por defecto. También se corrige su llamada al
servicio de compras para pasar el actor como tercer argumento, tal como exige
el contrato; no era un cambio de aplicación. Solo se sustituyen avisos y
transporte externo para evitar mensajes reales.

**Permisos:** matriz HTTP con middleware/routers reales, ocho módulos
individuales, admin y sin módulos. PDF/Excel/Maps y selectores respetan el
dueño de la ruta; mayúsculas/barra final no abren un permiso ajeno. Escrituras
rechazan antes de efectos. Actor viene del token, revocación bloquea reintento,
corrección exige admin y /eventos no acepta revisión. Vencido/inactivo/cliente
no abre operaciones internas; portal rechaza token de personal y pedido ajeno.

**Concurrencia:** conexiones PostgreSQL reales y fixtures COMMIT solo en el
clon. Misma recepción/cierre/carga confirma una vez; distintos UUID con misma
revisión dejan un ganador y el otro 409. Recepción y cierre compiten por el
mismo saldo y conservan exclusivamente el resultado ganador. Envío adicional
tiene intento durable visible antes del transporte simulado y se transmite
una vez; orden original no se amplía. Respuesta perdida tras mover maestro
reconoce el evento original. READ ONLY/REPEATABLE READ observados con SHOW en
las consultas físicas y de necesidades, sin simular SQL ni conexión.

**Unidades:** 2 cajas × 6 = 12 propias para demanda 10; el excedente no cubre
la próxima semana. 500 del proveedor × 0,02 = 10 propias y costo propio 500
con precio proveedor 10. Recepción acredita una sola vez y conserva la
conversión/compras/facturas guardadas después de modificar mapping/precio/
nombre. Fracciones 0,1 + 0,2 sin residuos; quinta decimal, booleano, exceso y
línea de otra orden rechazan sin efectos. Cierre conserva lo recibido y
libera solo cobertura pendiente de su origen.

Stock general cambia al recibir y se ve en ambas semanas. Las pruebas
comparan demanda/cobertura/recepciones del otro ciclo por separado del saldo
general; aumentar ese saldo no equivale a asignar mercadería a otra semana.
El inventario de partida del ensayo es cero provisional; ventas sintéticas
pueden dejarlo negativo y no constituyen inventario físico verificado.

## Evidencia final y alcance

**2.257 pruebas / 362 suites**, sin fallos ni omitidas. Veinte casos nuevos:
seis de permisos, ocho de concurrencia/aislamiento y seis de unidades.
Grafo 12 y build aprobados. Los casos de permisos/unidades usan SAVEPOINT/
ROLLBACK sobre SQL y routers reales; conexiones/COMMIT de concurrencia solo
existen en el clon desechable. La suite se ejecuta con concurrencia de archivos
1 para evitar que las huellas globales de un caso vean fixtures COMMIT de otro;
las carreras dentro de cada caso sí usan conexiones/transacciones paralelas.

Servidor completo propio, **569 solicitudes HTTP**: 28 rutas de lectura,
19 escrituras del flujo y diez perfiles (ocho módulos individuales, admin,
sin módulos). Matriz: **364 lecturas y 190 escrituras denegadas**, además de
tokens/frontera, operaciones positivas, reintentos y descarga privada.
Receptor de Proveedores acredita +2 solo una vez y conserva el actor JWT;
chofer carga 0,3 una vez, administrador corrige y revocar permiso bloquea el
reintento. Proveedores no habilita registrar compras ni acceder a Clientes.
PDF guardado SHA-256 idéntico, private/no-store. Datos de la factura del buzón
se representan como tales, no se presentan como un PDF original del proveedor.

Chromium 1440/390: **cinco vistas / diez capturas**, revisadas sin desborde
global ni errores JavaScript. Comprador ve conversión/recepción y carece de
Clientes; chofer ve Maps/carga fraccionaria sin ficha o finanzas; administrador
ve corrección; cuenta con módulo revocado muestra falta de acceso.
**18 huellas de negocio completas idénticas** tras lecturas/rechazos y tras
las pantallas. Se toman las referencias después de las operaciones positivas
que corresponden; fixture y escrituras HTTP autorizadas son solo del clon.
El navegador emite únicamente GET, cero reporte global legado y cero
escrituras automáticas. Tres transportes de fixture son dobles en memoria;
servidor propio conserva las salidas bloqueadas y los trabajos desactivados.

Ensayos iniciales y finales privados conservados. Ajustes de expectativas del
test: clave rc- válida mantiene su formato aunque la ruta cambie de caso;
recepción incrementa stock general visible, no demanda/cobertura de otra
semana. No se detectó un fallo que exigiera cambiar los servicios. No ejecutar
limpieza semanal ni enviar WhatsApp/correos para comprobar ACL. Concesiones
públicas del catálogo del agente vigentes.

VAL-05–08, Maps anteriores de una fuente LOCAL y los pendientes fiscales/
corte/manuales conservan sus casillas. No acreditar aceptación Hacienda real,
producción o conteo físico por aprobar estos escenarios.

**VAL-04 cerrado: 93 listos / 6 pendientes (99 IDs)**. Independencia conserva
133/14 (147 IDs) separado. Sigue VAL-05: revisión global del flujo en navegador
de escritorio/celular y build; estas cinco vistas son la parte de permisos.
VAL-06/07 conservan aplicación/aislamiento y preservación global; CLI-10/VAL-08
pertenecen a las revisiones del usuario y RUT-03 requiere localizar Maps LOCAL.

## Aplicación local y relevo

Pruebas/documentación **05bbc4f** integradas por rebase y avance sin fusión
desde fc19546, solo en independencia-alegra local y sin push. No cambian
backend/src, frontend/src ni migraciones. App 5174→3002 conserva backend
seguro **49572** y Vite **98892**, sin reinicio. Lanzador permanente:
/private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs.
No usar server.js directo por IMAP/ping/Hacienda y salidas.

Respaldo nuevo de tachi LOCAL5434 protegido 0600:
/private/tmp/codex-validacion-cadena-20261006/antes-validacion-cadena-local.dump.
**36 huellas operativas + 9 completas adicionales idénticas** antes/después
de integrar y consultar. Stock/conteos/movimientos/eventos/órdenes/
recepciones/cierres en cero; cliente/ruta/ciclo cancelado del usuario,
usuarios/permisos, finanzas y documentos anteriores conservados. Sin nuevas
filas ZZ ni demo en la base habitual.

Habitual solo GET/SQL READ ONLY: salud/API/frontend 200, ficha con contexto
Sin ciclo 200/sin sesión 401, necesidades vacías, tres Excel vacíos 200/401,
detalles inexistentes 404. Producción no conectada; original 3000/PID5370,
developer 5013270 y main e19c3e5 intactos. No instalar ni regenerar Prisma.

Clon tachi_codex_validacion_cadena_20261006 y puertos propios 3003/5175
**RETIRADOS**, comprobados por lectura. Copia/rama temporal se retiran al
integrar este relevo. Dumps/logs/evidencia y diez capturas privados 0700/0600
en /private/tmp/codex-validacion-cadena-20261006. Guiones que dependen de la
copia retirada son evidencia, no lanzadores reutilizables. No borrar ensayos
ajenos, almacenamiento fiscal ni Descargas. Memoria conserva literalmente
las quince decisiones del usuario y libera únicamente esta reserva al cerrar.
Grafo y checklist actualizados en la misma entrega; 053 sigue libre.
