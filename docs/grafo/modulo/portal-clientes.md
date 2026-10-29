---
id: modulo/portal-clientes
tipo: modulo
titulo: Portal — carrito, cuenta y pedidos con ids propios; facturar crea una factura propia
estado: vigente
archivos:
  - docs/informes/marcas-clientes-2026-10-24.md
  - backend/src/utils/marcaPublica.js
  - backend/tests/catalogoClientesMarcas.test.js
  - backend/tests/catalogoClientesMarcasLocal.test.js
  - frontend/src/hooks/useFichaProductoCliente.js
  - frontend/src/components/catalogo-clientes/GruposProductos.jsx
  - frontend/src/components/catalogo-clientes/MarcaProductos.jsx
  - frontend/src/components/catalogo-clientes/FichaProducto.jsx
  - frontend/src/components/catalogo/PortadaMarca.jsx
  - frontend/src/utils/gruposCatalogoClientes.js
  - backend/tests/operacionSinSemanas.test.js
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
  - frontend/src/components/catalogo-clientes/PanelPedido.jsx
  - frontend/src/components/catalogo-clientes/ModalPedido.jsx
  - frontend/src/components/catalogo-clientes/ModalCompraAnterior.jsx
  - frontend/src/components/catalogo-clientes/InputCantidad.jsx
  - frontend/src/components/catalogo-clientes/MiniaturaProducto.jsx
  - frontend/src/components/catalogo-clientes/VolverAPedir.jsx
  - frontend/src/pages/portal/PortalFacturas.jsx
  - frontend/src/utils/fechaCR.js
  - frontend/src/pages/Clientes.jsx
  - frontend/src/components/clientes/ListaCuentas.jsx
  - frontend/src/components/clientes/NavegacionClientes.jsx
  - backend/tests/portalIdsPropios.test.js
  - backend/tests/facturarPedidoConImpuesto.test.js
aristas:
  depende_de: [tabla/venta-linea, modulo/facturacion]
  relacionado: [modulo/marcas-catalogo, decision/portal-en-su-propio-sitio, leccion/fecha-utc-costa-rica, modulo/rutas-clientes, modulo/catalogo-agente, modulo/facturas-bodega, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/dos-clases-de-oferta, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-10-24
---

## 2026-10-20 — el pedido se edita adentro; el portal, en su propio sitio

Pedido del usuario: «cuando se están añadiendo productos no se pueden editar
/ ajustar modal para editar producto en módulo de cliente que sea más
flexible». En «Su pedido» cada línea tenía solo «2 × ₡…» y una X: ahora lleva
foto, `InputCantidad` (−, número escribible, +) y papelera; el total de la
línea se actualiza al instante. En el teléfono el pedido ya no tiene un 70 %
fijo: toma el alto que deja la franja de sugerencias (máximo 92dvh entre las
dos) y la lista se desplaza adentro; en una pantalla angosta la cantidad baja
debajo del nombre. «Repetir esta compra» usa el mismo `InputCantidad`: su
control propio pasaba la línea a «Volver a poner» al borrar el número para
escribir otro. Los dos modales dicen `role=dialog`. Las fechas de «Volver a
pedir», «Repetir esta compra» y «Mis facturas» salían un día antes en Costa
Rica: ahora usan `fechaEnPalabras` ([[leccion/fecha-utc-costa-rica]]). La
cabecera del catálogo ya no desborda a 320 px.

El mismo día el portal pasa a publicarse aparte del sistema interno:
[[decision/portal-en-su-propio-sitio]].

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


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


2026-10-07, administración del personal reorganizada en [[modulo/rutas-clientes]]:
Clientes reúne portal/tablets dentro de Accesos; cuentas en tarjetas legibles,
con búsqueda y acciones de invitar/devolver/quitar acceso conservadas. Pedidos
mantiene área propia, filtros y contador de revisión de la selección cargada.
Sin cambiar permisos, ids ni servicios del portal. Navegador1440/390 y build
aprobados; las acciones de escritura no se ejecutan en la base habitual.
Ver `docs/informes/clientes-redisenados-2026-10-07.md`; CLI-10 sigue al usuario.


## 2026-10-24 — marcas y subcategorías también en Catálogo Clientes

El catálogo público presenta categoría → subcategoría → marca con portada y
lista de presentaciones/precios con IVA. Reutiliza `agruparMarcasCatalogo` y
`PortadaMarca` con el agente; el wrapper del portal conserva los controles de
pedido por producto. Los productos sin marca conservan su tarjeta; los que
no tienen subcategoría quedan en Otros cuando hay familias, sin encabezado
vacío en categorías aún sin clasificar. Categorías conservan nombre real
para filtrar y nombre visible para presentar.

La portada personal (`obtenerInicio`) la comparte Facturación, que la pide con
`{ ampliado: true }` para ver más productos y los de una sola compra
([[modulo/facturacion]], «Suele faltar»). El portal NO lo pide: sus topes (24)
y su respuesta (`habituales`, `perdidos`, `ofertas`) no cambian; una prueba lo
fija.

La clasificación sale de la misma lectura de `producto`, con LEFT JOIN a las
filas activas y compatibles; no hay consulta por ficha ni columna nueva.
`marcaPublica` limita campos y tipos incluso dentro del JSON de imagen.
Carrito, portada personal e historial reutilizan la proyección; costo,
inventario y márgenes siguen fuera del DTO. Búsqueda incluye marca y familia,
sin acentos. El orden SQL reúne cada clasificación y desempata por id, usando
las posiciones manuales existentes de Gestión. La paginación sigue en60
productos; agrupar lo ya recibido permite continuar una marca sin duplicar
su portada ni omitir variantes. No descarga todo para agrupar.

La vista previa abre también para visitantes con el producto ya recibido,
sin petición privada. Solo con sesión consulta historial propio y ofrece
agregar al pedido. Tocar una presentación muestra su foto individual y
conserva su id, precio y cantidad. Modal compartido, Escape, retorno de foco
y scroll; salir de la cuenta retira controles e historial. Ofertas y
recomendaciones conservan su selección y orden, con tarjetas individuales.

Fotos lazy/asíncronas con proporción reservada, encuadre de portada sin
franjas ni duplicado desenfocado. No hay animaciones que retengan scroll ni
dependencias nuevas. Ambos builds siguen separados. Sin migración nueva;
SQL064 ya está aplicada, no repetirla. Pruebas y alcance en
[el informe](../../informes/marcas-clientes-2026-10-24.md).
