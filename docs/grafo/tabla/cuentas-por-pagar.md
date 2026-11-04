---
id: tabla/cuentas-por-pagar
tipo: tabla
titulo: Se crea al recibir el correo, se libera al aceptar, y su saldo se calcula
estado: vigente
archivos:
  - backend/services/pagosProveedoresService.js
  - backend/src/modules/pagos-proveedores/pagosProveedor.service.js
  - backend/src/modules/compras/liberarCuentaPorPagar.js
  - backend/migrations/independencia/023_cuenta_por_pagar_de_compra.sql
  - backend/migrations/independencia/025_pago_proveedor.sql
  - backend/tests/pagosProveedor.test.js
  - backend/src/modules/pagos-proveedores/pagoProveedorIdempotencia.js
  - backend/src/modules/pagos-proveedores/cuentasPorPagar.lectura.js
  - backend/tests/cuentaPorPagarSinFactura.test.js
  - backend/migrations/independencia/078_cheque_a_fecha.sql
  - backend/src/modules/pagos-proveedores/chequesProveedor.service.js
  - backend/src/modules/pagos-proveedores/chequesPendientes.js
  - frontend/src/utils/chequeAFecha.js
  - frontend/src/components/pagos-proveedores/ChequesPorCobrar.jsx
  - backend/tests/chequesProveedor.test.js
  - backend/tests/chequeAFechaPantalla.test.js
aristas:
  vive_en: [modulo/compras]
  depende_de: [tabla/facturas-proveedores, tabla/compra]
  relacionado: [modulo/gastos-operativos]
medido: 2026-10-21
---

Modelo `CuentaPorPagar` (Prisma), tabla `cuentas_por_pagar`. Se crea al
guardar la factura del buzón (`liberada: false`), no al registrar la compra
— `registrarCompra` la libera con `liberarCuentaPorPagar`, que la cuelga de
la compra (`compra_id`, migración 023) y de su proveedor por id propio
(`proveedor_id`, migración 025; las 318 lo encontraron por cédula).

EL SALDO Y EL ESTADO SE CALCULAN (migración 025). La vista
`cuenta_por_pagar_saldo` da, por cuenta: total − notas de crédito aplicadas
(`nota_credito_aplicacion`, sin las eliminadas) − `pagado_sin_detalle` −
pagos vigentes (`pago_proveedor_cuenta` de pagos no anulados). El estado sale
de ahí: PAGADA si el saldo es 0, VENCIDA si pasó el vencimiento (día de Costa
Rica, no UTC), PARCIAL si tiene pagos y saldo, si no PENDIENTE. Las columnas
`saldo_pendiente` y `estado` siguen en la tabla porque el cliente de Prisma
—compartido con main/developer— las exige, pero NADIE en esta rama las lee:
se quedaban viejas (13 cuentas figuraban PENDIENTE meses después de vencer).

PAGAR ES UN DOCUMENTO. `pago_proveedor` (fecha, proveedor, cuenta de dinero,
método, referencia, monto) repartido en `pago_proveedor_cuenta`; se anula
con motivo, nunca se borra. Antes, pagar era un PATCH que bajaba el saldo a
mano; ese PATCH ahora responde 400.

`pagado_sin_detalle` es lo que ya estaba pagado al hacer el corte (₡16,3 M en
246 facturas): no hay dato de cuándo ni desde qué cuenta se pagó, así que no
se inventaron pagos — quedó un número por factura, congelado una vez. Al
aplicar la 025, los 318 saldos calculados dieron EXACTAMENTE los guardados.

GASTOS OPERATIVOS (061). Reutilizan esta cuenta y su saldo, no otra cartera.
Sólo se libera tras validar el original y registrar la compra sin producto;
contado también queda pendiente hasta registrar un pago real. El pago lleva
opcionalmente UUID y huella de idempotencia: repetir la misma petición
devuelve el documento existente, sin otro egreso; cambiarla con la misma
clave responde conflicto. Recibir combustible/alimentación sigue sin pagar;
desde SQL062 el operador confirma Aprobar y el medio en Revisión. El saldo
completo se paga en la MISMA transacción que la decisión, con registrarPagoEn.
Rechazar no paga y deja la cuenta sin liberar; si ya tiene pagos/notas exige
revisión. La ficha muestra siempre el saldo real, incluso al anular un pago.

SIN FACTURA DEL BUZÓN, Y SE LEE CON `pg` (2026-10-29). La factura de compra
cargada a mano a CRÉDITO (`crearCuentaACredito`) y la de contado
(`crearCuentaDeContado`, con `id` null) crean su cuenta con `factura_id` NULL:
no hay factura del buzón que colgarle. El cliente de Prisma declara `facturaId`
obligatorio, y Prisma valida cada fila que LEE, así que UNA cuenta así hacía
fallar la lista de Pagos a Proveedores entera (P2032, 500 «Error obteniendo
cuentas por pagar») desde que se cargó la primera factura a mano. Las pruebas
no lo vieron porque nadie leyó la lista con una de ellas; ver
[[leccion/el-doble-de-prisma-no-valida-tipos]], caso 2. Ahora las cuentas se
leen y se anotan con `pg` (`cuentasPorPagar.lectura.js`): una cuenta sin
factura sale con `facturaId` null, sin productos, y con el número de la propia
cuenta. Una prueba impide que vuelva a haber una lectura de `cuentas_por_pagar`
con Prisma.

CHEQUES A FECHA (078, 2026-11-03). El usuario paga algunas facturas con un
cheque fechado para dentro de un mes («así el proveedor me da 30 días») y
pidió que «no me lo quite de una, sino que me salga una nota como cheque para
x fecha, pendiente de confirmación»; eligió confirmarlo él. Con método Cheque
y fecha FUTURA (hasta 180 días) no se registra un pago: se anota en
`cheque_proveedor` + `cheque_proveedor_cuenta`, fuera de `pago_proveedor`, así
que el saldo, `movimiento_caja`, el cierre y el reporte del contador no lo ven.
La factura se sigue debiendo con su nota, y lo que el cheque cubre no se vuelve
a pagar: `facturasAPagar` (una sola copia para el pago y el cheque) descuenta
los cheques sin confirmar (`chequesPendientes.js`). «Confirmar cobro» marca
`confirmado_en` y registra el pago de siempre con `registrarPagoEn` en la misma
transacción, con el día en que salió del banco (por omisión el del cheque, u
hoy si se cobró antes); el cheque queda colgado de `pago_id`. Anular no borra
(motivo); uno confirmado se deshace anulando su pago. El modal de varias
facturas, compartido con Cuentas por Cobrar y Gastos, solo lo permite con
`permiteChequeAFecha` (Pagos a Proveedores).

