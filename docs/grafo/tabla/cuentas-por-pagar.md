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
clave responde conflicto. Ni combustible ni alimentación se pagan solos.
