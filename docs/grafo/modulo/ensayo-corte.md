---
id: modulo/ensayo-corte
tipo: modulo
titulo: Ensayo del corte — base desechable, cargas, enlaces y conciliaciones
estado: vigente
archivos:
  - backend/scripts/independencia/ensayar-corte.js
  - backend/scripts/independencia/lib/ensayo-corte.js
  - backend/scripts/independencia/lib/base-ensayo.js
  - backend/scripts/independencia/auditar-datos-corte.js
  - backend/scripts/independencia/lib/datos-corte.js
  - backend/tests/ensayoCorte.test.js
  - docs/plan-corte-independencia.md
aristas:
  relacionado: [modulo/auditoria-operacion-local, modulo/hacienda, modulo/lectura-migracion-alegra, modulo/conciliacion-ventas, modulo/conciliacion-cobros, modulo/conciliacion-compras, modulo/conciliacion-notas-credito, modulo/inventario, modulo/archivo-ventas-electronicas, bloqueo/carga-electronica-historica, leccion/ids-propios-y-de-alegra-no-se-mezclan]
  bloqueado_por: [bloqueo/conteo-fisico, bloqueo/xml-historico-sin-recuperar]
medido: 2026-10-10
---

La herramienta prepara una candidata local nueva; nunca reemplaza la base
compartida ni producción. Ver comandos, requisitos y vuelta atrás en
[el plan operativo](../../plan-corte-independencia.md). No arranca servidor,
limpieza, IMAP ni mensajes, no instala dependencias ni regenera Prisma.

El dump es regular, privado y sin enlaces. La carpeta de salida debe ser
nueva y quedar fuera de Git. La base debe llamarse `tachi_ensayo_*`, no existir
y usar el Postgres local de 5434. Después de restaurar se verifica que haya
`usuario` y no conversaciones de Evolution. Nunca usar un patrón `[A-Z]*`
sin cita para excluirlas: puede plegar la mayúscula y seleccionar al revés.

El esquema 001–043 se aplica completo **una vez**. Después de las maestras y
los documentos se repiten solo los enlaces de datos seleccionados, con 041
al final. La 025 no se recrea: su vista anterior no puede reemplazar la vista
ampliada de la 028. Solo se completa su FK de proveedor pendiente; no se
reinventa lo pagado sin detalle. Las compras propias provienen del buzón
aceptado (020); el informe de conciliación no las vincula por nombre/número.

La precarga de los procesos hijos aplica el aislamiento antes de cambiar el
nombre a la base de ensayo, y borra llaves de escape y contexto de pruebas.
No basta pasar DATABASE_URL por entorno: `.env.aislado` la reemplazaría y se
terminaría cargando la compartida. El lector de origen solo admite GET.

Dos pasadas comparan huellas de negocio: tiempos de importación, ids de
líneas reemplazadas y firmas de fotos se excluyen; documentos e importes se
conservan. Luego se verifica cero provisional, intentos resueltos y series
seguras, y se ejecutan los cuatro conciliadores. `ensayo.json` registra fases,
códigos y estado incompleto hasta terminar. Código 0: ensayo técnico completo
sin diferencias; 2: diferencias/repetibilidad no demostrada; 1: incompleto.
`corte_autorizado` permanece FALSE en cualquier caso.

**MEDICIÓN REAL, 2026-10-05:** dump nuevo del origen, solo lectura, 7.524.510
bytes, conversaciones excluidas. Restauración y todas las migraciones
completadas; maestras y enlaces cargados. La carga de facturas se detuvo por
`factura_electronica_aceptada`: el cargador no guarda `hacienda_estado`.
No se supuso aceptación para pasar la restricción. La adaptación fiscal fue autorizada y corregida el 2026-10-05, en
[[bloqueo/carga-electronica-historica]]. Una nueva pasada encontró que las
plantillas electrónica y comercial de Alegra comparten el prefijo abreviado
00100001 y el número 4946 (orígenes 5489 y 5524). El cargador ahora toma la
serie y consecutivo reales de la clave cuando existe, conserva el número
impreso y guarda la plantilla de origen. Normaliza copias previas antes de
recargar, sin cambiar importes/aceptación ni documentos nativos. No se relajó
la UNIQUE para pasar. Carga corregida COMPLETADA en la candidata propia:
5.526 facturas y 53.582 líneas; 487 aceptadas en origen, 5 rechazadas y 56
plantillas con estado desconocido. El fallo del cargador ya no es bloqueante.
El ensayo completo y las dos pasadas NO se consideran terminados. La carga
independiente de cotizaciones sí se probó: una importada, próxima propia 3.
No se cambiaron documentos ni inventario de la copia compartida.

**FICHAS POR REVISAR:** `auditar-datos-corte.js --salida=/ruta/privada/nuevo.json`
usa una instantánea SQL READ ONLY, no consulta Alegra ni corrige campos.
Entrega ids de ESA base, referencia histórica y motivos por ficha. Un dato
ausente no equivale automáticamente a rechazo de negocio/Hacienda. No
trasladar sus ids propios a otra copia. En la compartida: 14 productos sin
impuesto, 17 sin categoría, 9 medicamentos sin registro y 76 con precio
inferior al costo según su tarifa actual; causas se superponen (101 fichas).
Clientes: 212 sin correo, 245 sin actividad, 75 sin teléfono utilizable,
24 sin identificación y uno con tipo pendiente; 245 fichas en total.
Nada se rellenó con valores supuestos.


Auditoría posterior de rutas, 2026-10-07: [[modulo/auditoria-operacion-local]]
reconstruye SOLO 044–052 desde un respaldo LOCAL 043 y compara historia,
esquema y cero provisional. No ejecuta cargadores de Alegra ni conciliaciones
finales y no completa las dos pasadas del corte. Ese pendiente se conserva.

REQUISITOS DEL SERVIDOR, 2026-10-08. El ensayo corre en la copia local y no
prueba el servidor de producción. El plan operativo lista aparte lo que tiene
que existir allá antes de D: Node 22 y `xmllint`, disco persistente para
fotos, privados y almacén de Hacienda, las llaves `PERMITIR_*`, el paso real
de las migraciones sobre la base de producción y la fusión a `main`, que es
el corte mismo.

ENSAYO CON DATOS DE PRODUCCIÓN, 2026-10-09 (una pasada, base
`tachi_ensayo_20261008_a`). Cargó 5.558 facturas, 53.851 líneas, 1.532
cobros, 27 notas, 941 compras, 2.157 productos y 248 clientes, y se cortó en
la verificación final, antes de las conciliaciones. Dos fallos que habrían
aparecido igual el día del corte, corregidos el 2026-10-10:

- MIGRACIÓN 032. Enlazaba faltantes y cola de impresión una sola vez, antes
  de que existieran las facturas propias: 286 faltantes y 1.571 filas de la
  cola quedaron sin `factura_propia_id` y esas pantallas salían vacías. Ahora
  vuelve a enlazar cada vez que corre (está en la lista de enlaces del ensayo).
- MIGRACIÓN 054 (completa la 041). 4 de 65 intentos de factura no
  enlazaban: tiquetes que Alegra pasó a factura electrónica conservan el id y
  cambian de número. Se reconocen cuando la factura copiada está en la
  plantilla electrónica o trae clave fiscal de origen;
  `facturacion/idempotencia.js` usa la misma regla. Primero se puso en la 041
  y eso rompía una base armada desde cero: usa columnas que crea la 043. Lo
  atrapó el ensayo del 2026-10-10 sobre el respaldo de producción.

Comprobado sobre una copia de esa base devuelta al estado sin enlaces: 286 de
286, 1.571 de 1.571 y 0 intentos sin resolver, igual en una segunda pasada, y
la verificación del ensayo pasa. NO se repitió la carga desde Alegra.

DURACIÓN. Esa pasada tardó unas 15 horas de reloj (9,8 solo facturas, 4,9
cobros). No se sabe cuánto fue Alegra y cuánto el equipo suspendido de noche:
medirlo antes de fijar la ventana del corte. Sigue pendiente el ensayo de dos
pasadas desde un dump nuevo.

ENSAYO DE MIGRACIONES SOBRE EL RESPALDO DEL CORTE, 2026-10-10: respaldo de
producción restaurado en una base local nueva y las 54 migraciones aplicadas
en orden, sin error, en segundos. Diez no se pueden repetir enteras (025 y
044 a 052): en producción se aplican una sola vez; lo que se repite después
de las cargas es la lista de enlaces de `ensayar-corte.js`.

