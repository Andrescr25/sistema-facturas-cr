# Rotación reciente tras revisar el caso real — 2026-10-14

El usuario señala un producto comprado en70 unidades menos de un mes antes,
ya agotado, cuya rotación muestra16/mes. La inspección autorizada de
producción fue exclusivamente SELECT dentro de REPEATABLE READ/READ ONLY,
con default_transaction_read_only y ROLLBACK, sin ejecutar servicios de la
aplicación ni escribir datos. Se confirmó la compra de70 con factor1.

Las ventas emitidas dan74 unidades en los últimos30 días:43 en septiembre
y31 en octubre. La cifra anterior16,33 era julio6 + agosto0 + septiembre43,
dividido entre3. Corresponde a la definición histórica previamente elegida,
que excluía octubre, y no al movimiento reciente que necesita el usuario.
Una factura anulada con10 unidades no cuenta como venta. No hay que añadir
las compras al cálculo ni inventar ventas para hacer coincidir existencias.

Tras explicar ambos resultados, el usuario elige expresamente **«Rotación =
unidades vendidas en los últimos30 días»**. Esta decisión sustituye la de
tres meses completos en Rentabilidad y Gestión de Catálogo. `unidadesMes`
suma hoy y los29 días anteriores; no divide entre3 ni se reinicia al cambiar
de mes. Sin ventas da cero; mantiene decimales y excluye fechas futuras.

Ambas pantallas comparten `SQL_ROTACION_MENSUAL`. Rentabilidad, detalle,
Excel, Gestión por categoría y búsqueda indican **Últimos30 días**.
El helper usa una sola consulta y conserva ventas, unidades, facturas,
clientes, semanas y Pareto de su ventana vigente. Precios mantiene su media
de12 meses. Se retira el modo obsoleto de meses completos del código activo.

Pruebas locales con tablas TEMP y BEGIN/ROLLBACK reproducen74 (43+31),70
vendidas sólo este mes, fronteras de30 días, cambio de mes/año, febrero
bisiesto/no bisiesto, ventana mensual corta, cantidades fraccionarias, cero
sin ventas y coincidencia entre los tres servicios. No se desarrolla ni se
prueba el código nuevo contra producción. Sin migración nueva; hashes,
verificación final y publicación se registran al terminar la entrega.

Verificación final: suite completa240 archivos/2.895 casos,2.489 aprobados,
406 condicionales omitidos y cero fallos.14 casos de rotación reciente en
PostgreSQL y los lectores de venta_linea aprobados. Grafo y estructura
correctos. Build correcto. Chromium en390/700/1440 con8 solicitudes HTTP
a controladores/servicios/PG reales verifica74 en tarjetas, detalle,
categoría y búsqueda, fracciones/cero y período visible, sin desbordes ni
errores. El Excel devuelve200 y la celda de rotación contiene74 numérico.
Pruebas con TEMP/ROLLBACK o copia desechable local; ningún envío real.
