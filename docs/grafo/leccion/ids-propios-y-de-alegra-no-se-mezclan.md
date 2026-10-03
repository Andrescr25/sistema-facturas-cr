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
aristas:
  relacionado: [modulo/cotizaciones, modulo/facturacion, leccion/cache-con-ids-propios-no-borra-pendientes]
medido: 2026-10-03
---

Los ids propios son seriales (1, 2, 3…) y los de Alegra también. Pasar uno
donde se espera el otro **no da error**: encuentra un registro, el de otra
persona.

Casos en esta rama:

1. **Editar una factura** — mandar un id propio a la ruta de Alegra editaba
   OTRA factura. Por eso la edición se enruta por la marca `esPropia`
   (sección 6 del checklist).
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

**Cómo aplicarlo:** una ruta o una prop que recibe un id dice en su nombre
de quién es. Si un componente puede recibir los dos, recibe dos props
distintas, nunca una que "depende del llamador".
