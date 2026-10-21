---
id: modulo/facturacion-offline
tipo: modulo
titulo: Facturación sin señal — copia propia y colas conservadas
estado: vigente
archivos:
  - backend/tests/operacionSinSemanas.test.js
  - frontend/src/services/facturacionService.js
  - frontend/src/services/indexedDBService.js
  - frontend/src/services/dispositivo.js
  - frontend/src/services/facturaPdf.js
  - frontend/src/services/colaImpresionService.js
  - frontend/src/utils/facturasLocales.js
  - frontend/src/utils/facturacionUtils.js
  - frontend/src/hooks/useFacturacion.js
  - frontend/src/hooks/useCatalogoAlDia.js
  - frontend/src/utils/catalogoAlDia.js
  - backend/tests/catalogoAlDia.test.js
  - frontend/src/hooks/useFacturasEmitidas.js
  - frontend/src/components/facturacion/AvisoEdicion.jsx
  - frontend/src/components/facturacion/PanelEditarFacturas.jsx
  - backend/tests/contextoColasFactura.test.js
  - backend/tests/facturasLocales.test.js
  - backend/tests/facturaPdfFrontend.test.js
  - backend/tests/facturacionSinAlegra.test.js
  - backend/tests/baseLocalAbierta.test.js
  - backend/tests/facturacionFlujoPantalla.test.js
  - frontend/src/components/facturacion/PestanasFacturacion.jsx
  - frontend/src/hooks/useLineasFacturacion.js
  - frontend/src/hooks/useDescuentoClienteFacturacion.js
  - frontend/src/services/descuentoClienteService.js
  - frontend/src/utils/descuentoCliente.js
  - backend/tests/descuentoCliente.test.js
  - backend/tests/descuentoClientePg.test.js
aristas:
  relacionado: [leccion/lo-que-mueve-plata-no-va-por-omision, modulo/historicos-contexto-documentos, modulo/facturacion, modulo/correo-facturas, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/cache-con-ids-propios-no-borra-pendientes, leccion/fecha-utc-costa-rica, leccion/la-db-local-es-produccion]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

El formulario nuevo no consulta semanas. Los tres caminos de reenvío
mantienen la clave original y el campo legado de la cola cuando existe,
para reconocer su huella; el servidor no lo asigna a una factura nueva.
`contextoColasFactura.test.js` cubre también reenviar desde el formulario
nuevo una petición antigua con ciclo, sin modificarla ni duplicarla.

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


SECCIÓN 16. Se retiró `facturaPropiaAdaptador.js`: la copia de facturas y
la pantalla usan `numero`, `cliente`, `lineas`, `fecha` y los estados
`borrador`/`emitida`/`anulada`. Los controles de productos siguen usando su
forma de formulario. La petición conserva el contrato que acepta el backend,
con `clienteId` y `productoId` explícitos; no se cambia el cuerpo de una cola
antigua ni la huella que usa la idempotencia.

DOS RESPUESTAS PROPIAS. GET ya devuelve la vista propia; POST/PUT devuelve
la fila SQL, que `facturaEscrita` convierte en la misma copia nativa, sin
campos de Alegra. El `saldo` histórico de SQL no se presenta como deuda.
El acuse de idempotencia (`yaExistia`, solo id/número) conserva el detalle
descargado. Una precarga resumida tampoco reemplaza las líneas completas por
su cantidad: sin ellas no habría edición offline. Se espera la confirmación
de la transacción IndexedDB antes de afirmar que se guardó la copia.

INDEXEDDB V3→V4. Se mantiene el nombre `SistemaFacturasCR`. Se cambian solo
las copias de `facturas_cache` y sus índices, en una transacción de versión.
Las colas de facturas, ediciones y pedidos, sus claves, intentos y fechas,
productos, clientes y configuración permanecen iguales. Si falla un `put`
por cuota, se revierte todo, incluidos los índices y la versión. Una pestaña
antigua que bloquea el cambio produce un aviso para cerrarla, sin usar v3
como si estuviera actualizada; las conexiones nuevas se cierran al recibir
`versionchange`.

PROCEDENCIA, ANTES DE CONSULTAR. Una copia antigua sin `esPropia` no se
abre por su número en `/facturacion/facturas/:id`: podría pertenecer a otra
persona. Sus ids de copia pasan a `copia-alegra-<id>`; `alegraId` queda como
referencia, el cliente/producto propio queda sin identificar. Así puede
coexistir con una factura propia del mismo id. Solo se reconoce un borrador
local sin marca cuando su cola tiene `clienteId`/`productoId` explícitos y
coinciden todas las líneas. No se convierte una cola antigua en propia.
Una copia resumida sin líneas pide abrirse con conexión antes de editar.

CREACIÓN Y REINTENTO. Cuerpo y clave se guardan juntos en una transacción;
antes había una ventana entre dos escrituras que dejaba una venta sin clave.
Cada reenvío usa la clave original. El resultado propio se registra como
`facturaId`, sin reutilizar `alegraId`. Dos ediciones sin señal conservan
`esPropia`; las ediciones históricas sin marca siguen pendientes con su motivo
y la opción de descartar, nunca se envían contra un id propio ni se borran.
Reparar un producto con referencia corrupta borra solo el catálogo de
productos y su fecha de descarga: una venta pendiente no se puede recuperar
volviendo a descargar el catálogo.

PDF. `facturaPdf.js` conserva la descarga autenticada por blob, la apertura
previa al await y la ruta particular de Impresión. Si falla, cierra la pestaña
vacía. Verificación de la migración y los reintentos en Chromium, incluidas
cuota y pestaña bloqueante, en una copia privada sin HTTP de escritura.
El informe de avance documenta la verificación final de pantalla y suite.

DESPUÉS DEL CORTE. La conversión de las copias v3 permanece para tablets
que aún no abrieron esta versión. No retirar la compatibilidad de entrada
`client`/línea `id` del backend hasta vaciar las colas de los dispositivos,
según [[modulo/facturacion]]. No se hizo una migración PostgreSQL.

LA BASE LOCAL SE ABRE SOLA (2026-10-04, error reportado por el usuario en el
catálogo del agente: `Cannot read properties of null (reading
'transaction')`). `facturacionService` se carga con la aplicación y escucha
`online` en TODAS las pantallas; al volver la conexión intenta mandar lo
pendiente. Pero `indexedDBService.init()` solo lo llamaba la pantalla de
Facturación, y cada método usaba `this.db` a secas: en cualquier otra pantalla
—o después de que la conexión se cierra sola por un cambio de versión— era
null, reventaba, y lo pendiente no se mandaba. Ahora todo método pide la base
con `abierta()`, que la abre si hace falta y una sola vez aunque la pidan dos
a la par. Guardar la copia de una factura sigue sin hacer fallar la venta si
el navegador no deja abrir la base.

AL VOLVER LA CONEXIÓN (`handleOnline`), que por lo anterior ahora sí corre
fuera de Facturación:
- **Sin sesión no se manda nada.** El catálogo del agente se usa con la sesión
  vencida; mandar igual era un 401 por factura. Las pendientes esperan
  intactas al próximo ingreso.
- **Un 401 a mitad del envío corta el envío** sin anotarle un error a ninguna
  factura ni edición: la sesión venció, no es un rechazo de ese documento. El
  resultado lleva `sinSesion: true`.
- **Primero las facturas, después las ediciones.** Las dos comparten
  `syncInProgress`; lanzadas a la vez, la segunda encontraba la bandera puesta
  y no hacía nada: las ediciones pendientes nunca se mandaban al reconectar.

`baseLocalAbierta.test.js` carga `indexedDBService` de verdad sobre una
IndexedDB simulada. Reproducido y verificado en Chromium cortando y
devolviendo la conexión en `/catalogo-agente`, con sesión, sin sesión y con la
sesión vencida y una factura pendiente de prueba: quedó sin marcar.

2026-10-05: ciclo explícito en portal/pedido de agente y facturación presencial;
al facturar se conserva el recorrido original. Colas antiguas intactas,
filtros de pedidos y validación por cuenta: [[modulo/pedidos-por-ciclo]].

CONTINUIDAD 2026-10-06. La etapa de históricos/copia corrige PUT y los acuses,
distingue Sin ciclo de metadata sin descargar y conserva la fotografía en
los tres caminos de reenvío. Ver [[modulo/historicos-contexto-documentos]] y
el informe historicos-contexto-2026-10-06; sus cifras reemplazan el relevo
anterior. No confundir esta entrega con VAL o cierre integral RUT-08.

LA PANTALLA SE ENTERA CUANDO LA SUBIDA TERMINA (2026-10-11). Al volver la
conexión suben a la vez el servicio (`handleOnline`) y la pantalla; la
segunda encuentra `syncInProgress` puesto y volvía a leer la cola antes de
tiempo: mostraba "pendiente de envío" una factura ya creada, con un
Reintentar que contestaba "Factura pendiente no encontrada", y no mostraba el
motivo de la que el servidor rechazó. Ahora cada sincronización avisa al
terminar (`facturacionService.alSincronizar`) y la pantalla relee ahí. Si el
servidor rechazó alguna, queda un aviso fijo.

LA COLA SE VE EN CUALQUIER ANCHO. El panel con lo pendiente —motivo,
Reintentar, Descartar— era solo de teléfono (`md:hidden`): una tablet veía el
"1" de la cabecera y no tenía dónde tocar. Con algo por subir la pestaña
aparece como "Por subir", el número de la cabecera lleva ahí, lo pendiente va
arriba del panel, e ir a verlo no borra la venta en curso. El contador "por
subir" sale de la cola de ahora, no de la que había al abrir.

EL CÓDIGO → CANTIDAD NO TIENE CARRERA. El foco pasa a la cantidad en el mismo
Enter, antes de buscar el producto en IndexedDB: tecleando "64⏎10⏎" de
corrido (o con lector) el "10" caía en la casilla del código. La búsqueda por
código no distingue mayúsculas (662 productos tienen letras). Detalle en
[[leccion/lo-que-mueve-plata-no-va-por-omision]].

LA COPIA DEL CATÁLOGO SE RENUEVA SOLA (2026-10-13). El usuario reactivó dos
productos en Gestión de Catálogo y preguntó: «por qué cuando vuelvo a activar
un producto en gestión de catálogo este producto no me aparece en
facturación». Eran dos causas, y las dos se corrigieron.

1. **Estaban activos pero ocultos, y la lista para vender dejaba fuera los
   ocultos.** Los dos venían dados de baja Y ocultos (hay 176 así); reactivar
   no los saca de oculto. «Oculto» es de los catálogos que ven los clientes:
   la regla del maestro dice que sigue vendible y facturar solo rechaza los
   inactivos. Pero `/api/catalogos/productos` —lo que baja Facturación— pedía
   "activo y sin ocultar". Ahora es todo lo activo (`estado: 'vendibles'` en
   `productos.service.js`). Los catálogos de clientes y agente no cambian.
2. **Facturación trabaja con una copia guardada en el dispositivo**, y solo la
   renovaba al tocar «Actualizar» (o si estaba vacía). Un producto
   reactivado, uno nuevo o un precio corregido no aparecían hasta eso; con
   los precios, además, no se notaba.

Cómo se renueva ahora, sin perder el trabajo sin conexión:
- `GET /api/catalogos/productos/huella` devuelve un md5 de lo que Facturación
  guarda de cada producto vendible (nombre, referencia, descripción, precio,
  impuesto y tarifa, categoría, CAByS, unidad). Cambiar una foto, el costo, u
  ocultar un producto NO la cambia: no hay que bajar nada.
- `useCatalogoAlDia` (lo llama la página) pregunta la huella al entrar, al
  volver a la pestaña, al recuperar conexión y cada 3 minutos, nunca más
  seguido que cada 45 segundos. Si es distinta de la guardada en
  `localStorage`, baja los productos (`actualizarCacheProductos`) y se los
  pasa a la pantalla. Si es igual, es un solo pedido chico.
- No estorba: sin conexión no hace nada; un error se calla y la copia
  anterior sigue sirviendo; no corre durante «Actualizar», y cuando esa
  actualización termina solo anota la huella (no baja el catálogo otra vez).
  La venta en curso no se toca: cada línea ya tiene su copia del producto.
- «Actualizar» sigue existiendo: además trae clientes y facturas.

Queda igual que antes, a propósito: los CLIENTES nuevos o corregidos siguen
entrando con «Actualizar»; nadie lo pidió y es la misma idea si hiciera falta.

`useFacturacion.js` y `facturacionService.js` están en su tope de tamaño: el
gancho nuevo vive aparte y la página lo conecta (`setProductos` se expone en
el mismo renglón que `productos`).

Pruebas: `catalogoAlDia.test.js` (reglas, conexión y, contra PostgreSQL local,
la lista para vender y la huella). Chromium real: producto ZZ dado de baja y
oculto → «Activar» en Gestión de Catálogo → aparece en Facturación sin tocar
«Actualizar»; sin cambios no baja nada; un precio corregido llega solo; uno
dado de baja deja de ofrecerse.



DESCUENTO DEL CLIENTE (2026-10-14). El carrito se extrae a
`useLineasFacturacion`: conserva el descuento manual/oferta separado del
automático. El precio cambia la elegibilidad y el cliente cambia su
porcentaje, sin duplicar rebajas. `useDescuentoClienteFacturacion` carga
condiciones privadas con guarda contra respuestas de otro cliente. La copia
en IndexedDB se separa por usuario e id propio de cliente, sin guardar
el token como clave; permite preparar la venta sin señal. Si no se conoce
la condición, se pide una descarga antes de facturar.

El cuerpo de la cola nueva conserva `descuentoClienteRevisado` y
`descuentoBase` por línea junto con la clave de idempotencia. Cambiar
condiciones al sincronizar produce rechazo revisable, sin convertirlo en
otra venta ni reescribir una cola antigua. Editar una venta ya persistida
no reaplica el descuento actual de la ficha. Chromium comprobó guardar
sin conexión con 5 %, porcentaje base 0 y cola conservada.

## «Editar facturas» en orden de llegada — 2026-10-19

El usuario: «el editar factura que es para móvil no está bien hecho, ocupo que
las facturas que salen en editar sean por orden de llegada y no al azar». La
copia del teléfono (`getFacturasPrecargadas`) se ordenaba solo por día; las
del mismo día quedaban en el orden interno de IndexedDB, y el servidor
desempata por consecutivo, que es distinto entre electrónicas y normales.

`ordenDeLlegada` (`utils/facturasLocales.js`): por día y, dentro del día, por
id propio descendente (crece con cada factura guardada, en cualquier serie);
las que todavía no subieron (id local) van primero en su día, por su hora.
La búsqueda mezcla teléfono y servidor con `combinarBusqueda`, sin repetir y
en el mismo orden. Comprobado en Chromium a 390 px sobre una copia: las 60
facturas de la lista y una búsqueda por cliente en el orden real de llegada.

