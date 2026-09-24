---
id: leccion/telefonos-sucios
tipo: leccion
titulo: Los teléfonos de Alegra vienen sucios — quitarles lo que no es dígito da el número de otro
estado: vigente
archivos:
  - backend/src/utils/telefonosCliente.js
  - backend/src/modules/orders-whatsapp/orders-whatsapp.service.js
aristas:
  relacionado: [leccion/la-db-local-es-produccion]
medido: 2026-09-23
---

De 120 fichas de clientes (2026-09-03), 19 tenían el teléfono escrito de una
forma que no es un teléfono: con el nombre de quien contesta ("88272453
GABRIEL"), con DOS números ("60301550 63409692"), con siete dígitos ("+506
8770053") o sin ningún número.

Quitar todo lo que no sea dígito convierte "60301550 63409692" en un número
de 16 dígitos que no es de nadie. Para una orden de compra el peor caso es
que no llegue; para un enlace de invitación al portal el peor caso es que
LLEGUE a otra persona, que puede crear la cuenta del cliente y ver sus
facturas.

Usar `utils/telefonosCliente.js`, que devuelve TODOS los candidatos para que
una persona elija, en vez de `normalizarTelefonoCR` de orders-whatsapp, que
adivina. Y en toda pantalla que mande algo sensible, mostrar el número antes
de mandar.
