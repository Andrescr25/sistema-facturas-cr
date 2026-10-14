# Reporte Proveedores: 409 al enviar — 2026-10-14

El usuario informó POST /orden-compra/proveedor/enviar409 y confirmó el
motivo: «Un producto ya no tiene faltantes libres. Revisá la orden.» La consola
mostraba sólo el mensaje genérico de Axios y el frontend anterior62e53a37.
No se atribuye el fallo únicamente a esa versión: se reprodujo en código actual.

## Causa y corrección

A10 reservado en borrador del proveedor1; el mismo faltante se reasigna al2.
El reporte recién leído muestra10 sin enviar porque descuenta sólo cobertura
enviada; el motor descuenta también el borrador viejo. Reproducido con0
transportes y el mismo409 del usuario, sin conectar a producción.

Al clic de envío se cierran los borradores/pendientes de otro proveedor que
todavía reservan esos faltantes revisados. Se exige sin enviada_en/envio_id ni
intento enviando/incierto/confirmado. El advisory46005 y los bloqueos de factura
y faltante preceden al cierre. No se borran líneas, orígenes ni PDF; quedan
motivo y bitácora. Los demás productos del borrador siguen como necesidades
actuales y se revisan en otra compra; el cierre no inventa demanda ni stock.
Si falla la revisión o el guardado nuevo, toda la transacción revierte.
Una enviada/incierta conserva íntegra su cobertura: sólo se compra el saldo nuevo.

Además se reprodujeron dos conflictos de identidad: una asignación antigua
sin cédula frente a una ficha identificada, y un mapping cuyo nombre histórico
difiere de la ficha actual. Reporte y motor comparten resolución de ficha única
y selección de mapping. No se infieren homónimos; ficha ambigua exige identificación.
Se conservan id/nombre/cédula públicos y las claves de sessionStorage existentes.
La consola muestra el message real del servidor para distinguir estos rechazos.

## Verificación

Tres regresiones de reservas: antigua copia PDF/orígenes y otro productoB5
conservados, rechazo400 revierte cierre sin transporte, enviada e incierta
idénticas después de reasignar con nuevo saldo5. Siete casos de identidad:
NULL/vacío/SIN_PROVEEDOR, ficha sin cédula con mapping histórico, tarjetas por
nombre/cédula separadas y homónimos ambiguos/identificados con destinatarios distintos.

Navegador con backend HTTP/servicios/PG reales y ROLLBACK:37 solicitudes,
reserva reasignada sin409 al enviar, documento anterior intacto, guardado7+3,
recarga, exclusión/manual/restauración y nueva factura3.390/700/1440 sin desborde.
Transporte simulado; ninguna limpieza ni mensajes/correos reales.

Suite general completa:232 archivos,2.834 casos,2.445 aprobados,389
condicionales omitidos,0 fallos. Node25: procesos independientes por archivo
sin worker interno, conservando contexto de prueba y bloqueo de red externa.
Build y **308 pruebas dirigidas con PostgreSQL, interfaz y grafo/estructura
aprobados sin fallos** antes de publicar. Una copia de preview no tenía las órdenes históricas requeridas por
una lectura READ ONLY; se verifica esa matriz sobre respaldo existente restaurado
en otra base local. No se toca producción para desarrollar/probar, ni se cambia SQL.
