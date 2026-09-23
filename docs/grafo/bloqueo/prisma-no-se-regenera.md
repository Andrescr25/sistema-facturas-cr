---
id: bloqueo/prisma-no-se-regenera
tipo: bloqueo
titulo: node_modules es un enlace al árbol de producción
estado: vigente
archivos:
  - backend/config/database.js
aristas:
  relacionado: [leccion/la-db-local-es-produccion]
medido: 2026-09-23
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

Tampoco se instalan paquetes sin pensarlo: `npm install` corre `postinstall:
prisma generate` (definido en `backend/package.json`).
