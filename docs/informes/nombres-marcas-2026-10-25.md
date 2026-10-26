# Nombres y orden de presentaciones — 2026-10-25

El usuario pide revisar lo hecho por Claude y normalizar todos los productos
que pertenecen a marcas. Claude había creado 56 agrupaciones, además de las
tres del usuario, conservando nombres. La lectura de planificación encuentra
296 productos en 59 marcas; nueve se añadieron después del lote de Claude.

## Criterio

Producto → medida/capacidad/número → marca y características → empaque.
Nombre completo en MAYÚSCULAS, con tildes, abreviaturas legibles y separadores
uniformes (ajuste posterior confirmado por el usuario el mismo día).
Por ejemplo: `TORNILLO PARA GYPSUM 1 1/2 · PUNTA FINA · 1 × 100`, también
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
Aplicado y verificado en producción por Codex el2026-10-25 21:32:41 CR, conforme al
permiso explícito del usuario de corregir los nombres. Primer lote296+3;
durante la verificación el usuario añadió Cinta métrica Pretul con tres
productos: segundo lote3+1, también con respaldo. Resultado:299 productos en
60 marcas y4 títulos corregidos. Todos los otros campos de esos productos
coinciden con sus respaldos inmediatos; no quedan marcados fuera de los lotes.

La foto de la marca76 se actualizó concurrentemente desde otra operación:
se conservó esa edición. El corrector sólo hizo UPDATE de nombre/fecha; no
restaura fotos ni asignaciones de la captura inicial. Los planes, respaldos
y planes inversos para deshacer están en el directorio privado
`~/.local/share/sistema-facturas-cr/respaldos/20261025-nombres-marcas-codex/`.
No se corrieron pruebas contra producción ni se enviaron mensajes reales.


## Ajuste posterior: mayúsculas y empaque de corofijas

El usuario confirma que su formato de producto es todo en mayúsculas. Se
conservan las correcciones de ortografía, tildes, medidas y orden; los títulos
de las marcas mantienen su formato actual. Para las 25 corofijas solicita
quitar únicamente los sufijos de caja/master del documento, como
`(C 10)(M 300)`: queda `FERRAWY LLAVE COROFIJA 10MM`. El empaque comercial
de otros productos, como `1 × 100` en tornillos, se conserva.

Se prepara un plan de 314 productos vigentes en las agrupaciones revisadas:
289 del lote anterior y las 25 corofijas actuales. Se reutiliza el corrector
existente con nombre/marca esperados, respaldo previo y bitácora. El plan no
incluye las dos fichas corofijas retiradas ni modifica sus documentos.
El ensayo completo sobre copia local y ROLLBACK confirmó los 314 nombres,
25 corofijas sin C/M, todos los demás campos de producto intactos, las huellas
de documentos/mapeos/movimientos iguales y repetición sin escrituras. Las
7 pruebas PostgreSQL existentes del corrector volvieron a pasar. No cambia
código de ejecución ni pantallas; sigue vigente la suite completa del mismo
código (3053 correctas, 0 fallos/cancelaciones y 3 omisiones históricas).
La aplicación real se confirmó con el corrector existente y respaldo previo;
la lectura posterior confirmó los 314 nombres, las 25 corofijas sin C/M y
todos los demás campos de producto idénticos al respaldo inmediato. Las
marcas completas, incluidas sus fotos, quedaron iguales. Aplicado por Codex
el 25/10/2026. Plan, filas previas/posteriores, verificación y plan inverso
están en `~/.local/share/sistema-facturas-cr/respaldos/20261025-nombres-mayusculas-codex/`.
Para deshacer se usa `deshacer.json` con el mismo corrector y un respaldo
nuevo; valida que no haya ediciones/reasignaciones posteriores.
