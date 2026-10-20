---
id: modulo/faltantes
tipo: modulo
titulo: Faltantes — del despacho a la reimpresión, sobre la factura y el producto propios
estado: vigente
archivos:
  - docs/informes/proveedores-correccion-2026-10-14.md
  - backend/tests/proveedoresCritico.test.js
  - backend/src/modules/reports/faltantesCompra.sql.js
  - backend/tests/ordenesAutomaticas.test.js
  - backend/src/modules/orders-whatsapp/ordenesAutomaticas.service.js
  - backend/src/modules/rutas/operacionCiclo.service.js
  - backend/tests/operacionCiclos.test.js
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/ContextoCicloDocumento.jsx
  - frontend/src/hooks/useFiltroCicloOperacion.js
  - backend/migrations/independencia/032_faltantes_con_ids_propios.sql
  - backend/migrations/independencia/033_faltante_cantidad_rebajada.sql
  - backend/src/utils/guardarFaltantes.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/reports/notasDeFaltantes.js
  - backend/src/modules/reprinting/colaImpresion.js
  - backend/src/modules/reprinting/procesarImpresion.js
  - backend/src/modules/missing-items/missing-items.service.js
  - backend/src/modules/missing-items/ajusteEntrega.js
  - backend/src/modules/missing-items/missing-items.controller.js
  - backend/services/proveedorAsignacionService.js
  - backend/src/modules/proveedores/proveedores.asignacion.service.js
  - backend/src/modules/orders-whatsapp/orders-whatsapp.service.js
  - backend/tests/proveedorDeFaltantesPropio.test.js
  - backend/services/scheduledCleanup.js
  - frontend/src/hooks/useReporteClientes.js
  - frontend/src/hooks/useReporteProveedores.js
  - frontend/src/hooks/useImpresion.js
  - frontend/src/utils/reporteClientesUtils.js
  - frontend/src/utils/impresionUtils.js
  - frontend/src/services/colaImpresionService.js
  - backend/tests/faltantesIdsPropios.test.js
  - backend/tests/notasDeFaltantes.test.js
  - backend/tests/fechaCalendarioReportes.test.js
  - backend/tests/impresionPropia.test.js
  - backend/tests/impresionPropiaLocal.test.js
  - backend/tests/impresionHook.test.js
  - backend/tests/impresionEmitir.test.js
  - frontend/src/components/impresion/EmitirEImprimir.jsx
  - frontend/src/components/impresion/ListaFacturasPendientes.jsx
  - backend/tests/ajustesFaltantesImpresion.test.js
  - backend/tests/reporteClientesGuardado.test.js
  - docs/informes/auditoria-impresion-2026-10-11.md
  - docs/informes/impresion-pedido-exacto-2026-10-08.md
  - backend/tests/horaEnvioImpresion.test.js
  - backend/tests/reporteClientesFiltros.test.js
  - frontend/src/components/reporte-clientes/ListaClientes.jsx
  - frontend/src/components/reporte-proveedores/ListaProveedores.jsx
  - frontend/src/components/reporte-proveedores/ProveedorDetalle.jsx
  - frontend/src/components/reporte-proveedores/ModalAsignarProveedor.jsx
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping]
  relacionado: [modulo/reporte-proveedores, modulo/contexto-visible-operacion, modulo/necesidades-por-ciclo, modulo/archivo-ordenes-compra, modulo/ordenes-compra-por-ciclo, modulo/facturas-bodega, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, leccion/proveedor-por-cedula, modulo/exportaciones-reportes, modulo/demo-reporte-proveedores, modulo/hacienda]
medido: 2026-10-20
---

**2026-10-14, compra actual y procedencia exacta:** Reporte Proveedores y sus
notas comparten faltantesCompra.sql: pendiente, factura emitida sin crédito
total, producto presente, sin respuesta revisada ni cola pendiente. No leer
procesados como demanda nueva. Restar solo cobertura ya enviada/intentada;
conservar snapshots enviados aparte. Notas incluyen facturaId/clienteId de
cada origen; frontend filtra las facturas actuales de ese proveedor.
Bodega valida pertenencia y cantidad contra factura_linea antes de guardar;
un producto ajeno o cantidad mayor revierte el despacho completo.
[Evidencia](../../informes/proveedores-correccion-2026-10-14.md).


**2026-10-13, simplificación de proveedores:** el usuario retira las áreas y
paneles de ciclos/necesidades/factura/recepción/cierre de Reporte Proveedores.
Solo Faltantes y fichas; órdenes se revisan dentro del proveedor, acumulando sin
semanas. El detalle técnico/histórico de este nodo y sus APIs/documentos siguen
conservados. Presentación vigente: [[modulo/reporte-proveedores]].


EL RECORRIDO. Bodega despacha una factura y marca lo que faltó → el Reporte
de Proveedores junta lo que hay que comprar, por proveedor → el Reporte de
Clientes registra qué llegó después y da la factura por lista → Impresión
ajusta la factura y la reimprime.

ROT-03, 2026-10-13: [[modulo/reporte-clientes]] filtra por ruta actual de
la ficha, ordena por próxima visita y agrupa por id propio. Consultarlo deja
de asignar proveedores: esa escritura ocurre en Bodega o por asignación
explícita. Los párrafos de ciclos describen la historia y el reporte del
proveedor; no se usan para seleccionar clientes. Ajustes/cola conservados.

SOBRE LO PROPIO (2026-09-30, sección 11 del checklist, pasos 2 y 3). Cada
faltante cuelga de `factura.id` y de `producto.id`
(`faltantes.factura_propia_id`, `faltantes.producto_propio_id`), y la cola
de impresión de `factura.id` (`facturas_reimpresion.factura_propia_id`) —
migración 032. Antes colgaban de las tablas viejas `facturas` y `productos`,
que se llenaban desde Alegra: una factura hecha en el sistema no tenía cómo
tener faltantes.

LAS COLUMNAS VIEJAS SE RENOMBRARON, NO SE REUSARON: `factura_vieja_id`,
`producto_viejo_id`. Reusar `factura_id` para el id propio era la trampa de
siempre ([[leccion/ids-propios-y-de-alegra-no-se-mezclan]]): los dos son
seriales, y código traído de developer que escribiera ahí el id de la tabla
vieja colgaría el faltante de OTRA factura sin error. Con el nombre cambiado
falla en voz alta. Por la misma razón se borró `POST /alegra/facturas/:id/faltantes`
(registraba por id de Alegra y le pasaba el id viejo a la función que ahora
espera el propio) y el módulo `faltantes` (`/api/faltantes` de alta y
consulta), que nadie llamaba.

EL PRODUCTO DE UN FALTANTE (`guardarFaltantes` → `productoPropioDe`): el
`producto_id` que manda Bodega; si no viene, el id de Alegra (único en
`producto`); y por referencia solo si calza con UN producto — hay 4
referencias repetidas en el maestro.

LAS NOTAS ("lo que pidió el cliente", en el Reporte de Proveedores) salen de
`factura_linea.descripcion` de la misma línea del faltante, con una consulta.
Antes se recorría la lista de facturas de Alegra (~5 s por página). Una línea
sin nota trae la descripción del producto (Facturación la pone): esa no cuenta.
Van indexadas por `producto_id`, el mismo de cada línea del reporte.

EL PROVEEDOR del faltante se asigna solo con el mapeo, buscado por el
`producto_id` propio (los mapeos lo llevan desde la 018) y por referencia
solo como segundo intento para fichas duplicadas; ver el cierre de §13 abajo.
Las descargas Excel reutilizan las lecturas con `asignarProveedores: false`:
no asignan ni guardan al descargar. Ver [[modulo/exportaciones-reportes]].

DAR POR LISTA (Reporte de Clientes → Impresión,
`POST /reportes/faltantes/cliente/facturas/:facturaId/impresion`): los
ajustes se arman en el servidor con lo que la pantalla fue guardando
producto por producto (`faltantes_ajustes`), no con lo que mande la
pantalla. Desde la auditoría del 2026-10-11, un envío nuevo exige una respuesta
coherente y `revisado = true` persistido para cada faltante. La cola reusa la
fila de la factura: hay una por factura.

GUARDADOS Y ENVÍO COORDINADOS (auditoría tras el corte, 2026-10-11). Antes,
guardar/borrar un ajuste no bloqueaba la factura ni comprobaba si estaba en
Impresión; encolar tampoco exigía la revisión en la base. Un POST atrasado
podía cambiar una entrega ya enviada, o Impresión podía recibir la respuesta
anterior mientras se guardaba la confirmación. Guardar/borrar toma primero
el bloqueo de factura y después el de faltante, en la misma transacción, y
rechaza facturas anuladas, faltantes procesados o una cola pendiente (409).
Recuperar desde Reporte de Clientes habilita de nuevo sus ajustes.

La entrega es un entero entre 0 y el faltante: `no_llego` es 0, `completo`
es toda esa cantidad, y `parcial` queda entre ambos. El servidor deriva
`requiere_actualizacion` de la cantidad, y una respuesta cambiada sin bandera
de revisión pierde su confirmación anterior. Encolar comprueba también los
ajustes antiguos, bajo el mismo bloqueo, antes de escribir la cola. Las colas
ya existentes conservan su procesamiento; no hay migración ni corrección
automática de documentos emitidos.

En la pantalla, los guardados y borrados de un mismo faltante se ejecutan en
orden. Enviar espera las respuestas pendientes y comprueba la revisión
persistida antes y después del diálogo. El rollback vuelve solo la línea que
falló al último valor confirmado, sin borrar éxitos de otras líneas ni pisar
una intención más nueva. La revisión masiva conserva cada éxito. Una respuesta
de otra selección no modifica la vista actual ni envía sus peticiones en espera.
Las pruebas nuevas reproducen estos cruces con PostgreSQL desechable y los
manejadores reales del hook con promesas controladas; ver el informe del día.

RECUPERAR desde el Reporte de Clientes (`.../recuperar`): si todavía no se
imprimió, la factura SALE de la cola; si ya se procesó, sus faltantes vuelven
a pendientes y la fila queda como historial de Impresión. Con el camino
viejo, recuperar una factura en cola no tocaba el servidor: al recargar
volvía bloqueada "en impresión", e Impresión la habría procesado con los
ajustes de antes.

PROCESADA es lo que Impresión ya reimprimió: al procesarla sus faltantes
pasan a 'procesado' (y al recuperarla vuelven); el reporte lo lee de ahí.
"En impresión" es la fila pendiente de la cola. Una factura anulada sale de
los dos reportes y de las notas (`factura.estado <> 'anulada'`; la columna es
NOT NULL, así que `<>` no pierde filas).

LAS FECHAS de la factura propia son de calendario y viajan como 'YYYY-MM-DD'.
`new Date('2026-09-10')` es medianoche UTC, el 9 en Costa Rica: los
formateadores de Reporte de Clientes e Impresión las leen como día local
(pasó en la primera vuelta en el navegador).

LAS HORAS (cuándo se mandó a Impresión, cuándo se procesó, cuándo despachó
Bodega, cuándo se registró el faltante) se escriben con `AHORA_CR_SQL`, nunca
con `CURRENT_TIMESTAMP`: son columnas sin zona horaria y el pooler de
producción deja 1 de cada 5 consultas en UTC
([[leccion/fecha-utc-costa-rica]]). La nota "🖨️ En impresión — hora" del
Reporte de Clientes muestra la hora del envío guardada en la cola, no la de
cargar la pantalla.

LA LISTA DE CLIENTES del reporte busca también por producto (nombre o
código; cada tarjeta dice cuánto le falta) y sus filtros viven en la página,
para que no se pierdan al entrar a un cliente y volver. Dentro del pedido el
color queda solo en el botón de la respuesta elegida y en la barra de
progreso (vino de `developer`, 2026-10-03).

LIMPIEZA SEMANAL RETIRADA (050). La implementación anterior borraba faltantes,
ajustes, notas de bodega y reiniciaba envíos. Ya no existe ese SQL/cron/botón;
las rutas antiguas solo rechazan 410. Nunca ejecutarla desde otra rama/copia
ni restaurar los tests anteriores. Archivo por recepción conserva los registros.
Ver [[modulo/archivo-ordenes-compra]].

IMPRESIÓN (`procesarImpresion.js`, todo bajo `/reimpresion`, que es del
módulo Impresión: `/facturacion` es de otro y su permiso no alcanzaría).
Procesar una factura de la cola le rebaja lo que no llegó, le pone los
precios del catálogo (`producto.precio_sin_iva`, sin IVA como la línea) y la
marca impresa, en UNA transacción, con la misma edición de Facturación
(`editarFacturaEn`). Las que Bodega despachó completas ('sin_pendientes')
solo se marcan: la factura no se toca. La pantalla de edición recibe la
propuesta ya armada por el servidor; lo que se guarda es lo que la persona
deja. El PDF es el mismo de Facturación, servido por la ruta de Impresión.

ADAPTACIÓN DE LA CORRECCIÓN DE MAIN (2026-10-08). Un pedido de 6 con 3
faltantes confirmados como "no llegó" queda en 3; no se elimina toda la línea.
Se conserva el motor propio: ids `factura.id`/`producto.id`, `cantidad_rebajada`,
edición e inventario en la misma transacción y restricciones fiscales/cobros.
No se incorpora el servicio que escribe en Alegra ni sus snapshots.

La pantalla manda `precioEditado`: al escribir un precio se marca manual y
se respeta; si es automático se relee `producto.precio_sin_iva` al guardar,
porque puede cambiar mientras la propuesta está abierta. La regla propia
mantiene el precio de factura si el catálogo vale 0 y las `sin_pendientes`
conservan sus precios. Los clientes anteriores, sin bandera, conservan el
precio enviado. La respuesta tardía de otra factura ya no pisa la edición
actual. Quitar el último producto conserva el formulario vacío y bloquea
guardar; no vuelve a procesar la propuesta original. Recuperar, desde
Impresión o Reporte de Clientes, toma primero el mismo bloqueo de factura
que procesar para coordinar factura, faltantes y cola.

`impresionPropiaLocal.test.js` ejecuta propuesta y payload reales con edición
e inventario propios sobre una copia local `tachi_codex_*`, con fixtures ZZ
y BEGIN/ROLLBACK: 6−3, precio cambiado entre abrir/guardar, manual, recuperación,
fallo al finalizar, vacío, protección electrónica y `sin_pendientes`.
`impresionHook.test.js` controla las respuestas del servicio propio y verifica
los manejadores del formulario, sin llamadas externas ni impresora física.

UN FALTANTE SE REBAJA UNA SOLA VEZ (migración 033): cada faltante recuerda
cuánto se le quitó ya a la factura (`cantidad_rebajada`) y procesar aplica la
diferencia. Antes —también con Alegra— se calculaba sobre la cantidad de hoy:
una factura recuperada y vuelta a procesar se rebajaba dos veces. Si después
llegó más, se le devuelve a la línea (o la línea vuelve, con el precio del
catálogo). Una cola histórica sin respuesta conserva la rebaja completa;
los envíos nuevos exigen confirmar explícitamente qué llegó.

UNA FACTURA CON COBROS NO SE EDITA: Impresión lo dice ("hay que revertir el
cobro antes de editarla") y la deja en la cola. Medido en el historial: en
222 de 240 facturas procesadas en 60 días el cobro llegó DESPUÉS de imprimir;
solo 18 lo tenían antes (6 con ajustes).

EL TOTAL de la pantalla de edición se calcula como el servidor: con la tarifa
de cada línea y su descuento. Antes sumaba sin impuesto y lo comparaba con el
total con impuesto: "contra el original" salía siempre negativo.

SIN PUENTE (2026-09-30). Nada escribe ya en la tabla vieja `facturas` por
estos flujos: la factura propia no se copia, Bodega no la espeja, y el
portal y el tablero leen el alistado de `factura`. Se retiró el camino viejo
por id de Alegra (procesar, recuperar, listas de la cola, la Bodega que leía
de Alegra) con sus rutas y sus pruebas. La columna `facturas.factura_propia_id`
queda —la usa la 032 al correr en el corte— pero nadie la lee ni la escribe.

UNA PRUEBA BARRE TODO EL SQL del servidor buscando `<alias>.factura_id` o
`.producto_id` sobre `faltantes`/`facturas_reimpresion`
(faltantesIdsPropios.test.js): dos así se escaparon al primer barrido, en una
ruta que ninguna pantalla llamaba.

A QUIÉN SE LE PIDE CADA FALTANTE (2026-10-03, todo por ids propios)

- **Automático**, al abrir el Reporte de Proveedores
  (`proveedorAsignacionService.js`): los mapeos del producto por
  `supplier_product_mapping.producto_id`, y de esos el más barato. Se quitó el
  camino por el id de Alegra (medido: ningún producto activo llegaba a un
  mapeo solo por ahí). La referencia quedó SOLO como segundo intento, cuando
  el producto no tiene mapeo propio: sirve a 4 fichas duplicadas cuyo mapeo
  está en la gemela. Antes los tres caminos se sumaban siempre, y el mapeo de
  otra ficha con la misma referencia entraba a competir por precio.
- **A mano** (`POST /proveedores/asignaciones`, `{ productoId, proveedorId }`):
  la ficha propia del proveedor y el producto propio. Marca los faltantes
  PENDIENTES de ese producto. Lo que había antes (`/alegra/faltantes/…`) le
  preguntaba el contacto a Alegra en vivo, lo buscaba por nombre en la tabla
  vieja `proveedores` y resolvía el producto contra `alegra_products_cache`.
- **La pantalla** busca y crea proveedores en `/proveedores/fichas` y busca
  productos para agregar al pedido en `/catalogos/productos`. Las dos
  búsquedas iban a Alegra en vivo.
- **El pedido por WhatsApp** (`orders-whatsapp`) busca cómo le llama el
  proveedor al producto por `producto_id`.

Resuelto en Relacionar Productos (§8, 2026-10-04): el mapeo de un producto
sin ficha en Alegra guarda `alegra_item_id=''` (conserva NOT NULL para el
cliente Prisma compartido) y se identifica por `producto_id`; el buzón
también relaciona por el producto propio.
Las rutas de los reportes y del pedido tienen su propia dirección desde el
2026-10-04 (`/reportes`, `/faltantes`, `/orden-compra`); el prefijo `/alegra`
y su enrutador adaptador se retiraron.

EL WHATSAPP DEL PROVEEDOR ES EL DE SU FICHA (2026-10-04). La orden de compra
lo lee y lo guarda en `proveedor.telefono_whatsapp`
(`orders-whatsapp.service.js`: `fichaDelProveedor`, `getProveedorContacto`,
`guardarProveedorContacto`; rutas `GET`/`PUT /orden-compra/proveedor-contacto`
con `cedula` y `nombre`). Se llega a la ficha por CÉDULA; por nombre solo si
la orden no la trae y hay una única ficha con ese nombre — el mismo proveedor
aparece con dos grafías y elegir entre dos fichas sería adivinar a quién se
le escribe. Guardar pasa por `editarFicha`: misma validación, mismo formato
("8888 2222"; al mandar se le pone el 506) y bitácora; el mismo número
escrito de otra forma no cuenta como cambio. Antes iba a `proveedor_contactos`,
llaveada por nombre, y la ficha no se usaba; además la pantalla leía el
número donde el servidor no lo pone y terminaba mostrando el que recordaba
cada navegador (`localStorage`, que queda solo como último recurso cuando la
ficha no tiene número). Prueba: `ordenCompraTelefonoDeLaFicha.test.js`.

DEMOSTRACIÓN RETIRADA (pedido del usuario, 2026-10-04). Tras recorrer el
reporte, pidió eliminar el conjunto `ZZ-DEMO`: retirados sus dos proveedores,
cinco productos, faltantes, borradores y su fila de Impresión por ids del
manifiesto. Cero restos y nueve tablas anteriores iguales; no se ejecutó
limpieza semanal. Evidencia en [[modulo/demo-reporte-proveedores]].

## Operación por ciclos — 2026-10-05

Bodega/reportes/notas/Excel leen JOIN_CICLO de la factura, nunca ruta actual
del cliente. Filtros rutaId/cicloId estrictos y Sin ciclo; incompatibles
producen vacío, inválidos 400. Recorrido/Maps fijo, semana/orden/anticipado
en documentos. Selector propio por permiso del módulo; solo metadatos,
sin exponer paradas/Maps/saldos en esa consulta. Listas de reportes y notas
ahora tienen dueño específico en usuarios/modulos: llevan contexto privado.
Bodega de un ámbito explícito no se recorta a ventana/límite del conjunto.
Filtros también protegen la lista cacheada en el teléfono; drafts conservados.
Proveedor agrega origen por faltante con cantidad, factura/cliente/parada y
ciclo; notas/exportación mismo ámbito. Agrupación distingue proveedores de
un producto; Excel añade Procedencia y conserva lectura sin asignar.
Consulta filtrada no reutiliza borrador/envío GLOBAL por proveedor: borradores
persistentes y reservas implementados en [[modulo/ordenes-compra-por-ciclo]];
047 añade envío inmutable y cobertura solicitada: se descuenta por origen
una vez, aun antes de recibir stock. El intento incierto mantiene cobertura
bloqueada sin afirmar envío confirmado. En la revisión de orden se distingue
apartado sin confirmación, solicitado y libre; la línea enviada muestra todo
lo pendiente del proveedor. Excedentes de empaque no cubren otra semana.
Recepción física/cobertura parcial siguen pendientes; pedidos sin facturar
tampoco se alistan todavía.
Limpieza semanal aún pendiente por código: lanzador seguro y nunca probarla.
Relevo/evidencia en docs/informes/operacion-ciclos-2026-10-05.md.

Integrado localmente en 8e656fa: 2.011 pruebas aprobadas, grafo 12, build y
Chromium 1440/390 (tres módulos y dos Excel). Compartida solo GET, 16 huellas
del inicio y 19 de la integración iguales; inventario cero/históricos
conservados. Reserva propia se retira al cerrar; no nueva migración,
próxima 046 en esa entrega. Operativo 44/55 en esa entrega. Continúa ahora la
046 con borradores por ciclo, ver nuevo módulo e informe de órdenes.

RETIRO SEMANAL (050). Compatibilidad scheduledCleanup no carga cron/DB;
arranque no la programa. API global de faltantes/cantidades rechaza 410 sin
consultar; no borrar ajustes/notas/asignaciones ni reiniciar envíos. Configuración
explica el archivo por recepción, sin botón. [[modulo/archivo-ordenes-compra]]
conserva historia y cobertura; faltantes mantienen su propio flujo explícito.

Vista operativa de stock/demanda/faltantes/compras: [[modulo/necesidades-por-ciclo]],
consulta por semana y producto con procedencia. No reservar/descontar stock
otra vez ni considerar borrador/incierto como solicitado confirmado. Consulta
nueva no asigna proveedores; no llamar reporte legado de fondo. Evidencia y
estado vigente en informe necesidades-cobertura-2026-10-06.

## Contexto visible y lecturas — 2026-10-06

Revisión vigente en [[modulo/contexto-visible-operacion]]: selección clara,
respuestas tardías descartadas, notas por semana y contexto original en la
ficha. Los párrafos anteriores son avances históricos, incluidos sus pendientes.
RUT-08/FIL-11 y validación integral se conservan abiertos; no cerrar por probar
una sola consulta, exportación o cambio de maestro. No hay nueva SQL.


## Asignación explícita en un ciclo — 2026-10-07

Abrir los reportes de clientes/proveedores con ruta, semana o Sin ciclo ya
no asigna proveedores automáticamente. El navegador detectó que los GET
conservaban el valor por omisión del reporte global; los tests anteriores
pasaban `asignarProveedores:false` y no ejercitaban ese camino real.
La exportación conserva su lectura sin escrituras.

Faltantes por ciclo permite seleccionar productos y asignar una ficha desde
la misma pantalla. POST /proveedores/asignaciones recibe `cicloId` opcional:
con ciclo positivo afecta solo sus faltantes pendientes; Sin ciclo solo los
históricos. Vacío explícito/inválido devuelve 400, inexistente 404; omitirlo
conserva el contrato global anterior. No modifica mapeos maestros, órdenes
emitidas, cantidades ni stock. El cambio de selección cierra el modal.
Las tarjetas de proveedor son botones accesibles; búsqueda cabe en celular.
Ver [[modulo/recorrido-visual-operativo]] y las seis regresiones PostgreSQL.


## Presentación vigente — 2026-10-07

Faltantes en [[modulo/reporte-proveedores]] usa tarjetas de proveedor/producto,
búsqueda/fecha juntas y resumen explícito del reporte completo de la selección.
Consulta general conserva edición/selección/procedencia con controles móviles;
preparación de orden sigue por semana o Sin ciclo. Área inactiva/error no se
interpretan como proveedor desaparecido. Pruebas visuales interceptan incluso
el GET general que puede asignar proveedores; no se insertan demos en la base.

## Preparación automática de compras — 2026-10-13

Bodega transmite solo el incremento nuevo a compras dentro de su transacción;
la asignación manual prepara la necesidad libre del proveedor. Precio/asignación
automática admite la conexión recibida y lee el buzón por SQL en ella: una
conexión Prisma separada no ve un faltante sin COMMIT. Las consultas filtradas
siguen sin asignar/preparar. Guardar de nuevo no repone exclusiones manuales.
Órdenes enviadas e inciertas preservan cantidades, PDF y cobertura. Las nuevas
necesidades usan un borrador independiente. Ver [[modulo/ordenes-compra-por-ciclo]].


2026-10-15 — El archivo visual de [[modulo/reporte-clientes]] separa cada factura
tras 24 h sin movimientos desde el envío a Impresión. No modifica faltantes,
ajustes ni la cola, y no ejecuta limpieza semanal. Recuperar reabre el trabajo;
un procesado recuperado no se archiva otra vez hasta reenviarse. Fechas de
historial normalizadas por zona CR y consulta/exportación sin escritura.

## «Imprimir y emitir» — 2026-10-20

El usuario: «hay facturas que siempre se emiten, pero se emiten hasta después
del proceso de impresión; que todas las facturas que tienen correo en
impresión salga el botón imprimir y emitir; eso sí, que el proceso de
rebajas y ajustes de precios se haga primero y después se emita».

- **A quién**: `seEmiteAlImprimir` (utils/impresionUtils.js) — la factura
  tiene correo y no es electrónica, no tiene un comprobante en curso
  (`hacienda_comprobante_id`) ni es histórica de Alegra. La cola trae esos
  tres datos (`aFilaDeCola`). Y quien mira tiene que tener Facturación:
  emitir usa `/api/facturacion/hacienda`, que es de ese módulo (al
  2026-10-20 todos los que entran a Impresión lo tienen).
- **Dónde**: en la lista (las que Bodega despachó completas), en la
  revisión de cambios y en la edición; las de la lista muestran el correo
  y «se emite al imprimir».
- **El orden: guardar → emitir → imprimir.** `procesarYSeguir` guarda
  primero —faltantes rebajados, precios del catálogo, marcada impresa— y
  recién entonces abre `EmitirEImprimir`, que emite solo con
  `useEmisionFactura`, `PanelEmisionFactura` y `BotonEmitirFactura`: los
  mismos pasos y las mismas preguntas que Facturación (motivo de un
  descuento, con qué paga el cliente). Hacienda recibe la factura ya
  ajustada (una electrónica no se edita) y el papel sale como «Factura
  electrónica» con su clave: el PDF solo la muestra aceptada. Por eso se
  imprime con un clic aparte al aceptarse: el navegador bloquea una pestaña
  que se abre sola segundos después del clic. Si no se puede emitir, se
  imprime igual («Imprimir sin emitir») y se emite después desde
  Facturación. Mientras emite no se cierra: cortar deja un comprobante
  firmado sin enviar.
- Probado en una copia desechable con Hacienda apagada (guarda, la
  emisión se detiene con el motivo y no se crea comprobante) y con Hacienda
  simulada en el navegador (el precio nuevo se guardó antes del primer POST
  a Hacienda; orden: procesar → emitir → enviar → consultar).
Pruebas: `backend/tests/impresionEmitir.test.js` y los casos nuevos de
`backend/tests/impresionHook.test.js`.
