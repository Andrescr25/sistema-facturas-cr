# Checklist: independencia de Alegra

- **Rama de trabajo:** `independencia-alegra`. `developer` y `main` siguen con
  el sistema híbrido.
- **Pospuesto por decisión (11 de setiembre de 2026):** el paso a factura
  electrónica. El modelo de datos deja el lugar listo para hacerlo después.
- **Contexto y cifras:** ver `plan-independencia-alegra.md`.

Cada sección dice qué depende hoy de Alegra y cuándo se da por lista. Se
marca `- [x]` al terminar.

## Cómo trabajar en esta rama

- **Base local.** Se levanta con `docker start tachi-db-local`. Si la copia
  quedó vieja: `cd backend && scripts/db-local/refrescar-copia.sh --si`. El
  script lee producción, reemplaza **solo** la base local y vuelve a aplicar
  las migraciones de la rama.
- **Backend de la rama:** `cd backend && PORT=3010 node server.js`. Se
  conecta a la copia local por `.env.aislado`, y el de `main` puede seguir
  corriendo en el 3000.
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

- [ ] Datos de la empresa: nombre, cédula, actividad, dirección, teléfono, correo y logo para los PDF
- [ ] Impuestos y tarifas: 13 %, 4 %, 2 %, 1 % y exento
- [ ] Métodos de pago: efectivo, SINPE Móvil, transferencia, tarjeta y cheque
- [ ] Plazos de crédito: contado, 8, 15, 22, 30 y 60 días
- [ ] Cuentas de dinero: Caja general, Caja chica, Banco y Tarjeta empresarial
- [ ] Series y consecutivos propios, que no choquen con los de Alegra
- [ ] Pantalla de Configuración para todo lo anterior

**Lista cuando:** nada de esto se lee de Alegra.

---

## 2. Productos

**Hoy en Alegra:** es el maestro (2.130 productos). La caché local no tiene
existencias ni CABYS. Gestión de Catálogo edita en Alegra nombre, referencia,
precio, costo y categoría, y también borra, duplica por marca y sube fotos.
Revisión de Precios crea productos y cambia precios. Se sincroniza cada 6 horas.

- [ ] Tabla `producto`: nombre, referencia, descripción, CABYS, tarifa de impuesto, unidad, categoría, precio sin IVA, costo, estado, oculto, inventariable, forma farmacéutica y registro sanitario
- [ ] Carga inicial de los 2.130 productos
- [ ] Crear producto (reemplaza el alta desde Revisión de Precios y "duplicar marca")
- [ ] Editar producto con **todos** los campos. Hoy no se pueden editar CABYS, impuesto, unidad ni los datos de medicamento
- [ ] Activar y desactivar en vez de borrar, para no perder el historial
- [ ] Categorías: crear, renombrar y desactivar (hay 17 en Alegra y ninguna pantalla)
- [ ] Fotos en almacenamiento propio. Las URL de Alegra vencen a los 7 días
- [ ] `precio_historico` y `costo_historico` apuntando al id propio
- [ ] Facturación, catálogo del agente, catálogo de clientes y portal leyendo de `producto`
- [ ] Retirar la sincronización de productos cada 6 horas
- [ ] Datos a corregir: 2 sin impuesto, 18 sin referencia, 8 medicamentos sin registro sanitario (6 tampoco tienen forma farmacéutica)

**Lista cuando:** se puede crear, editar y desactivar cualquier producto sin
abrir Alegra.

---

## 3. Clientes

**Hoy en Alegra:** 204 clientes y **ninguna pantalla** para crearlos ni
editarlos. La integración tiene los métodos, pero nadie los llama.
Facturación los busca en la caché que viene de Alegra. El portal usa
`alegra_contact_id`.

- [ ] Tabla `cliente`: tipo y número de identificación, nombre, nombre comercial, hasta 4 correos, teléfonos, provincia, cantón, distrito y señas, actividades económicas, plazo y límite de crédito, exoneración, observaciones y estado
- [ ] Carga inicial de los 204 clientes
- [ ] Pantalla de clientes: listar, buscar, crear, editar y desactivar. Hoy `/clientes` solo maneja el portal
- [ ] Validar la identificación según su tipo (física, jurídica, DIMEX, NITE) y validar teléfonos (lección de los teléfonos sucios)
- [ ] Traer las actividades económicas por cédula desde la consulta pública de Hacienda al crear o editar
- [ ] Ficha del cliente con facturas, saldo, abonos, pedidos e historial de compras. Hoy está repartido entre CxC, Reporte de Clientes y portal
- [ ] Portal, catálogo del agente, CxC y WhatsApp usando `cliente.id`
- [ ] Datos a completar: 176 sin correo, 9 sin identificación, 202 sin actividad económica

**Lista cuando:** se puede dar de alta un cliente nuevo y facturarle sin
abrir Alegra.

---

## 4. Proveedores

**Hoy repartido en tres lugares:** el mapeo por cédula
(`supplier_product_mapping`, 36 cédulas), la tabla `proveedores` (25 filas y
sin cédula) y 34 contactos en Alegra que se crean al enviar compras.

- [ ] Tabla `proveedor` por cédula: nombre, plazo, correo y teléfono de WhatsApp; los contactos de pedido ya existen en `proveedor_contactos`
- [ ] Unificar las tres fuentes en una sola lista
- [ ] Pantalla de proveedores: crear, editar y ver sus productos, compras y saldo
- [ ] Mapeo producto ↔ proveedor apuntando a `producto.id` y `proveedor.id`

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

- [ ] Tablas `factura` y `factura_linea`: copia fija del cliente, fechas, condición y plazo, medio de pago, subtotal, descuento, impuesto por tarifa, total, estado (borrador, emitida o anulada), serie, consecutivo y `alegra_id` opcional
- [ ] Consecutivo propio, tomado con bloqueo para que no se repita
- [ ] Crear factura con la misma pantalla y un backend nuevo, conservando la idempotencia (`factura_intento`) y la cola sin conexión
- [ ] **Editar factura**, dejando registro en la bitácora. Regla: se edita mientras no esté emitida como electrónica; una vez emitida, se corrige con nota de crédito
- [ ] Anular factura con motivo, definiendo qué pasa si ya tenía un pago aplicado
- [ ] **Notas de crédito** por devolución total o parcial, error o anulación, devolviendo al inventario. Hoy se hacen **a mano en Alegra** (27, con motivos como "error", "devolución" y "anular")
- [ ] PDF propio de la factura (ya existe el de cotización con pdfkit)
- [ ] Envío por WhatsApp y correo con el PDF propio
- [ ] Buscar facturas por número, cliente o fecha en la base propia
- [ ] Impuesto calculado por línea con la tarifa del producto (lecciones: IVA 13 % hardcodeado y precio sin IVA vs costo con IVA)
- [ ] Descuentos por línea y ofertas de exceso y liquidación (lección de las dos clases de oferta)
- [ ] Retirar el módulo `duplicados-electronica`, que solo existe por cómo Alegra convierte facturas
- [ ] Dejar el espacio para la emisión electrónica pospuesta: la factura guarda todo lo necesario para emitirla después sin rehacer el modelo

**Lista cuando:** se puede vender, editar, anular y devolver sin abrir Alegra.

---

## 7. Cobros, cuentas por cobrar y caja

**Hoy en Alegra:** CxC se sincroniza cada 30 minutos y los abonos van a
`POST /payments`. Hay 1.349 pagos, todos a "Caja general". **Del último mes,
135 de 150 pagos no traen observación y no salen de nuestro sistema**:
parecen registrarse a mano en Alegra. Hay que confirmarlo con quien cobra.

- [ ] Tabla `pago`: facturas a las que se aplica, método, cuenta de dinero, referencia (número de SINPE, por ejemplo) y usuario
- [ ] Saldo de cada factura calculado: total menos pagos menos notas de crédito
- [ ] Registrar el cobro de contado al facturar, para que no haga falta ir a Alegra
- [ ] Registrar abonos desde la misma pantalla de CxC, sobre la base propia
- [ ] **Cierre de caja diario**: efectivo esperado contra efectivo contado. Hoy no existe
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
