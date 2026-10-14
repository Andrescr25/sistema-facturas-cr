# Rotación mensual de productos — 2026-10-14

**Antecedente:** esta media de tres meses completos fue reemplazada después
por **unidades vendidas en los últimos30 días**, elegida expresamente por
el usuario tras revisar un producto agotado. Ver [regla vigente y evidencia](rotacion-reciente-2026-10-14.md).

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

Entrega inicial en developer, sin migración nueva. Main conserva6c96741; vista
local5173/3000 actualizada al publicar. Hash y relevo en la memoria compartida.

## Unificación con Gestión y publicación autorizada

Después el usuario autoriza «ok, subelo al main» y consulta por ambos módulos.
Gestión de Catálogo comparte ahora `SQL_ROTACION_MENSUAL` con Rentabilidad,
tanto por categoría como al buscar. Sin ventas se muestra0/mes; los decimales
usan el mismo formato, evitando que una media0,33 se mostrase como cero.
La fila explica «3 meses completos». El motor de precios mantiene su ventana
de12 meses y el catálogo del agente conserva el Pareto vigente.

La prueba nueva ejecuta los tres servicios reales contra PostgreSQL y compara
30,0,33 y0 sin ventas: categoría, búsqueda global y Rentabilidad coinciden.
El conjunto se publica por avance sin fusión después de la suite completa,
base local, build y recorrido de ambas pantallas en navegador. Sin SQL nuevo,
pruebas ni mensajes reales de producción. Los hashes y la comprobación
pública de Render se registran en permiso-subir-a-main.md.

Verificación del conjunto: suite240 archivos/2.895 casos,2.489 aprobados,
406 condicionales omitidos y cero fallos;12 casos mensuales con PostgreSQL,
los lectores de ventas y la suite de taxonomía con base local aprobados.
Build correcto. Chromium verifica Rentabilidad, categoría y búsqueda con
ocho solicitudes HTTP a servicios reales, en390/700/1440: medias30,0,33 y0,
mismo formato, período explícito y ausencia de desbordes/errores. El Excel
responde200. Todas las escrituras de prueba se revierten; la suite completa
usa una copia desechable de la base local.
