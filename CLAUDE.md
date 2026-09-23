# Invariantes de este repositorio

No es documentación del sistema — eso vive en el grafo: **empezá por
[docs/grafo/README.md](docs/grafo/README.md)**, el mapa de todos los nodos
(módulos, tablas, decisiones, lecciones, bloqueos), con aristas tipadas que se
validan solas (`backend/tests/grafo.test.js`, corre con `npm test`). Cada rama
tiene su propio grafo, que describe el código de ESA rama.
Este archivo es más corto: solo lo que, si se ignora, rompe algo real.

## Dos worktrees, dos realidades de base de datos

| Worktree | Rama | Base "local" |
|---|---|---|
| `sistema-facturas-cr` | `main`, `developer` | **es producción** — ver [docs/grafo/leccion/la-db-local-es-produccion.md](docs/grafo/leccion/la-db-local-es-produccion.md) |
| `sistema-facturas-cr-independencia` | `independencia-alegra` | propia, aislada por `backend/config/aislado.js` |

Antes de correr algo que escriba, confirmar en cuál worktree se está parado.
En este (`main`/`developer`) la base, Alegra y el buzón de Gmail son los de
producción: capturar el estado previo a un archivo antes de mutar nada, y
nunca probar un endpoint destructivo contra un registro real. No hay red de
seguridad.

## `main` se toca solo con autorización

El trabajo se hace en `developer`. Pasar algo a `main` (y subirlo) lo
autoriza el usuario cada vez. El trabajo de migración sin Alegra va solo en
`independencia-alegra` y no se mezcla con estas ramas sin autorización
explícita.

## No regenerar Prisma sin pensarlo

`node_modules` lo comparten los dos worktrees (en `independencia-alegra` es
un enlace a este). `npm install` corre `postinstall: prisma generate` y le
cambia el cliente a la otra rama. Las columnas que se agregan por SQL (por
ejemplo `alegra_products_cache.subcategoria_id`) no están en el esquema de
Prisma: se leen y escriben con `query` crudo. Ver
[docs/grafo/bloqueo/prisma-no-se-regenera.md](docs/grafo/bloqueo/prisma-no-se-regenera.md).

## Secretos

`.env`, `.env.local` nunca se comitean ni se imprimen, ni completos ni
parciales. Si el usuario pega una credencial en el chat, se usa solo en
memoria para esa sesión y se le avisa que la rote.

## Fechas de calendario: nunca `toISOString()`

Costa Rica es UTC−6. `new Date().toISOString().slice(0,10)` da el día de
mañana después de las 6 p.m. Usar `backend/src/utils/fechaCR.js`
(`hoyEnCostaRica`, `diaEnCostaRica`).

## Precio sin IVA, costo con IVA

Nunca multiplicar ni dividir por 1,13 a mano: hay tarifas de 0/1/2/4/8/13 %.
Ver [docs/grafo/leccion/precio-sin-iva-costo-con-iva.md](docs/grafo/leccion/precio-sin-iva-costo-con-iva.md).

## Datos de prueba

`zz-*` / `ZZ` se borran después de verificar. Nunca se fabrican registros de
negocio (facturas, pagos, clientes) para "ver si funciona" sin poder
distinguirlos después.

## Antes de escribir un nodo nuevo en `docs/grafo/`

Cada ruta que se cite en `archivos:` tiene que existir de verdad en ESTA
rama — `grafo.test.js` lo va a rechazar si no. Si algo se puede leer del
código, va ahí, no a la memoria de `~/.claude`: esa queda para preferencias
del usuario, decisiones suyas y lecciones de sesiones pasadas, no para lo que
el código ya dice por sí solo.
