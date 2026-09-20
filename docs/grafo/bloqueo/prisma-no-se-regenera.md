---
id: bloqueo/prisma-no-se-regenera
tipo: bloqueo
titulo: node_modules es un enlace al árbol de producción
estado: vigente
archivos:
  - backend/config/database.js
aristas:
  relacionado: [modulo/compras, leccion/la-db-local-es-produccion]
medido: 2026-09-20
---

`backend/node_modules` en el worktree `sistema-facturas-cr-independencia` es
un ENLACE SIMBÓLICO al `node_modules` del worktree `sistema-facturas-cr`
(`main`/`developer`). Correr `prisma generate` acá le cambiaría el cliente a
esa otra rama.

Consecuencia: ninguna tabla o columna nueva de esta rama pasa por Prisma.
Todo va por SQL puro en `backend/migrations/independencia/NNN_*.sql` y se lee
con `pg` (`config/database.js`), nunca con el cliente Prisma. Las migraciones
019 y 020 y todo `pagosProveedoresService.js`/`notasCreditoService.js` ya
siguen esta regla; es la que hay que seguir para el resto de
[[modulo/compras]].

Por la misma razón, tampoco se instalan paquetes nuevos en esta rama sin
pensarlo: un `npm install` corre `postinstall: prisma generate` (definido en
`backend/package.json`) y dispararía justo esto.
