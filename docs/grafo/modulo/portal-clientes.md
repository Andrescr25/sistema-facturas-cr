---
id: modulo/portal-clientes
tipo: modulo
titulo: Portal — carrito, cuenta y pedidos con ids propios; facturar crea una factura propia
estado: vigente
archivos:
  - backend/migrations/independencia/035_portal_con_ids_propios.sql
  - backend/src/modules/catalogo-clientes/consultaProducto.js
  - backend/src/modules/catalogo-clientes/catalogo-clientes.service.js
  - backend/src/modules/portal-clientes/portal-clientes.auth.js
  - backend/src/modules/portal-clientes/portal-clientes.middleware.js
  - backend/src/modules/portal-clientes/portal-clientes.carrito.service.js
  - backend/src/modules/portal-clientes/portal-clientes.cliente.service.js
  - backend/src/modules/portal-clientes/portal-clientes.pedidos.service.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/portal-clientes/portal-clientes.inicio.service.js
  - backend/src/modules/portal-clientes/portal-clientes.sugerencias.service.js
  - backend/src/modules/portal-clientes/portal-clientes.saldo.service.js
  - backend/src/modules/catalogo-agente/pedidos-agente.service.js
  - backend/src/utils/descuentosExceso.js
  - frontend/src/hooks/useCarritoCliente.js
  - frontend/src/hooks/useClientesPortal.js
  - frontend/src/pages/CatalogoClientes.jsx
  - frontend/src/pages/Clientes.jsx
  - backend/tests/portalIdsPropios.test.js
  - backend/tests/facturarPedidoConImpuesto.test.js
aristas:
  depende_de: [tabla/venta-linea, modulo/facturacion]
  relacionado: [modulo/catalogo-agente, modulo/facturas-bodega, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/dos-clases-de-oferta, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-10-05
---

SECCIÓN 12, PARTE 2. El catálogo del cliente expone `producto.id`, incluidos
productos sin Alegra. El carrito y las líneas del pedido guardan `producto_id`;
el pedido se liga a `cliente.id` y, al facturarlo, a `factura.id` (035).
Los ids viejos quedan en columnas distintas para conciliar en el corte.
La migración rellena los propios por las correspondencias históricas, es
repetible y avisa lo que no enlaza: nunca adivina por nombre ni borra líneas.

LA SESIÓN SALE DE LA CUENTA, NO DEL CONTACTO. El JWT conserva como `sub` la
cuenta `cliente_portal.id` y firma `clienteId`. El middleware relee por `sub`
el cliente propio y las dos banderas de activo en cada petición. También
acepta tokens viejos: ignora su `contacto` y deriva la ficha de la cuenta.
El historial, las compras y los saldos se filtran por ese `clienteId` de la
sesión. Adivinar una factura ajena sigue devolviendo 404. Las invitaciones
se unen por `cliente_id`, y activarlas consume el enlace y cambia la
contraseña dentro de la misma transacción.

EL CARRITO NO CONGELA PRECIOS. Solo al crear el pedido se guarda lo que se
le promete al cliente, con IVA y descuento ya aplicados. Las escrituras del
carrito y enviar el pedido bloquean su cabecera: un segundo envío lo encuentra
vacío y una línea agregada después no se pierde. Cabecera, líneas y vaciado
son una transacción. Los productos se toman con bloqueo compartido mientras
se congelan precio e impuesto. El aviso interno sale solo después del COMMIT.
Un producto que dejó de estar disponible se informa y pide revisar el carrito.

FACTURAR BLOQUEA EL PEDIDO. `crearFacturaEnTransaccion` guarda la factura y
el UPDATE del pedido en la misma conexión. Un doble clic o una respuesta
perdida devuelve la misma factura; no usa las claves `pedido-N` de los
intentos antiguos en Alegra. La tarifa se valida contra el maestro y el
precio con IVA prometido se separa en base e impuesto desde el TOTAL de la
línea, con la opción interna `preciosConImpuesto`; no se divide y redondea
primero el precio unitario para luego volver a sumarle IVA. Así dos unidades
de ₡37.800 al 13% conservan los ₡75.600 prometidos. El precio guardado sigue
siendo sin IVA, y Facturación y Cotizaciones conservan su cálculo habitual.
El exceso no se aplica otra vez. Un cambio de precio no altera el pedido; si cambió la tarifa, se
bloquea para revisarlo. El seguimiento lee `factura_id` y su alistado.
Un pedido viejo ya facturado pero sin correspondencia propia no se refactura.

DOS BORDES TEMPORALES: cola offline histórica e inventario pospuesto:
- La tablet ya usa ids propios desde la parte 3. Su caché invalida la consulta
  antigua sin borrar pedidos pendientes. Solo esos envíos históricos pueden
  mandar campos explícitos de Alegra, traducidos por su correspondencia.
  Cabecera y líneas del agente se guardan juntas; generan factura propia.
- Los excesos siguen ligados a Alegra en Inventario. `mapaVigentesPropios`
  traduce las ofertas al id propio tanto para el portal como para la tablet.
  El mapa antiguo queda para el inventario pospuesto.
  Las bajas de precio ya se leen por producto propio, y el catálogo público
  no expone los márgenes internos ni usa su id histórico como identidad.

VERIFICACIÓN: PostgreSQL local en BEGIN/ROLLBACK (cliente y productos sin
Alegra, tarifas 0/1/2/13%, invitación de un uso, sesión revocada, factura
idempotente, rollback de pedido y factura, seguimiento y compras ajenas).
Nunca se prueba contra producción ni se envían mensajes reales.

Chromium: flujo completo en escritorio (1440 px) y tablet (820 px), sobre
una copia desechable, sin errores de JavaScript o HTTP ni desborde horizontal.
Cinco facturaciones HTTP simultáneas crean una sola factura. La suite
completa pasa (1.536 aprobadas, una omitida), y el frontend compila.

2026-10-05: ciclo explícito en portal/pedido de agente y facturación presencial;
al facturar se conserva el recorrido original. Colas antiguas intactas,
filtros de pedidos y validación por cuenta: [[modulo/pedidos-por-ciclo]].

Tercera parte: catálogo personal por ciclo y envío explícito, con contexto
firmado que no concede sesión: [[modulo/preventa-por-enlace]].
