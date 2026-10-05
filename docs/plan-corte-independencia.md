# Corte de independencia: ejecución y vuelta atrás

Estado al 5 de octubre de 2026: plan operativo preparado; **no ejecutado**.
Producción continúa en `main`/`developer`. Hacienda queda fuera del trabajo
nocturno por instrucción expresa y se revisará antes de decidir la salida.
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
'aceptada' para hacerlo pasar. Revisar mañana el estado real del origen y
los documentos desconocidos, respetando la exclusión de Hacienda del trabajo
nocturno. Detalle en [el bloqueo de carga histórica](grafo/bloqueo/carga-electronica-historica.md).
Antes de D también comparar las correcciones de configuración/maestras de
la rama con la candidata nueva: una carga desde Alegra no equivale a copiar
las decisiones propias que ya se guardaron localmente.
