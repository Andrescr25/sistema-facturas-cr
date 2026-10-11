# Entrada para agentes de IA

Leé [CLAUDE.md](CLAUDE.md) y después [el mapa del grafo](docs/grafo/README.md).
Esos invariantes y los nodos de **esta rama** aplican a cualquier modelo.
El [checklist de independencia](docs/checklist-independencia-alegra.md) indica
el avance y el trabajo pendiente; seguí las aristas del módulo antes de editar.

Para la reorganización solicitada el 2026-10-05, leé también
[las instrucciones vigentes del usuario](docs/instrucciones-vigentes-usuario.md)
y [el checklist de rutas/ciclos](docs/checklist-rutas-ciclos-operativos.md).
Avanzá por partes; una decisión guardada no acredita su implementación.
La orden recibida se retira de la lista activa a las 24 h conservando historial.
El usuario reiteró el 2026-10-05: este flujo es solo local, en la rama de
migración `independencia-alegra`; no tocar `developer`, `main` ni conectar con
la base de producción. Usar copias locales para desarrollo y pruebas.

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

## Cuando hay más de un agente trabajando

Cada agente en su propia copia: `git worktree add -b tmp/<agente>-<tarea>-<fecha>`.
El nombre de esa rama es el aviso de qué tiene cada uno; antes de empezar,
`git worktree list` dice qué está tomado. No se edita la carpeta de otro ni se
comitean sus archivos. El que termina monta su trabajo sobre la rama (rebase y
avance sin fusión), y el otro lo revisa. La base local es compartida: una
migración que cambia datos se avisa en el relevo.
