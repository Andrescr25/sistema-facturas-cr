# Avance de independencia de Alegra — 2026-10-04

La auditoría de compras ya permite medir las diferencias sin escribir
documentos: **1.052 compras de Alegra y 860 propias**, con 745 candidatos
únicos y 89 grupos ambiguos, pendientes de confirmar. También se completó
el vínculo histórico de ₡21.200 de las notas de crédito: **27 notas
coincidentes y cero incidencias** dentro de ese alcance. El corte completo
sigue abierto; los candidatos de compras no son vínculos certificados.
El [checklist](../checklist-independencia-alegra.md) y el
[grafo](../grafo/README.md) describen el estado vigente.

## Qué cambió en este avance

La migración **040** crea un archivo propio para el débito de ingreso, con
el objeto GET íntegro, y una tabla de créditos vinculados mediante los dos
ids propios. Tiene su identidad separada de factura, incluso si los números
o ids externos coinciden. No añade ventas, deuda del mostrador ni numeradores.

`cargar-debitos-ingreso.js` completa el archivo y el vínculo sobre una nota
ya copiada, **sin reimportar su cabecera o líneas**. El cargador completo
de notas también incorpora esos destinos y confirma series/documentos en
la misma transacción. Ambos siguen leyendo Alegra por GET y usan el guardián
de la base aislada. La copia repetida conserva contenido, ids y timestamps.

Medición real sobre copia desechable y después en la copia local: un débito
por ₡21.200, de 2025-02-11,
totalmente acreditado. Su objeto archivado coincide con el GET original,
incluidas líneas y referencias. Se revisaron las 27 notas, sus 24 facturas
destinatarias y el débito; código 0. Los **₡8.600,20 aún sin aplicar** de
otra nota permanecen como observación, no se inventó una aplicación.

El archivo histórico no es emisión propia de débitos, cierre de cartera
ni descarga de PDF/XML electrónicos. Alcance y comandos en
[el nodo de débitos históricos](../grafo/modulo/historico-debitos-ingreso.md).

## Coordinación con Claude

Claude terminó Relacionar Productos (`59a838e`, `569529d`) y crear producto
desde una línea del proveedor (`27b46d5`, `7a1fb2f`). También implementó la
decisión delegada de recalcular el avance de la factura desde sus líneas
(039). Terminó Revisión de Precios (`2874c37`, `3d777a4`): la pantalla lee
el maestro propio y la compra usa el producto de la línea. Codex integró
este avance sobre esos commits, usando worktree y PostgreSQL propios para
la 040, sin editar esos módulos.

Durante este avance, Claude usó `tmp/claude-buzon-20261004` para el buzón
de compras y lo completó (`0ae7f3b`, `1242f81`). Integró y subió esos cambios
sobre el débito de Codex (`91fc635`), sin conflictos: **§8 completa**.
Los dos worktrees temporales ya se retiraron. También corrigió el precio
sugerido en `developer/main` (`c469365`, `8d2c073`); Codex no modificó esas
ramas. Volver a revisar commits y worktrees antes de elegir otra tarea.

En la continuación de compras, Claude fusionó los arreglos de developer
(`f6ed251`), pasó las fotos de Bodega y el código de marca al maestro propio
(`71397d9`, `8ca2a52`), retiró el catálogo antiguo (`b4e5315`, `fee8434`) y
el envío antiguo de compras a Alegra (`a80c0e0`, `31d4b82`). Codex montó su
auditoría sobre esos commits, en worktree y PostgreSQL propios. No editó
esos módulos, no cambió la base compartida ni reinició sus servidores.

Después, Claude retiró Facturación contra Alegra y corrigió las sugerencias
por cliente (`6519d31`, `00b65ce`); retiró el módulo viejo de productos y las
sobras del adaptador (`6fb1330`, `925d796`) y trajo el cierre de permisos de
producción a la rama (`5a82965`). Codex preparó la demostración siguiente
sobre esa base. Claude abrió después `tmp/claude-huella-factura-20261004`:
el contrato y la idempotencia de Facturación le corresponden; este avance
no modifica esos archivos ni reinicia sus procesos.

## Estado del checklist

Las secciones 0–16 tienen **110 tareas principales marcadas y 33 abiertas**
(revisado sobre `5a82965`).
Compras (§8) ya quedó completa; el débito completa un tramo de §15 y no
cierra la conciliación total. Esa cuenta no mide la preparación para
producción. §§11–14 siguen terminadas.

## Qué sigue pendiente

- Completar los períodos de ventas/cobros, compras y existencias, resolver
  diferencias, recargar y comprobar numeradores al preparar el corte. El
  diagnóstico de septiembre del [informe anterior](avance-independencia-2026-10-03.md)
  sigue identificado como medición anterior; este trabajo no lo recarga.
- Retirar la caché restante, la sincronización de productos, los traductores
  y las rutas antiguas de Facturación/Productos en el orden del checklist.
  El catálogo antiguo y el envío antiguo de Compras ya se retiraron.
- Guardar PDF/XML originales, completar correo con PDF y verificar la
  recepción real de WhatsApp en su entorno autorizado.
- Hacienda, aceptación electrónica y correcciones de datos se mantienen
  pospuestos con las decisiones existentes; inventario espera el conteo.
- Ensayar el corte completo y documentar congelamiento y reversa.

## Continuación: auditoría de compras

Codex tomó la conciliación de compras de §15 mientras Claude retiraba el
catálogo antiguo y sus dependencias de Alegra. Se añadió un auditor de
solo lectura para encabezados e importes agregados, con informe privado;
no ejecuta el reconciliador que modifica compras desde XML.

La copia contiene 860 compras y **ninguna tiene guardado el id de
su bill en Alegra** por el vínculo del buzón. La herramienta propone pares
por identificación del proveedor y número exacto, distingue únicos de
ambiguos y mantiene ambos pendientes de confirmar. No llena ids por
coincidencia de seriales, nombres, fechas o montos. Una línea cuyo impuesto
no viene informado se consulta por ficha; si sigue sin dato, el impuesto
mensual queda desconocido y se señala como incidencia.

La lectura real completa cubre **2025-07-01 a 2026-10-04**, con 1.052 bills
de Alegra y las 860 compras propias. Terminó con código **2**, diagnóstico
con diferencias y vínculos pendientes:

| Resultado | Cantidad | Qué significa |
|---|---:|---|
| Vínculos explícitos propios | 0 | Ninguna compra queda certificada |
| Candidatos únicos | 745 | Proveedor y número exactos; falta confirmar el vínculo |
| Grupos ambiguos | 89 | 89 compras propias frente a 191 bills; no escoger automáticamente |
| Compras propias sin candidato | 26 | Sin pareja en este tramo y bajo ese criterio |
| Bills sin candidato propio | 116 | No implica por sí solo que haya que importarlos |
| Bills con impuestos sin informar | 31 | La ficha individual tampoco los informa; el importe mensual queda desconocido |

Los 745 candidatos únicos presentan diferencias en al menos un campo:
vencimiento en 745, total en 627, impuesto de líneas en 253 y moneda en 5.
Son campos superpuestos, no documentos adicionales. Son diferencias entre
candidatos, **no 745 errores confirmados de la base propia**. El antiguo
envío ponía la fecha de emisión como vencimiento; además, hay diferencias
históricas de impuestos y faltan XML. No se ajustaron totales, monedas,
fechas, impuestos ni ids para hacerlos coincidir. La revisión debe usar el
comprobante original y conservar las decisiones sobre meses entregados al
contador. La lectura GET no es una instantánea atómica: se repite con Alegra
congelado al preparar el corte.

Huellas anteriores/posteriores de **14 tablas y las secuencias públicas
idénticas**, incluidos compras/líneas, buzón/líneas, proveedores, productos,
CxP, notas y pagos de proveedores, costos/precios históricos, períodos y
líneas del contador y series. La herramienta no cargó ni corrigió nada.
Informe y evidencia privados fuera de git:
`/private/tmp/codex-compras-20261004/compras-historicas.json` (0600).

Verificación de compras: **20 pruebas** con dobles de Alegra y PostgreSQL
desechable, incluido READ ONLY efectivo, rollback y huellas. La integración
descubrió además un problema en la preparación de `taxonomiaCatalogo.test.js`:
limpiaba módulos que Claude ya retiró y conservaba el helper nuevo con una
conexión falsa de otro caso. Se ajustó la limpieza al módulo actual, sin
cambiar el servicio de Catálogo. El grafo de Catálogo documenta el motivo.
Pasaron las **45 comprobaciones dirigidas**, incluidas compras, Catálogo y
grafo. La suite integrada sobre `31d4b82`, con PostgreSQL propio y
concurrencia 1: **1.725 aprobadas, cero fallos y ninguna omitida**. La primera
corrida tuvo también la incidencia interna de Node 25.8.2 al deserializar
datos de `buscarProductosActivos.test.js`; sus cuatro casos pasaron por
separado y la repetición completa terminó sin ese fallo. No se cambió Node
ni se omitieron pruebas. Esta entrega no modifica el frontend.

Alcance y comandos en [el nodo de conciliación de compras](../grafo/modulo/conciliacion-compras.md).
La conciliación completa y el corte continúan abiertos.

## Demostración de Reporte de Proveedores para el usuario

Solicitada el 2026-10-04 y **conservada en la base local de independencia**
para que el usuario la abra ahora. Entrar en
`http://localhost:5174/reportes/proveedores`, buscar `ZZ-DEMO` y abrir
`ZZ-DEMO Distribuidora Norte [PRUEBA]` (3 productos, 22 unidades) o
`ZZ-DEMO Ferretería Sur [PRUEBA]` (2 productos, 5 unidades).

Hay cinco productos, cinco mapeos por ids propios, cinco faltantes y cinco
notas de cliente. Dos borradores `ZZ-DEMO-PROV-FACT-1/2`, claramente
ficticios, sostienen los FKs que exige el reporte. No tienen serie,
consecutivo, emisión electrónica, cliente real ni cobro; no cuentan como
ventas emitidas o deuda. Proveedores sin correo ni teléfono real.
El usuario puede recorrer notas, cantidades, PDF, agregar productos y
reasignar; WhatsApp mantiene el bloqueo de salida de la rama.

Antes de conservarla se verificaron creación, rechazo de duplicados y
retirada en BEGIN/ROLLBACK: **nueve tablas idénticas**. En Chromium real
1440/700 px, con las APIs de 3002: ambas tarjetas, entrar/volver entre
proveedores, productos, notas y descarga de un PDF válido (23.435 bytes),
sin errores JS. Esa revisión no guardó cambios de la orden. Después de
insertar y abrir el reporte, las huellas de todos los registros anteriores
de nueve tablas siguieron idénticas; tampoco cambió `serie_consecutivo`.
Las secuencias de ids sí avanzan al insertar, sin retrocederlas ni tocar
numeradores de negocio. No se ejecutó la limpieza semanal ni se mandaron
mensajes; no hubo cambios en producción.

Pasaron **30 comprobaciones dirigidas**: grafo, marca de pedido enviado y
deshacer cambios de la orden. No se atribuye a esta entrega una suite
completa nueva ni cambios del frontend.

El script de demostración corre solo a mano y solo en base local con
salidas bloqueadas. Conserva un manifiesto privado 0600 para la retirada
puntual cuando el usuario termine, sin limpiar otros datos. **Otros modelos
deben conservar este conjunto durante la revisión y no refrescar la base
compartida.** Alcance y comandos en
[el nodo de la demostración](../grafo/modulo/demo-reporte-proveedores.md).
Evidencia, capturas, PDF y manifiesto fuera de git en
`/private/tmp/codex-demo-proveedores-20261004`.

## Verificación del débito histórico

PostgreSQL desechable: repetición y dos cargas concurrentes, rollback después
de modificar el archivo y antes de guardar el vínculo, UNIQUE/monto positivo,
notas nativas conservadas y recarga completa. Huellas de facturas, pagos y
créditos a facturas sin cambios. Hay ocho pruebas nuevas del archivo y dos
casos adicionales del conciliador; la suite no consulta Alegra real.

Suite integrada sobre `3d777a4`: **1.768 pruebas aprobadas, cero fallos y
ninguna omitida**. Tras conservar en la salida del cargador el próximo
número de cada serie, pasaron las **43 comprobaciones dirigidas**, incluido
el grafo. El frontend compiló; esta entrega no cambia su código.

Aplicación local: respaldo completo antes de aplicar **solo la 040** y
ejecutar la carga puntual. Quedaron un documento archivado íntegro y una
aplicación por ₡21.200. Huellas anteriores/posteriores de ocho tablas
(facturas y líneas, pagos y aplicaciones, créditos y líneas/destinos a
facturas, series), más las secuencias anteriores, **idénticas**. Se verificó
otra vez el objeto archivado contra el GET original y la conciliación
terminó con código 0. No se ejecutó la recarga completa de notas.

Detalle, respaldo e informes privados fuera de git en
`/private/tmp/codex-debitos-20261004`, archivos modo `0600`.
