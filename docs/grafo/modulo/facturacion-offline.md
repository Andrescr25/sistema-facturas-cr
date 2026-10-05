---
id: modulo/facturacion-offline
tipo: modulo
titulo: Facturación sin señal — copia propia y colas conservadas
estado: vigente
archivos:
  - frontend/src/services/facturacionService.js
  - frontend/src/services/indexedDBService.js
  - frontend/src/services/dispositivo.js
  - frontend/src/services/facturaPdf.js
  - frontend/src/services/colaImpresionService.js
  - frontend/src/utils/facturasLocales.js
  - frontend/src/utils/facturacionUtils.js
  - frontend/src/hooks/useFacturacion.js
  - frontend/src/hooks/useFacturasEmitidas.js
  - frontend/src/components/facturacion/AvisoEdicion.jsx
  - frontend/src/components/facturacion/PanelEditarFacturas.jsx
  - backend/tests/facturasLocales.test.js
  - backend/tests/facturaPdfFrontend.test.js
  - backend/tests/facturacionSinAlegra.test.js
  - backend/tests/baseLocalAbierta.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/correo-facturas, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/cache-con-ids-propios-no-borra-pendientes, leccion/fecha-utc-costa-rica, leccion/la-db-local-es-produccion]
medido: 2026-10-04
---

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
