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
No conectar con la base de producción para desarrollar ni probar: usar copias
locales.

LAS RAMAS SON DOS: `developer`, donde se trabaja, y `main`, que es producción
(más abajo, cuándo se sube). La migración terminó con el corte del 2026-10-10 y
su rama, `independencia-alegra`, se borró el 2026-10-11 por decisión suya. No
volver a crearla ni a publicar otra rama.

La carpeta principal, `sistema-facturas-cr`, usa la base de producción. El
entorno local aislado ya no es una carpeta del escritorio (la
`sistema-facturas-cr-independencia` se quitó el 2026-10-11 por decisión del
usuario): es el archivo `.env.aislado`, guardado con las fotos y los archivos
de la base local en `~/.local/share/sistema-facturas-cr/entorno-aislado/`.
Tu carpeta de trabajo queda aislada al enlazar ahí `backend/.env` y
`backend/.env.aislado`. No regeneres Prisma ni instales dependencias en el
backend: `node_modules` y las dependencias de Hacienda son enlaces a los de
la carpeta principal. Conservá las protecciones de `config/aislado.js`.

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
comitean sus archivos. El que termina monta su trabajo sobre `developer`
(rebase y avance sin fusión) y publica `developer`; el otro lo revisa. Antes
de publicar, mirar qué más trae `developer`: empujarla publica también lo que
el otro haya montado. La base local es compartida: una migración que cambia
datos se avisa en el relevo.

**Cada commit lleva la firma del agente que lo hizo** (`Co-Authored-By: …` al
final del mensaje). Sin eso, en el historial no se distingue quién hizo qué.

## Subir a `main`

Los agentes pueden subir a `main` directamente (decisión del usuario,
2026-10-11: «sí tienen permiso de subir directo a main y decir quién fue el
que subió qué»). `main` es producción: Render despliega solo.

- Se sube con `git push origin developer:main` (avance sin fusión) y después
  `git fetch origin main:main`.
- **Solo lo verificado**: suite completa, pruebas con base y, si toca
  pantallas, recorrido en navegador. Nunca "para probar en producción".
- **Mirar qué más viaja**: `git log origin/main..developer`. Si hay commits
  del otro agente, decirlo. Si no están revisados, o les falta una migración
  en producción, no se sube y se explica por qué.
- **Las migraciones no viajan con el push**: producción no las corre sola. Un
  commit que necesita SQL nuevo espera a que esté aplicado.
- **Decir quién subió qué**: en la respuesta al usuario («Subí yo, <agente>,
  a main: tales commits; míos estos, de <otro> aquellos») y en el registro
  de la memoria compartida (`permiso-subir-a-main.md`).

## La estructura: se mantiene en cada cambio

Para el usuario es «de suma importancia» (2026-10-11), y vale tanto como que
el cambio funcione. El porqué y el caso real están en
[la lección](docs/grafo/leccion/la-estructura-se-cuida-con-una-prueba.md).
Antes de comitear:

- **Cada cosa en su carpeta.** Frontend: reglas y cuentas puras en
  `src/utils/` (sin React ni servidor, con su prueba); estado y llamadas al
  servidor en `src/hooks/use*.js`; cada sección en
  `src/components/<pantalla>/`; la página solo arma. Un componente no importa
  `services/` ni el cliente de una integración. Backend: rutas → controlador
  → servicio dentro de `src/modules/<módulo>/` o `src/integrations/<x>/`.
- **Si el archivo crece, se parte en ese mismo cambio.** Topes: 500 líneas en
  el frontend, 700 en el backend.
- **Diseño con la paleta por rol** (`primario`, `neutro`, `exito`, `alerta`,
  `peligro`, `nota`): nada de `gray-500`, `blue-600` ni colores `#hex` a
  mano. Sin hojas `.css` nuevas salvo animaciones, y con `theme('colors.…')`.
  Tarjetas grandes y lista → detalle, reusando `Insignia`, `Boton`,
  `TarjetasResumen` y `Modal`.
- **Una sola copia** de cada ayudante (buscar en `utils/` antes de escribir
  otro) y **nada de código muerto**: lo que deja de usarse se borra ahí mismo.
- **Escribir como el archivo vecino**: comillas, punto y coma, comentarios.

`backend/tests/estructura.test.js` lo hace cumplir y corre con `npm test`. Si
falla, se acomoda el cambio al molde. Una excepción se anota en esa prueba,
en el mismo commit, con su porqué; sus listas de "deuda" pueden achicarse,
nunca crecer.
