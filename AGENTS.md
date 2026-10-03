# Entrada para agentes de IA

Leé [CLAUDE.md](CLAUDE.md) y después [el mapa del grafo](docs/grafo/README.md).
Esos invariantes y los nodos de **esta rama** aplican a cualquier modelo.
El [checklist de independencia](docs/checklist-independencia-alegra.md) indica
el avance y el trabajo pendiente; seguí las aristas del módulo antes de editar.

Trabajá únicamente en `sistema-facturas-cr-independencia`, rama
`independencia-alegra`, para esta migración. La carpeta hermana
`sistema-facturas-cr` usa la base de producción. No regeneres Prisma ni
instales dependencias en el backend: `node_modules` es un enlace compartido.
Conservá las protecciones de `config/aislado.js`.

Nunca ejecutes la limpieza semanal: tampoco desde pruebas, cron o botón.
Las verificaciones que escriben usan una copia desechable de PostgreSQL o
BEGIN/ROLLBACK. No envíes mensajes reales para probar.

Actualizá código, comentarios que expliquen el porqué, grafo y checklist en
el mismo cambio. La memoria local de Claude guarda preferencias y estado del
relevo; el detalle técnico vive en el repositorio. No copies secretos al
grafo, la memoria, los logs ni las respuestas.
