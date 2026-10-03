---
id: modulo/faltantes
tipo: modulo
titulo: Faltantes — del despacho a la reimpresión, sobre la factura y el producto propios
estado: vigente
archivos:
  - backend/migrations/independencia/032_faltantes_con_ids_propios.sql
  - backend/migrations/independencia/033_faltante_cantidad_rebajada.sql
  - backend/src/utils/guardarFaltantes.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/reports/notasDeFaltantes.js
  - backend/src/modules/reprinting/colaImpresion.js
  - backend/src/modules/reprinting/procesarImpresion.js
  - backend/src/modules/missing-items/missing-items.service.js
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
  - backend/tests/horaEnvioImpresion.test.js
  - backend/tests/reporteClientesFiltros.test.js
  - frontend/src/components/reporte-clientes/ListaClientes.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping]
  relacionado: [modulo/facturas-bodega, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, leccion/proveedor-por-cedula, modulo/exportaciones-reportes]
medido: 2026-10-03
---

EL RECORRIDO. Bodega despacha una factura y marca lo que faltó → el Reporte
de Proveedores junta lo que hay que comprar, por proveedor → el Reporte de
Clientes registra qué llegó después y da la factura por lista → Impresión
ajusta la factura y la reimprime.

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
pantalla; un faltante sin respuesta se rebaja entero. La cola reusa la fila
de la factura: hay una por factura.

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

LA LIMPIEZA SEMANAL (domingo 23:59 y el botón de Configuración) borra los
faltantes y sus ajustes, limpia el encargo que Bodega anotó en la factura
(`factura.bodega_observaciones`) y reinicia el ciclo de pedidos. Ya no vacía
`facturas_pendientes`: nadie escribe en ella. NUNCA se ejecuta para probar —
ni contra la base local: su SQL se verifica con PREPARE.

IMPRESIÓN (`procesarImpresion.js`, todo bajo `/reimpresion`, que es del
módulo Impresión: `/facturacion` es de otro y su permiso no alcanzaría).
Procesar una factura de la cola le rebaja lo que no llegó, le pone los
precios del catálogo (`producto.precio_sin_iva`, sin IVA como la línea) y la
marca impresa, en UNA transacción, con la misma edición de Facturación
(`editarFacturaEn`). Las que Bodega despachó completas ('sin_pendientes')
solo se marcan: la factura no se toca. La pantalla de edición recibe la
propuesta ya armada por el servidor; lo que se guarda es lo que la persona
deja. El PDF es el mismo de Facturación, servido por la ruta de Impresión.

UN FALTANTE SE REBAJA UNA SOLA VEZ (migración 033): cada faltante recuerda
cuánto se le quitó ya a la factura (`cantidad_rebajada`) y procesar aplica la
diferencia. Antes —también con Alegra— se calculaba sobre la cantidad de hoy:
una factura recuperada y vuelta a procesar se rebajaba dos veces. Si después
llegó más, se le devuelve a la línea (o la línea vuelve, con el precio del
catálogo). Un faltante sin respuesta se rebaja entero.

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

Sigue del lado de Alegra, fuera de este módulo: `supplier_product_mapping`
exige `alegra_item_id` (NOT NULL), así que un producto sin ficha en Alegra no
puede tener mapeo. Es de Relacionar Productos, igual que el buzón de compras.
Las rutas de los reportes y del pedido siguen colgadas del prefijo `/alegra`
(el enrutador adaptador); son módulos propios, el prefijo se va en la §16.
