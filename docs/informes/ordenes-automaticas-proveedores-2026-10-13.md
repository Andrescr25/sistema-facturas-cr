# Compras por proveedor y órdenes automáticas — 2026-10-13

## Resultado

Registrar en Bodega un faltante nuevo o el aumento de uno existente prepara la
compra en la misma transacción. Asigna el proveedor conocido con las reglas
existentes y busca una orden borrador/pendiente sin intento de envío de esa
ficha y ese ciclo fijo (incluido Sin ciclo). Acumula allí; si ya se envió o
hay un intento incierto, crea otro borrador independiente. No manda mensajes
al detectar faltantes. Sin proveedor activo inequívoco o conversión válida,
conserva el faltante visible para revisión.

A10/B5 enviados seguidos de C8/A3 generan otra orden con C8/A3. La primera
conserva líneas, procedencia, cantidades, revisión y bytes de su PDF. Repetir
un registro idéntico no duplica ni aumenta cantidades. El incremento se
limita al faltante nuevo: una revisión manual de 10 a 7 seguida de 3 nuevas
queda en 10, no vuelve a comprar lo excluido. Cajas se redondean hacia arriba
con seis decimales; solo un borrador puede asignar su excedente a lo nuevo.
Un excedente de una orden enviada no compra otra necesidad ni otra semana.

Una pendiente puede ampliarse: vuelve internamente a borrador y recupera
pendiente dentro de la misma transacción. Su revisión cambia y el PDF anterior
se conserva como historia, pero no habilita enviar; preparar y revisar otra
copia es obligatorio. Enviada, parcial, recibida, cerrada e intento incierto
quedan fuera de la búsqueda de orden abierta. Cancelación sin envío conserva
el estado histórico cerrada y se muestra Cancelada; el cierre de enviada sigue
requiriendo revisar cobertura. Recepciones, compras, inventario y archivo
individual a las 24 horas conservan sus reglas.

## Reporte

Entrada Compras → proveedor → faltantes actuales y listas separadas de
pendientes, envíos por verificar y enviadas. Cantidad necesaria descuenta lo
recibido. Fecha de creación, envío, referencia y estado por orden; horas de
Costa Rica. Abre el detalle existente de productos/PDF/factura/recepción.
Necesidades y fichas/asignación conservan sus accesos.

GET /orden-compra/por-ciclo/resumen usa READ ONLY/REPEATABLE READ y no crea
órdenes ni repone exclusiones manuales. POST /sincronizar es la acción explícita
para faltantes anteriores o liberados al cancelar. Preparar desde Faltantes
abre la orden abierta existente. Las llamadas y el estado de una orden viven
en useOrdenesCompraCiclo; OrdenesCompraCiclo deja de importar services/api y
sale de la lista de deuda de estructura.

## Técnica y seguridad de operación

Reutiliza tablas, vistas de cobertura y triggers existentes; no necesita SQL
nuevo. Bloqueo advisory46005/1 antes de factura/faltantes, común con revisión,
envío y recepción, evita reservar dos veces. Cambios/version/bitácora en el mismo
COMMIT. Asignar proveedor manualmente prepara solo la necesidad libre y conserva
cobertura anterior, incluso si pertenecía a otra ficha. Asignación automática
admite la conexión de Bodega y consulta el precio del buzón por SQL en ella;
Prisma en otra conexión no vería el registro sin COMMIT.

Trabajo en worktree propio tmp/codex-ordenes-proveedor-20261013, separado del
de Claude. Escrituras únicamente en una base tachi_codex_* desechable, obtenida
del preview local, mediante transacciones con ROLLBACK o fixtures concurrentes
retirados al eliminar el clon. Salidas de red bloqueadas; WhatsApp es un doble.
No se ejecutó la limpieza semanal ni se consultó producción para desarrollar.

Incidencia de preparación: se invocó por error el build de la raíz (genera
Prisma en las dependencias compartidas). El esquema del worktree y el principal
se compararon y son idénticos. Sin SQL por ese comando ni instalación de
paquetes; se corrigió el comando para construir únicamente frontend. La
verificación usa el cliente compartido existente.

## Validación

Pruebas PostgreSQL: ejemplo A10/B5 → nueva C8/A3; acumulación en borrador y
pendiente; copia anterior rechazada; aumento 10→13 y repetición; revisión manual;
conversiones/cajas; incierto; cancelación; consulta de solo lectura real y dos
conexiones concurrentes. Suite de órdenes incluye envío, vínculo de factura,
recepción parcial/final, cierre, archivo, necesidades y asignación de proveedor.

Chromium 390/700/1440: entrada/lista/detalle, PDF real revisado, envío simulado,
orden original bloqueada, nueva A3/C8 editable, 409 ante revisión obsoleta,
503/reintento y ausencia de desbordes/errores JavaScript. La consulta inicial
no hizo escrituras. Backend real en servidor efímero de pruebas, cerrado al
terminar; imágenes y datos de evidencia privados fuera de Git.

Suite completa: 2.737 casos, 2.392 aprobados,
345 comprobaciones condicionadas omitidas en esa corrida; las de compras se
activan por separado contra PostgreSQL. Conjunto focalizado de compras/Bodega:
190 casos aprobados sin omitidos. Build del frontend y grafo/estructura válidos.
Cero fallos/cancelaciones. No se certifica entrega real de WhatsApp por probar
con un transporte simulado.
