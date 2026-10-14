# Proveedores: asignación y contactos rápidos — 2026-10-14

El usuario solicita optimizar las consultas, especialmente cambiar un producto
de proveedor y cargar sus números. Autoriza inspección de producción sólo de
lectura y pide probar/publicar exclusivamente en developer, sin pasar a main.

## Causa y cambio

Asignar un producto sincronizaba las necesidades del proveedor; por cada
producto volvía a leer todas las necesidades y el detalle completo de la
orden. Esto multiplicaba consultas y mantenía el bloqueo global mucho tiempo.
Mostrar un número esperaba ese bloqueo y preparaba un PDF completo antes de
mostrar la ficha. No era sólo el tamaño de las tablas: cada ida a Supabase
añadía latencia al conjunto de lecturas repetidas.

La sincronización lee las disponibilidades dos veces por proveedor bajo los
mismos bloqueos y guarda líneas/orígenes por lote. El helper compartido
conserva conversión, nombres/códigos, cantidades y validación de reservas.
Se mantienen versiones, bitácora, límite500, parciales, excesos, exclusiones
manuales y órdenes enviadas/inciertas. Un fallo revierte la transacción.

GET /orden-compra/proveedor/contactos hace una lectura de la ficha, sin
bloquear compras ni consultar faltantes/PDF. El modal muestra esos datos
mientras prepara la copia si el número es único; con cero/varios se elige
antes de preparar. Confirmar sólo se habilita tras revisar el destino/mensaje
de la copia guardada. Respuestas tardías y reintentos conservan sus guardas.

Preparar relee el reporte sólo del proveedor identificado, conservando huella,
fecha, orígenes y revalidación bajo bloqueo. La consulta general materializa
sólo facturas que tienen faltantes, evitando examinar créditos/última impresión
de miles de ventas ajenas a la necesidad actual. Sin cache de datos operativos
ni migraciones/índices nuevos; usa los índices existentes.

## Evidencia y límites

Inspección autorizada con conexión independiente y default_transaction_read_only
más BEGIN READ ONLY, tiempos limitados y ROLLBACK. Sólo SELECT, metadatos y
EXPLAIN ANALYZE de lecturas; no ejecutar servicios que escriben en producción.
Se observaron 5.604 facturas,54.233 líneas y713 faltantes en las estadísticas.
El primer reporte tenía77 productos: ejecución SQL383ms y lectura de contacto
110ms incluyendo red. El plan evaluaba última impresión en unas5.438 facturas.
Los datos operativos cambiaron durante el trabajo; no mezclar esas muestras.
Comparación posterior dentro de la misma transacción de lectura: ambas
versiones devuelven exactamente lo mismo, incluidos orígenes y huellas; el
reporte actual de esa muestra tenía un producto. SQL153ms frente a187ms;
son mediciones puntuales, no una promesa de tiempos en producción.

Escenario local comparable con40 productos y ROLLBACK: asignación258→21
consultas,1.873ms→158ms. Preparación118→40 consultas,1.247ms→794ms;
la lectura nueva de contactos es1 consulta/0,88ms local.
La latencia externa agrava las consultas en serie: esta medición local no
representa un tiempo de red real ni una prueba de escritura en producción.

Suite completa239 archivos/2.894 casos:2.488 aprobados,406 condicionales
omitidos,cero fallos. **108 pruebas dirigidas con PostgreSQL aprobadas**:
cobertura, límite501→500+1, rechazo completo de lote, contactos READ ONLY
sin esperar el bloqueo de otra conexión, modal con preparación lenta y
concurrencia/envíos anteriores. Grafo/estructura23 y build correctos.

Chromium con65 solicitudes HTTP/servicios/PG reales y ROLLBACK: contactos,
selección/cancelación/cambio de número y reintentos, cantidades/extras y
snapshot de pedido conservados. Reasignar un producto desde el modal de la
pantalla pasó por la transacción real y el reporte recargado,125ms local.
390/700/1440 sin desbordes ni errores de ejecución; ninguna salida real.

Publicación únicamente en developer y preview5173/3000; main se conserva
en010ee18. No se escribieron datos ni índices/migraciones en producción.
Sin mensajes reales ni limpieza semanal. El resto de pendientes de la cadena
operativa queda fuera de esta entrega; hash publicado en memoria compartida.
