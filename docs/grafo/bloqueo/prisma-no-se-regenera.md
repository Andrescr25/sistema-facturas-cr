---
id: bloqueo/prisma-no-se-regenera
tipo: bloqueo
titulo: node_modules es un enlace al árbol de producción
estado: vigente
archivos:
  - backend/config/database.js
aristas:
  relacionado: [leccion/la-db-local-es-produccion, leccion/el-doble-de-prisma-no-valida-tipos]
medido: 2026-10-03
---

`backend/node_modules` en el worktree `sistema-facturas-cr-independencia` es
un ENLACE SIMBÓLICO al `node_modules` del worktree `sistema-facturas-cr`
(`main`/`developer`). Las dos ramas comparten el mismo cliente de Prisma.

DESDE `independencia-alegra`: correr `prisma generate` le cambiaría el cliente
a `main`/`developer`. Ninguna tabla o columna nueva de esa rama pasa por
Prisma: todo va por SQL puro en `backend/migrations/independencia/NNN_*.sql` y
se lee con `pg` (`config/database.js`), nunca con el cliente Prisma. Las
migraciones 019 en adelante y `pagosProveedoresService.js` /
`notasCreditoService.js` ya siguen esta regla.

DESDE `main`/`developer`: lo mismo al revés — un `npm install` o un `prisma
generate` acá también cambia lo que usa la otra rama. Y como Prisma no conoce
las columnas que se agregan por SQL (por ejemplo
`alegra_products_cache.subcategoria_id`), esas se leen y escriben con `query`
crudo aun en esta rama.

VALE TAMBIÉN PARA LO VIEJO. El cliente generado no solo ignora las columnas
nuevas: sigue exigiendo lo que su esquema dice de las viejas. Un campo que
declara obligatorio no puede quedar en NULL aunque la base lo permita —
Prisma valida cada fila que lee y una sola hace fallar la consulta entera.
Pasó con `supplier_product_mapping.alegra_item_id` el 2026-10-03: ver
[[leccion/el-doble-de-prisma-no-valida-tipos]]. Antes de soltar un NOT NULL
de una tabla que Prisma conoce, mirar `Prisma.dmmf`.

Tampoco se instalan paquetes sin pensarlo: `npm install` corre `postinstall:
prisma generate` (definido en `backend/package.json`).
