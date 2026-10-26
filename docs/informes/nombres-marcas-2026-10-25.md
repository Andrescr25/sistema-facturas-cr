# Nombres y orden de presentaciones — 2026-10-25

El usuario pide revisar lo hecho por Claude y normalizar todos los productos
que pertenecen a marcas. Claude había creado 56 agrupaciones, además de las
tres del usuario, conservando nombres. La lectura de planificación encuentra
296 productos en 59 marcas; nueve se añadieron después del lote de Claude.

## Criterio

Producto → medida/capacidad/número → marca y características → empaque.
Mayúscula inicial, tildes, abreviaturas legibles y separadores uniformes.
Por ejemplo: `Tornillo para gypsum 1 1/2 · punta fina · 1 × 100`, también
para el producto que antes intercalaba `1X100` antes de `PTA FINA`.
El término comercial [gypsum](https://mcprod.epaenlinea.com/tornillos-gypsum.html)
se escribe igual en ambos grupos de tornillos. `Masquintaype` pasa a `Cinta
de enmascarar`; se corrigen esos tres títulos de agrupación.

No se deducen unidades ausentes ni se cambia el código de medidas técnicas
(275/300, 2RS, 6PR TT, 025, 469 m). La aldaba escrita `11/2` se separa como
`1 1/2`. Los nombres repetidos se conservan con sus ids/referencias: una
corrección ortográfica no demuestra que sean el mismo artículo. El tornillo
de techo asignado al grupo gypsum conserva su descripción de techo y su
ubicación; este trabajo no reclasifica productos.

Los nombres pertenecen al maestro. Las descripciones originales del proveedor
y las líneas guardadas en facturas/compras no se reescriben.

## Aplicación

`scripts/catalogo/corregir-nombres.js PLAN.json` sólo muestra cuántos cambios
haría. Para escribir requiere `--aplicar USUARIO_ID RESPALDO_NUEVO.json`.
El plan contiene id, marca esperada y nombre antes/después. Se validan todos
los registros antes del primer UPDATE, con bloqueo en orden de subcategoría,
marca y producto; un cambio de nombre/asignación posterior detiene el lote.
Un error de SQL o del respaldo revierte todo. La segunda ejecución no escribe
si los nombres ya coinciden. Reutiliza transacciones, validación y bitácora
existentes; no cambia las protecciones del entorno.

El respaldo guarda las filas originales antes de escribir, en archivo nuevo
con permiso0600. Para deshacer, invertir antes/después del plan y aplicar con
otro respaldo: también se comprueba que no haya ediciones posteriores.
El plan y los respaldos de esta operación viven fuera de Git.

## Presentación

El agrupador ya ordenaba variantes por nombre, pero el orden numérico nativo
no entiende fracciones. El comparador puro compartido toma sus valores reales
y usa alfabeto español para el texto. Ambos DTO (`name`/`nombre`) y Gestión
y su lista principal usan el mismo criterio. No incorpora dependencias, peticiones ni
trabajo por fotograma de scroll; sólo ordena cuando cambia la lista.

## Verificación

14 pruebas de fracciones, decimales, alfabeto español, nombres repetidos,
respaldo, bitácora, idempotencia, conflicto por edición/reasignación y rollback.
Ensayo local del lote296+3: precios, costos, referencias, imágenes y todos
los campos salvo nombre/fecha idénticos. Huellas de factura_linea, compra_linea,
supplier_product_mapping y movimiento_inventario conservadas; repetición
sin escrituras. No se desarrolla ni prueba contra producción.
48 comprobaciones Chromium en390/700/1440: orden exacto de brochas/tornillos
en agente y cliente, vista previa, foco/scroll, recarga sin red del agente,
lista principal y selección de Gestión → Marcas y ausencia de desbordes/errores JS. Ambos builds
y lint correctos;23 pruebas de grafo/estructura aprobadas.

La suite encontró una prueba anterior de visitas que asumía que una fecha
relativa (hoy menos7) era anterior al17/10 fijo de otra ficha. Conserva la
comprobación del orden general y verifica el cliente atrasado por id, con su
estado y diferencia de días. Sólo cambia la prueba, sin modificar el módulo.
La revalidación de sus9 casos pasó. Suite completa249 archivos:3047correctas,
0fallos y3omisiones históricas del corte.37 dirigidas finales correctas.
Aplicación del lote pendiente de registrar.
