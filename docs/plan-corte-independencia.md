# Corte de independencia: ejecución y vuelta atrás

Estado al 5 de octubre de 2026: plan operativo preparado; **no ejecutado**.
Producción continúa en `main`/`developer`. Hacienda fue autorizada después del
trabajo nocturno y su [integración está implementada](plan-integracion-hacienda.md).
La aceptación real con credenciales se verifica antes de decidir la salida.
La fecha de calendario y la ventana de trabajo deben fijarse con el usuario;
este documento llama **D** al día elegido, en hora de Costa Rica (UTC−6).
No se programa ni se realiza el corte automáticamente.

## Condiciones para elegir D

El ensayo debe terminar y sus diferencias deben tener una resolución cierta.
No se completan clientes, CABYS, impuestos, identificaciones ni aplicaciones
de dinero con valores supuestos. Los XML/originales pendientes requieren
revisión; el archivo fiscal existente se conserva siempre.

El inventario empieza en **cero provisional**, como pidió el usuario. Se
realizará el conteo completo al salir a producción. Antes de abrir ventas y
compras se completa la auditoría inicial con cantidades REALES: el catálogo
y la revisión deben permanecer estables durante el conteo. No se cargan
existencias ni auditorías de Alegra y no se usa cero como conteo confirmado.

Correo y WhatsApp requieren recepción comprobada por un destinatario
identificado en el entorno autorizado. Los dobles y las respuestas HTTP no
prueban entrega. La rama de desarrollo mantiene todas las salidas bloqueadas.
Las tablets conservan sus pendientes; no se borra IndexedDB ni se quita la
compatibilidad anterior hasta verificar que cada cola se envió completamente.

## Ensayo reproducible, sin tocar producción

Un dump privado del esquema público, obtenido por lectura, debe excluir las
tablas de conversaciones de Evolution (nombres con mayúscula inicial). Usar
nombres exactos citados al excluirlas: un patrón sin cita puede plegar la
mayúscula y excluir las tablas equivocadas. La herramienta comprueba que
exista `usuario` y que no se hayan restaurado esas conversaciones.

Desde `backend` en independencia, con el contenedor local ya iniciado:

```sh
node scripts/independencia/ensayar-corte.js \
  --base=tachi_ensayo_20261005_prueba \
  --dump=/ruta/privada/origen.dump \
  --destino=/ruta/privada/ensayo-nuevo \
  --desde=2024-01-01 --hasta=2026-10-05 --pasadas=2
```

Requiere dump regular 0600 y destino NUEVO fuera de Git. Solo crea una base
`tachi_ensayo_*` que todavía no existe, en el Postgres local 5434; nunca borra
ni reemplaza `tachi`, una base existente o producción. No instala dependencias,
no regenera Prisma ni importa el servidor, cron, IMAP o canales salientes.

Orden: restauración → migraciones completas → configuración, productos y
contactos → enlaces de datos con maestras presentes → facturas, cobros,
notas, débitos históricos y cotizaciones → 041 → ceros, intentos y series.
Las compras propias se cargan desde el buzón aceptado por la 020; no se
duplican las de Alegra ni se enlazan por número/nombre para hacerlas cuadrar.
El esquema se aplica una sola vez; los enlaces seleccionados se repiten
tras maestras y documentos. No se recrea la vista antigua de 025 después de
028. La segunda pasada repite la carga y compara datos comerciales, excluyendo
fechas de importación, ids reemplazados de líneas y firmas de fotos.

Después compara ventas, cobros, notas y compras con la fuente por GET y SQL
READ ONLY. `ensayo.json` y los cuatro informes quedan privados, sin pisar
informes anteriores. Código 0: ensayo técnico repetible sin diferencias;
2: diferencias o repetibilidad sin demostrar; 1: ensayo interrumpido. Los tres
mantienen `corte_autorizado=false`. Un fallo conserva la base desechable e
identifica la fase; nunca activa producción ni registra datos de demostración.

## Secuencia para D

| Momento | Acción | Evidencia necesaria |
|---|---|---|
| Antes de D | Resolver datos/diferencias, revisar Hacienda y fijar ventana | Informe revisado; fecha aceptada por usuario |
| D, inicio | Detener nuevas ventas, cobros, compras y ediciones en Alegra y aplicación anterior; cerrar pendientes online | Origen congelado, tablets identificadas y colas conservadas |
| D, respaldo | Copiar SQL, fotos, XML privados, archivo de originales y sesión WhatsApp por canal privado | Huellas, permisos y restauración probada; respaldo fuera del servidor |
| D, carga | Repetir carga final sobre copia candidata; ejecutar 041 después de facturas/notas; verificar todos los consecutivos | Intentos resueltos, series mayores que máximos, electrónicas inactivas hasta Hacienda |
| D, conciliación | Repetir informes con el origen congelado y el mismo alcance | Sin diferencias no explicadas; faltantes de XML resueltos o documentados con decisión cierta |
| D, servidor | Instalar código validado y configuración del servidor definitivo, rutas privadas y fotos; preparar sesión Baileys | Sin sincronización Alegra, permisos correctos, archivos accesibles a sus dueños |
| D, conteo | Confirmar auditoría inicial completa con el físico real | Todos los productos contados, revisión estable, kardex de apertura y costo comprobados |
| D, verificación | Revisar emisión/cobro/crédito/compra y envíos autorizados | Recepción real, saldos correctos, sin duplicados, sin usar documentos ZZ como negocio |
| D, apertura | Autorizar apertura del sistema propio; Alegra queda de consulta | Un solo lugar que emite/escribe; monitoreo de los primeros documentos |
| Después | Verificar cada tablet y retirar compatibilidad solo con colas vacías; conservar respaldos y originales | Sin pendientes perdidos; exportación completa del período de transición |

No usar `setupDatabase.js`: no monta las migraciones propias. Tampoco usar
`refrescar-copia.sh --si` sobre la copia revisada para ensayar: reemplaza la
base compartida. No ejecutar limpieza semanal ni su botón durante ninguno de
estos pasos. Los datos de trabajo de faltantes no son datos descartables.

## Servidor de producción: lo que tiene que existir antes de D

Decisión del usuario, 2026-10-08: el sistema propio queda en ESTE MISMO
repositorio; en D todo `independencia-alegra` pasa a `main` y Alegra queda
de consulta. No hay repositorio ni proyecto nuevo. Mientras no se diga otra
cosa se asume el despliegue actual de `main` (Render + Supabase): confirmarlo
con el usuario antes de preparar el servidor, porque de eso depende cómo se
cumple cada punto. Ninguno estaba en este plan: salieron de la revisión de
la rama del 2026-10-08 y ninguno se puede comprobar desde la copia local.

1. **Node 22.** `backend/package.json` exige Node >= 22. `nixpacks.toml` y
   `frontend/package.json` todavía piden Node 18: alinearlos. *(El programa
   `xmllint` figuraba acá como requisito del servidor. Render no lo trae y
   no se puede instalar ahí: se encontró el 2026-10-11, con el sistema ya en
   vivo, al preparar el primer comprobante. Desde ese día el XSD se valida
   con libxml2 en WebAssembly, dependencia del módulo de Hacienda, y el
   servidor no necesita nada más que Node.)*
2. **Disco que sobreviva a un despliegue.** Todo archivo va a disco local:
   fotos (`ALMACENAMIENTO_DIR`, 270 MB medidos en la copia), PDF y XML
   privados (`ALMACENAMIENTO_PRIVADO_DIR`) y el almacén de Hacienda
   (`HACIENDA_ALMACEN_PRIVADO`), que guarda `llave-cifrado` y los XML
   firmados. Un servicio sin disco persistente los pierde en cada
   despliegue, y sin esa llave no se recuperan las credenciales guardadas.
   Las tres rutas apuntan a un disco persistente y entran en el respaldo.
3. **Llaves de arranque.** Fuera de la copia local, `config/aislado.js` no
   conecta ni deja salir nada por omisión. En el servidor se prenden a
   propósito, en D: `PERMITIR_BASE_REMOTA=true`, `PERMITIR_SALIDAS=true`,
   `PERMITIR_LECTURA_BUZON=true`, `WHATSAPP_PROVEEDOR=interno` y
   `HACIENDA_TRABAJADOR=true` (o `npm run hacienda:seguir` desde un
   planificador aparte). La aplicación ya no lee `ALEGRA_*` ni las
   `ENABLE_*_SYNC` de Alegra; los cargadores de la migración sí usan las
   credenciales de lectura.
4. **Las migraciones sobre la base de producción.** Las 52 de
   `migrations/independencia/` solo las aplican `refrescar-copia.sh` y
   `ensayar-corte.js`, siempre sobre una copia local. Falta decidir y
   ensayar el paso real: aplicarlas sobre la base de producción congelada o
   promover la candidata. Cualquiera de los dos se prueba completo en el
   ensayo antes de D.
5. **La fusión a `main`.** Preparada el 2026-10-10 sin tocar `main`: se trajo
   `main` a esta rama (`51dca48`) y quedó como antecesor, así que el día del
   corte `main` solo avanza hasta la rama, sin conflictos. Los 15 conflictos
   eran de Impresión y del catálogo del agente, donde la rama ya tenía su
   versión adaptada; el resultado es idéntico a la rama. Si `main` recibe
   otro arreglo antes del corte, repetir `git merge main` acá y revisar igual.
   La fusión ES el corte: en cuanto entra a `main`, producción deja de usar
   Alegra. No se adelanta.

## Corte iniciado el 2026-10-10

Decisión del usuario ese día: pasar a producción ya y corregir ahí, con
Alegra como respaldo hasta fin de mes. Se eligió migrar la base de Supabase
en sitio y cargar ahí mismo; `main` avanza al final.

**La base de PRODUCCIÓN ya tiene el esquema nuevo.** Quien lea esto no debe
suponer que producción sigue como antes:

| Paso | Estado |
|---|---|
| Respaldo de producción (`pg_dump`, 63 tablas, sin conversaciones) | Hecho, 18:36. Privado, fuera del repositorio |
| Ensayo: ese respaldo restaurado en local + las 54 migraciones | Hecho. Atrapó la regla de renumeradas mal puesta en la 041 (hoy 054) |
| Las 54 migraciones en producción, una transacción por archivo | Hecho, 18:41–18:42, sin errores |
| Carga desde Alegra a las tablas nuevas | Hecha, 18:58–22:00 (3 h: facturas 2 h 19 min, cobros 35 min). 5.562 facturas, 53.855 líneas, 1.536 cobros, 27 notas, 942 compras, 2.157 productos, 248 clientes, 42 proveedores |
| Verificación del estado (`verificarEstado`) y enlaces | Hecha: pasa. 0 intentos sin resolver, series seguras, 322 faltantes y 1.577 filas de Impresión enlazadas |
| Conciliación contra Alegra, 2026-09-01 a 2026-10-10 | Ventas sin diferencias (233). Cobros sin diferencias (270). Saldos: 320 de 320 cobrables iguales. Notas: ninguna en el tramo. Compras: sin vínculo guardado, no se certifica (117 contra 117) |
| Backend nuevo en local contra producción, solo lectura | 16 pantallas responden. Por cobrar: 45 clientes, 61 facturas, ₡2.509.202 |
| Variables del servicio en Render | Hechas por el usuario, con disco persistente en `/var/data` |
| `main` avanza hasta esta rama y se sube | Hecho por el usuario, 22:39. El sistema propio está en vivo en Render |

Mientras `main` no avance, en Render sigue el sistema anterior sobre una
base ya migrada. Lo que se sabe que le falla: **Impresión y los reportes de
faltantes** (la 032 renombró `faltantes.factura_id`, `faltantes.producto_id`
y `facturas_reimpresion.factura_id`). Los pedidos del portal pueden fallar
por el disparador nuevo de `pedido_cliente`; no se comprobó. El resto de las
63 tablas anteriores no cambió de forma.

El sistema anterior corre su limpieza semanal el domingo a las 23:59: conviene
que el código nuevo esté desplegado antes.

Variables que el servicio necesita para arrancar con este código:
`PERMITIR_BASE_REMOTA=true` (sin ella no se conecta a una base remota),
`PERMITIR_SALIDAS=true`, `PERMITIR_LECTURA_BUZON=true`, `NODE_VERSION=22`,
y para Hacienda en pruebas `HACIENDA_PERMITIR_PRUEBAS=true` y
`HACIENDA_TRABAJADOR=true`. No definir `MODO_AISLADO`.

Pendiente aparte del despliegue, visto al verificar:

- **Fotos: hecho el 2026-10-10.** 2.045 fotos (273 MB) en el disco
  persistente del servicio (`/var/data`, `ALMACENAMIENTO_DIR`), migradas
  desde la consola de Render; 40 de 40 al azar las entrega el servidor. Un
  primer intento, con la variable puesta pero SIN disco montado, guardó todo
  en espacio temporal y dejó producción sin fotos hasta devolver las
  direcciones de Alegra: antes de migrar, `df -h /var/data` tiene que mostrar
  el disco. `migrar-fotos.js` ya no corre contra una base remota sin
  `ALMACENAMIENTO_DIR`, pero no puede saber si esa ruta es un disco de verdad.
- **Hacienda** no está configurada en producción (ningún ambiente). Tres
  impuestos de 0 % siguen sin código: los elige una persona.
- **Inventario** en cero, a propósito, hasta el conteo.
- **Anular un cobro** existe en el servidor y no tiene botón en la pantalla.
- Un backend del sistema anterior corriendo en una máquina de desarrollo
  también ejecuta la limpieza semanal contra producción: apagarlo.

Vuelta atrás antes de subir `main`: devolver los tres nombres de columna de
la 032. Las tablas nuevas pueden quedar; el sistema anterior no las mira.

## Vuelta atrás

**Antes de la primera escritura real en el sistema nuevo:** mantenerlo cerrado,
conservar la candidata y los informes, volver al código/configuración anteriores
y reabrir Alegra. Las cargas fueron lecturas del origen; no hay documentos
nuevos que devolver. No borrar la candidata ni el archivo fiscal al volver.

**Después de una escritura real:** detener ambas aplicaciones y conservar SQL,
colas y archivos. Identificar todas las facturas, cobros, créditos y compras
nativas desde la apertura por sus ids propios, documentos y bitácora. No
restaurar un respaldo viejo sobre esos datos, ni reenviarlos masivamente a
Alegra: se perderían o duplicarían ventas/pagos. La vuelta necesita un registro
revisado documento por documento, con consecutivos, aplicaciones y situación
fiscal ciertos; Hacienda se trata en su revisión. No hay reversa automática
que pueda decidir eso por el negocio.

La misma congelación sirve si una conciliación, entrega o conteo no pasa:
se conserva evidencia, se corrige la causa y se repite antes de abrir. El
plan queda listo para fijar D cuando el usuario revise las condiciones.


## Resultado del primer ensayo sobre el origen actual

Restauración, esquema completo, maestras y enlaces probados en base nueva.
La carga de facturas se detuvo por la restricción fiscal de 015: el cargador
no inserta `hacienda_estado`. El ensayo queda INCOMPLETO; no se asigna
'aceptada' para hacerlo pasar. Después de la autorización de Hacienda se
corrigieron estado fiscal y series del origen: una carga aislada completó
5.526 facturas y 53.582 líneas. El ensayo de dos pasadas de todos los cargadores
y conciliaciones permanece incompleto. Revisar los estados desconocidos;
detalle en [el antecedente de carga histórica](grafo/bloqueo/carga-electronica-historica.md).
Antes de D también comparar las correcciones de configuración/maestras de
la rama con la candidata nueva: una carga desde Alegra no equivale a copiar
las decisiones propias que ya se guardaron localmente.
