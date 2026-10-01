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
  ven desde la otra, y cada una tiene su `.env` y sus fotos. **`node_modules`
  NO es de cada una**: `backend/node_modules` de esta rama es un enlace
  simbólico al de `sistema-facturas-cr` (`main`/`developer`) — corregido acá
  porque esta misma página lo decía distinto más abajo (§4, migración 018).
  Por eso ninguna tabla o columna nueva pasa por Prisma: todo va por SQL en
  `migrations/independencia/` y se lee con `pg`, nunca con `prisma generate`,
  que le cambiaría el cliente a la otra rama. `.env.aislado` y
  `almacenamiento/` viven **solo** en la carpeta de la rama.
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
  Se aplican a la base local y el script de refresco las vuelve a correr
  todas, en orden, sobre cada copia nueva de producción. NO se copian a
  `setupDatabase.js` (ver §15: ese script no puede montar esta base).
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
- [x] Series y consecutivos propios, que no choquen con los de Alegra. Factura no electrónica `00100001` continuando en 4869; nota de crédito propia `00100003` desde 1 (migraciones `independencia/011` y `012`). Las electrónicas quedan inactivas y el numerador se niega a emitir con una serie inactiva. El consecutivo se toma con bloqueo dentro de la transacción de la factura: si algo falla, el número no se gasta
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
- [x] **Facturación, catálogo del agente, catálogo de clientes y portal leyendo de `producto`.** Ya estaban el catálogo de clientes, las ofertas por baja de precio, TODO el portal y Facturación (que lee de `/maestro/productos`). Faltaba **el catálogo del agente, que era un proxy de solo lectura a Alegra**: la tablet paginaba de a 30 *contra Alegra*, así que sincronizar el catálogo en el campo dependía de que Alegra contestara — era la última pantalla que lo hacía. Qué es un producto visible no se redefine ahí: sale de `catalogo-clientes/consultaProducto`, el mismo lugar que usan el catálogo de clientes y el portal. **Se conservan los nombres de Alegra en la respuesta** (`name`, `price`, `tax`, `images`) porque la tablet los lee así y guarda el catálogo sin conexión; cambiarlos obligaría a resincronizar todas las tablets el mismo día (deuda de §16). **NO se manda `inventory`, a propósito**: el maestro propio todavía no lleva existencias, y mandar un inventario vacío hacía que la tarjeta contara cero disponibles y marcara **todo el catálogo como "Agotado"** — la tarjeta ahora distingue "no se sabe" de "cero" y no dice nada cuando no hay dato. Verificado en el navegador: la tablet sincronizó los **2.012 productos** desde nuestra base, con fotos, precios y rebajas, sin una sola petición a Alegra
- [x] **Gestión de Catálogo con el rediseño de `main`, sobre el maestro propio
  (2026-09-24).** Se trajo de `developer` la pantalla nueva (tarjetas de
  resumen, categorías en el orden del agente con sus subcategorías, barra de
  lote) y se conectó a `producto`: la subcategoría pasó a
  `producto.subcategoria_id` (migración 030, con las 2.075 clasificaciones
  que ya había en `main`) y árbol, lista, búsqueda y lotes van por
  `/maestro/*` (`productos/taxonomia.service.js`). Cambiar de categoría es
  inmediato —en `main` es un trabajo de fondo contra Alegra—. La ficha sigue
  siendo la propia (CABYS, impuesto, ocultar, dar de baja) y los ocultos y
  dados de baja se buscan con el filtro de estado. El catálogo del agente lee
  la subcategoría del mismo lugar. Verificado en el navegador (1440 y 390 px,
  sin desborde ni llamadas a Alegra) y por HTTP: clasificar, rechazar un
  producto de otra categoría, cambiar de categoría, mover una subcategoría
  entera, no borrar una con productos, nombre visible — todo devuelto
  después. **Antes del corte:** `cargar-productos.js` copia lo que `main`
  siga clasificando
- [ ] Retirar `alegra_products_cache`. **Medido el 17 de setiembre de 2026: la consultan de verdad 20 archivos** (7 son scripts), y los que más la usan son justamente los módulos que todavía no se migran: `productos-revision` (23 usos) y `revision-precios` (13) de Compras, `catalogo.service` (12), `inventario-auditorias` (4), `cotizaciones` (3), rentabilidad y reportes. **No es una tarea independiente: es la consecuencia de migrar las secciones 5, 8, 10 y 13.** Los catálogos y el portal ya no la tocan
- [ ] Retirar la sincronización de productos cada 6 horas. *Bloqueado por lo mismo: es la que llena esa caché*
- [ ] Datos a corregir entre los activos (medido al cargar): 14 sin impuesto, 42 sin categoría y 10 medicamentos sin registro sanitario. Además, 9 productos al 4 % y 3 al 8 % coinciden con los que dejó mal el error de ids de impuesto

**Hallazgos de esta sección:**
- **Tres productos que parecían dejar margen se están vendiendo al costo.** El clasificador de costos asumía 13 % de IVA para todos. De los 67 productos activos con costo y tarifa distinta de 13 %, a 5 les da pérdida con su tarifa real y **3 de esos aparentaban estar sanos**: GALON SALSA LIZANO 5L (₡12.000 de costo contra ₡11.881 de precio), MAYONESA DEL CHEF SOBRES 1X250 y SALSA TOMATE EL CHEF SOBRES 1X250 — los tres al 1 %. Asumir el 13 % les subestimaba el costo un 11,1 % en promedio. Para revisar con el contador junto con el resto de las correcciones.
- Un JSON mal formado respondía 500 en todo el sistema; en esta rama ahora responde 400. **En `main` sigue igual.**
- "Agregar marcas" sugiere la referencia siguiente leyendo la caché de Alegra, así que no ve los productos creados solo en la base propia. Pasa a leer `producto` cuando se retire la caché.
- Las acciones de cada tarjeta (sugerir foto, agregar marca, editar) aparecen solo al pasar el mouse, así que en el teléfono no se llega a ellas. El problema ya estaba antes.

- **El catálogo del agente no se partía por categoría en esta rama.
  CORREGIDO (2026-09-24).** La tablet agrupa por `itemCategory` —como lo
  llama Alegra— y la versión propia mandaba `category`: los 2.012 productos
  caían en "Otros" y la barra de categorías quedaba vacía. La verificación de
  la sincronización contó productos y fotos, no categorías. Se vio al traer
  de `developer` las familias por subcategoría.

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
- [x] **Validar la identificación según su tipo y los teléfonos.** El largo ya se revisaba, y eso dejaba pasar `1ABCD6789` como cédula física —tiene nueve caracteres— y `1102920581` como jurídica. Ahora los cuatro tipos numéricos exigen solo dígitos y la jurídica tiene que empezar con 3. **Las reglas se contrastaron contra las 247 fichas cargadas antes de escribirlas**: la regla de "provincia del 1 al 7" que uno esperaría para la cédula física habría dejado ocho clientes reales sin poder guardarse (los hay que empiezan con 8 y 9), así que no se puso; tampoco se inventó un prefijo para DIMEX ni NITE, de los que hay dos fichas y ninguna. Las 247 siguen pudiéndose guardar. Los teléfonos ya estaban: `validarTelefonoEscrito` limpia lo que viene sucio ("72366788  KENDALL" → "7236 6788") en vez de rechazarlo
- [x] **Avisar cuando una identificación ya está usada** (`GET /api/clientes/coincidencias`). **Avisa, no bloquea**: 139 fichas comparten `100000000`, el número del cliente de mostrador, así que prohibir el repetido dejaría sin poder crear la próxima pulpería. Pero cuando es una cédula de verdad el repetido importa —hay dos fichas de WILBERTH BUZANO y dos de OG PWR HOUSE— y quien llena la ficha es el único que puede decir si son el mismo negocio o dos sucursales. El formulario lo consulta medio segundo después de dejar de escribir y muestra con quién choca, con el total: *"Ya hay 2 fichas con esa identificación: OG PWR HOUSE… Se puede guardar igual."*
- [x] **Traer las actividades económicas por cédula desde Hacienda** (`integrations/hacienda`, `GET /api/clientes/hacienda/:identificacion`). Botón *Consultar en Hacienda* en la ficha: trae el nombre legal, el tipo de identificación, el régimen, si está **moroso u omiso** —que quien da crédito querría saber antes de darlo— y las actividades activas, con la principal de primera. **Se propone, no se pisa**: el nombre legal casi nunca es el que usa la casa ("OG PWR HOUSE SOCIEDAD DE RESPONSABILIDAD LIMITADA" contra "OG PWR HOUSE …-GYM Palmares") y reemplazarlo dejaría fichas que nadie reconoce; hay un botón aparte para tomarlo. El tipo sí se pone solo **cuando está vacío**, porque no hay nada que pisar. Las actividades dadas de baja no se ofrecen: no sirven para facturar. **Si Hacienda no contesta, la ficha se guarda igual** — un servicio de terceros caído no puede impedir dar de alta a un cliente. *No es una "salida al mundo real" de las que bloquea `config/aislado`: es una lectura pública que no cambia nada en ningún lado, así que corre también aislado.* Verificado en vivo contra el servicio: una jurídica con 3 actividades, una cédula no inscrita y el tipo puesto solo
- [x] **Ficha del cliente con todo junto** (`clientes.resumen.service.js`, `GET /api/clientes/:id/resumen`). Se abre tocando el nombre en la lista de fichas. Trae lo que debe hoy —saldo, vencido, facturas y **crédito disponible**—, cómo viene comprando en 12 meses (facturado, facturas, promedio, última compra), las últimas 10 facturas con su saldo, los últimos 10 abonos, qué se lleva y sus pedidos del portal. Todo de la base propia y en consultas paralelas: las 5.398 facturas tienen sus **52.357 líneas** copiadas, así que el historial ya no necesita `venta_historico`. **Sin límite de crédito puesto no se inventa un porcentaje** —decir "₡0 disponible" haría creer que no tiene crédito, y lo que pasa es que nadie se lo escribió— y sobregirado se muestra en negativo, que es justo el caso que hay que ver. Tres cosas aparecieron al mirarlo en pantalla y se corrigieron: el método del abono salía como `cash` (ahora sale del catálogo), **el mismo producto se partía en dos entradas con la mitad del monto cada una** —en unas facturas la línea trae referencia y en otras no, y se agrupaba por el texto; ahora se agrupa por producto— y un abono de octubre de 2024 se leía como si fuera de hace un mes, así que las fechas de otros años muestran el año
- [x] **Portal, catálogo del agente, CxC y WhatsApp usando `cliente.id`** (migración `independencia/017`). Se le agregó `cliente_id` a `cliente_portal`, `cliente_invitacion`, `pedido_cliente` y `envio_whatsapp`, y se rellenó: las 11 cuentas, las 27 invitaciones, el pedido y los 15 envíos con contacto encontraron su ficha. Las columnas viejas **se conservan hasta el corte**: borrarlas ahora obligaría a que todo el código nuevo esté perfecto de una. Dos cosas dejaron de depender de Alegra en el camino: **listar las cuentas recorría hasta 900 contactos de Alegra en vivo** cada vez que se abría la pestaña —ahora es una consulta a `cliente` y salen los 247, no solo los que existan allá—, y **crear una invitación le pedía la ficha a Alegra**, así que no se podía invitar a alguien que no existiera también allá ni invitar a nadie si Alegra no contestaba. Los teléfonos se siguen sacando con `telefonosDe`, que ya sabe leer fichas sucias ("7236 6788 KENDALL"): se le pasan nuestras columnas en vez de copiar la lógica. Los pedidos nuevos —del portal y del agente— guardan nuestro id, y los envíos propios (factura y recordatorio de saldo) ya lo guardaban. Verificado en el navegador: 247 clientes con sus estados (6 activos, 1 revocado, 4 vencidos, 236 sin cuenta), sin una sola petición a Alegra
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

  *Medido el 17 de setiembre de 2026:* la tabla vieja `proveedores` tiene **25 filas** y solo `id, nombre, contacto, telefono, email` —**no tiene cédula**—; 24 calzan por nombre con el maestro nuevo y la que no es "Proveedor General", un comodín con **178 productos** colgados. Hay **384 productos** ligados a esa tabla por `productos.proveedor_id`. **El maestro nuevo `producto` NO tiene columna de proveedor a propósito**: la relación vive en `supplier_product_mapping`, que ya cuelga de nuestros ids (018). Así que absorber la tabla vieja **no es mover datos: es migrar las consultas** de `product.service` (20 usos), `report.service` (9), `product.controller` (7) y `faltantes` (7) para que lean la relación de donde ahora vive. Va con las secciones 11 (Bodega y faltantes) y 13 (Reportes).
- [x] Pantalla de proveedores: pestaña **Fichas** en Reporte Proveedores (`/reportes/proveedores`), con listar, buscar, crear, editar y desactivar. Cada tarjeta dice cuántos productos le compramos y cuántas facturas suyas entraron; la ficha abierta muestra sus últimas 10 facturas y lo que más le compramos. *El saldo llega con la sección de Compras: los pagos todavía están en Alegra*
- [x] **Mapeo producto ↔ proveedor apuntando a `producto.id` y `proveedor.id`** (migración `independencia/018`). `supplier_product_mapping` se llaveaba por `alegra_item_id` y `supplier_cedula`: un id de un sistema ajeno y un texto que llega escrito de varias formas. De los **2.060 mapeos**, los 2.060 encontraron su proveedor por cédula y 2.049 su producto por el id de Alegra; **7 más se recuperaron por nombre exacto** —son `REF-…`, un id inventado de cuando el producto no tenía id de Alegra— y se verificó que cada uno calza con **un solo** producto, no con varios, porque si no estaría eligiendo al azar. Quedan **4 sin producto**: tres "TEST MEDICAMENTO API FIX" y uno borrado en Alegra; se dejan en NULL, no se borran. El índice único `(proveedor_id, supplier_code)` pasó sin conflicto: ningún proveedor tiene un código repetido. Los **cuatro** lugares que crean mapeos llenan las columnas nuevas (`ligarIdsPropios`), para que no nazcan vacíos; se hace con SQL y no con Prisma porque en esta rama `node_modules` es un enlace al árbol de producción y `prisma generate` le cambiaría el cliente a `main`. Las columnas viejas se conservan hasta el corte

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
- [x] **Notas de crédito** por devolución total o parcial, error o anulación (`facturacion/notaCredito.service.js`, `POST /api/facturacion/notas-credito` y `PATCH /notas-credito/:id/anular`). **Se acredita lo que se COBRÓ**: el precio, el descuento y la tarifa salen de la línea de la factura, no del producto de hoy — devolver al precio nuevo le regalaría plata al cliente, y al viejo se la quedaría debiendo. **No se puede acreditar más de lo facturado**, ni en monto ni por línea, contando lo que ya devolvieron otras notas vigentes; la factura se lee con bloqueo para que dos devoluciones simultáneas no pasen cada una su propia validación. **El motivo escrito es obligatorio**: de las 27 notas viejas hay 4 sin ninguno y hoy nadie sabe por qué se hicieron. Anular no borra, y el saldo de la factura vuelve solo porque se calcula. Serie propia **00100003**, no electrónica (migración `independencia/012`), decidida así porque la serie 0010000103 de las 27 existentes es formato de Hacienda y sigue viva: meter ahí un documento sin firmar sería caro de deshacer. Verificado en vivo contra la copia: devolución parcial sobre una factura real, el saldo bajó de ₡17.348 a ₡16.123,08, devolver de más dio 409, y al anular el saldo volvió solo. **Todavía NO devuelve al inventario**: no hay existencias propias —solo la bandera `inventariable`— porque el inventario espera el conteo físico (sección 5). La nota guarda la cantidad devuelta por línea, que es justo lo que el inventario va a consumir cuando exista; se dejó registrado, no simulado
- [x] PDF propio de la factura (`facturacion/factura.pdf.js`, `GET /api/facturacion/facturas/:id/pdf`). Es lo que desata el nudo: mientras el papel lo hiciera Alegra, no se podía facturar sin Alegra, porque quien vende en el mostrador tiene que entregar algo impreso. Comparte paleta, logo y fuentes con la cotización y la orden de compra (`utils/marcaPdf.js`). **Una factura anulada lo grita**: sello diagonal en cada página y el motivo junto al número, porque un papel anulado que se ve igual que uno válido es como se cobra dos veces lo mismo. **El impuesto va desglosado por tarifa** —acá se vende al 1 %, 2 %, 4 % y 13 % en la misma factura— y la tarifa que no aporta impuesto no ensucia los totales. La columna de descuento solo sale si alguna línea la usa. Verificado mirando papeles reales de la copia local (5 tarifas, 116 líneas en 6 páginas, anulada, con cobro y con nota de crédito) y por HTTP
- [x] **Envío por WhatsApp con el PDF propio** (`facturacion/facturaEnvio.service.js`, `GET /facturas/:id/telefonos` y `POST /facturas/:id/whatsapp`). El archivo se **adjunta**, no se manda un enlace: un enlace tendría que ser público y la factura lleva la cédula y la dirección del cliente. Los teléfonos se **proponen** desde la ficha —celulares primero, y lo ilegible se avisa en vez de descartarse—, y el número queda **a la vista en el botón** antes de mandar: mandarle la factura de un cliente a un desconocido es el error que importa acá y no lo evita ningún código. Una factura anulada no se manda. El envío queda registrado con nuestro `cliente_id` (migración `independencia/014`), y también cuando falla: un "no tiene WhatsApp" repetido es un teléfono que hay que corregir en la ficha. **Falta la confirmación del envío real**: la instancia de Evolution (`localhost:8080`) no estaba corriendo. Verificado hasta el borde de la red contra un doble: sale `POST /message/sendMedia/<instancia>` con el número normalizado y el PDF en base64 (~47 KB)
- [ ] **Confirmar el envío real por WhatsApp.** El código está listo y probado hasta el borde de la red, pero la instancia de Evolution no estaba corriendo (`WHATSAPP_API_URL` apunta a `localhost:8080` y ahí no había nada escuchando). Cuando esté arriba: mandar una factura al 6298 4143 y confirmar que llega el PDF. Si en producción la URL es otra, hay que revisar cuál usa Render.
- [ ] **Envío por correo con el PDF propio.** `services/emailService.js` solo LEE el buzón por IMAP: no hay envío de correo en el sistema —ni nodemailer ni SMTP configurado—, así que esto pide decidir cuenta y proveedor antes de construirlo
- [x] Buscar facturas por número, cliente o fecha en la base propia (`facturacion/facturaConsulta.service.js`, `GET /api/facturacion/facturas` y `GET /api/facturacion/facturas/:id`). El saldo se **calcula** —total, menos los cobros vigentes, menos las notas de crédito vigentes—, no se guarda: un cobro que se anula tiene que devolver el saldo solo, sin que nadie corra nada. Se busca por la **terminación** del número, porque en el mostrador se dice "la 4868" y no "la 001000014868", y por nombre o cédula del cliente sin acentos. El listado no trae las líneas, solo cuántas son; salen al abrir la factura, junto con sus cobros y sus notas de crédito, y **los cobros anulados aparecen marcados, no escondidos**, porque el cliente va a preguntar por ese cobro y tiene que haber rastro. Tope de 100 filas por página. Verificado contra la copia local y por HTTP: las 72 facturas con saldo (₡2.537.665,10) coinciden con el control en SQL. Falta que la pantalla las consuma
- [x] Impuesto calculado por línea con la tarifa del producto (lecciones: IVA 13 % hardcodeado y precio sin IVA vs costo con IVA). La tarifa sale de `producto.impuesto_id`, **no del `tax.id` que manda el navegador**: ya pasó que esos ids estuvieran mal y 82 líneas al 1 % se registraran al 4 %. Cada línea guarda su tarifa y su monto, así que una factura de hace dos años se explica sola
- [x] Descuentos por línea y **ofertas de exceso** (lección de las dos clases de oferta). El descuento por línea se guarda en porcentaje Y en monto, y baja la base del impuesto antes de calcularlo (10 % sobre ₡3.000 → base ₡2.700, IVA ₡351). Y la facturación ya **conoce las ofertas de exceso** (`facturacion/ofertas.service.js`, `GET /api/facturacion/ofertas`): el catálogo del agente y el portal ya se las mostraban al cliente, así que quien pedía viendo "−35 %" llegaba a la caja y **se le cobraba completo**. Ahora la línea nace con ese descuento y la pantalla dice *Oferta de exceso*; si el cajero lo cambia, deja de decirlo. Qué cuenta como oferta viva **no se redefine acá**: sale de `utils/descuentosExceso.js`, el único lugar donde está escrito —si cada pantalla lo decidiera por su lado, el cliente vería una oferta que al facturarla se cobra completa. De 467 productos con descuento, 34 están vivos hoy. El descuento del catálogo va sobre el precio CON impuesto y el de la factura sobre la base ANTES: el cliente paga lo mismo —P(1+t)(1−d) es P(1−d)(1+t)— y en la factura el descuento baja la base imponible, que es como debe declararse
- [x] **Retirado el módulo `duplicados-electronica`**, que solo existía por cómo Alegra convierte una factura no electrónica en electrónica: creaba un segundo documento y había que anular la copia. Nuestras facturas nacen una sola vez en nuestra base. **No era código muerto**: detectó 9 casos reales entre el 20 de agosto y el 10 de setiembre de 2026, así que sigue haciendo falta en `main` hasta el corte —y como el retiro vive solo en esta rama, eso se cumple solo. La tabla `duplicado_electronica` **se conserva** con su historial; se quitaron el módulo, su montaje, la corrida dentro de la sincronización de CxC y la ruta del permiso de Configuración
- [x] **El espacio para la emisión electrónica** (migración `independencia/015`). No la implementa —sigue pospuesta—: deja lo que obligaría a migrar las 5.398 facturas otra vez si se dejara para después. (1) **La respuesta de Hacienda**: `hacienda_estado` (pendiente/enviada/aceptada/rechazada), cuándo se envió, cuándo contestó y qué dijo. La diferencia entre *pendiente* y *enviada* es la que evita mandar dos veces el mismo documento. (2) **La naturaleza del descuento** por línea, que Hacienda exige: hoy se guardaba cuánto, no por qué. (3) **La ruta del XML firmado** —la ruta, no el contenido: son ~15 KB por factura. **Y la regla, hecha valer por la base**: `CHECK (NOT electronica OR hacienda_estado = 'aceptada')`. Un comprobante no es electrónico porque uno lo mande, sino cuando Hacienda lo acepta; sin esa restricción la pantalla diría "Factura electrónica" sobre algo rechazado. A las 531 copiadas de Alegra se les anotó `aceptada`

- [x] **Ver las facturas ya emitidas** desde la pantalla (pestaña *Facturas*): busca por número, cliente o cédula, filtra por estado y rango de fechas, y cada fila abre su detalle con líneas, cobros y notas de crédito. Desde ahí se ve el **PDF**, se **anula** con motivo y se hace una **nota de crédito**. Abre en "Con saldo" a propósito: la pregunta real frente a esa pantalla es a quién hay que cobrarle, no "mostrame todas". Mirar una factura vieja **no borra la venta en curso**.
- [x] **Cada factura tiene su propia vista**, no un desplegable dentro de la lista: con veinte líneas, un acordeón empuja el resto de las facturas fuera de la pantalla. La vista sigue la **misma estructura que el PDF** —emisor, documento, cliente, líneas, totales, términos— para que lo que se ve en pantalla sea lo que sale impreso y nadie tenga que traducir de una a la otra. Desde ahí: ver PDF, anular y nota de crédito.
- [x] **El papel lleva todo lo que pide una factura**, tomando como referencia el PDF que emitía Alegra: emisor con cédula, dirección, contacto y **actividad económica con su descripción**; cliente con cédula, **teléfono y dirección**; condición de venta, moneda y medio de pago; por línea la referencia y el **CAByS**, cantidad, precio, descuento, **monto del impuesto con su tarifa** y total; el **monto en letras** (`utils/numeroALetras.js`, 26 pruebas), el desglose del IVA por tarifa, y los **términos de pago** —las cuentas de SINPE y banco por donde le pagan a la empresa—. Todo eso sale de **Configuración** (migración `independencia/013`), no del código: una cuenta cambia sin que nadie toque un archivo. El teléfono y la dirección del cliente se **copian en la factura** al emitirla, como el nombre y la cédula: el documento se reimprime igual años después aunque la ficha cambie. A las 5.398 ya copiadas se les rellenó desde la ficha actual (4.050 con teléfono, 5.093 con dirección).
- [x] **Dos etiquetas que distinguen el documento**: *Factura de venta* (creada en el sistema, aún no emitida ante Hacienda) y *Factura electrónica* (ya emitida). Salen en la lista y en el detalle. **Son distintas del estado**: "Pagada" o "Anulada" dicen cómo va la factura; la etiqueta dice si se emitió. Una puede estar pagada y no ser electrónica. Las 5.398 copiadas ya traían la marca —531 electrónicas y 4.867 no—, no hubo que deducirla del número.
- [x] **Corregir la factura sobre el documento mismo** (botón *Editar factura*): no se abre otra pantalla ni otro formulario — los campos editables se vuelven inputs **en su propio lugar**, con la misma estructura, tarjetas y secciones. Editar en un formulario aparte obliga a comparar de memoria: uno cambia un precio en una lista de campos y tiene que imaginarse cómo va a quedar el papel. Se puede cambiar el **cliente** —el error más caro: el documento queda a nombre de quien no compró—, los productos, cantidades, precios, descuentos y observaciones, con el total recalculándose en vivo y el motivo quedando en la bitácora. **El IVA no es un campo escribible**: la tarifa sale del maestro del producto, y dejarla a mano es el agujero por el que se facturaron productos al 1 % cobrando 13 %. El número, la serie y la fecha tampoco se tocan. Una factura **electrónica, cobrada o acreditada no se edita**, y la pantalla dice cuál de las tres es la razón. En escritorio la pestaña *Editar facturas* desaparece —se corrige entrando a la factura— y en el teléfono se mantiene, que es la edición rápida del mostrador.
- [ ] **Emitir electrónicamente una factura ya creada.** El botón está a la vista pero apagado: la emisión ante Hacienda está pospuesta y uno que dijera haber emitido sin emitir sería peor que no tenerlo. Al hacerla, la etiqueta pasa sola de *Factura de venta* a *Factura electrónica* y quedan bloqueadas la edición y la anulación, como ya ocurre con las 531 copiadas
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

- **El frontend también sacaba el día en UTC** (`new Date().toISOString().split('T')[0]` en `useFacturacion.js`), así que de noche la pantalla trabajaba con la fecha de mañana. No llegó a las facturas porque el servidor usa su propio día y descarta la que manda el navegador, pero el dato viajaba mal. Corregido con `frontend/src/utils/fechaCR.js`, que nombra la zona en vez de confiar en la del dispositivo: un teléfono con la zona mal puesta no debería cambiar la fecha de una venta.
- **Un CHECK escrito como `electronica = FALSE OR hacienda_estado = 'aceptada'` NO hacía valer nada.** Con `hacienda_estado` en NULL esa condición da NULL, y un CHECK solo rechaza cuando da FALSE: marcar una factura como electrónica pasaba sin protestar. Se comprobó marcando una de verdad (y devolviéndola). La forma correcta exige el valor: `NOT electronica OR COALESCE(hacienda_estado, '') = 'aceptada'`. Vale para cualquier restricción de este archivo que compare una columna que admite nulos.
- **Las facturas hechas de noche salían fechadas al día siguiente. CORREGIDO.** `guardarFactura` tomaba el día con `new Date().toISOString()`, que es UTC, y Costa Rica es UTC−6: a partir de las 6 de la tarde ese valor ya es mañana. Lo destapó la suite al correr a las 19:21 —dos pruebas de vencimiento empezaron a fallar solas—, no una revisión del código. Ahora el día se arma nombrando la zona `America/Costa_Rica`, que también vale en scripts y en Render, donde `TZ` puede no estar puesta. La base no tenía el problema: su sesión ya está en hora de Costa Rica.
- **`buscarCliente` no traía el teléfono ni la dirección**, así que las facturas NUEVAS se guardaban sin esos datos y el papel salía sin ellos. Las 5.398 copiadas no lo mostraron porque la migración `013` las rellenó desde la ficha. Lo destapó una prueba de cambio de cliente, no la vista: mirando el PDF de una factura vieja todo se veía bien. Corregido y cubierto con prueba en el camino de creación.
- **2.307 de las 5.398 facturas copiadas tienen la cabecera peleada con la suma de sus líneas**, por menos de ₡1 cada una (₡539,64 en total). Es redondeo: la configuración trae `decimales = 0`, así que Alegra redondea el total a colones enteros mientras las líneas guardan céntimos. No se toca —corregir 2.307 totales por redondeo sería peor que la diferencia—, pero conviene tenerlo presente al cuadrar con el contador.
- **La actividad económica es la 4752.1**, confirmada con el negocio el 12 de setiembre de 2026. La API de Alegra devuelve 523402 y eso fue lo que quedó al cargar la configuración, pero el papel que reciben los clientes siempre dijo 4752.1. Corregido. Además, `cargar-configuracion.js` **ya no pisa lo que esté escrito** en la fila de la empresa —solo rellena lo vacío—: repetir esa carga revertía la corrección sin decir nada.
- **El catálogo compartido escondía datos que el papel sí imprime.** `catalogosParaOperar()` elegía columnas a mano y dejaba afuera la actividad económica y los términos de pago, así que la pantalla mostraba menos que el PDF. La prueba que lo fijaba daba por interno un dato que va impreso en cada factura; se corrigió la regla, no la prueba.
- **Tres encimes de texto en el PDF**, todos por la misma causa: `continued: true` junto con `align: 'right'` alinea cada fragmento por separado dentro de la misma caja y escribe la etiqueta sobre el valor ("Fecha de creación" pisada por la fecha, "Condición" por "Contado"). Se coloca midiendo el ancho del valor.
- **El catálogo de la pantalla se estaba cargando incompleto. CORREGIDO.** El maestro se pedía de a 500 por página, pero el servidor corta en 100; con el tope de 20 vueltas se bajaban 2.000 de 2.025 productos y los últimos 25 **no aparecían al facturar**. No daba ningún error: simplemente el producto "no existía" cuando alguien lo buscaba.
- **`setupDatabase.js` no podía sembrar las series en una instalación nueva. CORREGIDO.** El `INSERT` de la serie de facturas usaba `ON CONFLICT (tipo_documento, sucursal, terminal)`, la llave vieja de tres columnas que ese mismo archivo borra doce líneas más arriba al crear la de cuatro. Contra el esquema de hoy revienta con *there is no unique or exclusion constraint matching the ON CONFLICT specification*. No se notaba porque `setupDatabase.js` **no corre al arrancar el servidor**; sí corre en una instalación nueva, que es donde habría dejado la base sin series y sin poder emitir.
- **El mismo bug está en `developer` y `main`, y ahí sí llegó a las facturas emitidas.** Medido contra las 5.398 copiadas: 213 líneas en 147 facturas de productos al 1 % salieron al 13 % (₡47.201,72 de IVA de más), 13 líneas al 2 % al 13 % (₡28.427,80) y 6 exentas al 13 %. No es una reclasificación de tarifas: el **mismo producto** aparece a las dos tarifas en el mismo período (LAPICERO BIC AZUL, 85 líneas al 1 % y 84 al 13 % entre 2024 y 2026), o sea que depende del camino que creó la factura. En sentido contrario hay 67 líneas de productos al 13 % facturadas al 0 % (−₡47.447,71) y 13 al 0,5 %, que **pueden ser exoneraciones legítimas** y hay que mirarlas con el contador antes de afirmar nada. Corregir lo ya emitido va con el trabajo de Hacienda; **corregir el código de producción es aparte y urgente**, porque cada venta nueva de un producto al 1 % se sigue emitiendo al 13 %.
- **La pantalla cobraba 13 % sobre productos al 1 % y al 2 %. CORREGIDO** (`useFacturacion.js`). Cada línea nacía con `tax: impuestoDefault`, o sea el impuesto **principal de la factura**, ignorando el del producto; el cálculo de totales sí respeta la tarifa de la línea, pero nunca le llegaba una. En una factura de prueba con un producto al 1 % y otro al 2 % la pantalla mostraba ₡1.907,89 y el servidor guardaba ₡1.716,07: **₡191,82 de diferencia entre lo que se le cobra al cliente y lo que dice la factura**. Es la misma familia del IVA 13 % fijo, sobreviviendo en otro lugar. Ahora la línea toma la tarifa del maestro, que es la que el servidor cobra.
- **Y la etiqueta mentía aunque el monto estuviera bien**: decía "IVA 13 % (13%)" —el nombre del impuesto principal— al lado de un monto que era 1 % + 2 %. Ahora dice las tarifas que de verdad hay en la factura: "IVA (1%, 2%)".
- **Las cuatro fuentes de la pantalla estaban en 404** en la rama (`/alegra/facturacion/taxes`, `/payment-methods`, `/items`, `/contacts`), porque ese submontaje se retiró al mover Facturación a su propio prefijo. No se veía: `getImpuestos()` se tragaba el error y devolvía una lista escrita a mano con IVA 13 %. Un respaldo silencioso que contesta un número equivocado es peor que un error.

**Lista cuando:** se puede vender, editar, anular y devolver sin abrir Alegra.

---

## 7. Cobros, cuentas por cobrar y caja

**Hoy en Alegra:** CxC se sincroniza cada 30 minutos y los abonos van a
`POST /payments`. Hay 1.349 pagos, todos a "Caja general". **Del último mes,
135 de 150 pagos no traen observación y no salen de nuestro sistema**:
parecen registrarse a mano en Alegra. Hay que confirmarlo con quien cobra.

- [x] Tabla `pago` y `pago_factura` (migración `independencia/009`): facturas a las que se aplica, método, cuenta de dinero, referencia (número de SINPE) y usuario. Un abono puede repartirse entre varias facturas. **Los 1.350 cobros están copiados** (₡212.222.730, aplicados a 5.222 facturas) y cuadran: 5.242 de 5.242 facturas coinciden con lo que Alegra dice que se pagó
- [x] **Al calcular el saldo, un cobro ANULADO no cuenta.** Hecho en `facturaConsulta.service.js` y cubierto con prueba. Hay uno así entre los 1.350 (₡84.127,90 en la factura 00100001010000002164): Alegra la reporta con 0 pagado justamente porque el cobro se anuló. Sumar `pago_factura` sin filtrar `pago.anulado` la mostraría como pagada
- [x] Saldo de cada factura **calculado**, no guardado: total, menos los cobros vigentes, menos las notas de crédito vigentes. Así anular un cobro o una nota devuelve el saldo solo, sin que nadie corra nada. Verificado en vivo: al anular una nota de ₡1.224,92 el saldo volvió de ₡16.123,08 a ₡17.348
- [x] Registrar el cobro al facturar, en la misma transacción que la factura: si la factura falla, no queda un pago suelto. El método se elige en la pantalla (efectivo, SINPE, transferencia, tarjetas, cheque o *queda pendiente*) y el que pide referencia la exige. **El cobro va aparte de la condición de venta**: un cliente con crédito puede pagar de una, y uno de contado quedar debiendo
- [x] **Cómo paga el cliente**, elegido al facturar (efectivo, SINPE Móvil, transferencia, tarjetas, cheque o "queda pendiente"). El método que pide referencia la exige: un SINPE sin número es imposible de cuadrar después contra el banco. **El cobro va aparte de la condición de venta**: "de contado" es lo que dice el documento y sale del plazo del cliente; que HAYA pagado es otra cosa —un cliente con crédito puede pagar de una—, y derivar una de la otra deja facturas mostrando un saldo que nadie debe. El pago se registra en la misma transacción que la factura, así que no queda un cobro suelto si la factura falla. El PDF dice con qué se pagó y su referencia.
- [x] **Registrar abonos sobre la base propia** (`cuentas-por-cobrar/cobros.service.js`, rutas bajo `/api/cuentas-por-cobrar/propios/*`): lista de deudores agrupada por cliente —así se cobra: uno no llama "por la factura 4868", llama a la pulpería y pregunta por todo—, abonos parciales o totales, y anulación con motivo. **El saldo se relee CON BLOQUEO antes de aplicar**: entre que la pantalla mostró ₡10.000 y alguien apretó, otra caja pudo haber cobrado; el `FOR UPDATE` hace que la segunda espere y vea el saldo ya rebajado. **"Saldar total" usa el saldo recién leído**, no el de la pantalla. No se cobra más que el saldo —un excedente no es un abono— y SINPE exige referencia. Anular no borra: el saldo vuelve solo porque se calcula. Verificado en vivo contra la copia: 55 clientes con saldo, abono de ₡1.000 sobre la 001000014802 (₡226.402 → ₡225.402), cobrar de más rechazado, y al anular el saldo volvió solo. **La pantalla de CxC ya las usa**: la lista de deudores, los abonos y las líneas de la factura salen de nuestra base —antes las líneas se le pedían a Alegra cada vez que se abría el modal— y el único pedido de la pantalla es a `/propios/deudores`. Los componentes dejaron de hablar de `alegraInvoiceId`: usan `facturaId`, porque meter nuestro id en un campo con ese nombre sería dejar escrita una mentira que alguien terminaría mandando a una ruta de Alegra. **Y el cobro ya ofrece SINPE Móvil**, que faltaba: la lista estaba escrita a mano en el código y ahora sale del catálogo, con su referencia obligatoria
- [x] **Con qué fecha nace una factura hecha sin señal: DECIDIDO** (13 de setiembre de 2026, decisión del negocio). Queda la fecha de la **sincronización**, que es el día que el servidor le pone al recibirla. La pantalla manda `date` y el servicio lee `fecha`, así que ese valor se descarta a propósito: se confía en el reloj del servidor y no en el del dispositivo. Una factura armada el lunes sin señal y sincronizada el miércoles queda fechada el miércoles
- [x] **Cierre de caja diario** (`cuentas-por-cobrar/cierreCaja.service.js`, migración `independencia/016`): lo que la caja debería tener contra lo que tiene. "Cobros del día" respondía cuánto entró; esto responde si **cuadra**, que es lo que hace aparecer un faltante el mismo día y no tres semanas después. **Se compara solo el efectivo** —SINPE, transferencia y tarjeta se cuadran contra el banco, no contando billetes— y los demás métodos quedan como referencia. **Una diferencia no se guarda sin explicarla**: sobrante o faltante piden motivo. **El esperado se congela al cerrar**: si se recalculara, anular un cobro viejo cambiaría sola la diferencia que alguien firmó. Un día no se cierra dos veces; reabrir pide motivo y queda anotado **antes** de borrar el cierre. La pestaña ya lee de nuestra base y trae el panel para contar el efectivo
- [x] **Recordatorios de saldo con el saldo propio** (`GET`/`POST /api/cuentas-por-cobrar/propios/clientes/:id/recordatorio`). **El texto lo arma el servidor**, con los mismos datos que muestra la pantalla: si lo armara el navegador, el monto del mensaje podría no coincidir con el de la pantalla que lo originó. Quien cobra lo puede editar antes de mandarlo. Lo más vencido va primero —es por lo que se llama— y ahora **dice por dónde pagar**, tomado de los términos de la configuración: un recordatorio que dice cuánto se debe pero no a qué cuenta depositar obliga a una segunda conversación. Los teléfonos se proponen desde la ficha y el número se valida antes de salir. **La pantalla ya la usa**, y los teléfonos vienen con el recordatorio en vez de ir a buscarlos a la ficha de Alegra
- [x] **Portal: saldo y facturas del cliente desde tablas propias** (`portal-clientes.saldo.service.js`). Leía el espejo `cuentas_por_cobrar`, que se copiaba de Alegra cada 30 minutos; ahora el saldo se calcula de nuestras facturas y cobros en el momento en que el cliente pregunta. **Usa las mismas expresiones de saldo que la pantalla de la casa**, a propósito: si el cliente y el cobrador vieran números distintos, la discusión en el mostrador no la gana nadie. Se filtra por `cliente.id` a través de `alegra_id`, **nunca por nombre** —hay fichas que se llaman casi igual ("OG PWR HOUSE …-GYM Palmares" y "… GYM-San Ramón") y calzar por texto le enseñaría a un cliente las facturas de otro—. Los días de atraso los cuenta contra el día **en Costa Rica**: en Render el servidor corre en UTC y con `CURRENT_DATE`, pasadas las 6 de la tarde, lo que vence hoy aparecería vencido
- [x] **Retirada la sincronización de CxC cada 30 minutos.** Con el portal y el dashboard leyendo de la base propia, ya nadie leía el espejo. Se fueron el trabajo periódico, su arranque, el botón "Actualizar desde Alegra" —ahora dice **Actualizar** y simplemente relee— y las rutas viejas que leían `cuentas_por_cobrar`, con su controller y su servicio (658 líneas). **Dejar esas rutas habría sido peor que borrarlas**: seguirían respondiendo, pero con la última foto antes de apagar la copia y sin nada que dijera que está vieja. Con ellas se fue el último camino por el que esta pantalla podía escribirle un pago a Alegra. La tabla `cuentas_por_cobrar` se conserva hasta el corte. Verificado en el navegador, escritorio y móvil: la cartera y la tarjeta del dashboard salen de la base propia, sin una sola petición a Alegra

**Lo que apareció al comparar las dos fuentes** (antes de apagar el espejo):

- **De 2026 no había ni una diferencia**: las 66 facturas con saldo estaban en las dos fuentes por el mismo monto.
- **Dos facturas que el espejo daba por pendientes ya estaban cobradas** (BAZAR MARY RINCON, ₡38.502, efectivo del 11 de setiembre). El espejo iba atrasado; la base propia tenía razón. Es exactamente el caso que hacía falta evitar en el portal.
- **Seis facturas de 2024 y 2025 que nosotros damos por pendientes y Alegra no** (₡160.500,10, todas del mismo cliente: ADITA OROZCO / OG PWR HOUSE). No es un problema de la copia —todos los pagos copiados tienen enlazado el 100 % de su monto, y las notas de crédito también—: en Alegra quedaron cerradas por algo que no viajó, probablemente un anticipo o un cierre a mano. Va con las correcciones de datos del final. **Cuatro de las seis se cobraron desde la pantalla el 13 de setiembre** (₡122.054,40 en efectivo); quedan la 00100001010000002142 (₡26.750,20) y la 00100001010000002143 (₡11.695,50). Esta última cuelga de un cliente **con cuenta en el portal**, así que conviene resolverla antes de que el portal salga a producción

**Hallazgos de esta sección:**
- **La pantalla de CxC se abría sola en un cliente y no dejaba salir.** Usaba `null` como "ninguno seleccionado", y justamente esas 14 facturas tienen el `clienteId` en null: `null === null` coincidía, así que la pantalla abría ese grupo al cargar y "Volver a clientes" lo volvía a encontrar. Los otros 54 deudores eran inalcanzables. El centinela pasó a `undefined`, que ningún cliente puede tener.
- **14 facturas con saldo no tienen ficha de cliente** (su cliente se borró en Alegra antes de la copia; al copiar se contaron 17 en total). La deuda se ve y se puede cobrar —el nombre quedó escrito en la factura— pero **no se les puede mandar un recordatorio**, porque no hay a quién. El botón queda apagado diciendo por qué, en vez de fallar con un 400. Reasignarlas va con las correcciones de datos del final.
- **`diaEnCostaRica('2026-09-08')` devolvía `'2026-09-07'`.** JavaScript parsea una fecha suelta como medianoche UTC y, al formatearla en UTC−6, se corría un día atrás. Salió a la luz en un recordatorio que le decía al cliente *"vencida hace 6 días"* cuando eran 5. Pasar de un día de calendario a un día de calendario es la identidad; la conversión solo tiene sentido para un INSTANTE. **El mismo archivo está en `developer` y `main`**: ahí ningún llamador le pasa cadenas —todos mandan `Date`—, así que el error está latente pero no se manifiesta. Conviene subir la corrección igual.
- **Y otra vez el "Invalid Date" del PDF, en otro lugar**: las columnas DATE llegan como objeto `Date` y recortarlas como texto daba `"vence en NaN día(s)"` en el mensaje al cliente. Cubierto con prueba.
- **El cálculo viejo de "Cobros del día" tomaba el día en UTC** (`new Date(fecha + 'T00:00:00.000Z')`), así que un cobro de las 7 de la noche caía en el reporte del día siguiente. En un cierre de caja eso no es un detalle: es plata que aparece donde no se contó. La versión propia compara contra `p.fecha::date`.
- **Un `return await cierreDe(dia)` dentro de la transacción devolvía null**: esa función lee por el pool —otra conexión— y la transacción todavía no había hecho COMMIT, así que no veía la fila recién insertada. Se devuelve lo que retornó el propio INSERT. Vale para cualquier servicio de este repositorio que lea con `pool.query` dentro de `enTransaccion`.
- **Las tarjetas por método decían "Otro"**: el componente mapeaba colores y etiquetas por las claves de Alegra (`cash`, `transfer`) y ahora llegan las nuestras. De paso nunca había tenido una tarjeta para SINPE Móvil.
- **Una prueba con la fecha escrita a mano** (`fecha_vencimiento === '2026-09-27'`) pasó el día que se escribió y falló al siguiente. Ahora el caso fija su propia fecha y el valor por omisión se prueba aparte, sin fecha.

**Lista cuando:** nadie tiene que entrar a Alegra para marcar una factura
como pagada.

---

## 8. Compras

**Hoy:** el correo trae el XML y, desde el 2026-09-20, se guarda por ruta en
`facturas_proveedores.xml_ruta` (antes no se guardaba nada, ver el ítem de
abajo). Se relaciona y pasa por Revisión de Precios. Al terminar, "Registrar
compra" crea `compra`/`compra_linea` propias, actualiza costo y precio en
`producto` y libera la cuenta por pagar — nada de esto toca Alegra (antes iba
a `POST /bills` y `PUT /items`; ese camino viejo, `enviarFacturaAlegra`,
sigue en el código pero ya no lo llama la pantalla, y de todos modos
`config/aislado.js` bloquea cualquier escritura a Alegra desde esta rama).
Gastos recurrentes todavía crea productos y contactos en Alegra (ítem propio
más abajo).

- [x] Tablas `compra` y `compra_linea` (migraciones 019 y 020). **El XML NO se
  guarda**, al revés de lo que decía esta línea: `emailService.js` lo parsea en
  memoria y lo descarta, y la columna `archivo_xml` guarda el NOMBRE del
  archivo, no su contenido (comprobado sobre las 862: ninguna trae un `<`). Se
  armaron desde lo que ya estaba parseado. Cargadas **860 compras y 8.590
  líneas** —las 855 ENVIADA más los 5 gastos recurrentes; las 2 que nadie
  aceptó se quedan en el buzón, que es donde deben estar—, con proveedor propio
  en las 860 y nuestro producto en 8.443 de 8.590 líneas (98,3 %). Las dos
  migraciones se pueden volver a correr sin duplicar. **El total es el del
  comprobante, no la suma de líneas:** hay 18 facturas donde no coinciden, de
  ₡65 a ₡16.941 y algunas NEGATIVAS —descuentos y cargos a nivel de factura que
  el parser no extrae—, y sin el XML no se pueden reconstruir
- [x] **Guardar el XML recibido (2026-09-20).** Toda factura y nota de
  crédito nueva guarda su XML por ruta en `almacenamiento-privado/` —NO bajo
  `/archivos`, que `express.static` sirve sin sesión a propósito para las
  fotos; un comprobante fiscal no puede quedar así (migración 021,
  `bloqueo/xml-historico-sin-recuperar` en el grafo). De paso se extrajeron
  `TotalOtrosCargos`, `TotalDescuentos` y `TotalIVADevuelto`, que el parser
  nunca leía y son justo lo que explica las 18 que no cuadraban (migración
  022), y se corrigieron dos bugs que afectaban el cuadre: `Descuento`/
  `Impuesto` repetidos en una línea daban `NaN` (6.013 de 8.600 líneas tienen
  descuento > 0), y un `estadoFinal` fuera de alcance hacía que **toda**
  factura procesada quedara marcada como error en el log aunque se hubiera
  guardado bien. **Quedan dos scripts escritos y sin correr, porque necesitan
  las credenciales reales de Gmail y que el usuario decida el momento:**
  `recuperar-xml-del-buzon.js` (busca por `archivo_xml`, no por `email_id`
  —es un seqno IMAP volátil y 69 de 862 no lo tienen— y verifica contra
  `clave`) y `reconciliar-compras.js` (recalcula el cuadre con lo recuperado).
  El primero necesita `PERMITIR_LECTURA_BUZON=true`, una llave nueva: no
  `PERMITIR_SALIDAS`, porque leer el buzón no es lo mismo que escribir hacia
  afuera, y antes esa guarda vivía solo en `startMonitoring()` y no en
  `connect()` — corregido, las dos la revisan ahora
- [x] **"Enviar a Alegra" pasa a ser "Registrar compra" (2026-09-20), sin tocar
  Alegra.** Módulo nuevo `src/modules/compras/`, montado en `/api/compras` con
  el mismo permiso que Revisión de Precios (es la misma pantalla, con el
  botón renombrado). `registrarCompra` reemplaza a `enviarFacturaAlegra`: crea
  `compra` + `compra_linea` desde el buzón ya revisado, actualiza
  `producto.costo_con_iva` de cada línea con producto propio (con
  `modules/precios/costo.js`, la fuente única — no se recalculó acá), y si
  hay precio ajustado también `producto.precio_sin_iva` más su fila en
  `precio_historico` con `producto_id` y `origen: 'compra'` (mismo patrón que
  `productos.service.js:250`, el de Gestión de Catálogo). **El cambio de forma
  más grande frente a lo que reemplaza:** `enviarFacturaAlegra` toleraba que
  crear la factura en Alegra fallara y aplicaba costos y precios de todos
  modos; acá es una sola transacción — o entra todo, o no entra nada. Probado
  forzando un fallo a mitad de camino: hace ROLLBACK y no queda nada a medias.
  La cuenta por pagar se libera y se cuelga de `compra_id` (migración 023,
  316 de 318 ya enlazadas retroactivamente) — repitiendo el cálculo de
  `pagosProveedoresService.liberarCuentaPorFactura` en SQL crudo DENTRO de la
  misma transacción, porque llamar a esa función usaría la conexión de Prisma,
  otra conexión a la base, y un rollback acá no la revertiría; una compra de
  CONTADO sin cuenta por pagar no es un error. Una línea sin producto propio
  (123 de 8.590, migración 018) se cuenta aparte y no tumba la compra. El
  nombre `estado: 'ENVIADA'` se conserva en la base por compatibilidad con lo
  que ya filtra por ese valor — el frontend ya no lo MUESTRA así ("Registrada"
  en vez de "Enviada", sin ninguna mención a Alegra en la pantalla). Verificado
  de punta a punta contra la copia local con datos `ZZ` (creados y borrados
  en la misma prueba) y en el navegador: el botón dice "Registrar compra" y
  no dispara ninguna escritura hasta que se toca. 1.104 pruebas, todas pasan
  (13 nuevas)
- [x] El cambio de precio de venta se guarda en `producto` — mismo cambio que
  el ítem de arriba: `registrarCompra` ya no le manda ningún precio a Alegra
- [x] **"Devolver la factura al proveedor o rechazarla" era una alucinación de una sesión anterior (2026-09-20).**
  Nunca fue un pedido real — no hay una acción de rechazo hacia el proveedor en
  ningún lado de esta conversación ni de las anteriores rastreables por git. Lo
  que sí existe, y siempre existió, es otra cosa: cuando una factura queda mal
  relacionada en Relación de Productos, se **devuelve a relacionar**
  (`devolverFactura` en `revision-precios.service.js`, botón "Devolver a
  Relacionar"), que la manda de vuelta a `PROCESADA` para corregir y volver a
  cargar. Es 100 % interno — nunca tocó Alegra, nunca tuvo fricción por ser
  local — y ya tiene pruebas (`facturaProveedorNoSeDuplica.test.js`). No hace
  falta ninguna construcción nueva. Migración `024` escrita para quitar
  `'devuelta'` del `CHECK` de `compra` (migración 019), porque no
  correspondía a nada real y nada del código lo usaba (confirmado: 860/860
  compras en `registrada`, cero en `devuelta`) — aplicada a la copia local
  el 2026-09-23
- [ ] Guardar el estado de aceptación de cada compra. El envío del mensaje receptor queda con la emisión electrónica
- [x] **Gastos recurrentes sin crear productos ni contactos en Alegra
  (2026-09-20).** `registrarEnAlegra` creaba un contacto, un servicio por
  concepto y un `POST /bills` en Alegra; pasó a ser `registrarComoCompra`
  (`facturas-recibidas.adapter.js`), que crea `compra` + `compra_linea`
  locales, igual que una factura normal, pero **sin producto**
  (`producto_id = NULL`, a propósito: son servicios, no inventario) y **sin
  reconstruir nada por diferencia** —ni agrupar en "servicios" ni recalcular
  "otros cargos"—, porque `compra.total` es el del comprobante y no depende
  de que las líneas sumen exacto. Con eso se fueron
  `buscarOCrearServicio`, `lineasDeDetalle` y `otrosCargosDeTotales`
  (código muerto sin la parte de Alegra). `liberarCuentaPorPagar` se
  extrajo de `compras.service.js` a su propio archivo para que las dos
  transacciones —Revisión de Precios y gastos recurrentes— usen la MISMA
  función en vez de cada una llevar su copia (era la tercera vez que se
  iba a escribir). **Una transacción POR FACTURA, no una para todas**: el
  gasto de un mes que falla no bloquea el de otro que ya se procesó bien.
  Verificado contra la copia local con datos `ZZ` (creados y borrados en la
  misma corrida): proveedor resuelto por cédula (Liberty, id 24), línea con
  `producto_id NULL`, total igual al de la factura. **Consecuencia que hay
  que saber**: el Reporte Contador (sección 13, sin migrar) sigue leyendo
  de Alegra — un gasto recurrente nuevo no va a aparecer ahí hasta que esa
  sección también se independice, el mismo hueco de tránsito que ya tienen
  Cotizaciones e Inventario con `alegra_products_cache`
- [ ] Órdenes de compra por WhatsApp usando `producto.id`

**Lista cuando:** una compra entra al inventario y a CxP sin tocar Alegra.

---

## 9. Cuentas por pagar y pagos a proveedores

**Hoy ya son locales:** 318 cuentas por pagar y 18 notas de crédito de
proveedor. Dependen poco de Alegra.

- [x] Usar `proveedor.id` y `compra.id` — `compra_id` (023) y `proveedor_id`
  (025, las 318 por cédula); `liberarCuentaPorPagar` llena los dos al registrar
  la compra
- [x] **Registrar el pago a proveedor como egreso de una cuenta de dinero
  (2026-09-23, migración 025).** `pago_proveedor` + `pago_proveedor_cuenta`:
  fecha, cuenta de dinero, método, referencia; un pago puede cubrir varias
  facturas del mismo proveedor; se anula con motivo. El saldo y el estado de
  cada cuenta se CALCULAN en la vista `cuenta_por_pagar_saldo` (total − notas
  de crédito − pagado antes del corte − pagos vigentes); editar el saldo a
  mano quedó cerrado (400). Lo ya pagado sin registro (₡16,3 M en 246
  facturas) quedó como `pagado_sin_detalle`, sin inventar pagos. Verificado
  contra la copia local: los 318 saldos calculados igual a los guardados, y
  un pago ZZ de ₡1.000 bajó y devolvió el saldo al anularse (borrado después).
  La pantalla (Pagos a Proveedores) registra el pago con cuenta, método y
  referencia, lista los pagos de cada factura y los anula con motivo
- [x] **Registrar los gastos recurrentes como egresos (2026-09-23).** Marcar
  un gasto como pagado exige la cuenta de la que salió; el método se deduce
  del tipo de cuenta si no se elige (caja → efectivo, banco →
  transferencia), y la fila trae elegida la cuenta usada la última vez para
  ese gasto. De paso: la fecha por omisión era `CURRENT_DATE` de la base —en
  una base UTC, mañana después de las 6 p.m.—; ahora es `hoyEnCostaRica()`
- [x] **El cierre de caja resta lo que salió de la caja (migración 026).**
  Pagos a proveedores y gastos pagados desde "Caja general" bajan el
  esperado, con su detalle en pantalla, y se congelan al cerrar
  (`cierre_caja.salidas_efectivo`). El panel de cierre ahora aparece también
  en un día sin cobros. **Pregunta abierta para el usuario:** el cierre no
  conoce un fondo de caja; un día sin cobros y con un pago desde la caja da
  un esperado negativo
- [x] **Caja General, el punto central (2026-09-23, migración 027).**
  Decisión del usuario: sin fondo fijo ni cajas separadas. Todo cobro entra a
  Caja General, todo pago a proveedor o de gasto sale de ella; el método dice
  cómo. Los movimientos son la vista `movimiento_caja`, armada sobre los
  mismos documentos (`pago`, `pago_proveedor`, `pago_recurrente`) — sin una
  segunda tabla que duplique o se desincronice—, cada uno con las facturas
  que lo originaron; los anulados se ven y no suman. Un cobro o un pago puede
  cubrir VARIAS facturas de la misma contraparte (casillas + "Cobrar/Pagar N
  facturas"). Pestaña "Caja General" en Cuentas por Cobrar, por período. El
  cierre resta solo lo que salió EN EFECTIVO. Verificado desde la pantalla
  con un cobro y un pago de 2 facturas cada uno (borrados después)
- [x] **Compras de contado (2026-09-23, migración 028).** No tenían cuenta
  por pagar —solo nace al recibir el correo si es a crédito o trae plazo—,
  así que su pago no llegaba a Caja General. Decisión del usuario: al
  registrar la compra nace su cuenta PENDIENTE (`de_contado`), no pagada de
  una vez; una persona anota "se pagó vía efectivo" en Pagos a Proveedores y
  recién ahí sale de Caja General. Estado CONTADO (no "vencida"), filtro y
  tarjeta "De contado sin anotar". Los gastos recurrentes no la crean (se
  pagan en su pantalla). Las 544 históricas no se tocaron. Verificado con la
  función real sobre una compra histórica y el pago desde la pantalla
  (borrado después)

**Lista cuando:** entradas y salidas de dinero cuadran en Caja General.

---

## 10. Cotizaciones

**Estaban en Alegra hasta el 2026-09-24:** se creaban, editaban y borraban
en `/estimates`, y facturar una creaba la factura en Alegra. El PDF y el
enlace público ya eran propios. **Ahora viven en la base propia** (ver
`docs/grafo/modulo/cotizaciones.md`).

- [x] **Tablas `cotizacion` y `cotizacion_linea` (migración 029) y la carga
  desde Alegra (`scripts/independencia/cargar-cotizaciones.js`, 2026-09-24).**
  En Alegra quedaba UNA (la 2, de La Ecosr, ₡1.231): se copió con su precio
  cotizado y su tarifa por línea, y su total calzó (₡1.231,15; Alegra redondea
  a colones enteros). La carga es repetible —actualiza por `alegra_id`— y al
  final sube la serie si encuentra una cotización mayor: en `main` se siguen
  haciendo en Alegra hasta el corte. Una facturada en Alegra se enlaza a su
  factura copiada por el "Cotización N" de las observaciones. Numeración
  propia en `serie_consecutivo` (tipo `cotizacion`, sin prefijo), continuando
  en la 3; borrar no devuelve el número
- [x] **Crear, editar, borrar, vencer y facturar generando una factura propia
  (2026-09-24).** El precio sale del maestro del servidor y las líneas se
  arman con el mismo `armarLineas` de la factura, así que cotización y factura
  redondean igual. El estado NO se guarda: facturada / vencida (día de Costa
  Rica) / vigente se calcula, y anular la factura devuelve la cotización a
  vigente sola. **Facturar crea la factura y marca la cotización en UNA
  transacción** (`crearFacturaEnTransaccion`), con la cotización tomada con
  bloqueo: un doble clic devuelve la misma factura. Vale el precio cotizado;
  una vencida pide confirmación. Una que se facturó no se edita ni se borra
  —tampoco si su factura se anuló—. Bitácora en crear, editar, borrar y
  facturar. Clientes y catálogo salen de la base propia; WhatsApp con el id
  propio del cliente. Verificado de punta a punta por HTTP contra la copia
  local (crear, misma clave, editar, PDF, página pública, facturar dos veces,
  borrar/editar una facturada → 409, anular la factura → vigente → facturar
  de nuevo, borrar otra, enlace viejo de Alegra) con total de la factura igual
  al de la cotización (₡19.450,50); todo lo de prueba borrado y las series
  devueltas a 4869 y 3. Y en el navegador a 320–1280 px, sin una sola
  llamada a Alegra

**Hallazgos de esta sección:**
- **Los enlaces públicos ya mandados apuntan a ids de Alegra.** El token
  firmaba `cotizacion:<id>` y las cotizaciones propias arrancan en 1: con la
  misma firma, el enlace viejo de la 11 de Alegra habría abierto la
  cotización propia 11, de otro cliente. Las propias firman
  `cotizacion-propia:<id>` y un token viejo se busca por `alegra_id`
  (verificado: el enlace de la 11 abre la 2 copiada).
- **WhatsApp desde Cuentas por Cobrar proponía el teléfono de OTRA persona.
  CORREGIDO.** El modal buscaba los teléfonos preguntándole a Alegra por
  `contactoId`, pero Cuentas por Cobrar —ya propia desde la sección 7— le
  pasaba el id propio del cliente. A "AB CHANA" (propio 8) le proponía el
  celular de "EL LLANO" (contacto 8 de Alegra). **Medido: 47 de los 54
  deudores.** El número queda a la vista antes de mandar, que es lo que
  evitó que saliera, pero el que aparecía elegido era el equivocado. Ahora
  hay dos rutas y dos props con nombres distintos (`telefonos-cliente/:clienteId`
  lee la ficha propia; `telefonos/:contactoId` queda solo para el aviso de
  pedidos del portal, sección 12). Ver `docs/grafo/leccion/ids-propios-y-de-alegra-no-se-mezclan.md`.
- **Las claves `cotizacion-<id>` de `factura_intento` son de ids de Alegra**
  (hay 5). Facturar una cotización propia no las usa: se protege con el
  bloqueo de la fila, no con idempotencia por clave.
- La lista de cotizaciones en el teléfono sacaba el botón de borrar fuera de
  la tarjeta (la fila de botones no podía encogerse). Corregido.

---

## 11. Bodega, impresión y faltantes

**Terminada el 2026-09-30.** Antes, Facturas en Bodega, Impresión y
reimpresión, y Faltantes leían las facturas de Alegra por periodo y cambiaban
su estado usando el `alegraId`; ahora todo va por `factura.id` y `producto.id`.

- [x] Leer las facturas propias — *Facturas en Bodega (2026-09-29):
  `warehouse/bodegaPropia.js` lista las emitidas de `factura` con sus líneas;
  la pantalla usa `factura_id`. Falta impresión y reimpresión (paso 2).*
- [x] Estados de alistado por `factura.id` — *migración 031: `factura.estado_bodega`,
  `bodega_procesado_en`, `bodega_observaciones`; lo ya despachado se copió.
  Puente: `facturas.factura_propia_id`, y despachar escribe en las dos hasta
  que Faltantes, la cola de impresión y el portal lean `factura`. De paso:
  la copia de la factura propia entraba con `alegra_id = 0` en una columna
  única y la SEGUNDA factura propia no se podía crear; ahora entra con NULL.*
- [x] Faltantes y ajustes con `producto.id` y `factura.id` — *migración 032
  (2026-09-30): `faltantes.factura_propia_id`/`producto_propio_id` y
  `facturas_reimpresion.factura_propia_id`; las columnas viejas se
  RENOMBRARON (`factura_vieja_id`, `producto_viejo_id`) para que nada vuelva a
  escribir ahí sin que salte. Bodega guarda por el `producto_id` de la línea;
  Reporte de Proveedores, Reporte de Clientes, notas (ahora de
  `factura_linea`, sin Alegra), asignación de proveedor, auditoría y las dos
  limpiezas leen las columnas nuevas. Relleno probado en una base desechable:
  por id de Alegra, por referencia única, y avisa lo que no enlaza. Se
  retiraron el módulo `faltantes` y tres reportes sin consumidor que leían la
  tabla vieja de proveedores. Visto en el navegador de la rama: Bodega →
  proveedor asignado solo → la nota "CTE" en la ficha → la factura en el
  Reporte de Clientes con su fecha correcta.*
- [x] Reporte de Clientes: "dar por lista" y "recuperar" sobre la factura
  propia — *2026-09-30: `POST /reportes/faltantes/cliente/facturas/:facturaId/impresion`
  arma los ajustes en el servidor con lo guardado producto por producto, y
  `.../recuperar` saca de la cola la que no se imprimió (antes volvía
  bloqueada al recargar) o reabre los faltantes de la ya procesada. Visto en
  el navegador: Bodega → No llegó → Confirmar revisión → Enviar a impresión →
  aparece en Impresión → Recuperar → editable al recargar.*
- [x] Impresión: editar con la edición propia, PDF propio y marcar procesada
  sin Alegra — *2026-09-30: `reprinting/procesarImpresion.js` bajo
  `/reimpresion`: rebaja faltantes, pone precios del catálogo y marca
  impresa en una transacción con `editarFacturaEn`. Migración 033
  (`faltantes.cantidad_rebajada`): un faltante se rebaja UNA vez — antes una
  factura recuperada y vuelta a procesar se rebajaba dos veces. Un producto
  desactivado después de facturarlo ya no impide editar esa factura. Una con
  cobros no se edita y lo dice (en el historial, 222 de 240 se imprimieron
  antes del cobro). Visto en el navegador: proponer → Solo guardar (la 14863
  quedó en ₡4.689,50) → Recuperar → reprocesar sin rebajar dos veces → PDF
  propio → la 14835, con cobro, explica por qué no se edita. Todo restaurado
  y comparado byte a byte.*
- [x] Retirar el puente `facturas.factura_propia_id` y el camino viejo de
  Bodega — *2026-09-30: la factura propia ya no se copia a `facturas`, Bodega
  no la espeja, y el portal (línea de tiempo del pedido) y el tablero leen el
  alistado de `factura`. Fuera el camino por id de Alegra: la Bodega que leía
  de Alegra, procesar/recuperar/listas de la cola en `invoice.service`, y sus
  métodos del frontend. Una prueba barre todo el SQL del servidor buscando
  columnas renombradas (se habían escapado dos). La columna del puente queda
  para que la 032 corra en el corte.*
- [x] *Vino de main (2026-09-29):* la marca "Pedido enviado" del Reporte de
  Proveedores dura un ciclo (`ciclo_pedidos`): la limpieza semanal y el botón
  de Configuración la reinician. Al migrar faltantes, conservar ese reinicio.
  NUNCA probar la limpieza contra una base con datos de trabajo. — *Se
  conserva: las dos limpiezas siguen llamando a `cicloPedidos.reiniciar`
  (cicloPedidos.test.js). Su SQL nuevo se verificó con PREPARE, sin ejecutarlas.*

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
- [ ] *Vino de main (2026-09-29), hoy con el id de Alegra:* "Productos nuevos"
  (`producto_nuevo_catalogo.alegra_item_id`; ya valida contra `producto`),
  la rotación A/B de "Cliente nuevo" y "Bajamos el precio". Pasan a ids
  propios junto con la caché de la tablet.
- [ ] *Vino de main:* el historial solo cuenta facturas EMITIDAS (sin
  borradores ni anuladas, `esVenta`). Al leerlo de `factura_linea`, la misma
  regla: una proforma o una anulada no son venta.
- [x] *Vino de main:* aviso a la empresa de cada pedido nuevo del portal
  (`avisoPedidoNuevo.js`). Ya funciona sobre el pedido propio; en la rama
  aislada no sale (correo y WhatsApp bloqueados).

---

## 13. Reportes

**Hoy dependen de lo sincronizado:** Dashboard y Rentabilidad leen tablas
locales que se llenan desde Alegra. El Reporte para el contador importa
facturas y notas de crédito desde Alegra.

- [ ] Dashboard desde tablas propias
- [ ] Rentabilidad y fotografía de márgenes desde `producto` y `factura_linea`
  — *la Rentabilidad nueva de main (2026-09-25: sin pestañas, rotación y
  estadísticas en tiempo real) ya lee los productos de `producto`; falta que
  lo vendido, la rotación (`ventas/rotacion.js`) y las gráficas
  (`ventas/estadisticas.js`) salgan de `factura_linea`. Mientras tanto solo
  entran los productos con `alegra_id` (hoy todos). La "fotografía" semanal
  de márgenes ya no existe: main la retiró.*
- [ ] Reportes de proveedores y de clientes
- [ ] Reporte para el contador desde datos propios: ventas, compras, notas de crédito e IVA por tarifa
- [ ] Exportar a Excel (`xlsx` ya está instalado)

---

## 14. Usuarios y permisos

**Hoy ya son locales.**

- [ ] Permisos para los módulos nuevos: clientes, productos, inventario, caja, notas de crédito y configuración

**Hallazgos de esta sección:**
- **Un cajero con solo Facturación no podía cargar productos ni clientes.
  CORREGIDO (2026-09-24).** Facturación leía de `/maestro/productos` (dueño:
  Gestión de Catálogo) y de `/clientes` (dueño: Clientes), y el servidor
  exige el módulo también en las lecturas: 403 y la pantalla sin nada que
  vender. Afectaba a un usuario real ("familia vargas araya", solo con
  Facturación). Ahora lee de `/catalogos/productos` y `/catalogos/clientes`,
  la lectura compartida de lo activo, y `permisosModulos.test.js` falla si
  Facturación vuelve a pedir una ruta de otro módulo.
- [ ] Definir qué acciones requieren administrador: anular, nota de crédito, ajustar inventario, editar una factura emitida y cerrar caja
- [ ] Pantalla para consultar la bitácora

---

## 15. Migración y corte

- [x] **~~Espejar en `setupDatabase.js` las migraciones 013 a 020~~ — no
  corresponde (revisado 2026-09-23).** `setupDatabase.js` no puede montar esta
  base desde cero con o sin el espejo: no crea las tablas que maneja Prisma
  (`facturas_proveedores`, `supplier_product_mapping`,
  `alegra_products_cache`) ni las del portal (`cliente_portal`,
  `pedido_cliente`), borra todo al empezar e inserta proveedores de ejemplo.
  Las migraciones 018 a 023 alteran justamente esas tablas, así que copiarlas
  ahí fallaría o daría una seguridad falsa. La base del corte se arma como ya
  la arma `scripts/db-local/refrescar-copia.sh`: copia de producción +
  `migrations/independencia/*.sql` en orden — ese camino es el que se ejercita
  en cada refresco, así que lo que hay que cuidar es que cada migración corra
  en orden sobre una copia fresca de producción. Si algún día hiciera falta una instalación desde cero, es un script
  nuevo (`prisma db push` + `migrations/*.sql` + `migrations/independencia/*.sql`),
  no más copias a mano.
- [ ] Script de carga desde Alegra, de solo lectura y repetible: productos, clientes, proveedores, facturas con líneas, pagos, notas de crédito, compras, cotizaciones y existencias. *Cotizaciones ya tiene el suyo (`cargar-cotizaciones.js`)*
- [ ] **Correr la carga de facturas y notas de crédito JUSTO antes del corte, y
  revisar el próximo número que imprime.** Medido el 2026-09-24: la serie
  propia `00100001` está en 4869 pero Alegra ya emitió hasta la **4936** (67
  números, según la tabla de bodega de la copia del 23 de setiembre). Sin
  recargar, la primera factura propia choca con la UNIQUE (tipo, serie,
  consecutivo) y el mostrador no puede facturar. `cargar-facturas.js` y
  `cargar-notas-credito.js` ahora suben cada serie hasta lo copiado
  (`GREATEST`, nunca retrocede). El mismo choque deja a la factura propia
  **fuera de Facturas en Bodega**: su espejo en la tabla vieja `facturas` se
  inserta con `ON CONFLICT (numero_factura) DO NOTHING`, así que si el número
  ya lo tiene una de Alegra, se descarta sin avisar
- [ ] Bajar el PDF y el XML de las facturas electrónicas que emitió Alegra, que hay que conservar 5 años
- [ ] Conciliación: cantidades y totales por mes iguales entre Alegra y la base propia
- [ ] Ensayo de corte completo en la base de la rama
- [ ] Plan de corte: qué día, qué se congela en Alegra y cómo se vuelve atrás
- [ ] WhatsApp en el servidor nuevo (vino de main, 2026-09-29): Baileys vive
  adentro del backend (`integrations/whatsapp/conexion.js`), con la sesión en
  la base (`whatsapp_sesion`). En el corte: `WHATSAPP_PROVEEDOR=interno` y
  `PERMITIR_SALIDAS=true`, y copiar la sesión de producción o volver a
  vincular con el QR. En la rama aislada no se conecta nunca.

---

## 16. Retiro de Alegra del código

- [ ] **Borrar los dos traductores del frontend**, que existen solo mientras los componentes hablen el vocabulario de Alegra:
  - `frontend/src/services/facturaPropiaAdaptador.js` — traduce la factura propia a `numberTemplate`, `client`, `items`, `status: open/void`. Se borra cuando la pantalla de Facturación y el cache de IndexedDB usen `numero`, `cliente`, `lineas` y nuestros estados.
  - El mapeo `adaptarDeudor` dentro de `frontend/src/services/cuentasPorCobrarService.js` — traduce a `numeroFactura`, `totalSaldo`, `clienteNombre`. Se borra cuando `CuentasPorCobrar.jsx`, `ClienteDetalle.jsx` y `ModalAbono.jsx` usen `numero`, `saldoTotal` y `nombre`.

  Se dejaron a propósito **en el frontend y no en el servidor**: meter el vocabulario de Alegra dentro de nuestra propia API sería dejarlo ahí para siempre. Pegados al código viejo, se borran con él. Mientras existan, el precio es que hay dos nombres para lo mismo y alguien puede escribir uno esperando el otro.

- [ ] Quitar las sincronizaciones de productos (6 h) e historial de clientes. *La de **CxC (30 min) ya se retiró** con la sección 7*
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
