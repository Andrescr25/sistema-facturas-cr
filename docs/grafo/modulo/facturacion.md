---
id: modulo/facturacion
tipo: modulo
titulo: Facturación de venta — ya cerrado en la migración
estado: vigente
archivos:
  - frontend/src/components/facturacion/VerFotoProducto.jsx
  - frontend/src/components/facturacion/LineaFactura.jsx
  - backend/tests/fotoProductoFacturacion.test.js
  - frontend/src/components/facturacion/PrecioConIva.jsx
  - frontend/src/utils/facturacionUtils.js
  - backend/tests/precioConIvaFacturacion.test.js
  - backend/tests/operacionSinSemanas.test.js
  - backend/src/modules/facturacion/facturacion.routes.js
  - backend/src/modules/facturacion/facturaPropia.controller.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/facturacion/idempotencia.js
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/src/modules/facturacion/saldo.sql.js
  - frontend/src/services/facturacionService.js
  - frontend/src/utils/facturacionUtils.js
  - backend/tests/facturacionSinAlegra.test.js
  - backend/tests/sugerenciasFacturacion.test.js
  - backend/tests/idempotenciaFactura.test.js
  - backend/tests/intentoDeFacturaIdPropio.test.js
  - backend/tests/facturaCobroRevertido.test.js
  - backend/tests/facturacionFlujoPantalla.test.js
  - backend/src/modules/facturacion/factura.pdf.js
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/components/facturacion/ClienteFactura.jsx
  - frontend/src/components/facturacion/LineasFactura.jsx
  - frontend/src/components/facturacion/TotalesFactura.jsx
  - frontend/src/components/facturacion/CobrosFactura.jsx
  - frontend/src/utils/facturaVista.js
  - frontend/src/hooks/useEdicionFactura.js
  - backend/tests/facturaVista.test.js
  - frontend/src/components/facturacion/NotasCreditoFactura.jsx
  - frontend/src/components/facturacion/ModalNotaCredito.jsx
  - frontend/src/components/ui/Contador.jsx
  - backend/tests/notaCreditoDiseno.test.js
  - frontend/src/utils/notaCreditoTexto.js
  - backend/src/modules/facturacion/notaCredito.service.js
  - backend/src/modules/facturacion/notaCredito.controller.js
  - backend/tests/notaCreditoSeguimiento.test.js
  - backend/tests/facturaConsulta.test.js
  - backend/tests/facturaCambioCliente.test.js
  - backend/src/utils/fechaCR.js
  - frontend/src/hooks/useFacturasEmitidas.js
  - frontend/src/components/facturacion/PanelFacturasEmitidas.jsx
  - frontend/src/components/facturacion/SelectorPago.jsx
  - frontend/src/components/facturacion/PanelCobro.jsx
  - backend/migrations/independencia/041_intento_de_factura_con_id_propio.sql
  - backend/src/modules/facturacion/facturaLineas.js
  - backend/src/modules/facturacion/descuentoCliente.service.js
  - backend/src/modules/precios/costoDerivado.js
  - backend/migrations/independencia/060_descuento_global_cliente.sql
  - frontend/src/hooks/useLineasFacturacion.js
  - frontend/src/hooks/useDescuentoClienteFacturacion.js
  - frontend/src/services/descuentoClienteService.js
  - frontend/src/utils/descuentoCliente.js
  - frontend/src/components/facturacion/AvisoDescuentoCliente.jsx
  - backend/tests/descuentoCliente.test.js
  - backend/tests/descuentoClientePg.test.js
  - docs/informes/descuento-global-cliente-2026-10-14.md
  - frontend/src/utils/moneda.js
  - frontend/src/utils/revisionPreciosUtils.js
  - frontend/src/utils/impresionUtils.js
aristas:
  relacionado: [modulo/rutas-clientes, modulo/rentabilidad, leccion/precio-sin-iva-costo-con-iva, modulo/hacienda, leccion/la-estructura-se-cuida-con-una-prueba, leccion/lo-que-mueve-plata-no-va-por-omision, leccion/ids-propios-y-de-alegra-no-se-mezclan, modulo/compras, modulo/faltantes, modulo/portal-clientes, modulo/conciliacion-ventas, modulo/conciliacion-cobros, modulo/conciliacion-notas-credito, modulo/historico-debitos-ingreso, modulo/correo-facturas, modulo/facturacion-offline, modulo/archivo-ventas-electronicas, modulo/inventario, tabla/movimiento-inventario]
medido: 2026-10-28
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


Ventas ya vive sobre la base propia (sección 6 del checklist). Se
enlaza acá porque el checklist tuvo, durante meses, siete ítems de esta
sección archivados por error dentro de "## 2. Productos" (líneas 130-177):
"Ver las facturas ya emitidas", "Cómo paga el cliente", "Emitir
electrónicamente una factura ya creada" y otros cuatro, más 37 hallazgos de
Cobros mezclados en el mismo bloque. Se corrigió el 2026-09-20 moviéndolos a
sus secciones (6 y 7) y recontando.

EMISIÓN FISCAL (2026-10-05): [[modulo/hacienda]] implementa preparación,
envío, firma y consulta desde la factura propia. Configuración recibe .p12 y
credenciales; aceptación REAL en pruebas y corte siguen pendientes. La venta
y el comprobante fiscal conservan numeradores separados.

CORREO CON PDF PROPIO (2026-10-04): [[modulo/correo-facturas]] describe la
pantalla y las rutas de envío manual de facturas emitidas, desde la cuenta
del buzón existente. Destinatario confirmado, PDF adjunto y fallos SMTP
controlados. En la rama aislada se puede revisar el formulario pero no enviar;
la recepción real se verifica en el ensayo del corte.

ORIGINALES DE ALEGRA (2026-10-04): [[modulo/archivo-ventas-electronicas, modulo/inventario, tabla/movimiento-inventario]]
descarga los PDF/XML originales de las ventas electrónicas históricas.
Viven en un archivo privado con claves y huellas; no se sustituyen por el
PDF propio ni se presentan como nuevas emisiones.

SALDO PARA CONSULTA Y CONCILIACIÓN (2026-10-03): las expresiones `COBRADO` y
`ACREDITADO` viven en `saldo.sql.js`, un archivo puro que no carga la base ni
servicios. `facturaConsulta.service` las usa y conserva sus exportaciones
para Cobros y el Portal. La conciliación las importa directamente: así mide
la misma fórmula de la pantalla sin arrancar la aplicación. Excluye cobros
anulados y notas anuladas; el saldo de consulta se limita a cero como antes.
Las columnas históricas `saldo` y `total_pagado` no determinan lo que se debe.

DÉBITO HISTÓRICO (2026-10-04): [[modulo/historico-debitos-ingreso]] conserva
el documento de Alegra y su crédito en tablas propias separadas. No lo
convierte en factura, deuda nueva o venta, ni cambia `ACREDITADO` de las
facturas. Su emisión propia sigue fuera del alcance.

FACTURAR UN PEDIDO (sección 12, parte 2): el portal usa
`crearFacturaEnTransaccion` con la opción interna `preciosConImpuesto`.
Se separan base e impuesto del total final de cada línea, para conservar
exactamente el precio prometido, sin volver a aplicar la rebaja. El precio
unitario guardado sigue siendo sin IVA. La pantalla de Facturación y las
cotizaciones usan las bases sin IVA habituales; una petición HTTP no activa
esta opción interna. Factura y pedido se confirman juntos, con bloqueo del
pedido para que repetir la solicitud devuelva la misma factura.

EDITAR UNA FACTURA EMITIDA (`editarFactura`; dentro de una transacción
ajena, `editarFacturaEn`, que es lo que usa Impresión): no se puede si es
electrónica, si tiene cobros o una nota de crédito. Un producto desactivado
DESPUÉS de facturarlo se conserva al editar esa factura (había 8 facturas así
en el último mes y Impresión no las habría podido ajustar); lo que no se
puede es agregarlo nuevo.

UN SOLO CAMINO (2026-10-04). Hasta ese día convivían la factura propia
(`/api/facturacion/facturas`) y la de siempre contra Alegra, que ya no usaba
ninguna pantalla pero seguía montada: `POST /api/facturacion/invoices` creaba
una factura EN ALEGRA y `PUT /api/alegra/facturas/:id` editaba una allá. Se
retiraron con `facturacion.service.js`, `facturacion.controller.js`,
`integrations/alegra/ventaSinStock.js` y el módulo viejo `invoices`
(`/api/facturas`, `/api/alegra/facturas`). `idempotencia.js` se queda: es de
la factura propia, y su prueba se reescribió sobre ella. La diferencia que
importa: un fallo al guardar queda `fallida` —la transacción es nuestra, no
quedó nada y reintentar es seguro—; `incierta` era "Alegra no contestó" y el
camino propio ya no la produce, pero el módulo sigue frenando las que haya en
la tabla.

FACTURACIÓN SIN TRADUCTOR (2026-10-04). Pantalla y caché hablan el contrato
propio. [[modulo/facturacion-offline]] explica la actualización IndexedDB v4,
la conservación de colas y claves y la separación de copias históricas. La
marca se comprueba antes de consultar el detalle, además de antes de enviarlo.

LA TABLET Y LA MARCA `esPropia`. La base de Facturación en el navegador
(`SistemaFacturasCR`: facturas en copia, facturas y ediciones pendientes) NO se
borró al dejar Alegra — a diferencia de la del catálogo del agente. Puede tener
documentos de antes, con el id de allá. Mientras hubo dos rutas, la marca
elegía a cuál mandar; ahora que hay una, lo que no la trae NO SE MANDA
(`editarFactura` lo rechaza antes de tocar la red; una edición pendiente sin
marca queda con su motivo y el botón de descartar, no se borra sola). La copia
que queda al editar sin señal conserva la marca: sin eso, la segunda edición
sin señal de la misma factura se habría ido a la ruta de Alegra con un id
nuestro. Cuando el servidor RECHAZA una edición (409: tiene cobros, es
electrónica, está anulada) se muestra el motivo; antes se guardaba "para
después" y se reintentaba para siempre.

"SUELE FALTAR" (`GET /api/facturacion/clientes/:clienteId/sugerencias`). Es el
mismo cálculo del portal (`portal-clientes.inicio.service.obtenerInicio`),
con `cliente.id` en la ruta y `producto.id` en la respuesta. Del 2026-10-03
al 2026-10-04 la pantalla lo pidió con el id de Alegra: 216 de 247 clientes
veían las compras de otro. Ver
[[leccion/ids-propios-y-de-alegra-no-se-mezclan]], caso 5.

NO DUPLICAR AL REENVIAR (`idempotencia.js`, tabla `factura_intento`,
migración 041). La clave la pone la tablet una vez y viaja en cada reenvío.
La tabla vino de producción y tenía DOS clases de id en una columna: el id
de Alegra de lo creado allá (facturas y también cotizaciones) y, desde la
rama, el id propio. Ahora la factura propia va en `factura_id` y
`alegra_invoice_id` queda para lo de antes. Lo que se devuelve al reenviar es
siempre nuestro id, o ninguno: un intento de antes del corte se resuelve por
id de Alegra Y número, y solo si tiene huella — las cotizaciones no la
tienen, y la cotización 7 calza en id y en número con la factura 7. La
huella del contrato propio incluye al cliente; la del contrato de antes
(`client`, `id`) quedó idéntica, fijada por una prueba, porque es la que
calculan las tablets que reenvían después del corte.

PENDIENTE, PARA DESPUÉS DEL CORTE: `emitirCon` acepta ids de Alegra
(`client`, línea sin `productoId`). No se puede quitar antes: así llegan las
facturas que una tablet armó sin señal con el sistema anterior.

KARDEX PROPIO (2026-10-05). Crear, editar y anular factura mueve inventario
en la misma transacción. Las notas devuelven fracciones de cuatro decimales
y el costo de la salida original; anular la nota registra reversa. Un error
posterior revierte también movimientos y numerador. Apertura provisional en
cero, sin volver a descontar ventas históricas: [[modulo/inventario]].

2026-10-05: ciclo explícito en portal/pedido de agente y facturación presencial;
al facturar se conserva el recorrido original. Colas antiguas intactas,
filtros de pedidos y validación por cuenta: [[modulo/pedidos-por-ciclo]].

RECORRIDO COMPLETO (2026-10-11), el día después del corte. La factura NACE
SIN COBRAR para todo cliente (venía marcada "Efectivo" para los de contado,
que son casi todos, y salía pagada sola); cobrar en el momento es una
elección que se ve en la barra en cualquier ancho. Una factura cobrada se
corrige anulando su cobro DESDE LA FACTURA (permiso `anular-cobro`), y la
guarda del servidor ya no cuenta cobros ni notas anulados. La ficha y el PDF
muestran el detalle escrito en cada línea y editar no lo borra; con descuento
los totales cierran con la calculadora. El código del producto no distingue
mayúsculas. Todo, con sus porqués, en
[[leccion/lo-que-mueve-plata-no-va-por-omision]].

SIN HACER, a propósito: la venta a medio armar se pierde si se recarga la
página (o si la tablet descarta la pestaña); las referencias repetidas entre
productos activos (`100231`, `27010136`, `7443000380100`) hacen que el código
elija uno cualquiera — es dato del catálogo, no de la pantalla.

LA NOTA DE CRÉDITO CUENTA QUÉ HIZO (2026-10-11). El usuario hizo una sobre
una factura electrónica y contó: «apliqué la nota de crédito y no avisó nada
y solo me salió la factura como pagada». Pidió que se sepa «si se aplicó, si
anuló el documento o qué pasó» y «si la nota es aplicada a una factura
electrónica o una de venta normal». Tenía razón en las tres cosas: el aviso
decía «creada» a secas, la nota era un renglón gris al pie del documento, y
la etiqueta de la factura decía "Pagada" porque el saldo había quedado en
cero.

- **Saldo en cero no es "Pagada".** `estadoDeFactura`
  (`utils/notaCreditoTexto.js`) pregunta primero si la acreditaron entera:
  entonces dice «Anulada con nota de crédito». Con una nota parcial sigue
  diciendo lo que debe (o "Pagada" si lo demás se cobró) y abajo «Nota de
  crédito por ₡X». Misma regla en la factura y en la lista.
- **Cada nota es una tarjeta ARRIBA del documento**
  (`NotasCreditoFactura.jsx`), con tres recuadros: *qué hizo* (anuló la
  factura completa, o acreditó tanto de tanto y cuánto se sigue debiendo;
  cuántas unidades volvieron al inventario; si quedó plata a favor de un
  cliente que ya había pagado), *a qué se aplicó* (factura electrónica con su
  consecutivo, tiquete, o factura de venta «no electrónica») y *cómo va ante
  Hacienda*.
- **El aviso al crearla** dice lo mismo en una línea, con la factura ya
  releída.
- **Si la factura es electrónica, la nota se emite ahí mismo**, con el botón
  de un clic y los pasos de la factura: ver [[modulo/hacienda]], "LA NOTA DE
  CRÉDITO, DE UN CLIC". Si no lo es, la tarjeta dice «No va a Hacienda» y no
  ofrece un botón que va a fallar.

`facturaConsulta.service.js` devuelve de cada nota, además del monto, las
unidades devueltas y su comprobante de producción. Pruebas:
`notaCreditoSeguimiento.test.js`, con el caso real (₡62,15, electrónica,
acreditada entera).

Desde esa misma noche la nota electrónica **le llega al cliente por correo**
con su PDF y sus dos XML, y cada tarjeta tiene «Ver PDF»: ver
[[modulo/correo-facturas]], "LA NOTA DE CRÉDITO TAMBIÉN SE ENTREGA".

No se hizo: anular una nota desde la pantalla (el servidor ya lo permite).

"EMITIDAS" SON DOS LISTAS (2026-10-11). Pedido del usuario: «que el tab que
dice "emitidas" se divida en Facturas de venta y Facturas electrónicas, para
que no me salgan ambas en emitidas». En Facturación → Facturas las pestañas
son ahora: Facturas de venta · Facturas electrónicas · Anuladas · Todas
(`ESTADOS` en `useFacturasEmitidas.js`), y abre en la primera.

"Con saldo" se quitó ese mismo día, también por pedido suyo: «eso lo veo en
cuentas por cobrar, entonces no es necesario». Era la pestaña en la que abría
la pantalla. El servidor conserva el estado `con_saldo` porque lo usa el
tablero; no volver a ponerla acá sin que él lo pida.

La regla la pone el servidor (`listarFacturas`, estados `ventas` y
`electronicas`) y es la misma de la etiqueta de cada documento: electrónica
es la que Hacienda ACEPTÓ, factura o tiquete. Una enviada sin respuesta, o
rechazada, sigue en "Facturas de venta" hasta que la acepten. Las dos
condiciones son una la negación de la otra sobre las emitidas, así que
ninguna queda fuera ni repetida (medido en la copia local: 4.728 + 516 =
5.244). `emitidas`, las dos juntas, sigue existiendo para quien llame sin
decir cuál quiere. "Anuladas" y "Todas" siguen mezclando las dos: no se
pidió partirlas.

LA PANTALLA DE LA FACTURA, PARTIDA COMO EL RESTO (2026-10-11). `VistaFactura.jsx`
llegó a 790 líneas con todo adentro. Ahora arma la pantalla y nada más: las
cuentas y las reglas (totales, por qué no se edita, qué se manda al guardar)
están en `utils/facturaVista.js` con pruebas de verdad; la copia que se edita,
en `hooks/useEdicionFactura.js`; y cada sección en su componente
(`ClienteFactura`, `LineasFactura`, `TotalesFactura`, `CobrosFactura`,
`NotasCreditoFactura`). El botón y el panel de la emisión electrónica también
viven acá, en `components/facturacion/`. El porqué y la prueba que lo cuida:
[[leccion/la-estructura-se-cuida-con-una-prueba]].

De paso se corrigió un fallo viejo: la segunda corrección seguida de una
misma factura encontraba «Guardar cambios» apagado.

CAMBIAR EL CLIENTE DE UNA FACTURA DABA 500 (2026-10-13). El usuario, editando
una factura de venta: al elegir otro cliente y guardar, «Invalid time value».
Al cambiar el cliente se recalcula el vencimiento con el plazo del cliente
nuevo, sumando días a la fecha de la factura, y esa fecha se leía con
`String(factura.fecha).slice(0, 10)`. La base no entrega un DATE como texto:
el driver devuelve un objeto Date, y eso da "Mon Oct 12". Con un cliente a
crédito reventaba al sumar; con uno de contado habría guardado esa cadena
como fecha (la base la rechaza).

- Ahora se lee con `diaDeBase` (`utils/fechaCR.js`): las partes locales del
  Date, que es como el driver lo armó. Ni `String().slice`, ni
  `diaEnCostaRica` (en un servidor en UTC la medianoche es el día anterior).
- Había dos copias sueltas de esa misma lectura (`fechaLarga` en
  `marcaPdf.js` y `fechaIsoLocal` en el reporte del contador): usan el mismo
  ayudante.
- Por qué no se vio antes: la prueba con dobles tenía la fecha escrita como
  texto. `facturaCambioCliente.test.js` lo prueba contra la base local, que es
  la única que devuelve lo que rompía; sin el arreglo da el mismo error.

Chromium real: editar una factura ZZ, cambiarla a un cliente con crédito
(vence a los días de su plazo) y a uno de contado (vence el mismo día).



DESCUENTO POR CLIENTE (2026-10-14). La ficha guarda `descuento_global`
(0–100, dos decimales; vacío desactiva). En ventas nuevas se aplica cuando
el margen sobre el precio sin IVA, antes de descuentos, es estrictamente
mayor al 21 %. El costo se normaliza con la tarifa real (incluido 0/1 %) y
con la clasificación de calidad de Rentabilidad; costo ausente, sospechoso
o historial inestable no concede descuento automático. La oferta, el
manual y el del cliente se comparan: gana el mayor, nunca se suman.

`facturaLineas.js` conserva el cálculo y la validación de la copia mostrada;
el servicio de escritura baja de 827 a menos de 700 líneas. Los costos se
leen en lote, por ids propios y sobre la conexión de la factura. Solo
`emitirCon` aplica la condición nueva; editar/reimprimir no vuelve a leer
la ficha para rebajar documentos anteriores. La integración fiscal usa las
líneas persistidas y mantiene la elección explícita del motivo de descuento.

GET privado `/facturacion/clientes/:clienteId/descuento` prepara la vista
previa. No agrega costos al catálogo público ni compartido. POST compara
porcentaje y descuentos revisados: un cambio de ficha/costo devuelve 409
antes de reservar número o registrar cobro; la pantalla renueva condiciones
y requiere otro clic. Una cola antigua sin vista previa permanece pendiente
si el cliente ahora tiene descuento, para no alterar el total prometido.

SQL 060 ensayada en copias locales y aplicada en producción por Codex el
2026-10-14 a las 15:31:43 CR, tras autorización expresa de migrar y subir a
main. Respaldo restaurado, 144 tablas y 250 clientes conservados; descuento
inicial 0 %. Pruebas de escritura solo locales. [Pruebas y estado](../../informes/descuento-global-cliente-2026-10-14.md).

El descuento produce centavos: la vista redondea descuento, base e IVA por
línea, igual que el servidor. `utils/moneda.js` reúne el redondeo compartido
con Impresión y Revisión de precios; la prueba compara pantalla y escritura
para precios decimales y descuentos, evitando diferencias de un centavo.

## Totales del PDF: subtotal, descuento, impuesto, total — 2026-10-19

El usuario, al ver el PDF de la factura de SUPER BUEN PRECIO con descuento:
«el formato de pdf no me gusta, quiero que diga subtotal xx / descuento xx /
impuesto %x / total xx». El pie decía «Subtotal ₡227.512 · Ya incluye ₡7.517
de descuento · IVA 13 % ₡29.577 · TOTAL ₡257.089»: el subtotal ya traía el
descuento restado, y por eso el descuento iba como nota y no como renglón.

Ahora (`renglonesDeTotales` en `factura.pdf.js`): **Subtotal** de ANTES del
descuento (`subtotalAntesDeDescuento`: la base más el descuento, también en
las copiadas de Alegra), **Descuento** como resta (₡0 si no hay), **Impuesto
13 %** —un renglón por tarifa, de la mayor a la menor, como lo escribió él:
«impuesto 13 % xx / impuesto 2 % xx»— y el **TOTAL** en su recuadro. Así la cuenta
cierra en el papel: ₡235.029 − ₡7.517 + ₡29.577 = ₡257.089. La columna
IMPORTE de cada línea sigue siendo después del descuento. Vale para la
factura, la electrónica y la nota de crédito (el mismo papel), y para el PDF
que va por correo. Pruebas en `backend/tests/facturaPdf.test.js`.

Después, el mismo día: «en el pdf el único error que veo es este:
Doscientos cincuenta y siete mil ochenta y nueve con 11/100 colones
costarricenses» —las letras llevaban céntimos y el TOTAL no—, y él eligió
«haz que el monto en letras sea redondeado» (`montoEnLetrasDelTotal`, igual
que `colones()`). De paso se corrigió el español del monto: «ciento un
colones» y no «ciento uno», «doscientos un mil» y no «doscientos ún mil»,
«dos millones de colones» (`utils/numeroALetras.js`). Y «la vista previa del
pdf donde la puedo editar» (`VistaFactura` → `TotalesFactura`) muestra los
mismos renglones con `renglonesDeTotales` de `utils/facturaVista.js`, al verla
y al editarla.

## Botones de la factura abierta — 2026-10-19

El usuario: «en editar facturas dentro de facturas haz que estos btns salgan al
final de la factura y NO al principio: Cancelar, Guardar cambios. Haz que todo
el diseño de btns sea más acorde al sistema y no tan genéricos, recuerda
reciclar código». En `VistaFactura`, editando, arriba queda solo «Editando
<número>»; **Cancelar y Guardar cambios van al final**, debajo de los términos,
con el error de guardado al lado (antes salía arriba, lejos del botón). Todos
los botones de la factura —Volver, Ver PDF, WhatsApp, Correo, Editar, Emitir
electrónicamente, Nota de crédito, Anular, los XML y «Enviar al cliente» del
panel de emisión, «Ver PDF» de la nota y la confirmación de anular un cobro—
usan `ui/Boton` con la variante de lo que hacen (secundario; peligro para
anular; fantasma para volver; primario para guardar). Prueba:
`backend/tests/botonesFactura.test.js`. La cabecera de Facturación
(«Actualizar») es de todas las pestañas y no se tocó.

## Color en las acciones y Facturación responsive — 2026-10-19

«Ponle color a estos btn: Ver PDF, WhatsApp, Correo, Editar factura, Emitir
electrónicamente, Nota de crédito» y «este módulo hazlo completamente
responsive». `ui/Boton` suma variantes de color suave por significado, los
tonos de `ui/Insignia`: `activo` (azul: Correo), `exito` (verde: WhatsApp),
`alerta` (ámbar: Editar), `nota` (morado: Nota de crédito), `acento` (naranja
de la marca: Ver PDF); Emitir electrónicamente va en `primario` sólido y
Anular en `peligro`.

Responsive, medido en Chromium a 320, 360, 390, 768, 1024 y 1440 px (desborde
horizontal, elementos fuera de pantalla y controles de menos de 36 px en el
teléfono), en Nueva factura, Editar facturas, la lista y la factura vista y
en edición: sin desbordes ni controles chicos.
- `LineasFactura`: en el teléfono, una tarjeta por línea (la tabla de seis
  columnas cortaba precio, descuento, impuesto y total); cada campo es un
  componente que usan la tabla y la tarjeta.
- `CELDA`: campos altos y con letra de 16 px en el teléfono (sin zoom).
- Acciones de la factura en dos columnas parejas en el teléfono.
- Pestañas en tres columnas con el ícono arriba; «Actualizar», paginación y
  anular factura con `ui/Boton`; filtros, fechas, «Cambiar» cliente,
  «Agregar detalle» y quitar línea con tamaño de dedo.
- `index.css`: el ícono del calendario de TODOS los campos de fecha en el
  teléfono iba con `position: absolute` sin un padre posicionado y se salía al
  borde de la tarjeta; el campo es ahora su referencia.
Pruebas en `backend/tests/botonesFactura.test.js`.

## Nota de crédito: el modal y la tarjeta, ordenados — 2026-10-20

«Haz el modal de nota crédito más acorde al sistema, y cuando la nota de
crédito se haga haz que se acomode mejor ahí; actualmente se ve muy
desordenado».
- `ModalNotaCredito`: el contenido iba pegado a los bordes, con chips chicos,
  un campo de número suelto por línea y botones genéricos en un azul ajeno a
  la paleta. Ahora: la factura a la que se le acredita arriba; tres pasos con
  aire (motivo, por qué, qué se devuelve); cada línea con el contador, con
  tope en lo facturado, y lo que acredita; y en el pie del `ui/Modal`, siempre
  a la vista, el error, «Se acredita ₡…», Cancelar y «Crear nota» con
  `ui/Boton`. Los motivos salen de `MOTIVOS_NOTA` (utils/notaCreditoTexto),
  la misma lista con la que la tarjeta los nombra; el monto por línea, de
  `acreditadoDe` (utils/facturaVista), con la cuenta del servidor.
- **`ui/Contador`** («− 1 +»): estaba copiado en `LineaFactura` y
  `ModalCantidad`, y la nota iba a ser la tercera copia. Es uno solo y lo usan
  los tres.
- `NotasCreditoFactura`: monto, insignia y «Ver PDF» iban apilados a la
  derecha (en el teléfono, sueltos a la izquierda) y el texto del motivo
  pegado a la fecha. Ahora: una franja morada con el número, su estado y el
  monto; el motivo escrito en su renglón; los tres recuadros; y «Ver PDF de
  la nota» al pie, en el naranja del «Ver PDF» de la factura.
- Barra de acciones: en dos grupos —mandar (PDF, WhatsApp, Correo) y
  gestionar (Editar, Emitir, Nota de crédito, Anular)— que bajan enteros: a
  1280 px «Anular» bajaba sola a un segundo renglón. En el teléfono siguen en
  dos columnas (`contents`).
- `card !p-0` en la tarjeta de la nota y en la del documento: la regla
  global `.mobile-device .card` les sumaba 16 px de relleno en el teléfono a
  secciones que ya traen el suyo.
Medido a 320, 390, 768 y 1280 px sin desbordes ni controles chicos. Prueba:
`backend/tests/notaCreditoDiseno.test.js`.


## Editar una factura ya no es posible si Bodega la tomó — 2026-10-23

`editarFactura` responde 409 cuando la factura está tomada en Bodega (abierta,
despachada o con faltantes) y la consulta trae `tomadaEnBodega` para que la
pantalla no ofrezca Editar: se corrige con una nota de crédito (quitar) o con
una factura nueva (agregar). Impresión sigue ajustando por `editarFacturaEn`.
Las reglas y la tabla `factura_en_bodega` (066) están en
[[modulo/facturas-bodega]].

## El producto que se busca sale con IVA — 2026-10-28

El usuario: «cuando uno busca un producto para facturar este sale con el
precio sin IVA, ocupo que salga con IVA». El precio guardado es SIN IVA; ahora
la lista del buscador, la ficha «Encontrado» del modo por código, el modal de
cantidad y el buscador de editar una factura muestran lo que se cobra por una
unidad, con la leyenda «con IVA» (`PrecioConIva.jsx`). La cuenta es
`precioConIva` de `facturacionUtils.js`: la tarifa del producto (0, 1, 2, 4, 8
o 13 %; nunca un 1,13 fijo), y si no trae, la principal de la factura. Pasa por
`montosLineaFacturacion`, la misma cuenta de la línea, así que coincide al
céntimo con su total de una unidad. En el buscador de editar facturas la
tarifa que falta es 0 %, igual que `lineaDeProducto`. La línea que se agrega
sigue llevando el precio SIN IVA y su tarifa: lo que cambia es lo que se ve.
Ver [[leccion/precio-sin-iva-costo-con-iva]].

## Ver la foto del producto en la línea — 2026-10-28

El usuario: «una forma de ver la imagen del producto que estoy facturando; un
logo pequeño para ver la img; completamente responsive». Cada línea de la
factura en curso trae, junto al botón de quitar, un botón pequeño (40 px, igual
que el de quitar) que abre la foto en el modal del sistema (hoja desde abajo en
el teléfono, diálogo centrado en pantallas grandes; la foto se achica para caber
entera, con un alto máximo del 60 % de la pantalla). Solo aparece si el producto
tiene foto, y la foto no se pide hasta tocarlo. Sin señal se dice «No se pudo
cargar la foto» en vez de dejar un cuadro vacío (si el dispositivo ya la tenía
guardada, se ve).

La foto no viajaba a Facturación: `actualizarCacheProductos` descartaba
`imagen_url`. Ahora se guarda como `images: [{ url, favorite: true }]` (la forma
del catálogo del agente, para `fotoDe`). La página la busca en el catálogo por
`productoId` al dibujar cada línea —no se copia a la línea—, así también la
tienen las líneas de una factura cargada para editar o de las sugerencias del
cliente, y nada nuevo viaja a la cola de facturas pendientes.

**La foto entra en la huella** (`huellaParaOperar`): antes se decidió que
cambiarla no renovara la copia del dispositivo; ahora sí, porque la copia
muestra la foto y el archivo viejo se borra al reemplazarla (se vería rota).
Efecto del despliegue: la huella cambia una vez, así que cada dispositivo
renueva solo su catálogo la primera vez y las copias viejas, guardadas sin
foto, la reciben. Ocultar un producto y el costo siguen sin renovar nada.
