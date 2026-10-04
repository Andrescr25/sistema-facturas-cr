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
aristas:
  relacionado: [modulo/cotizaciones, modulo/facturacion, leccion/cache-con-ids-propios-no-borra-pendientes]
medido: 2026-10-04
---

Los ids propios son seriales (1, 2, 3…) y los de Alegra también. Pasar uno
donde se espera el otro **no da error**: encuentra un registro, el de otra
persona.

Casos en esta rama:

1. **Editar una factura** — mandar un id propio a la ruta de Alegra editaba
   OTRA factura. Por eso la edición se enrutaba por la marca `esPropia`
   (sección 6 del checklist). La ruta de Alegra se retiró el 2026-10-04; la
   marca sigue, ahora al revés: lo que NO la trae salió de una copia vieja
   de la tablet, con el id de allá, y no se manda a la ruta propia.
2. **WhatsApp desde Cuentas por Cobrar** (corregido el 2026-09-24). El modal
   buscaba los teléfonos con `/envios-whatsapp/telefonos/:contactoId`, que le
   pregunta a Alegra, pero Cuentas por Cobrar ya le pasaba el id propio. Al
   cliente propio 8 ("AB CHANA") le proponía el celular del contacto 8 de
   Alegra ("EL LLANO"). Medido: 47 de los 54 deudores. Ahora hay dos rutas y
   dos props (`clienteId` / `contactoId`) con nombres distintos a propósito.
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

**Al migrar un servicio a ids propios, buscar a TODOS los que lo llaman**, no
solo el que motivó el cambio: `obtenerInicio` tenía dos (el portal y
Facturación) y se migró pensando en uno.

**Cómo aplicarlo:** una ruta o una prop que recibe un id dice en su nombre
de quién es. Si un componente puede recibir los dos, recibe dos props
distintas, nunca una que "depende del llamador".
