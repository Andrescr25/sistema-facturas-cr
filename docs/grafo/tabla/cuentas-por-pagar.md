---
id: tabla/cuentas-por-pagar
tipo: tabla
titulo: Se crea al recibir el correo, se libera al aceptar
estado: vigente
archivos:
  - backend/services/pagosProveedoresService.js
aristas:
  vive_en: [modulo/compras]
  depende_de: [tabla/facturas-proveedores]
medido: 2026-09-20
---

Modelo `CuentaPorPagar` (Prisma), tabla `cuentas_por_pagar`. Se crea al
guardar la factura del buzón (`liberada: false`), no al enviarla a Alegra ni
al registrar la compra: eso importa para `registrarCompra` en
[[modulo/compras]] — no hay que CREAR la cuenta, hay que re-apuntarla a
`compra.id` y liberarla.

Hoy `facturaId` apunta al buzón (`facturas_proveedores`), no a
[[tabla/compra]], y `proveedorNombre`/`proveedorCedula` son texto suelto, sin
FK a `proveedor`. "Pagar" hoy es un PATCH que baja `saldoPendiente` a mano; no
existe una tabla `pago_proveedor` con cuenta de dinero, referencia y usuario
— por eso la sección 9 del checklist está en 0/3.
