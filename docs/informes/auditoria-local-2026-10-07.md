# Auditoría global local — 2026-10-07

VAL-06 y VAL-07 cerrados. El checklist operativo queda en **96 listos / 3
pendientes (99 IDs)**. Pendientes: RUT-03 (ubicaciones Maps anteriores desde
una fuente LOCAL), CLI-10 (revisión visual del usuario) y VAL-08 (revisión
manual del flujo completo). El checklist de independencia conserva **133/14
(147 IDs)**; sus pendientes fiscales, datos reales, conteo y corte son distintos.

Trabajo desde fc2ba3e en rama/copia temporal propia, solo independencia-alegra
local. Sin nuevos commits ni reservas de Claude al iniciar. Developer/main y
producción fuera del trabajo, sin push. No se ejecutó limpieza semanal.

## Herramienta que queda en el proyecto

`backend/scripts/independencia/auditar-operacion-local.js` captura únicamente
lecturas SQL REPEATABLE READ/READ ONLY. Exige localhost/127.0.0.1/::1 y puerto
5434, incluso con PERMITIR_BASE_REMOTA. No importa server.js, Prisma, lectores
de Alegra ni transportes externos. No corrige, clasifica ni borra registros.

Guardar evidencia fuera de Git, en carpeta privada 0700 real, con un archivo
nuevo. El resultado queda 0600 y solo incluye metadatos, conteos y huellas.
La referencia debe ser un JSON privado regular. Ejemplo desde backend, con
la configuración aislada LOCAL comprobada:

```sh
node scripts/independencia/auditar-operacion-local.js --salida=/ruta/privada/antes.json
node scripts/independencia/auditar-operacion-local.js --referencia=/ruta/privada/antes.json --salida=/ruta/privada/despues.json
```

Código 0: sin diferencias y cero provisional válido; 2: diferencias o apertura
provisional no válida; 1: incompleto. No reutilizar nombres ni sobrescribir
la evidencia. Confirmar que el archivo sea JSON completo cuando una ejecución
falle. Referencia anterior a una migración proyecta sus columnas originales;
comparar nuevas columnas/tablas requiere otro control del esquema y sus valores.

Incluye TODAS las tablas públicas, ids, importes, referencias, timestamps y
campos fiscales, sin excluir columnas. Huellas ordenadas preservan repeticiones
sin depender del orden físico SQL. MD5 detecta regresiones, no certifica archivos
ni fiscalidad. Captura también secuencias sin consumir números. Son externas a
MVCC: comparar con la app en reposo; un ROLLBACK de una escritura puede consumir
un serial y no se debe ocultar ni reiniciar para hacer pasar la comparación.

Cero se verifica antes de abrir la operación: existencias, conteos confirmados,
valoración y apertura física, movimientos y nueva operación por ciclos. La
actividad real posterior naturalmente deja de cumplir esta condición. Esta
herramienta no es un bloqueo de venta/conteo ni sustituye inventario físico.

## Reconstrucción desde un respaldo local

Se restauró el respaldo LOCAL anterior a 044, conservado desde el2026-10-05,
en `tachi_codex_auditoria_migraciones_20261007`. No se leyó producción ni Alegra.
Las nueve migraciones 044–052 se aplicaron en una sola transacción:

- **93 tablas anteriores y sus secuencias idénticas**, usando columnas previas;
  ids/importes/fechas y referencias históricos conservados.
- **13 tablas nuevas vacías**, clientes sin rutas/Maps supuestos, documentos
  anteriores sin ciclos ni preventa atribuida. Cero provisional conservado.
- Tras 044/045, fallo real SQL 22012: ROLLBACK conserva datos y elimina el DDL.
- Repetir 044 sobre 052: rechaza 42P07, ROLLBACK sin cambio de tablas.

Esquema reconstruido equivalente al habitual: 1.333 columnas, 457 restricciones,
347 índices, 27 triggers, 22 funciones y siete vistas. La primera comparación
textual detectó 17 CHECK antiguos y un índice antiguo con representación distinta
tras pg_restore: cast de varchar[] a text[] en el array o en cada literal.
Se conservó la evidencia original y se normalizó SOLO ese patrón equivalente;
las demás diferencias no se ocultan. Ninguna migración modifica esos objetos.
Funciones/vistas/triggers/columnas coincidían ya sin normalización.

La suite completa se ejecutó sobre esta 052 reconstruida, con archivos en
serie: **2.270 pruebas / 363 suites, 0 fallos, 0 omitidas**, 171,2s. Siete
regresiones nuevas: cambios/pérdida de historia, secuencias, estado provisional,
clasificación supuesta, rollback/liberación, lectura real completa y detección
real de auditoría reactivada/movimiento ficticio. Las escrituras negativas son
exclusivas del clon y se revierten; los seriales consumidos pertenecen al clon.

Revisión final de formato/comentarios: siete focalizadas PostgreSQL aprobadas
en el otro clon local propio. CLI: cuatro rechazos comprobados (ruta relativa,
salida en Git, carpeta sin privacidad, base remota aun con escape), sin archivo
creado. Guardas existentes de correo, WhatsApp y buzón verificadas en la suite
quitando NODE_TEST_CONTEXT: antes de llamar al transporte. No se habilitaron
salidas para demostrar el bloqueo.

## Conservación de la base local habitual

Auditoría de **106 tablas y 80 secuencias** sin diferencias. Los 36 controles
operativos y nueve completos adicionales anteriores también coinciden.
2.144 productos con existencia cero, ninguno contado ni valorado, apertura
pendiente y revisión0. Sin movimientos, órdenes, recepciones, cierres, entregas
ni documentos nuevos clasificados. Se conservan 17 auditorías y 470 descuentos
antiguos como históricos, ninguno activo; regalos históricos0. Finanzas,
maestros, permisos y ruta/ciclo cancelado del usuario permanecen completos.

2.023 archivos públicos de fotos idénticos por SHA-256 y tamaño. Los directorios
privado comercial y fiscal configurados en esta copia no existen; se comprobó
que permanecen ausentes, no se acredita un respaldo fiscal por ese resultado.
Los documentos sintéticos privados usados por pruebas permanecen solo en el
montaje desechable. No se cambiaron Descargas ni archivos de otros ensayos.

Respaldo de la habitual capturado por pg_dump LOCAL antes del trabajo y
protegido0600: `/private/tmp/codex-auditoria-local-20261007/origen-local.dump`.
Artefactos/dumps/huellas/esquema/logs privados0700/0600 bajo ese directorio;
no adjuntar filas, credenciales ni documentos a Git/memoria.

## Aplicación y relevo

Sin servicios/frontend modificados ni SQL nueva: 053 sigue libre, 044–052
ya estaban aplicadas a la habitual y **no se repiten allí**. Grafo12 y build
aprobados; Vite mantiene su aviso de tamaño del bundle. Aplicar únicamente
scripts, pruebas y documentación por rebase y avance sin fusión local.

App habitual5174→3002, backend seguro74960/Vite98892 conservados sin reinicio;
lanzador `/private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs`.
Conserva la autorización fiscal sandbox anterior y workertrue; comprobantes/
cola0, este trabajo no conecta a Hacienda. No arrancar server.js directo.
Original3000/PID5370 y developer5013270/main e19c3e5 intactos, sin conexión
ni pruebas contra la base de producción. Prisma/dependencias intactos.

El cierre debe confirmar lectura habitual tras integrar, retiro de las dos
bases propias `tachi_codex_auditoria_*_20261007`, copia/rama temporal y puertos
propios libres. Solo entonces liberar esta reserva y actualizar las cuatro
memorias conservando literalmente las quince decisiones. Conservar respaldo
local, evidencia y ensayos ajenos. El commit de relevo registra ese retiro.
