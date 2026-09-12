# Checklist: independencia de Alegra

- **Rama de trabajo:** `independencia-alegra`. `developer` y `main` siguen con
  el sistema híbrido.
- **Pospuesto por decisión (11 de setiembre de 2026):** el paso a factura
  electrónica. El modelo de datos deja el lugar listo para hacerlo después.
- **Contexto y cifras:** ver `plan-independencia-alegra.md`.

Cada sección dice qué depende hoy de Alegra y cuándo se da por lista. Se
marca `- [x]` al terminar.

## Cómo trabajar en esta rama

- **Dos carpetas, una por rama**, para que corran a la vez:

  | Carpeta | Rama | Frontend | Backend | Base |
  |---|---|---|---|---|
  | `sistema-facturas-cr` | `developer` | 5173 | 3000 | producción |
  | `sistema-facturas-cr-independencia` | `independencia-alegra` | 5174 | 3002 | copia local |

  La segunda es un `git worktree` del mismo repositorio: los commits de una se
  ven desde la otra, pero cada una tiene sus archivos, sus `node_modules`, su
  `.env` y sus fotos. `.env.aislado` y `almacenamiento/` viven **solo** en la
  carpeta de la rama.
- **Base local.** Se levanta con `docker start tachi-db-local`. Si la copia
  quedó vieja: `cd backend && scripts/db-local/refrescar-copia.sh --si`. El
  script lee producción, reemplaza **solo** la base local y vuelve a aplicar
  las migraciones de la rama.
- **Levantar la rama** (en `sistema-facturas-cr-independencia`):
  `cd backend && npm run dev` y `cd frontend && npm run dev`. Los puertos ya
  vienen puestos: el backend toma el 3002 por `MODO_AISLADO` de `.env.aislado`
  y el frontend el 5174 por `frontend/.env.development`. El 3001 quedó
  descartado: lo ocupa `sistema-facilitadores-judiciales` en esta misma
  máquina.
- **Si un puerto está ocupado**, se detiene diciéndolo en vez de saltar a otro.
  Para usar otro a mano, los dos juntos:
  `PORT=3003 npm run dev` y `VITE_API_URL=http://localhost:3003 npm run dev`.
  La sesión del navegador va aparte por puerto: en el 5174 hay que entrar de
  nuevo, con los mismos usuarios, que vienen en la copia.
- **Si arranca contra la base de producción**, se detiene con el error
  `BASE_NO_AISLADA`. No es un fallo: es la guarda haciendo su trabajo.
- **Traer lo nuevo de `developer`:** `git checkout independencia-alegra && git merge developer`.
  Nunca al revés: esta rama no se mezcla a `developer` ni a `main` hasta el
  corte.
- **Migraciones de la rama** en `backend/migrations/independencia/NNN_nombre.sql`.
  Se aplican a la base local, se reflejan en `setupDatabase.js` y el script
  de refresco las vuelve a correr.
- **Pruebas:** `cd backend && npm test`. Las que usan base van contra la copia
  local. Las de escritura real, dentro de una transacción que se revierte, se
  corren con `PROBAR_BASE_LOCAL=1`.
- **Si una prueba falla con `Unable to deserialize cloned data`**, no es el
  código: es el corredor de Node 25 leyendo mal el reporte de un proceso hijo
  cuando corren ocho archivos a la vez. Las pruebas de ese archivo pasan todas.
  Por eso `npm test` corre con `--test-concurrency=2`, que en 5 corridas
  seguidas no falló ninguna vez (con 8 en paralelo falla como 1 de cada 3).
- **Llaves de escape** (`PERMITIR_BASE_REMOTA`, `PERMITIR_SALIDAS`): solo el
  día del corte y a propósito.

---

## 0. Base del trabajo (antes de cualquier módulo)

> **Bloqueador.** La base local es la de producción. Todo lo que esta rama
> crea, edita o borra (clientes, productos, facturas) caería sobre los datos
> que hoy usa `main`.

- [x] Base de datos exclusiva: Postgres 17 en Docker (`tachi-db-local`, `127.0.0.1:5434`) con una copia de producción que deja fuera las tablas de WhatsApp. Se refresca con `scripts/db-local/refrescar-copia.sh --si`
- [x] Guarda dura en `config/aislado.js`: la base tiene que ser local, a Alegra solo se le lee, y WhatsApp, correo y el buzón de facturas quedan bloqueados. Pruebas: `tests/ramaAislada.test.js`
- [x] `backend/.env.aislado` (ignorado por git) gana sobre `.env`: base local y sincronizaciones apagadas
- [x] Rutina para traer `developer` a esta rama, nunca al revés (ver *Cómo trabajar en esta rama*)
- [ ] Capa de acceso por entidad (productos, clientes, facturas…), para que las pantallas no sepan si el dato viene de Alegra o de la base propia. *Se construye junto con Productos (sección 2)*
- [ ] Ids propios en todas las tablas nuevas, con `alegra_id` opcional para migrar y conciliar. *Se aplica desde la primera tabla nueva*
- [x] Bitácora de cambios: tabla `bitacora_cambio` y `src/utils/bitacora.js`. Cada módulo nuevo la usa al crear, editar, desactivar o anular
- [x] Node 22 en la rama (`engines` de `backend/package.json`)

**Lista cuando:** la rama corre contra su propia base, y una prueba garantiza
que no escribe en Alegra ni en producción.

---

## 1. Configuración de la empresa

**Hoy vive en Alegra:** cédula, actividad 523402, régimen tradicional, series
de numeración, impuestos (`GET /taxes`), métodos de pago
(`GET /payment-methods`), 4 cuentas de dinero y 6 plazos.

- [x] Datos de la empresa: nombre, cédula, actividad, dirección, teléfono y correo, en la base y editables. *El logo queda para cuando las fotos pasen a almacenamiento propio (sección 2): la URL de Alegra vence*
- [x] Impuestos y tarifas: los 13 de Alegra, incluidos 0,5 %, 8 % y los de bienes usados (inactivos)
- [x] Métodos de pago: efectivo, SINPE Móvil, transferencia, tarjetas y cheque
- [x] Plazos de crédito: contado, 8, 15, 22, 30 y 60 días
- [x] Cuentas de dinero: Caja general, Caja chica, Banco y Tarjeta empresarial
- [ ] Series y consecutivos propios, que no choquen con los de Alegra *(tabla lista; las series se definen en Facturación)*
- [x] Pantalla de Configuración para todo lo anterior: pestañas por catálogo, una sola tabla para los cuatro, se desactiva en vez de borrar, y conserva la limpieza manual de faltantes

**Avance:**
- Tablas `empresa`, `impuesto`, `metodo_pago`, `plazo_credito`, `cuenta_dinero` y `serie_consecutivo` (migración `independencia/002`).
- Datos cargados desde Alegra con `scripts/independencia/cargar-configuracion.js`: empresa, 13 impuestos, 6 plazos y 4 cuentas.
- Métodos de pago propios con **SINPE Móvil** (migración `independencia/003`), que no estaba en ninguna de las dos listas escritas a mano.
- API: `/api/configuracion` para ver y cambiar (solo con el módulo Configuración) y `/api/catalogos/configuracion` para leer lo activo (cualquiera que haya entrado). Cada cambio queda en la bitácora.
- Pantalla verificada en escritorio y teléfono contra la copia local: cédula inválida rechazada con su motivo, plazo repetido con 409, desactivar y reactivar, columnas alineadas, 0 llamadas a Alegra.

**Todavía no cambia (se hace en su sección):** Facturación sigue pidiendo los impuestos a Alegra y su lista de métodos de pago escrita a mano (sección 6); Cuentas por Cobrar sigue con la suya, sin SINPE Móvil (sección 7). Los números de SINPE y de banco que la pantalla vieja tenía escritos en el código no se pasaron solos: se agregan como cuentas si hacen falta.

**Hallazgo al cargar los impuestos (afecta a `main`):** `utils/impuestosAlegra.js` usa ids de Alegra equivocados. Desde el 10 de julio, 82 líneas de compra al 1 % se registraron al 4 %, 19 al 2 % se registraron al 8 % y 22 exentas quedaron al 0,5 %. Son unos ₡16.674 de IVA de compras de más en Alegra. Las tablas propias guardan la tarifa como número y no la deducen del id.

**Lista cuando:** nada de esto se lee de Alegra.

---

## 2. Productos

**Hoy en Alegra:** es el maestro (2.130 productos). La caché local no tiene
existencias ni CABYS. Gestión de Catálogo edita en Alegra nombre, referencia,
precio, costo y categoría, y también borra, duplica por marca y sube fotos.
Revisión de Precios crea productos y cambia precios. Se sincroniza cada 6 horas.

- [x] Tabla `producto`: nombre, referencia, descripción, CABYS, tarifa de impuesto, unidad, categoría, precio sin IVA, costo con IVA, estado, oculto, inventariable, forma farmacéutica y registro sanitario (migración `independencia/004`). Precio y costo van en columnas `precio_sin_iva` y `costo_con_iva`, para que no se confundan
- [x] Carga inicial de los 2.130 productos (2.025 activos) y las 17 categorías con `scripts/independencia/cargar-productos.js`
- [x] Crear producto desde Gestión de Catálogo ("Nuevo producto" y "Agregar marcas", que abre el mismo formulario ya lleno y sigue con la foto). CABYS e impuesto obligatorios y referencia única entre activos. *El alta desde Revisión de Precios se cambia en Compras (sección 8)*
- [x] Editar producto con **todos** los campos, incluidos CABYS, impuesto, unidad, descripción y datos de medicamento. La pantalla muestra el precio con IVA y el margen mientras se escribe; cada cambio de precio va a `precio_historico` y todo a la bitácora
- [x] Activar y desactivar en vez de borrar, y ocultar de los catálogos de clientes. Se hace desde la hoja del producto, con filtro de estado en la grilla (activos, ocultos, inactivos y todos)
- [x] Categorías: crear, renombrar y desactivar, en una pestaña de Gestión de Catálogo que reutiliza la tabla y el formulario de Configuración
- [x] Fotos en almacenamiento propio. Las URL de Alegra vencen. Toda foto nueva (subida o sugerida) se guarda en `/archivos`, solo se aceptan imágenes de verdad y la descarga rechaza direcciones de la red interna. Las **2.022 que ya existían** se pasaron con `scripts/independencia/migrar-fotos.js` (270 MB en disco, 54 s). El script se puede volver a correr: salta lo que ya es nuestro y, si una firma venció, le pide a Alegra una dirección nueva. `cargar-productos.js` ya no pisa una foto propia con una de Alegra. Una persona sube hasta 2 MB; la migración acepta hasta 8 MB porque 20 fotos de la empresa pesaban más. Quedan 108 productos que nunca tuvieron foto
- [x] `precio_historico` y `costo_historico` apuntando al id propio (migración `independencia/005`): 209 de 209 y 7.903 de 7.907 enlazadas; las 4 restantes son de productos que ya no existen en Alegra. `alegra_item_id` dejó de ser obligatorio
- [ ] Facturación, catálogo del agente, catálogo de clientes y portal leyendo de `producto`. *Avance: **ya leen de `producto` el catálogo de clientes, las ofertas por baja de precio y TODO el portal** (carrito, portada personalizada, "se lleva junto con", ficha de producto, compras anteriores y las tarifas que usa el pedido al facturar). Dejaron de depender de que la sincronización de cada 6 horas haya corrido. La definición de "qué es un producto para el cliente y cuál se muestra" quedó en un solo lugar (`catalogo-clientes/consultaProducto.js`) en vez de las cuatro copias que había. Siguen exponiendo el id de Alegra a propósito: el carrito y el pedido guardan `alegra_item_id`, y los descuentos por exceso y el histórico se llavean por ese id, así que cambiarlo rompería los pedidos en curso; va también `productoId` para cuando eso se migre. **El tablero de Rentabilidad** también pasó al maestro propio, y con eso dejó de asumir que todo paga 13 %: la clasificación de costos recibe ahora la tarifa real del producto. Son **91 productos activos que no están al 13 %** (44 al 1 %, 15 al 2 %, 9 al 4 %, 6 exentos, 3 al 8 %) y a los que se les estaba quitando un impuesto que no pagan, corriéndoles el margen. **Faltan Facturación y el catálogo del agente**, que lee Alegra en vivo*
- [ ] Retirar `alegra_products_cache`. **Son 22 archivos del backend los que la leen**, no solo los catálogos: revisión de precios, cotizaciones, rentabilidad, auditorías de inventario, el portal, los reportes y varios scripts. Se retira cuando todos lean `producto`
- [ ] Retirar la sincronización de productos cada 6 horas
- [ ] Datos a corregir entre los activos (medido al cargar): 14 sin impuesto, 42 sin categoría y 10 medicamentos sin registro sanitario. Además, 9 productos al 4 % y 3 al 8 % coinciden con los que dejó mal el error de ids de impuesto

**Hallazgos de esta sección:**
- **El mismo bug está en `developer` y `main`, y ahí sí llegó a las facturas emitidas.** Medido contra las 5.398 copiadas: 213 líneas en 147 facturas de productos al 1 % salieron al 13 % (₡47.201,72 de IVA de más), 13 líneas al 2 % al 13 % (₡28.427,80) y 6 exentas al 13 %. No es una reclasificación de tarifas: el **mismo producto** aparece a las dos tarifas en el mismo período (LAPICERO BIC AZUL, 85 líneas al 1 % y 84 al 13 % entre 2024 y 2026), o sea que depende del camino que creó la factura. En sentido contrario hay 67 líneas de productos al 13 % facturadas al 0 % (−₡47.447,71) y 13 al 0,5 %, que **pueden ser exoneraciones legítimas** y hay que mirarlas con el contador antes de afirmar nada. Corregir lo ya emitido va con el trabajo de Hacienda; **corregir el código de producción es aparte y urgente**, porque cada venta nueva de un producto al 1 % se sigue emitiendo al 13 %.
- **La pantalla cobraba 13 % sobre productos al 1 % y al 2 %. CORREGIDO** (`useFacturacion.js`). Cada línea nacía con `tax: impuestoDefault`, o sea el impuesto **principal de la factura**, ignorando el del producto; el cálculo de totales sí respeta la tarifa de la línea, pero nunca le llegaba una. En una factura de prueba con un producto al 1 % y otro al 2 % la pantalla mostraba ₡1.907,89 y el servidor guardaba ₡1.716,07: **₡191,82 de diferencia entre lo que se le cobra al cliente y lo que dice la factura**. Es la misma familia del IVA 13 % fijo, sobreviviendo en otro lugar. Ahora la línea toma la tarifa del maestro, que es la que el servidor cobra.
- **Y la etiqueta mentía aunque el monto estuviera bien**: decía "IVA 13 % (13%)" —el nombre del impuesto principal— al lado de un monto que era 1 % + 2 %. Ahora dice las tarifas que de verdad hay en la factura: "IVA (1%, 2%)".
- **Las cuatro fuentes de la pantalla estaban en 404** en la rama (`/alegra/facturacion/taxes`, `/payment-methods`, `/items`, `/contacts`), porque ese submontaje se retiró al mover Facturación a su propio prefijo. No se veía: `getImpuestos()` se tragaba el error y devolvía una lista escrita a mano con IVA 13 %. Un respaldo silencioso que contesta un número equivocado es peor que un error.

- **Tres productos que parecían dejar margen se están vendiendo al costo.** El clasificador de costos asumía 13 % de IVA para todos. De los 67 productos activos con costo y tarifa distinta de 13 %, a 5 les da pérdida con su tarifa real y **3 de esos aparentaban estar sanos**: GALON SALSA LIZANO 5L (₡12.000 de costo contra ₡11.881 de precio), MAYONESA DEL CHEF SOBRES 1X250 y SALSA TOMATE EL CHEF SOBRES 1X250 — los tres al 1 %. Asumir el 13 % les subestimaba el costo un 11,1 % en promedio. Para revisar con el contador junto con el resto de las correcciones.
- Un JSON mal formado respondía 500 en todo el sistema; en esta rama ahora responde 400. **En `main` sigue igual.**
- "Agregar marcas" sugiere la referencia siguiente leyendo la caché de Alegra, así que no ve los productos creados solo en la base propia. Pasa a leer `producto` cuando se retire la caché.
- Las acciones de cada tarjeta (sugerir foto, agregar marca, editar) aparecen solo al pasar el mouse, así que en el teléfono no se llega a ellas. El problema ya estaba antes.

**Lista cuando:** se puede crear, editar y desactivar cualquier producto sin
abrir Alegra.

---

## 3. Clientes

**Hoy en Alegra:** 204 clientes y **ninguna pantalla** para crearlos ni
editarlos. La integración tiene los métodos, pero nadie los llama.
Facturación los busca en la caché que viene de Alegra. El portal usa
`alegra_contact_id`.

- [x] Tabla `cliente` (migración `independencia/006`): tipo y número de identificación, nombre, hasta 4 correos, tres teléfonos, provincia, cantón, distrito, barrio y señas, actividad económica, plazo y límite de crédito, exoneración, observaciones y estado. *Falta nombre comercial y actividades secundarias: se agregan al hacer la pantalla*
- [x] Carga inicial con `scripts/independencia/cargar-contactos.js`: **247 clientes**, no 204. En Alegra hay 43 contactos sin ningún tipo puesto que son clientes de siempre (uno tiene 1.549 ventas), así que el contacto sin tipo cuenta como cliente
- [x] Pantalla de clientes: pestaña **Fichas** en `/clientes`, con listar, buscar (nombre, cédula o correo), filtrar por estado, crear, editar y desactivar. La tarjeta muestra lo que falta como falta ("Sin correo", "Sin teléfono") para verlo sin abrir cada ficha. Las otras pestañas (Pedidos, Cuentas del portal, Tablets) quedan igual
- [ ] Validar la identificación según su tipo (física, jurídica, DIMEX, NITE) y validar teléfonos (lección de los teléfonos sucios)
- [ ] Traer las actividades económicas por cédula desde la consulta pública de Hacienda al crear o editar
- [ ] Ficha del cliente con facturas, saldo, abonos, pedidos e historial de compras. Hoy está repartido entre CxC, Reporte de Clientes y portal
- [ ] Portal, catálogo del agente, CxC y WhatsApp usando `cliente.id`
- [ ] Datos a completar, medidos al cargar los 247: 212 sin correo, 245 sin actividad económica, 75 sin un teléfono usable, 24 sin identificación y 1 con un tipo que el sistema no conoce. *Va al final, junto con Hacienda*

**Hallazgos de esta sección:**
- 9 clientes con ventas en el histórico (90 facturas en total, la mayor con 24) ya **no existen como contacto en Alegra**: alguien los borró allá. Al cargar las facturas hay que crearlos desde el nombre que quedó en la venta, o las facturas se quedarían sin cliente.
- 3 contactos son cliente y proveedor a la vez; están en las dos tablas, con el mismo `alegra_id`.

**Lista cuando:** se puede dar de alta un cliente nuevo y facturarle sin
abrir Alegra.

---

## 4. Proveedores

**Hoy repartido en tres lugares:** el mapeo por cédula
(`supplier_product_mapping`, 36 cédulas), la tabla `proveedores` (25 filas y
sin cédula) y 34 contactos en Alegra que se crean al enviar compras.

- [x] Tabla `proveedor` por cédula (migración `independencia/006`): nombre, tipo y número de identificación, correo, teléfono, plazo, observaciones y estado; los contactos de pedido ya existen en `proveedor_contactos`
- [ ] Unificar las tres fuentes en una sola lista. *Avance: `cargar-contactos.js` junta los 34 de Alegra con las 8 cédulas que solo estaban en `supplier_product_mapping` = **42 proveedores**, sin ninguna cédula repetida. La migración `independencia/007` agrega el teléfono de WhatsApp (18 traídos de `proveedor_contactos`, que se busca por nombre) y `legacy_id`, el puente con la tabla vieja. Falta absorber la tabla vieja: no es solo mover datos, hay que migrar las consultas de Faltantes, Productos, Facturas y los reportes, que llegan por `productos.proveedor_id`*
- [x] Pantalla de proveedores: pestaña **Fichas** en Reporte Proveedores (`/reportes/proveedores`), con listar, buscar, crear, editar y desactivar. Cada tarjeta dice cuántos productos le compramos y cuántas facturas suyas entraron; la ficha abierta muestra sus últimas 10 facturas y lo que más le compramos. *El saldo llega con la sección de Compras: los pagos todavía están en Alegra*
- [ ] Mapeo producto ↔ proveedor apuntando a `producto.id` y `proveedor.id`

**Hallazgos de esta sección:**
- La tabla vieja `proveedores` tiene **25 filas para 17 proveedores**: el mismo está repetido hasta 3 veces, con el mismo teléfono y el mismo correo. Y los productos quedaron repartidos entre las copias (CADENA COMERCIAL RAMONENSE: 34 productos en una fila y 1 en la otra; GRUPO BÁSICO: 19 y 1). Absorberla es consolidar esas copias primero, o los productos de un proveedor van a seguir viéndose partidos en dos.
- Por eso el puente quedó en 16 de 25: las copias repetidas no se pueden enlazar sin decidir cuál manda.
- El "saldo" del proveedor no existe todavía en la base propia: las facturas del buzón (`facturas_proveedores`, 862) no registran pagos, que hoy viven en Alegra. Llega con la sección de Compras.

**Lista cuando:** hay una sola lista de proveedores, identificada por cédula.

---

## 5. Inventario

**Hoy las existencias viven solo en Alegra:** 2.013 productos inventariables,
**457 en negativo**. Las auditorías ajustan con `POST /inventory-adjustments`
(98 hechos). La factura de Alegra descuenta y la compra enviada a Alegra
suma. Liquidación sin stock lee las existencias de Alegra. Hay una segunda
bodega creada por error ("FABULOSO BOLSA 750 ML.").

- [ ] Tabla `movimiento_inventario` (kardex) con su tipo (inicial, venta, nota de crédito, compra, ajuste por auditoría, devolución a proveedor), cantidad, costo, documento de origen, usuario y fecha
- [ ] Existencia y costo promedio calculados a partir de los movimientos
- [ ] **Conteo físico completo antes de cargar existencias.** No arrancar con los 457 negativos
- [ ] Cada operación mueve inventario: la venta descuenta, la nota de crédito devuelve, la compra suma y la auditoría ajusta
- [ ] Pantalla de existencias con filtros y kardex por producto
- [ ] Auditoría de inventario escribiendo movimientos propios
- [ ] Liquidación sin stock y excesos leyendo existencias propias
- [ ] Alerta de stock bajo y compras sugeridas desde existencias propias
- [ ] Una sola bodega, "Principal"

**Lista cuando:** la existencia de cualquier producto se explica movimiento
por movimiento.

---

## 6. Facturación (ventas)

**Hoy en Alegra:**
- Crea la factura con `POST /invoices`, con caché sin conexión y cola de pendientes.
- Edita por `PUT /alegra/facturas/:id`, que termina en Alegra.
- El PDF y la numeración son de Alegra.
- Anula con `/void`, pero solo desde el módulo de duplicados.
- Hay 5.398 facturas históricas.

- [x] Tablas `factura` y `factura_linea` (migración `independencia/008`): copia fija del cliente y del producto, fechas, condición y plazo, medio de pago, subtotal, descuento, impuesto **por línea con su tarifa**, total, pagado y saldo, estado (borrador, emitida o anulada), tipo (factura o tiquete), serie, consecutivo, clave de Hacienda y `alegra_id` opcional. La copia de las 5.398 se hace con `scripts/independencia/cargar-facturas.js`
- [x] Consecutivo propio, tomado con bloqueo para que no se repita (migración `independencia/011` y `facturacion/consecutivo.js`). Las cuatro series se sembraron **continuando lo emitido**: factura 4869, nota de crédito 82, tiquete 1970 y factura electrónica 2463. Las electrónicas quedan inactivas hasta que se decida emitir ante Hacienda, y el numerador se niega a emitir con una serie inactiva. El número se arma distinto en cada serie: la no electrónica pega el consecutivo tal cual, la electrónica lo rellena a 10 dígitos
- [x] Crear factura con la misma pantalla y un backend nuevo, conservando la idempotencia (`factura_intento`) y la cola sin conexión. **La pantalla ya no toca Alegra**: los cuatro caminos de envío —envío directo, sincronización de la cola, reintento de una y envío inmediato de una pendiente— van a `POST /api/facturacion/facturas`, y las lecturas (productos, clientes, impuestos, métodos de pago, precarga, búsqueda y apertura de una factura) salen de la base propia. El pedido viaja con **nuestros** ids (`clienteId`, `productoId`), no con los de Alegra, para que una venta deje de depender de la columna `alegra_id`. La traducción a la forma vieja (`numberTemplate`, `client`, `items`) vive en `frontend/src/services/facturaPropiaAdaptador.js`, **no en el servidor**: meter el vocabulario de Alegra en nuestra propia API sería dejarlo ahí para siempre; en el frontend se borra el día que esos componentes hablen nuestro idioma. **La edición se enruta por la marca `esPropia`, nunca por el id**: nuestros ids son seriales (1, 2, 3…) y mandar uno a la ruta de Alegra no da error, edita OTRA factura. Verificado en el navegador de punta a punta: cliente, dos productos, Facturar → nació la 001000014869 continuando la serie, con el único envío a `/facturacion/facturas` y cero llamadas a Alegra; la factura de prueba se borró y el consecutivo volvió a 4869
- [x] **Editar factura**, dejando registro en la bitácora (`PUT /api/facturacion/facturas/:id`). Se edita mientras no sea electrónica, no tenga cobros aplicados y no tenga nota de crédito; una vez emitida electrónicamente se corrige con nota de crédito. El número, la serie y la fecha NO cambian: es el mismo documento con otro contenido. Las líneas se reemplazan enteras, porque una factura corregida puede tener menos que antes
- [x] Anular factura con motivo (`PATCH /api/facturacion/facturas/:id/anular`). **No borra**: conserva su número y queda en estado `anulada` con el motivo escrito, porque un número que desaparece es un hueco que hay que explicarle a Hacienda. Sin motivo no se anula. **Con un cobro aplicado NO se anula**: primero hay que revertir el cobro, y el mensaje dice cuánto es. Una electrónica tampoco: se corrige con nota de crédito. Anular lo ya anulado no es un error. Verificado en vivo el ciclo completo: crear → editar → anular, con la bitácora registrando los tres pasos
- [ ] **Notas de crédito** por devolución total o parcial, error o anulación, devolviendo al inventario. Hoy se hacen **a mano en Alegra** (27, con motivos como "error", "devolución" y "anular")
- [x] PDF propio de la factura (`facturacion/factura.pdf.js`, `GET /api/facturacion/facturas/:id/pdf`). Es lo que desata el nudo: mientras el papel lo hiciera Alegra, no se podía facturar sin Alegra, porque quien vende en el mostrador tiene que entregar algo impreso. Comparte paleta, logo y fuentes con la cotización y la orden de compra (`utils/marcaPdf.js`). **Una factura anulada lo grita**: sello diagonal en cada página y el motivo junto al número, porque un papel anulado que se ve igual que uno válido es como se cobra dos veces lo mismo. **El impuesto va desglosado por tarifa** —acá se vende al 1 %, 2 %, 4 % y 13 % en la misma factura— y la tarifa que no aporta impuesto no ensucia los totales. La columna de descuento solo sale si alguna línea la usa. Verificado mirando papeles reales de la copia local (5 tarifas, 116 líneas en 6 páginas, anulada, con cobro y con nota de crédito) y por HTTP
- [ ] Envío por WhatsApp y correo con el PDF propio
- [x] Buscar facturas por número, cliente o fecha en la base propia (`facturacion/facturaConsulta.service.js`, `GET /api/facturacion/facturas` y `GET /api/facturacion/facturas/:id`). El saldo se **calcula** —total, menos los cobros vigentes, menos las notas de crédito vigentes—, no se guarda: un cobro que se anula tiene que devolver el saldo solo, sin que nadie corra nada. Se busca por la **terminación** del número, porque en el mostrador se dice "la 4868" y no "la 001000014868", y por nombre o cédula del cliente sin acentos. El listado no trae las líneas, solo cuántas son; salen al abrir la factura, junto con sus cobros y sus notas de crédito, y **los cobros anulados aparecen marcados, no escondidos**, porque el cliente va a preguntar por ese cobro y tiene que haber rastro. Tope de 100 filas por página. Verificado contra la copia local y por HTTP: las 72 facturas con saldo (₡2.537.665,10) coinciden con el control en SQL. Falta que la pantalla las consuma
- [x] Impuesto calculado por línea con la tarifa del producto (lecciones: IVA 13 % hardcodeado y precio sin IVA vs costo con IVA). La tarifa sale de `producto.impuesto_id`, **no del `tax.id` que manda el navegador**: ya pasó que esos ids estuvieran mal y 82 líneas al 1 % se registraran al 4 %. Cada línea guarda su tarifa y su monto, así que una factura de hace dos años se explica sola
- [ ] Descuentos por línea y ofertas de exceso y liquidación (lección de las dos clases de oferta). *Avance: el descuento por línea ya se guarda en porcentaje Y en monto, y baja la base del impuesto antes de calcularlo (verificado: 10 % sobre ₡3.000 → base ₡2.700, IVA ₡351). Faltan las ofertas de exceso y liquidación, que son la otra clase*
- [ ] Retirar el módulo `duplicados-electronica`, que solo existe por cómo Alegra convierte facturas
- [ ] Dejar el espacio para la emisión electrónica pospuesta: la factura guarda todo lo necesario para emitirla después sin rehacer el modelo

**Hallazgos de esta sección:**
- **El permiso del módulo Facturación no se estaba aplicando. CORREGIDO y en producción** (developer 375e8d9, main 49dfbed). Sus rutas vivían en `/api/alegra/facturacion/...` y `/alegra` está en `COMPARTIDAS`, así que el middleware las dejaba pasar a cualquiera con sesión, incluido el `POST` que crea la factura. Ahora se montan en `/api/facturacion`, su propio prefijo, y el permiso vale solo. Comprobado contra producción con dos usuarios reales: sin el módulo, 403 en GET y en POST (antes 200); con el módulo, 200; la ruta vieja, 404. No se amplió la lista de compartidas: eso habría tapado el síntoma.
- **La copia de las 5.398 facturas** (52.357 líneas, 16 min) dejó: 5.242 emitidas, 132 anuladas, 24 borradores y 12 tiquetes. Sin enlazar: 210 sin condición de venta, 67 con un plazo que no calza, 17 con un cliente que ya no existe en Alegra y 1 con un método de pago desconocido.
- **4 de las 27 notas de crédito no dicen ningún motivo** y suman ₡417.250; otras 3 traen un texto que no calza con ninguna categoría, y 2 no acreditan ninguna factura. El motivo es texto libre en Alegra. Hay que revisarlas con el contador antes del corte.
- La factura de Alegra trae `term` como **texto** ("De contado"), no como el objeto con `id` que mandan los contactos: el plazo hay que calzarlo por nombre o días al copiar.
- Apareció un plazo **"14 días"** que no está en el catálogo (contado, 8, 15, 22, 30 y 60) ni vino de `GET /terms`: alguien lo escribió suelto en esa factura. Se guarda el texto y queda sin plazo enlazado. Decidir si se agrega al catálogo o se corrige esa factura.
- El impuesto de cada línea viene con todo el árbol de categorías contables de Alegra; de ahí solo sirven `id`, `percentage` y `amount`.
- **Buscar por nombre devolvía TODAS las facturas. CORREGIDO** (`facturaConsulta.service.js`). El patrón por número se armaba quitándole a lo buscado todo lo que no fuera dígito; un nombre lo dejaba en cadena vacía, el patrón quedaba en `'%'` y `numero LIKE '%'` calzaba con las 5.398. Buscar "SUPER" devolvía el histórico completo; ahora devuelve 1.177, y "SUPER LA CENTRAL" 84, todas de ese cliente. El número solo se compara si lo buscado trae dígitos, y quedó cubierto con prueba.
- **Tres cosas que solo se vieron MIRANDO el papel**, no en las pruebas: (1) donde va la fecha decía **"Invalid Date"**, porque `fechaLarga` recortaba `String(fecha)` a diez caracteres y las columnas DATE de Postgres llegan como objeto `Date` —las cotizaciones no lo notaron porque sus fechas vienen de Alegra como texto—; (2) el **importe de cada línea traía el impuesto adentro** mientras el precio unitario iba sin él, así que 3 × ₡464,60 daba ₡1.575 y el cliente que multiplica no le cuadraba; ahora la columna suma exactamente el Subtotal; (3) un **nombre largo de cliente se partía en dos líneas y la segunda pisaba la cédula** ("CENTRO DE TORNILLOS PALMARES LIMITADA"). Las tres corregidas y cubiertas con prueba.
- La factura `00100001010000002164` es el caso de prueba del saldo: tiene un cobro **anulado** por ₡84.127,90 (pago 721) y una nota de crédito por el mismo monto (nota 17, "duplica documento"). Su saldo es ₡0 **por la nota**, no por el cobro, y `cobrado` sale ₡0. Contar el cobro anulado la mostraría pagada — era la única diferencia contra Alegra en la conciliación de los 1.350 pagos.

**Lista cuando:** se puede vender, editar, anular y devolver sin abrir Alegra.

---

## 7. Cobros, cuentas por cobrar y caja

**Hoy en Alegra:** CxC se sincroniza cada 30 minutos y los abonos van a
`POST /payments`. Hay 1.349 pagos, todos a "Caja general". **Del último mes,
135 de 150 pagos no traen observación y no salen de nuestro sistema**:
parecen registrarse a mano en Alegra. Hay que confirmarlo con quien cobra.

- [x] Tabla `pago` y `pago_factura` (migración `independencia/009`): facturas a las que se aplica, método, cuenta de dinero, referencia (número de SINPE) y usuario. Un abono puede repartirse entre varias facturas. **Los 1.350 cobros están copiados** (₡212.222.730, aplicados a 5.222 facturas) y cuadran: 5.242 de 5.242 facturas coinciden con lo que Alegra dice que se pagó
- [ ] **Al calcular el saldo, un cobro ANULADO no cuenta.** Hay uno así entre los 1.350 (₡84.127,90 en la factura 00100001010000002164): Alegra la reporta con 0 pagado justamente porque el cobro se anuló. Sumar `pago_factura` sin filtrar `pago.anulado` la mostraría como pagada
- [ ] Saldo de cada factura calculado: total menos pagos menos notas de crédito
- [ ] Registrar el cobro de contado al facturar, para que no haga falta ir a Alegra
- [ ] Registrar abonos desde la misma pantalla de CxC, sobre la base propia
- [ ] **Cierre de caja diario**: efectivo esperado contra efectivo contado. Hoy existe "Cobros del día" en CxC, que resume por método lo cobrado y lo lista, pero no compara contra lo contado
- [ ] Recordatorios de saldo por WhatsApp calculados con el saldo propio
- [ ] Portal: saldo y facturas del cliente desde tablas propias
- [ ] Retirar la sincronización de CxC cada 30 minutos

**Lista cuando:** nadie tiene que entrar a Alegra para marcar una factura
como pagada.

---

## 8. Compras

**Hoy:** el correo trae el XML, se guarda en `facturas_proveedores` (862 con
XML), se relaciona y pasa por Revisión de Precios. Al final va a
`POST /bills` en Alegra: las 150 recientes dicen "Importada automáticamente".
Además cambia precios con `PUT /items`. Gastos recurrentes crea productos y
contactos en Alegra.

- [ ] Tablas `compra` y `compra_linea`, armadas desde el XML que ya se guarda
- [ ] "Enviar a Alegra" pasa a ser "Registrar compra": suma inventario, actualiza el costo y crea la cuenta por pagar
- [ ] El cambio de precio de venta se guarda en `producto`
- [ ] Devolver la factura al proveedor o rechazarla
- [ ] Guardar el estado de aceptación de cada compra. El envío del mensaje receptor queda con la emisión electrónica
- [ ] Gastos recurrentes sin crear productos ni contactos en Alegra
- [ ] Órdenes de compra por WhatsApp usando `producto.id`

**Lista cuando:** una compra entra al inventario y a CxP sin tocar Alegra.

---

## 9. Cuentas por pagar y pagos a proveedores

**Hoy ya son locales:** 318 cuentas por pagar y 18 notas de crédito de
proveedor. Dependen poco de Alegra.

- [ ] Usar `proveedor.id` y `compra.id`
- [ ] Registrar el pago a proveedor como egreso de una cuenta de dinero
- [ ] Registrar los gastos recurrentes como egresos

**Lista cuando:** entradas y salidas de dinero cuadran por cuenta.

---

## 10. Cotizaciones

**Hoy en Alegra:** se crean, editan y borran en `/estimates` (hay 2). El PDF
y el enlace público ya son propios. Facturar una cotización crea la factura
en Alegra.

- [ ] Tablas `cotizacion` y `cotizacion_linea`, y cargar las 2 existentes
- [ ] Crear, editar, borrar, vencer y facturar, generando una factura propia

---

## 11. Bodega, impresión y faltantes

**Hoy leen de Alegra:** Facturas en Bodega, Impresión y reimpresión, y
Faltantes leen las facturas de Alegra por periodo y cambian su estado usando
el `alegraId`.

- [ ] Leer las facturas propias
- [ ] Estados de alistado por `factura.id`
- [ ] Faltantes y ajustes con `producto.id` y `factura.id`

---

## 12. Portal de clientes y catálogos

**Hoy dependen de lo sincronizado:** leen `alegra_products_cache` y
`venta_historico`, que se llena desde Alegra. Facturar un pedido crea la
factura en Alegra, y el carrito usa `alegra_item_id`.

- [ ] Productos, ofertas y categorías leídos de `producto`
- [ ] Historial y sugerencias desde `factura_linea`, y retirar la sincronización del historial
- [ ] Un pedido facturado genera una factura propia
- [ ] Cliente del portal ligado a `cliente.id`
- [ ] Caché del catálogo del agente (IndexedDB) con ids propios, invalidando la caché vieja

---

## 13. Reportes

**Hoy dependen de lo sincronizado:** Dashboard y Rentabilidad leen tablas
locales que se llenan desde Alegra. El Reporte para el contador importa
facturas y notas de crédito desde Alegra.

- [ ] Dashboard desde tablas propias
- [ ] Rentabilidad y fotografía de márgenes desde `producto` y `factura_linea`
- [ ] Reportes de proveedores y de clientes
- [ ] Reporte para el contador desde datos propios: ventas, compras, notas de crédito e IVA por tarifa
- [ ] Exportar a Excel (`xlsx` ya está instalado)

---

## 14. Usuarios y permisos

**Hoy ya son locales.**

- [ ] Permisos para los módulos nuevos: clientes, productos, inventario, caja, notas de crédito y configuración
- [ ] Definir qué acciones requieren administrador: anular, nota de crédito, ajustar inventario, editar una factura emitida y cerrar caja
- [ ] Pantalla para consultar la bitácora

---

## 15. Migración y corte

- [ ] Script de carga desde Alegra, de solo lectura y repetible: productos, clientes, proveedores, facturas con líneas, pagos, notas de crédito, compras, cotizaciones y existencias
- [ ] Bajar el PDF y el XML de las facturas electrónicas que emitió Alegra, que hay que conservar 5 años
- [ ] Conciliación: cantidades y totales por mes iguales entre Alegra y la base propia
- [ ] Ensayo de corte completo en la base de la rama
- [ ] Plan de corte: qué día, qué se congela en Alegra y cómo se vuelve atrás

---

## 16. Retiro de Alegra del código

- [ ] Quitar las sincronizaciones de productos (6 h), CxC (30 min) e historial de clientes
- [ ] Quitar `integrations/alegra` y las rutas `/alegra/*`: 1.645 líneas del backend y 669 del frontend
- [ ] Dejar las columnas `alegra_*` solo como referencia histórica
- [ ] Una prueba que falle si algún archivo vuelve a importar la integración de Alegra

---

## Pospuesto

- [ ] Emisión electrónica propia ante Hacienda (ver el plan)

## Orden sugerido

**0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16**

Todo cuelga de productos y clientes. Facturación va después de inventario
para que cada venta ya descuente existencias propias. Cobros va pegado a
facturación para que no quede ninguna factura cuyo pago viva en otro lado.
