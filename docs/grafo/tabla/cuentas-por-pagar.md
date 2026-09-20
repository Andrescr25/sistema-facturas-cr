---
id: tabla/cuentas-por-pagar
tipo: tabla
titulo: Se crea al recibir el correo, se libera al aceptar
estado: vigente
archivos:
  - backend/services/pagosProveedoresService.js
  - backend/migrations/independencia/023_cuenta_por_pagar_de_compra.sql
aristas:
  vive_en: [modulo/compras]
  depende_de: [tabla/facturas-proveedores, tabla/compra]
medido: 2026-09-20
---

Modelo `CuentaPorPagar` (Prisma), tabla `cuentas_por_pagar`. Se crea al
guardar la factura del buzón (`liberada: false`), no al registrar la compra
— `registrarCompra` no la crea, la re-apunta y la libera.

`compra_id` (migración 023) es el enlace directo a [[tabla/compra]]; antes
solo existía `factura_id` hacia el buzón. Backfill retroactivo: 316 de las
318 cuentas ya enlazadas (las 2 que faltan son del buzón que nunca se aceptó
como compra). `registrarCompra` repite el cálculo de
`liberarCuentaPorFactura` en SQL crudo, DENTRO de su propia transacción, en
vez de llamar a esa función: es Prisma, otra conexión a la base, y un
rollback de la compra no revertiría lo que esa llamada ya hubiera
confirmado. Es una duplicación que se acepta hasta que Prisma se retire de
este camino.

`proveedorNombre`/`proveedorCedula` siguen siendo texto suelto, sin FK a
`proveedor`. "Pagar" sigue siendo un PATCH que baja `saldoPendiente` a mano;
no existe una tabla `pago_proveedor` con cuenta de dinero, referencia y
usuario — por eso la sección 9 del checklist sigue en 0/3.
