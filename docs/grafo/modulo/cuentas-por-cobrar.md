---
id: modulo/cuentas-por-cobrar
tipo: modulo
titulo: Cuentas por Cobrar — cartera, detalle de productos y registro de abonos
estado: vigente
archivos:
  - frontend/src/pages/CuentasPorCobrar.jsx
  - frontend/src/components/cuentas-por-cobrar/ModalAbono.jsx
  - frontend/src/components/pagos/TablaProductosFactura.jsx
  - frontend/src/hooks/useCuentasPorCobrar.js
  - frontend/src/hooks/useDetalleCobro.js
  - frontend/src/hooks/useOpcionesPago.js
  - frontend/src/services/cuentasPorCobrarService.js
  - frontend/src/utils/productosFacturaCobro.js
  - frontend/src/index.css
  - backend/src/modules/cuentas-por-cobrar/cuentas-por-cobrar.routes.js
  - backend/src/modules/cuentas-por-cobrar/cobros.controller.js
  - backend/src/modules/cuentas-por-cobrar/cobros.service.js
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/tests/productosFacturaCobro.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/caja-general, modulo/permisos, decision/caja-general-es-el-centro]
medido: 2026-10-30
---

La cartera se agrupa por cliente; el saldo se calcula desde la factura,
los cobros vigentes y las notas vigentes. Registrar un cobro relee ese saldo
con bloqueo, también cuando se elige saldar todo. No hay una copia de saldo
que deba mantenerse al mostrar el detalle.

## Qué contiene la factura al cobrar

`GET /cuentas-por-cobrar/propios/facturas/:id/productos` es una lectura bajo
el permiso de Cobros. Quien cobra puede ver la factura de otra persona sin
necesitar Facturación ni el permiso para ver todas sus facturas. No concede
acceso a editarla. Una consulta distingue un ID inexistente (404) de una
factura sin líneas ([]); ID inválido, 400. Reutiliza `COLUMNAS_LINEA` y
`lineaAVista` de Facturación y la fotografía histórica del documento, sin
consultar ni recalcular el producto actual.

`productosFacturaCobro` lleva ese DTO a la tabla compartida: descripción,
código, cantidad, precio unitario sin impuesto, descuento y total guardado
con impuesto. La clave es el número de línea, porque un producto se puede
repetir. Una regalía conserva su total cero real. Antes el servicio enviaba
`nombre`/`precio` y la tabla esperaba `descripcion`/`precioUnitario`: se veía
sin descripción y con ₡0,00; además recalculaba el total sin IVA.

`useDetalleCobro` carga y descarta respuestas tardías al cerrar o cambiar
factura. Un error de consulta se muestra con Reintentar y se diferencia de
una factura vacía; el contexto de productos no bloquea el cobro. Los métodos
de pago reutilizan `useOpcionesPago`, fuera del componente visual.

## Fecha en Safari móvil

El campo sigue siendo `type=date`, con el día de Costa Rica y su selector
nativo. En la regla móvil existente de `index.css`, `appearance:none` y
`display:block` hacen que el control de iOS respete el ancho CSS de su
tarjeta. Se conservan box-sizing, mínimos, alineación y alto táctil. La regla
también cubre los campos de fecha de los pagos compartidos. Una fecha vacía
no permite registrar un cobro.

No requiere SQL ni modifica importes, saldos, inventario o pagos anteriores.
[Caso y validación](../../informes/cobros-safari-detalle-2026-10-30.md).
