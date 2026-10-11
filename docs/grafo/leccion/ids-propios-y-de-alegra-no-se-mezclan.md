---
id: leccion/ids-propios-y-de-alegra-no-se-mezclan
tipo: leccion
titulo: Un id propio y uno de Alegra no son intercambiables — mezclarlos no falla, apunta a otro
estado: vigente
archivos:
  - backend/src/modules/envios-whatsapp/envios.service.js
  - backend/src/modules/envios-whatsapp/envios.routes.js
  - frontend/src/components/whatsapp/ModalEnviarWhatsApp.jsx
  - backend/src/modules/cotizaciones/enlacePublico.js
  - backend/src/modules/catalogo-agente/pedidos-agente.service.js
  - backend/tests/catalogoAgenteIdsPropios.test.js
  - backend/src/modules/facturacion/facturaPropia.controller.js
  - frontend/src/utils/facturacionUtils.js
  - backend/tests/sugerenciasFacturacion.test.js
  - backend/src/modules/facturacion/idempotencia.js
  - backend/tests/intentoDeFacturaIdPropio.test.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - frontend/src/services/indexedDBService.js
  - frontend/src/services/facturacionService.js
  - frontend/src/hooks/useFacturacion.js
  - backend/tests/catalogoViejoEnElNavegador.test.js
  - backend/tests/facturaPropia.test.js
aristas:
  relacionado: [modulo/cotizaciones, modulo/facturacion, modulo/facturacion-offline, leccion/cache-con-ids-propios-no-borra-pendientes]
medido: 2026-10-10
---

Los ids propios son seriales (1, 2, 3…) y los de Alegra también. Pasar uno
donde se espera el otro **no da error**: encuentra un registro, el de otra
persona.

Casos en esta rama:

1. **Editar una factura** — mandar un id propio a la ruta de Alegra editaba
   OTRA factura. Por eso la edición se enrutaba por la marca `esPropia`
   (sección 6 del checklist). La ruta de Alegra se retiró el 2026-10-04; la
   marca sigue, ahora al revés: lo que NO la trae salió de una copia vieja
   de la tablet, con el id de allá, y no se manda a la ruta propia. Tampoco
   se consulta su detalle por ese número: la respuesta propia marcaría como
   nuestra la factura equivocada antes de editarla. IndexedDB v4 separa
   también la clave de la copia histórica, aunque los dos ids coincidan;
   ver [[modulo/facturacion-offline]].
2. **WhatsApp desde Cuentas por Cobrar** (corregido el 2026-09-24). El modal
   buscaba los teléfonos con `/envios-whatsapp/telefonos/:contactoId`, que le
   pregunta a Alegra, pero Cuentas por Cobrar ya le pasaba el id propio. Al
   cliente propio 8 ("AB CHANA") le proponía el celular del contacto 8 de
   Alegra ("EL LLANO"). Medido: 47 de los 54 deudores. Se separaron dos
   rutas y dos props (`clienteId` / `contactoId`) con nombres distintos a
   propósito; la de Alegra se retiró el 2026-10-04, cuando ya nadie la
   pasaba. La que queda conserva su nombre (`/telefonos-cliente/:clienteId`)
   para que no se lea como "el id que tenga a mano".
3. **El enlace público de la cotización.** El token firma `cotizacion:<id>`;
   los que ya salieron por WhatsApp llevan ids de Alegra. Con las mismas
   firmas, el enlace viejo de la 11 de Alegra abría la cotización propia 11,
   de otro cliente. Las propias firman `cotizacion-propia:<id>` y las viejas
   se buscan por `alegra_id`.
4. **La tablet y su cola offline** (2026-10-03). El catálogo v3 guarda ids
   propios; la cola pendiente antigua conserva campos de Alegra. Se invalida
   el caché de consulta junto, pero nunca el trabajo pendiente. Dos contratos
   explícitos impiden interpretar por accidente un pedido antiguo como uno
   propio. La prueba crea fichas distintas con el mismo número en ambos
   espacios y comprueba que cada contrato apunta a su ficha.
5. **"Suele faltar" en Facturación** (corregido el 2026-10-04). Este es el
   caso al revés y el más fácil de repetir: se migró el SERVIDOR a ids
   propios (las ventas pasaron a salir de las facturas propias) y la pantalla
   siguió mandando el id de Alegra, con un comentario que decía "el histórico
   todavía habla en ids de Alegra" — cierto el día que se escribió. Al
   cliente propio 186 se le pedían las compras del cliente 80. Medido: 216 de
   247 clientes veían lo de otro, 1 coincidía por casualidad. Nada falló, y
   la prueba que había pasaba: doblaba el servicio y solo miraba que el
   parámetro de la ruta llegara tal cual. La prueba nueva va contra
   PostgreSQL y arma el cruce a propósito (un cliente cuyo id de Alegra es el
   id propio de otro).
6. **Una columna con dos clases de id** (corregido el 2026-10-04, migración
   041). `factura_intento.alegra_invoice_id` traía de producción el id de
   Alegra de cada factura creada; el código de la rama escribía ahí el id
   propio. Reenviar la factura 001000014841 devolvía 5369, su id de Alegra, y
   la 5369 propia es de otro cliente. Y dentro de Alegra tampoco es un solo
   espacio: la misma columna guarda ids de COTIZACIONES, y la cotización 7
   calza en id y en número con la factura 7. La regla "que coincidan id y
   número" parecía suficiente y enlazó cuatro cotizaciones con cuatro
   facturas ajenas; se vio solo porque se miró el resultado fila por fila.

7. **El catálogo guardado en el navegador, el día del corte** (2026-10-10,
   EN PRODUCCIÓN, con facturas reales). Facturación guarda productos y
   clientes en la IndexedDB del dispositivo. El sistema anterior los
   guardaba con el id de Alegra en `id`; al desplegar el sistema propio esas
   filas siguieron ahí, porque la pantalla solo descarga el catálogo cuando
   lo encuentra vacío y la subida a la versión 4 no lo vaciaba. La pantalla
   nueva mandó ese `id` como `clienteId` / `productoId`. Se eligió a un
   cliente (propio 237, Alegra 151) y la factura salió a nombre del cliente
   propio 151, PANADERÍA SION; se pidió la referencia 0005 (UNIÓN LISA) y se
   facturó el producto propio 1084, JARRA VIDRIO MD LABRADA. Dos facturas
   reales, ningún error. El caso 4 había previsto esto para el catálogo del
   agente (`AlegraCatalogReactDB` se vacía al pasar a v3) y NO para la base
   de Facturación, que es otra. Tres defensas, cada una alcanza sola:
   - `SistemaFacturasCR` pasa a la versión 5 y vacía `productos` y
     `clientes` (nunca las tres colas);
   - `facturacionService` no devuelve una fila que no traiga `productoId` /
     `clienteId`: la del sistema anterior no los tiene, así que el catálogo
     se ve vacío y se descarga;
   - **el servidor ya no confía en el id solo.** La pantalla manda además lo
     que mostraba —referencia y nombre de cada línea, nombre y cédula del
     cliente— y `facturaPropia.service.js` responde 409 si NADA de eso es lo
     que hay con ese id (`esLoMostrado`: con una seña que calce alcanza, para
     que corregir un nombre en la oficina no rechace la venta que una tablet
     hizo sin señal). Quien no manda señas (el portal, Impresión) no se
     revisa: ahí el id lo puso el servidor.

**Una columna, una clase de id.** Si una tabla copiada de producción va a
recibir ids propios, van en una columna nueva; la vieja se queda con lo que
tenía. Y para traducir lo viejo, buscar qué distingue de verdad a cada
documento (acá, la huella) antes de confiar en que dos números coincidan.

**Al migrar un servicio a ids propios, buscar a TODOS los que lo llaman**, no
solo el que motivó el cambio: `obtenerInicio` tenía dos (el portal y
Facturación) y se migró pensando en uno.

**Cómo aplicarlo:** una ruta o una prop que recibe un id dice en su nombre
de quién es. Si un componente puede recibir los dos, recibe dos props
distintas, nunca una que "depende del llamador".

**Un caché del navegador es otra base de datos, y también hay que migrarla.**
Antes de un corte que cambia el espacio de ids, listar TODAS las copias que
viven en los dispositivos (acá eran dos bases de IndexedDB) y comprobar que
cada una se invalida al abrir la versión nueva. Y cuando una pantalla manda un
id que eligió una persona, que mande también lo que esa persona estaba
viendo: es lo único que deja al servidor notar que el id apunta a otro.
