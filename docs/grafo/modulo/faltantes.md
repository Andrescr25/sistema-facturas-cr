---
id: modulo/faltantes
tipo: modulo
titulo: Faltantes — del despacho a la reimpresión, sobre la factura y el producto propios
estado: vigente
archivos:
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
  relacionado: [modulo/necesidades-por-ciclo, modulo/archivo-ordenes-compra, modulo/ordenes-compra-por-ciclo, modulo/facturas-bodega, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, leccion/proveedor-por-cedula, modulo/exportaciones-reportes, modulo/demo-reporte-proveedores]
medido: 2026-10-06
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
