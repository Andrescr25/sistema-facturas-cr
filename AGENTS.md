# Entrada para agentes de IA

Leé [CLAUDE.md](CLAUDE.md) y después [el mapa del grafo](docs/grafo/README.md).
Esos invariantes y los nodos de **esta rama** aplican a cualquier modelo.

En esta carpeta (`sistema-facturas-cr`, ramas `developer` y `main`) la base,
Alegra y el buzón de Gmail son los de PRODUCCIÓN. Antes de mutar nada se
captura el estado previo, y nunca se prueba un endpoint que escriba contra un
registro real. `main` se toca solo con autorización del usuario, cada vez.
El trabajo sin Alegra va en la carpeta hermana
`sistema-facturas-cr-independencia`, rama `independencia-alegra`, que tiene su
propia entrada.

Nunca ejecutes la limpieza semanal: tampoco desde pruebas, cron o botón. No
regeneres Prisma ni instales dependencias en el backend: `node_modules` lo
comparten las dos carpetas. No envíes mensajes reales para probar. No copies
secretos al grafo, la memoria, los logs ni las respuestas.

## Cuando hay más de un agente trabajando

Cada agente en su propia copia: `git worktree add -b tmp/<agente>-<tarea>-<fecha>`.
El nombre de esa rama es el aviso de qué tiene cada uno; antes de empezar,
`git worktree list` dice qué está tomado. No se edita la carpeta de otro ni se
comitean sus archivos. El que termina monta su trabajo sobre la rama (rebase y
avance sin fusión), y el otro lo revisa.
