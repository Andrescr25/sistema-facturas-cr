# Ubicaciones Maps anteriores: búsqueda local — 2026-10-07

Se amplió la búsqueda de la fuente anterior de RUT-03. **No se encontraron
ubicaciones en las fuentes revisadas. RUT-03 sigue pendiente**; el checklist
operativo conserva 96 listos / 3 pendientes (99 IDs). CLI-10 y VAL-08 son
revisiones manuales del usuario. Independencia conserva 133/14 separados.

Esto no afirma que el usuario no tenga las ubicaciones. El campo, la edición,
el botón móvil y las fotografías del recorrido ya funcionan. Falta localizar
el archivo o módulo donde quedaron los datos anteriores. Se solicitó esa
procedencia al usuario; no consultar Alegra, producción ni Gmail para inferirla.

## Fuentes comprobadas

| Fuente local | Lectura realizada | Resultado |
|---|---|---|
| Base habitual localhost5434 | Las 106 tablas públicas, incluyendo JSON/texto; metadatos y coordenadas lat/lng numéricas | 247 clientes, ninguno con Maps; ninguna fila con enlace Maps o coordenadas reconocidas |
| Respaldo local 03/10, antes de rutas | 86 tablas / 220.182 filas COPY | Ningún enlace Maps |
| Respaldo local 05/10, previo a044 | 93 tablas / 220.200 filas COPY | Ningún enlace Maps |
| Respaldo local 07/10, esquema052 | 106 tablas / 220.184 filas COPY | Ningún enlace Maps |
| Archivo del proyecto en Raspberry Pi, 26/09 | 48 archivos de código/documentación/esquema admitidos; sin secretos | Ningún enlace Maps ni campo de coordenadas reconocido |
| Dos JSON históricos de ventas, 25/09 | Búsqueda de enlaces en copias locales | Ningún enlace Maps |
| Código de las dos ramas y archivos locales relacionados | Localización de módulos, importador y posibles hojas/contactos | Sin archivo anterior de ubicaciones identificado |

El importador de contactos conserva dirección y observaciones; no dispone
actualmente de otra fuente local de Maps. No se ejecutó el importador para
consultar Alegra. En Downloads no se identificó una hoja/contactos candidata.
No se leyó indiscriminadamente información de otros proyectos ni cuentas.

Los dumps se inspeccionaron con `pg_restore -f -` SIN `-d`: solo descomprimir
el SQL al proceso lector. No se ejecutó el SQL ni se restauró una base. No
crear otra candidata ni correr limpieza para buscar enlaces. El archivo tar
se leyó sin extraer, excluyendo .env, dependencias y sesiones. Los resultados
privados guardan metadatos/conteos, sin filas, direcciones ni secretos.

Los patrones cubren enlaces compartidos maps.app.goo.gl, goo.gl/maps,
Google Maps com/co.cr y maps.google.com. La búsqueda de coordenadas SQL cubre
claves lat/lng/latitude/longitude/latitud/longitud numéricas. Un archivo con
otro formato, coordenadas dentro de una imagen, otra cuenta o un respaldo
no revisado puede contener los datos: no se descartaron esas posibilidades.

## Continuidad y conservación

Trabajo exclusivamente local desde7338e59, en copia/rama temporal propia.
Sin commits/reservas nuevas de Claude al empezar. Habitual únicamente SQL
REPEATABLE READ/READ ONLY y auditoría de lectura; ninguna escritura de negocio.
Developer/main, producción, servicios, Prisma y dependencias conservados.
No mensajes reales, conexiones de Alegra/Gmail/Hacienda ni limpieza semanal.
No migración nueva;053 libre. No datos demos ni ubicaciones supuestas.

Auditoría de conservación compara las106 tablas/80 secuencias con la
instantánea previa:106 tablas y80 secuencias idénticas, stock provisional/apertura0
con auditorías/descuentos históricos conservados. Grafo12 aprobado;
no se repite suite/build porque no hay cambio de código. La última validación
completa fue2.270 pruebas/363 suites y build, en el informe de auditoría local.

Evidencia privada0700/0600 en /private/tmp/codex-maps-local-20261007:
búsqueda de base, tres dumps, archivo tar y JSON históricos. No modificar
respaldos ajenos. Copia/rama propias se retiran al integrar el relevo y se
libera exclusivamente esta reserva. Las cuatro memorias conservan literalmente
las quince decisiones. Los scripts privados son evidencia de esta búsqueda.

Siguiente paso RUT-03: identificar la fuente concreta de ubicaciones y su
relación con los clientes. Cualquier recuperación futura debe comprobar la
identidad, respetar campos ya editados y no reescribir recorridos históricos.
No cerrar esta casilla por escribir un informe o buscar sin resultados.
