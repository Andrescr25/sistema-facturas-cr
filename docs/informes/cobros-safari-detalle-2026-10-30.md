# Cobros: fecha en Safari y productos de la factura — 2026-10-30

El usuario reporta que Fecha del pago se sale de la tarjeta en Safari del
iPhone, y que al abrir los productos de la factura se ven vacíos o en cero.

## Causas y cambio

El servicio entregaba nombre/referencia/precio y la tabla compartida leía
descripcion/codigo/precioUnitario, sin un ID de línea. El total se volvía a
calcular sin IVA. Ahora el adaptador puro entrega la forma de la tabla y
conserva el total del documento, incluidos IVA, descuentos y redondeos.

La petición anterior era a Facturación, que puede rechazar a quien solo
tiene Cobros o no creó la factura. Una lectura específica bajo Cobros usa
la misma selección y DTO de líneas de Facturación, sin ampliar su acceso.
Solo una consulta; no busca precio/costo actual ni otros datos de la factura.

Un fallo al consultar ya no se convierte en una lista vacía: se muestra y
permite reintentar. El estado de esas consultas queda en un hook que descarta
respuestas tardías. Los métodos reutilizan el hook existente de pagos; el
componente deja de importar servicios.

La regla móvil de los campos de fecha conserva `type=date` y limita la caja
mediante appearance:none y display:block. El estilo previo ya tenía
border-box y min/max-width; se evita que la apariencia nativa de iOS imponga
otro ancho. Se conserva el día elegido, el alto táctil y el selector nativo.

## Verificación

Seis regresiones: DTO de la tabla con total histórico de IVA/redondeo,
producto repetido y regalía cero, HTTP con solo Cobros y factura ajena,
401/403 sin permiso, documento sin relación actual de producto, factura
vacía/inexistente e ID inválido. PostgreSQL local con BEGIN/ROLLBACK.
179 pruebas dirigidas correctas de consulta, permisos, cobros y pagos.
Build correcto. ESLint del cambio correcto; el global conserva los mismos
9 errores y 25 avisos de HEAD, comprobados en una extracción limpia.

87 comprobaciones de navegador correctas: WebKit a 320/390/430/820 px y
Chromium a 390/1280 px. Campo lleno/vacío, día elegido y ausencia de desborde;
productos con descuento e IVA, total guardado, regalía cero, producto repetido,
error/reintento y factura sin líneas. El cobro simulado conserva fecha, método
y saldarTotal. También fecha al cobrar varias; en escritorio todas las
columnas se ven sin desplazamiento lateral. Sin errores JS. El modal de
escritorio usa el ancho compartido 2xl para que la tabla sea legible.
23 pruebas de grafo/estructura correctas; evidencia y capturas privadas en
`~/.local/share/sistema-facturas-cr/codex-cobros-safari-20261030/`.

El WebKit de
Playwright prueba el motor con vista móvil; no equivale a operar el selector
de UIKit de un iPhone físico. No se desarrolla ni prueba contra producción,
ni se registran cobros reales o se envían mensajes.


## Preparación de la publicación conjunta

Por «subelo a main», se revisan también los siete commits de Claude de
Empleados/Mis ingresos (2ecb3f3–07d8ea3), todavía pendientes de publicar,
y el relevo documental de Codex 90ed0a0. El arreglo de Cobros es 79128e9;
no requiere SQL, pero la publicación conjunta necesita 072–075 antes.

La verificación completa encontró dos pruebas desactualizadas. La de
Preventa se preparaba sin asignar una ruta, aunque desde la 069 es obligatoria;
ahora verifica acceso a la asignada y rechazo a la ajena (403), y conserva
la validación de ID inválido para el administrador (400). La de CSS exigía
que position:relative fuera la primera declaración; ahora comprueba esa
propiedad dentro de la regla, sin depender del orden de las declaraciones.
No se amplían permisos ni se cambia código de negocio por estas pruebas.

Ensayo en un segundo clon desechable: 072–075 conservan las huellas de todas
las tablas anteriores y las filas de movimiento_caja; se crean cuatro tablas
vacías y dos columnas opcionales. DDL reversible antes del COMMIT y segunda
aplicación sin cambios. Las 68 pruebas de planilla pasan contra ese esquema
recién creado. El aplicador real también se ensaya en ese clon: una sola
transacción, respaldo previo de columnas, vista y permisos retirados,
huellas de 13 tablas protegidas y movimientos iguales antes de confirmar.

La consulta de producción para preparar la operación es de solo lectura:
152 tablas, ninguna de las cuatro nuevas y ningún permiso seguimiento-agentes
que retirar. Antes de recrear la vista se compara con la 027. El resultado
real de la aplicación se registra después de confirmarlo.

Recorrido independiente de las pantallas de Claude contra el clon local:
117 comprobaciones Chromium a 390/820/1280 px (69 en Empleados, 48 en Mis
ingresos), sin errores de consola, desbordes ni escrituras. Se conserva la
verificación de Cobros de 87 comprobaciones WebKit/Chromium; no hubo cambios
de aplicación desde ese recorrido. Grafo y estructura finales: 23 correctas.


## Aplicación de SQL confirmada — 2026-10-30, 23:56 CR

Codex aplica 072–075 en producción como requisito de la publicación solicitada,
en una sola transacción con respaldo previo. 152 → 156 tablas; las cuatro
nuevas vacías, captado_por/captado_en nulos. Las huellas de las 13 tablas
protegidas y de los 1.714 movimientos de Caja se conservan. También el
propietario y permisos de la vista. No había concesiones de seguimiento-agentes
que retirar; no se asigna Empleados ni se crean fichas o pagos automáticamente.
Verificación posterior desde una conexión nueva y de solo lectura correcta.

Respaldos privados y resultado confirmado:
`~/.local/share/sistema-facturas-cr/respaldos/20261030-main-cobros-planilla-codex/`.
Antes del COMMIT cualquier diferencia revierte la operación. Si luego se
revierte código, se conserva el esquema aditivo y los datos que ya tenga;
no se borran jornadas o pagos para volver a una versión anterior.

Suite completa final: 268 archivos, 3.288 correctas, 0 fallos/canceladas y
3 omisiones de las condiciones históricas del corte. Esas tres no representan
funciones actuales sin comprobar. Evidencia privada de suite, ensayo y
navegador en `~/.local/share/sistema-facturas-cr/codex-main-cobros-20261030/`.
La revisión deja listo el avance a main de Codex 90ed0a0 y 79128e9, los siete
commits de Claude y esta actualización de pruebas y documentación de Codex.
