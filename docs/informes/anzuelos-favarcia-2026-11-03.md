# Anzuelos de Favarcia — relevo del 2026-11-03

El usuario pide ordenar el catálogo por familias a partir del catálogo de su
proveedor Favarcia. Decide trabajar primero en una copia actual de producción;
elige vender los anzuelos por caja, corregir relaciones que mezclaban códigos,
conservar los productos ligados al proveedor y usar margen del 30 % sobre el
precio. Nombres en MAYÚSCULAS sin tildes, conservando Ñ y medidas.

Después de revisar el resultado local, autoriza: «perfecto, subamos todo a
prod» (2026-11-03). Claude publica el ajuste de nombres de Gestión de Catálogo
053fb2e y aplica el plan revisado en producción. Codex recibe el relevo cuando
faltan las fotografías; no se vuelve a ejecutar el lote de datos.

## Datos ya aplicados y verificados

Se compara por lectura READ ONLY el estado actual con el cierre respaldado
de Claude: 29 fichas del lote, 26 relaciones proveedor/código y ninguna
diferencia en nombres, referencias, costos, precios, subcategorías y factores.
De las 29 fichas, 26 están activas y 3 dadas de baja (103, 107 y 370).
El producto nuevo es 4366, «ANZUELO TRIPLE 4 ESTAÑADO P/MAR 3551DS 50 PZAS».
Las 25 activas con costo tienen margen entre 30 % y 30,56 %, por los escalones
de redondeo ya revisados con el usuario. No se recalculan ni vuelven a guardar.

La baja de 103 y conservación de 106 se explicaron al usuario antes de su
aprobación final: 106 sí tiene Favarcia y 103 carecía de relación. Se conserva
ese resultado aprobado. Las excepciones pendientes de información son:

- 376, Mustad No.16, sin costo: no calcular precio hasta tener el dato real.
- 377, Mustad No.4, costo provisional del No.5: falta una factura propia.

## Fotografías pendientes

26 PNG recortados del catálogo original, cada uno menor de 2 MiB. Se preservan
los bytes originales, sin volver a generar o retocar las imágenes. El archivo
`fotos-pendientes.json` conserva qué código corresponde a cada ID propio,
incluido 4366. El servicio existente de carga valida los bytes, escribe en
el disco de Render y registra la sustitución en bitácora.

La API de producción rechaza con TOKEN_INVALIDO la sesión firmada con el
secreto local. No hay sesión de navegador conectada disponible en Codex.
Se abre una ventana propia de Chrome for Testing en el inicio de sesión real
para que el usuario se autentique. La contraseña no se lee desde el formulario
ni se pide por chat. La sesión que devuelve el login se usa en memoria para
completar exclusivamente las 26 fotos autorizadas; no se guarda en archivos.

La operación preparada primero respalda las fichas y los archivos anteriores,
valida que nombre/foto sigan iguales a la revisión y sube cada imagen por
`POST /maestro/productos/:id/imagen/archivo`. Después verifica el GET público,
los bytes por SHA-256 y que los demás campos de cada producto se conserven.
Guarda progreso por producto para evitar repetir una sustitución ya confirmada.
Cualquier fallo se detiene y requiere revisar el estado antes de reanudar.

**Cierre confirmado — 2026-11-03 15:50:49 CR:** el usuario inicia sesión y Codex completa
las 26 fotografías por la API normal. Cada descarga pública devuelve 200 y
su SHA-256 coincide con el PNG de origen. Los demás campos de cada ficha se
conservan, incluidos precios, costos, nombres, estado y referencias.

Una conexión nueva y de solo lectura confirma las 26 rutas y las 26 entradas
de bitácora con motivo foto y la cuenta administradora autenticada (ID 4).
El respaldo conserva las 24 imágenes anteriores y las fichas anteriores;
dos productos carecían de foto. Para revertir una sustitución se sube su
archivo respaldado por la misma API; no se guarda una ruta a un archivo que
el servicio ya eliminó. Una descarga de los originales no altera productos.

Verificación de las fotos públicas en Chromium y WebKit a 390 y 1280 px:
26 imágenes decodifican en cada uno de los cuatro recorridos (104 lecturas),
sin desborde. Evidencia visual revisada con los nombres y medidas del lote.
La ventana y la sesión temporal propias se cierran al terminar; no se
conservan tokens ni contraseñas. El lote de datos de Claude no se repitió.

## Respaldo y evidencia

Fuera de Git, sin credenciales:

- `~/.local/share/sistema-facturas-cr/respaldos/20261103-produccion-anzuelos-favarcia/`:
  antes/después del lote aplicado por Claude y lista de fotos pendientes.
- `~/.local/share/sistema-facturas-cr/codex-relevo-favarcia-20261103/`:
  auditoría de solo lectura, copias de las 26 fuentes, hashes y ejecución del
  cierre de fotos. Resultados reales: fotos-resultado.json, verificacion-final.json y
  fotos-navegador.json; respaldo-fotos/ conserva las sustituciones.

El maestro de producto, los documentos y sus relaciones se siguen leyendo
por ID propio. No se ejecutan nuevas migraciones, limpieza semanal ni envíos
de mensajes para esta continuación.


## Presentación añadida después: código 7413455

El usuario aporta la foto del triple Mustad 3/0, serie 9430DS 5X, caja de 25,
y pide agregarlo; si no se encuentra costo, se le informa junto con los
anteriores para consultarlo al proveedor. La búsqueda exacta de código y
por variantes de medida/nombre no encuentra producto, relación ni factura
del buzón. Tampoco existe en compra_linea, incluidas compras registradas
sin factura electrónica. El catálogo aportado no contiene precios.

Codex crea la ficha 4367 «ANZUELO TRIPLE 3/0 ESTAÑADO 9430DS 5X 25 PZAS»
con referencia 7413455, categoría/subcategoría e impuesto de la misma familia.
Se vincula a Favarcia por cédula 3101008166 y código 7413455; la unidad propia
es una caja de 25 y el factor se deja en 1/25, como en las presentaciones del
lote. No se mueve una relación existente ni se reutiliza el costo de otra medida.

El costo y el precio están pendientes; el esquema usa 0 como ausencia de costo
al crear. La ficha queda inactiva para impedir una venta sin precio. La
descripción deja constancia de la consulta pendiente y la meta del 30 %, que
solo se calculará cuando llegue un costo confirmado. No se crean compras,
pagos, ventas, historial de costo ni movimientos de inventario por darla de alta.

El alta compone los servicios existentes de producto, estado, subcategoría
y mapeo, con SAVEPOINT dentro de una transacción única. Se respalda antes de
escribir y se comparan las huellas de nueve tablas: producto/mapeos anteriores
y datos de compras/ventas/pagos/inventario quedan iguales. Ensayo local con
ROLLBACK correcto y 48 pruebas de los servicios implicados pasan; no hay nuevo
código de aplicación ni migraciones. Una conexión nueva READ ONLY confirma
una sola ficha y relación del código, inactiva, sin documentos ni costo inventado.

**Foto confirmada — 2026-11-03 16:26:05 CR:** el usuario inicia sesión y la API vincula
el PNG original de 7413455 a la ficha 4367. Su descarga pública devuelve 200
y SHA-256 idéntico a la fuente. El alta queda completa; solo falta confirmar
costo y precio para habilitar la venta.
El perfil privado del navegador conserva la sesión normal que el usuario
inicie, para poder trabajar las siguientes fichas sin pedir un login por
cada producto; el guion no exporta JWT/contraseñas a registros de operación.

### Costos que debe confirmar Favarcia

| Código Favarcia | Presentación | Situación |
| --- | --- | --- |
| 7413455 | Triple 3/0, 9430DS 5X, caja de 25 | No existe costo propio registrado; ficha 4367 pendiente. |
| 7413180 | Mustad No.16, 2330DT, caja de 100 | Ficha 376 sin costo confirmado. |
| 7413120 | Mustad No.4, 2330DT, caja de 100 | Ficha 377 tiene costo provisional del No.5; falta el suyo. |

Pedir costo por caja y confirmar si incluye IVA. La confirmación puede ser
una cotización del proveedor: no se requiere inventar una compra para fijarlo.
Respaldo del alta: `~/.local/share/sistema-facturas-cr/respaldos/20261103-alta-anzuelo-7413455-codex/`.
Búsquedas, plan, fuente, ensayo y verificaciones:
`~/.local/share/sistema-facturas-cr/codex-anzuelo-7413455-20261103/`.

## Marcas de anzuelos por serie — 2026-11-03

El usuario limita expresamente la reorganización de marcas a **Anzuelos**;
el resto del catálogo queda conservado. Las agrupaciones anteriores mezclaban
la serie 2330DT con una supuesta «serie E» y dejaban casi todos los triples
sueltos. Se reutilizan los servicios de marcas y sus portadas, sin cambiar
código de aplicación ni necesitar una migración.

| Marca | ID | Presentaciones | Visibles |
| --- | --- | --- | --- |
| Mustad · Anzuelos 2330DT | 105 | 13 | 13 |
| Mustad · Triples 7794DS 3X | 104 | 4 | 4 |
| Mustad · Triples 9430DS 5X | 117 | 7 | 6 |
| Mustad · Triples 3551DS para mar | 118 | 2 | 2 |

Se retira solo la marca106; sus cuatro medidas activas pasan a2330DT y su
ficha antigua inactiva370 queda suelta. Los antiguos103/107 sin modelo
confirmado también quedan sueltos e inactivos. El35647RB111, una presentación
distinta, conserva su tarjeta individual. No se borran productos. La nueva
ficha4367 pertenece a9430DS, conservando su estado inactivo y costo/precio
pendientes. En total, ambos catálogos muestran26anzuelos activos:25en estas
cuatro marcas y el35647RBindividual.

**Aplicación real:** Codex, 2026-11-03 16:41:54 CR, una transacción que compone
`marcas.guardar/eliminar` mediante el ayudante existente de SAVEPOINTs.
19productos cambian de agrupación; el resto de sus campos, las marcas y
productos fuera de Anzuelos y las huellas de ocho tablas de relaciones,
documentos, pagos e inventario se conservan. Primero se ensaya en un clon
desechable con ROLLBACK. Una conexión nueva READ ONLY confirma el resultado.

Cuatro portadas ilustrativas creadas con la herramienta integrada `image_gen`
(habilidad `imagegen`), usando fotos de los respectivos modelos como referencia.
Fondo uniforme, sin rótulos, medidas, cuadrículas ni márgenes añadidos. El
anzuelo2330DT va vertical para conservarlo entero junto a sus13filas.
Las imágenes individuales del proveedor permanecen intactas en la vista previa.
La API de marcas optimiza las portadas a WebP de667×1000px:19.662,26.142,
35.030y38.462bytes;119.296bytes en total. GET200 y hashes de descarga registrados.
Se utiliza la sesión normal del administrador; no se exportan credenciales.

Los cuatro PNG finales y los prompts exactos se conservan en la carpeta
ignorada `backend/scripts/salida/portadas-anzuelos-20261103/` del worktree
de Codex; `archivos.json` relaciona cada archivo, modelo, huella y prompt.
Los archivos publicados viven en el almacenamiento propio bajo `/archivos/marcas/`.

Verificación:33pruebas dirigidas de marcas, PostgreSQL, disco, ambos DTO y
agrupación, sin omisiones ni fallos. Lecturas públicas reales confirman26ids
en cada catálogo, las cuatro marcas con imagen y la exclusión del4367inactivo.
El respaldo anterior y el resultado de la transacción están en
`~/.local/share/sistema-facturas-cr/respaldos/20261103-marcas-anzuelos-codex/`;
plan, portadas, búsquedas y verificaciones en
`~/.local/share/sistema-facturas-cr/codex-marcas-ordenadas-20261103/`.
Los tres costos de la sección anterior siguen pendientes del proveedor.

En el recorrido aparece una diferencia de formato que impedía el orden
numérico:«NO.10» frente a«NO. 4». Se uniforma solo el espacio tras«NO.» en
siete nombres de2330DT usando el corrector existente, con plan previo,
respaldo, bloqueo y bitácora. No cambia medidas, referencias ni documentos.
Ensayo local con ROLLBACK e idempotencia correctos; sus7pruebas PostgreSQL
pasan, además de las33anteriores. Otra conexión READ ONLY confirma los
siete nombres esperados y conserva los demás campos del catálogo.

Recorrido visual:36comprobaciones de portadas a390/768/1280px:agente y portal
en Chromium, portal en WebKit. Sin imágenes rotas, desbordamientos ni erroresJS;
2330DT muestra4…16 y la vista previa conserva la foto individual. El portal
usa su búsqueda real; el navegador temporal del agente recibe solo los26DTO
reales ya comprobados, para evitar descargar miles de fotos ajenas al alcance.
Las solicitudes de escritura están bloqueadas en ese navegador; no hay
pedidos, mensajes ni movimientos de prueba. Grafo/estructura:23correctas.
El clon desechable se elimina después de las comprobaciones.
