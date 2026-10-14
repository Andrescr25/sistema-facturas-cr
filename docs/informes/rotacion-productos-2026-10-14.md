# Rotación mensual de productos — 2026-10-14

El usuario detecta la cifra en Rentabilidad y confirma usar los últimos tres
meses completos. El cálculo anterior promediaba una ventana móvil de tres
meses, incluyendo parte del actual; la tarjeta destacaba unidades semanales
y dejaba el dato mensual en texto secundario.

Ahora el promedio mensual suma las unidades de los tres meses calendario
anteriores y divide entre tres. Un mes sin ventas aporta cero. En octubre:
julio30 + agosto0 + septiembre60 → 30u/mes, aunque octubre lleve900.
El promedio cambia de período cuando comienza el mes siguiente, según la
fecha de Costa Rica. Las tarjetas, el detalle y el Excel indican el período.

`sqlRotacion` admite `promedioMesesCompletos` solicitado sólo por
Rentabilidad. Agrega ambas ventanas en una sola consulta, sin una lectura
adicional por producto. Los totales de ventas, unidades, semanas, facturas,
clientes, última venta y Pareto mantienen la ventana móvil. Se conserva el
promedio de un producto vendido sólo al inicio del primer mes completo,
aunque ya no tenga ventas en la ventana móvil. Catálogo y Precios conservan
sus ventanas; no se cambian tablas, facturas ni umbrales de precios.

Pruebas contra PostgreSQL local con tablas TEMP dentro de BEGIN/ROLLBACK:
mes en cero, producto sólo vendido este mes, primer/último día, sólo el
primer mes completo, media estable durante el mes, relevo en noviembre,
cambio de año, febrero bisiesto, decimales, zonas horarias y conservación
de todos los demás campos. Los lectores de venta_linea y la selección de
Rentabilidad también se verifican. Sin pruebas ni escrituras en producción.

Verificación final: suite completa240 archivos/2.895 casos,2.489 aprobados,
406 condicionales omitidos y cero fallos. Además11 pruebas nuevas de media
mensual y11 de lectores/vista contra PostgreSQL local, todas aprobadas.
Comparación de la copia local:726 productos de la ventana móvil conservan
exactamente todos los demás campos; la lectura ampliada incluye126 con
ventas sólo en el comienzo del primer mes completo. SQL31,5ms local, sin
una consulta adicional por producto.

Chromium con HTTP/controladores/servicios/PostgreSQL reales en una transacción
local con tablas TEMP y ROLLBACK: tarjeta y detalle muestran30u/mes, con900
en el mes en curso;390/700/1440 sin desbordes ni errores. El Excel devuelve
200 y conserva el valor numérico30 en la columna del promedio mensual.
Build correcto; grafo y estructura aprobados dentro de la suite.

Entrega en developer, sin migración nueva. Main conserva6c96741; vista
local5173/3000 actualizada al publicar. Hash y relevo en la memoria compartida.
