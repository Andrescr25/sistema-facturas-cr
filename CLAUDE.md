# Invariantes de este repositorio

No es documentación del sistema — eso vive en el grafo: **empezá por
[docs/grafo/README.md](docs/grafo/README.md)**, el mapa de todos los nodos
(módulos, tablas, decisiones, lecciones, bloqueos), con aristas tipadas que se
validan solas (`backend/tests/grafo.test.js`, corre con `npm test`). Cada rama
tiene su propio grafo, que describe el código de ESA rama.
Este archivo es más corto: solo lo que, si se ignora, rompe algo real.

## Dos ramas: `developer` y `main`

En `developer` se trabaja; `main` es lo que está en producción y **la sube
solo el usuario**. No hay más ramas: `independencia-alegra`, la de la
migración, se borró el 2026-10-11 por decisión suya (ya era idéntica a
`developer`). No volver a crearla.

## La carpeta principal usa la base de producción

| Dónde | Base "local" |
|---|---|
| `sistema-facturas-cr`, la carpeta principal (su `backend/.env`) | **es producción** — ver [docs/grafo/leccion/la-db-local-es-produccion.md](docs/grafo/leccion/la-db-local-es-produccion.md) |
| una carpeta de trabajo (`git worktree`) que enlace `backend/.env.aislado` | propia, aislada por `backend/config/aislado.js` |

Lo que aísla es ese archivo `.env.aislado`, que git ignora: ni una rama ni
una carpeta fija. La carpeta `sistema-facturas-cr-independencia`, que lo
tenía, se quitó el 2026-10-11 por decisión del usuario; su configuración, las
fotos y los archivos de la base local viven en
`~/.local/share/sistema-facturas-cr/entorno-aislado/`. Una carpeta de trabajo
queda aislada enlazando ahí su `backend/.env` y `backend/.env.aislado`; las
fotos se le pasan con `ALMACENAMIENTO_DIR` y `ALMACENAMIENTO_PRIVADO_DIR`.

Antes de correr algo que escriba, confirmar en cuál carpeta se está parado.
En la principal, capturar el estado previo a un archivo antes de mutar nada —
no hay red de seguridad.

## El aislamiento local no se toca

`backend/config/aislado.js` bloquea escrituras a Alegra, WhatsApp y correo
saliente (`salidasBloqueadas()`), y exige que `DATABASE_URL` resuelva a
`localhost`/`127.0.0.1` (`asegurarBaseLocal()`). Las llaves
`PERMITIR_BASE_REMOTA` y `PERMITIR_SALIDAS` existen para producción y se
prenden a propósito: nunca para probar. Lo que escribe se verifica contra una
copia desechable de la base local o con BEGIN/ROLLBACK.

## Prisma no se regenera en una carpeta de trabajo

En las carpetas de trabajo (`git worktree`) `backend/node_modules` es un
enlace simbólico al de `sistema-facturas-cr`, y las dependencias de Hacienda
(`backend/src/integrations/hacienda/node_modules`) también enlazan a las de
la principal. `npm install` o `prisma generate` ahí le cambian el cliente a la
carpeta principal.
Toda tabla o columna nueva va por SQL puro en
`backend/migrations/independencia/NNN_*.sql`, y se lee con `pg`
(`config/database.js`), nunca con Prisma. Ver
[docs/grafo/bloqueo/prisma-no-se-regenera.md](docs/grafo/bloqueo/prisma-no-se-regenera.md).

## Secretos

`.env`, `.env.aislado`, `.env.local` nunca se comitean ni se imprimen, ni
completos ni parciales. Si el usuario pega una credencial en el chat, se usa
solo en memoria para esa sesión y se le avisa que la rote.

## El saldo se calcula, nunca se guarda

`total − cobros vigentes − notas vigentes`, siempre en el momento de leerlo.
Guardarlo en una columna es la forma en que queda desactualizado sin que nadie
lo note.

## Fechas de calendario: nunca `toISOString()`

Costa Rica es UTC−6. `new Date().toISOString().slice(0,10)` da el día de
mañana después de las 6 p.m. Usar `utils/fechaCR.js`
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
