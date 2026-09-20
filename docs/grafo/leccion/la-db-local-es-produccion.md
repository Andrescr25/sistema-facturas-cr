---
id: leccion/la-db-local-es-produccion
tipo: leccion
titulo: En los worktrees main/developer, "local" es producción
estado: vigente
archivos:
  - backend/config/aislado.js
aristas:
  relacionado: [bloqueo/prisma-no-se-regenera]
medido: 2026-08-16
---

El nodo más enlazado de la memoria de `~/.claude` antes de este trabajo (9
entradas): un script de verificación que ESCRIBE deja daño real, porque la
base "local" de los worktrees `sistema-facturas-cr` (`main`/`developer`) es la
base de producción. No hay una base de pruebas separada ahí.

CÓMO APLICARLO: antes de correr cualquier script que mute algo contra esos dos
worktrees, capturar el estado previo a archivo. Nunca reintentar un `curl` que
dio timeout sin comprobar primero si el efecto ya ocurrió: el timeout puede
ser del cliente, no del servidor, y el servidor puede haber terminado igual.

Solo el worktree `sistema-facturas-cr-independencia` (rama
`independencia-alegra`) tiene una base propia, aislada por
`config/aislado.js` (`DATABASE_URL` debe resolver a `localhost`/`127.0.0.1`,
si no lanza `BASE_NO_AISLADA`).
