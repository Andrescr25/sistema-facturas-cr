# Avance de independencia de Alegra — 2026-10-04

Facturación y Cuentas por Cobrar ya usan los campos propios, sin los dos
traductores de §16. Proveedores (§4) también quedó completa. Se preservan
las colas de las tablets y sus claves; el inventario y el corte siguen abiertos.

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

Las secciones 0–16 tienen **118 tareas principales marcadas y 28 abiertas**
(recontado sobre los avances de Claude hasta `eef7dd5`; la descarga de originales
electrónicos avanzó, pero quedan 54 fichas sin XML ni clave fiscal). §0,
Proveedores (§4), Compras (§8) y §§11–14 están completas; el débito completa un tramo de §15 y no cierra
la conciliación total. Esa cuenta no mide la preparación para producción.
Hay además una fila de Hacienda en Pospuesto: **118 marcadas y 29 abiertas
en todo el archivo**.

## Qué sigue pendiente

- Completar los períodos de ventas/cobros, compras y existencias, resolver
  diferencias, recargar y comprobar numeradores al preparar el corte. El
  diagnóstico de septiembre del [informe anterior](avance-independencia-2026-10-03.md)
  sigue identificado como medición anterior; este trabajo no lo recarga.
- Retirar la caché restante y la sincronización de productos cuando exista
  inventario propio; retirar la integración tras las cargas y conciliaciones
  del corte. Facturación/Productos antiguos, el envío antiguo de Compras,
  el prefijo `/alegra` y los dos traductores frontend ya se retiraron.
- Resolver las 54 fichas electrónicas sin XML/clave fiscal en Alegra y
  respaldar/trasladar los originales al servidor. Verificar la recepción real
  de correo con PDF y WhatsApp en el ensayo autorizado del corte. El flujo
  de correo ya está implementado, con salidas bloqueadas durante el desarrollo.
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

Solicitada el 2026-10-04, revisada y **retirada por pedido explícito del
usuario**. El ejemplo tuvo dos proveedores `ZZ-DEMO`, cinco productos y
27 unidades; ya no está en la base compartida.

La demostración tuvo cinco productos, cinco mapeos por ids propios, cinco
faltantes y cinco notas de cliente. Dos borradores `ZZ-DEMO-PROV-FACT-1/2`, claramente
ficticios, sostienen los FKs que exige el reporte. No tienen serie,
consecutivo, emisión electrónica, cliente real ni cobro; no cuentan como
ventas emitidas o deuda. Proveedores sin correo ni teléfono real.
El usuario pudo recorrer notas, cantidades, PDF, agregar productos y
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
puntual. La revisión del usuario dejó una fila de Impresión y quitó una
línea del borrador: el primer intento se revirtió entero por el FK de la
cola. Se amplió la retirada para borrar únicamente la impresión de esos
borradores, por `factura_propia_id`, y luego se completó.
**Cero restos del manifiesto; nueve tablas anteriores y series iguales.**
No volver a insertar el conjunto sin un nuevo pedido. Alcance y comandos en
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

## Continuación: facturas por correo con PDF propio

Codex tomó el pendiente de §6 en `tmp/codex-correo-factura-20261004`, con
una copia PostgreSQL desechable. Antes de editar incorporó `0e610c0` y
`7df1d8f` (idempotencia propia), y `0787492`/`5a09601` de Claude (retirada del
prefijo `/alegra`). No se tocaron sus rutas de reportes, permisos o servidor.

Ya existe el botón Correo en el detalle de facturas emitidas. Permite
confirmar un destinatario, asunto y mensaje, con remitente visible y PDF
propio adjunto. GET/POST de la factura, bajo sesión y permiso Facturación;
usa el mailer existente y la cuenta del buzón elegida por el usuario. No
permite borradores/anuladas ni destinatarios ambiguos, controla los errores
SMTP y confirma aceptación del servidor, sin afirmar recepción. Los envíos
inciertos no se reintentan solos. No hay cambios de esquema ni datos de negocio.

Las salidas siguen bloqueadas: API 423 y botón Enviar deshabilitado en esta
copia. La recepción real con esa cuenta queda para el ensayo de corte de
§15. Contrato, pruebas y siguiente verificación en
[el nodo de correo](../grafo/modulo/correo-facturas.md).

Verificación dirigida: 14 pruebas aprobadas, incluido el caso de retirada
con impresión pendiente, con PostgreSQL desechable y ROLLBACK. Compilación
de frontend aprobada. Chromium real a 1440/700 px: API exige sesión (401),
permiso Facturación (403) y conserva aislamiento (423); modal bloqueado,
aceptación/rechazo simulados, cierre bloqueado mientras envía y cero
errores JavaScript. Ningún correo real. Evidencia privada en
`/private/tmp/codex-correo-factura-20261004`.

Suite completa con `PROBAR_BASE_LOCAL=1` contra la copia desechable:
**1.804 pruebas aprobadas, cero fallos y cero omitidas**. No se ejecutó
limpieza semanal ni se cambiaron datos de producción.


## Continuación: Facturación y la copia offline sin traductor

Codex retiró `facturaPropiaAdaptador.js`. La pantalla y la copia de facturas
usan `numero`, `cliente`, `lineas`, `fecha` y los estados propios. El GET
conserva su saldo calculado; el normalizador de POST/PUT no copia el saldo
histórico de SQL. El PDF mantiene su descarga autenticada y la ruta de
Impresión mediante `facturaPdf.js`.

`SistemaFacturasCR` pasa de versión 3 a 4, conservando su nombre. La
actualización convierte solo las copias: mantiene las tres colas, sus
claves de idempotencia, intentos y fechas, y los catálogos/configuración.
Separa los ids de copias históricas y propias aunque coincidan. La pantalla
rechaza una copia sin procedencia antes de consultar su detalle por la ruta
propia, y pide descargar el detalle antes de editar un resumen sin señal.
Las búsquedas resumidas conservan las líneas completas ya descargadas.

Cuerpo y clave de una venta nueva se guardan juntos: se elimina la ventana
que podía dejar una factura pendiente sin clave al cerrar la tablet. Reparar
un producto corrupto ya no borra las ventas pendientes. Las ediciones
antiguas sin marca permanecen en la cola con su motivo. No se renombra su
cuerpo ni se cambia la huella de idempotencia: la compatibilidad de entrada
del backend continúa abierta después del corte (§6). No hubo migración SQL.

Coordinación: Claude completó Cuentas por Cobrar (`f65bae4`, `475cc2a`) y el
WhatsApp de la ficha de proveedores (`84f6e38`, `0c023fa`), cerrando §4. Codex
montó este cambio sobre esos commits, sin conflictos y sin editar sus
worktrees. Durante la validación Claude integró también los permisos (`1234fb1`):
rutas prestadas y escrituras de reportes con dueño. Codex volvió a montar
su cambio sobre esa base sin conflictos y repitió la batería completa.
Este cambio no modifica los archivos de permisos. Pruebas en PostgreSQL desechable y
puertos propios; la base compartida, producción y sus procesos no se tocaron.

Validación final sobre `1234fb1` más este cambio: **1.850 pruebas aprobadas,
cero fallos**,
con `PROBAR_BASE_LOCAL=1` en la copia desechable, y compilación frontend
correcta (permanece el aviso previo de tamaño de algunos paquetes).
En Chromium: migración v3→v4 con ids coincidentes, igualdad de las tres
colas y los catálogos/configuración, reversión completa por cuota, pestaña
que bloquea la actualización, reintento con la misma clave y dos ediciones
sin señal. Reparar productos conserva las otras tiendas de IndexedDB.
La pantalla de 700 px guarda una edición con `productoId` propio y la
recupera después de recargar sin señal; en 1440 px siguen visibles PDF y
correo. Una copia histórica se rechaza sin consultar su id propio.
Cero errores de JavaScript, escrituras HTTP o mensajes reales en estas
pruebas de navegador. El detalle técnico y los archivos están en
[Facturación sin señal](../grafo/modulo/facturacion-offline.md).


## Continuación: originales PDF/XML de ventas electrónicas

El descargador de §15 recorre el historial de Alegra, selecciona las ventas
electrónicas emitidas y obtiene sus enlaces con `fields=pdf,xml`. Archiva
los bytes originales; no sustituye el PDF por una reimpresión propia. El
XML se comprueba contra la clave fiscal del documento y debe incluir firma.
El archivo privado mantiene SHA-256 y un manifiesto de la selección, los
comprobantes confirmados y los pendientes. No incluye enlaces firmados ni
credenciales. No modifica facturas, series, Hacienda, compras ni SQL.

La misma ejecución se puede reanudar: comprueba lo ya archivado y descarga
lo pendiente. Una copia alterada se reporta sin reemplazarla. Las descargas
usan concurrencia limitada; el manifiesto tiene un solo escritor. Un
error de lectura deja la revisión incompleta, conservando los originales.
La carpeta fiscal vive fuera de Git y de las carpetas servidas por Express.
El traslado y respaldo en el servidor corresponden al plan de corte; no
se escriben rutas locales del equipo dentro de `factura.xml_ruta`.

Primera medición local, solo SELECT: 531 facturas electrónicas copiadas,
entre 2024-06-05 y 2026-09-11. La descarga completa se hace desde Alegra,
para incluir lo posterior y no limitarse a esos ids. Una muestra real de
PDF y XML respondió 200; el XML contiene firma y su clave coincide.
Lectura completa del origen: **5.526 facturas; 546 marcadas electrónicas**.
**54 no entregan clave fiscal en el listado ni en el detalle**. Una segunda
consulta de las 54 respondió correctamente: todas ofrecen PDF, ninguna
devuelve XML; 46 están cerradas y 8 anuladas. No se concluye de esa marca de
plantilla que se emitieron fiscalmente ni que perdieron su XML. Sus ids y
motivo quedan pendientes en el manifiesto; no se generan XML ni se reemite
para suplirlos. El descargador exige identidad fiscal y no archiva esos PDF
como originales identificados. Revisar emisión/originales en Alegra antes
de cerrar §15. **Resultado final del reintento: 492 PDF y 492 XML**, 984
archivos, **23.561.897 bytes**, entre 2024-06-05 y 2026-10-01. Reutilizados
los 446 pares ya guardados; recuperadas las otras 46 consultas/descargas.
Verificación independiente de los 984 archivos: SHA-256, formato, pertenencia
del XML, presencia de firma y permisos correctos. No es una validación
criptográfica ni una consulta de aceptación ante Hacienda.
El manifiesto permanece incompleto exclusivamente por las **54 fichas
sin XML/clave**; código final 2, cero documentos fuera de la lectura y cero
otros fallos. La carpeta permanente es
`/Users/joseandres/Desktop/Proyectos_Per./archivo-fiscal-alegra/ventas`;
no retirarla al limpiar copias o bases de prueba.

Coordinación: sobre `bfd5c93` (Claude corrigió reconexión), incorporados
`8bb7f2b` y la revisión de tablas/checklist `0fdbd40`/`eef7dd5`, sin conflictos.
No se tocaron sus worktrees, servidores ni archivos de Facturación.
Batería combinada: **1.912 pruebas aprobadas, cero fallos**, con la base
desechable propia y `PROBAR_BASE_LOCAL=1`; incluye 26 pruebas del archivo
y fallos/reintentos/concurrencia. Es una herramienta de backend sin cambios
de interfaz. Instrucciones y alcance en
[el nodo del archivo electrónico](../grafo/modulo/archivo-ventas-electronicas.md).


## Continuación nocturna del 5 de octubre: inventario propio desde cero

Por instrucción expresa del usuario se construyó el inventario sin esperar
el conteo físico. La apertura es cero **provisional**, sin importar cantidades
de Alegra. Auditorías, descuentos y regalos previos quedan históricos fuera
del flujo activo; facturas y compras se conservan.

La 042 crea una bodega Principal, kardex inmutable, saldo y promedio móvil
calculados. Ventas, ediciones/anulaciones, créditos/anulaciones y compras
registran movimientos en la misma transacción. La nota devuelve el costo de
la salida original; compra usa unidades propias con impuestos/descuentos.
Las auditorías usan productos propios, guardan borradores y aplican ajustes
sin duplicar. El conteo inicial completo exige todos los productos, revisión
estable y cantidades reales explícitas; falta realizarlo en producción.
Devolución de cliente ingresa; devolución a proveedor sale y valida stock.
Excesos consultan ventas y existencias propias; las ofertas desaparecen en
la venta que agota el stock, sin cron ni aumento automático del descuento.

La pestaña Existencias incluye filtros, kardex, mínimos y cantidades
sugeridas de compra. Se revisaron escritorio y 700 px, con cero errores JS;
HTTP exige sesión y permiso de inventario. La tablet conserva su presentación
sin etiquetas de stock. El servidor ya no sincroniza productos de Alegra.
Las tres listas de dependencias activas quedaron **0 / 0 / 0**; 20 tablas
históricas retiradas del código protegidas por pruebas.

Validación final: **1.930 pruebas aprobadas, cero fallos y cero omitidas**,
build correcto; dirigidas 9/9 del core y 16/16 de auditorías/comercio.
Son 25 pruebas PostgreSQL entre core y servicios comerciales/auditorías,
con ROLLBACK/SAVEPOINT y base desechable. Ceros de todos los productos
comprobados por SQL y navegador. Sin mensajes reales, limpieza semanal,
Hacienda ni cambios de producción. Detalle: [inventario](../grafo/modulo/inventario.md).

Checklist tras este bloque: **130 ítems marcados y 16 pendientes** en §0–16;
17 pendientes contando la emisión de Hacienda pospuesta. El conteo físico
real permanece abierto; ocho de nueve puntos de inventario están cerrados.
No se considera cerrado el corte ni la recepción externa de mensajes.

Aplicado a la copia local compartida con respaldo previo: **2.144 productos
en cero**, ninguno marcado contado; **0 auditorías, 0 descuentos y 0 regalos
activos**. Conservadas 17 auditorías y 470 descuentos históricos. Las huellas
de 15 tablas comerciales/series fueron iguales antes y después. Puerto 3002
recargado con lanzador aislado, sin limpieza ni salidas; HTTP confirma stock
provisional y listas vacías. Producción sigue intacta. También los indicadores
de auditoría parten en cero: no se presenta una precisión de 100% sin conteos.


## Continuación nocturna: integración antigua retirada

La aplicación ya no contiene `src/integrations/alegra`. Los cargadores,
conciliadores y el archivo usan un lector exclusivo de scripts, limitado a
GET aun con las salidas abiertas. Autenticación privada, destino fijo,
redirecciones apagadas, reintentos acotados y errores sin objetos Axios.
Se retiraron los tres guiones antiguos que escribían costos/contactos/pagos
en Alegra y las pruebas que solo ejercitaban servicios retirados. Las reglas
comerciales propias y sus pruebas se conservan.

Validación: **1.902 pruebas aprobadas, cero fallos u omitidas**, incluidas
PostgreSQL real, y grafo 12/12. La cifra baja respecto de 1.930 por el retiro
del código y sus pruebas antiguas, no por omisiones del ejecutor. Consulta
real de un producto con el lector GET completada, sin escribir en Alegra.
Checklist: **131 marcados / 15 abiertos** (§§0–16), 16 con Hacienda pospuesta.
El retiro de columnas externas aún depende de vaciar las colas offline.


## Cierre nocturno: herramientas y ensayo del corte

Plan operativo y herramienta en candidata desechable preparados; auditoría
READ ONLY por ficha y referencia histórica, sin completar datos supuestos.
La restauración nueva pasó todo el esquema y las maestras/enlaces. El ensayo
se detuvo en la restricción fiscal de las facturas históricas: el cargador no
inserta `hacienda_estado`; su resolución queda con Hacienda para mañana.
No se inventó aceptación ni se marcó ensayo/corte como terminados. Una
cotización del origen se importó de forma independiente en la desechable.

Suite final **1.908 aprobadas, cero fallos y cero omitidas**. Las pruebas
nuevas comprueban rutas/base privada, no sobrescribir, SQL READ ONLY,
consecutivos/ceros y preservación de datos. Checklist **131/15** (§§0–16),
16 abiertos con Hacienda pospuesta. Estado completo, los 15 puntos y siguiente
sesión en [el informe del 5 de octubre](estado-checklist-2026-10-05.md).

## Continuación autorizada: Hacienda, 2026-10-05

La instrucción de excluir Hacienda de la noche fue reemplazada por la
autorización del usuario de diseñar y ejecutar su integración separada.
[Informe de Hacienda](hacienda-2026-10-05.md), [plan](../plan-integracion-hacienda.md)
y [grafo](../grafo/modulo/hacienda.md). Credenciales/certificado se cargan
en Configuración; aceptación real en pruebas sigue pendiente. El inventario
continúa en cero y las revisiones manuales quedan a cargo del usuario.


## Catálogo PDF con fotos — continuación local del 2026-10-05

Rutas/clientes/pedidos y preventa por enlaces conservados; nueva ampliación
para enviar el PDF con fotos junto al enlace, descargar/revisar su misma
copia y recibir pedidos por WhatsApp sin cuenta. Invitación opcional para
portal; conversaciones no crean pedidos automáticamente. Ejemplo real
personalizado en Descargas del usuario (60 productos/fotos), fuera de Git.
1.991 pruebas, grafo 12, build y Chromium 1440/390 aprobados. Operativo 34/61;
independencia 133/14. No nueva migración ni mensajes reales. Evidencia,
limitaciones y siguiente parte en [informe PDF](preventa-pdf-2026-10-05.md).

## Continuidad de catálogo — 2026-10-05

PDF visual implementado: categorías/subcategorías en orden manual, ofertas
y liquidaciones dentro de sus grupos, etiquetas y dos tarjetas con fotos
grandes por fila. Mensaje explícito de catálogo. Ver
[entrega y límites](catalogo-visual-2026-10-05.md): 1.999 pruebas aprobadas,
checklist operativo 38 listos/61 pendientes. Solo local; independencia
conserva 133/14, Hacienda REAL/corte y revisiones del usuario pendientes.

## Continuidad de operación — 2026-10-05

Bodega y reportes de faltantes por cliente/proveedor ahora filtran ruta/ciclo,
con semana, orden de preparación, Maps fijo y procedencia sumable en Excel.
[Entrega y pendientes](operacion-ciclos-2026-10-05.md): 2.011 pruebas aprobadas,
44 listos/55 pendientes en operativo; independencia conserva 133/14. Órdenes
persistentes/cobertura siguen pendientes; consulta filtrada no reutiliza
borrador global ni su marca de enviado. Solo local, sin cambios de producción.
