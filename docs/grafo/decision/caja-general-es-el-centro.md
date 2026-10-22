---
id: decision/caja-general-es-el-centro
tipo: decision
titulo: Caja General es el centro — todo cobro entra, todo pago sale, y los movimientos son una vista
estado: vigente
archivos:
  - backend/migrations/independencia/027_movimiento_caja.sql
  - backend/src/utils/cajaGeneral.js
  - backend/src/modules/cuentas-por-cobrar/cajaGeneral.service.js
  - backend/src/modules/cuentas-por-cobrar/cobros.service.js
  - backend/src/modules/cuentas-por-cobrar/cierreCaja.service.js
  - backend/src/modules/pagos-proveedores/pagosProveedor.service.js
  - frontend/src/components/cuentas-por-cobrar/CajaGeneral.jsx
  - frontend/src/components/pagos/ModalPagoVarias.jsx
  - backend/migrations/independencia/028_cuenta_de_contado.sql
  - backend/src/modules/compras/liberarCuentaPorPagar.js
aristas:
  relacionado: [tabla/cuentas-por-pagar, modulo/compras, modulo/gastos-operativos]
medido: 2026-10-21
---

DECISIÓN DEL USUARIO (2026-09-23): sin fondo fijo ni cajas separadas para
clientes o proveedores. Todo cobro ENTRA a Caja General; todo pago a un
proveedor o de un gasto recurrente SALE de ella. El método (efectivo, SINPE,
transferencia) dice cómo, no de dónde. Las otras `cuenta_dinero` sembradas
desde Alegra (banco, tarjeta, caja chica) quedan sin uso en estos flujos.

LOS MOVIMIENTOS SON UNA VISTA, NO UNA TABLA. `movimiento_caja` (027) une
`pago` (+ `pago_factura`), `pago_proveedor` (+ `pago_proveedor_cuenta`) y
`pago_recurrente` pagado. Una tabla aparte sería una segunda copia de cada
documento: se desincroniza al anular, y un cobro registrado por dos caminos
(al facturar de contado y como abono) se contaría dos veces. Los anulados se
ven marcados y no suman. Cada movimiento lleva las facturas que lo originaron.

UN MOVIMIENTO PUEDE CUBRIR VARIAS FACTURAS de la misma contraparte: un solo
documento con una línea por factura (`registrarAbono` y `registrarPago`
aceptan `aplicaciones`). Las facturas se bloquean todas juntas y por id.

EL CIERRE DE CAJA CUENTA BILLETES: resta solo las salidas con método
efectivo; un pago por transferencia pasa por Caja General pero no toca la
caja física.

POR PERÍODO, NO UN SALDO DE SIEMPRE: el histórico tiene ₡212 M de cobros y
casi ninguna salida registrada (los pagos viejos a proveedores quedaron como
`pagado_sin_detalle`), así que un saldo acumulado desde el principio no
significa nada.

COMPRAS DE CONTADO (028): al registrarlas nace su cuenta por pagar
PENDIENTE, marcada `de_contado` y con estado CONTADO (no "vencida"). No se
pagan solas —decisión del usuario—: una persona anota cómo se pagó y recién
ahí sale de Caja General. Los gastos recurrentes no la crean: se pagan en
Pagos Recurrentes, y una cuenta acá contaría la salida dos veces.

COMBUSTIBLE Y ALIMENTACIÓN (061): son gastos operativos documentados por
factura, distintos de los servicios de Pagos Recurrentes. Usan la cuenta
por pagar y el MISMO pago a proveedor de esta vista. Recibir/clasificar no
crea egresos, incluso si el XML dice contado. El método sigue diciendo cómo
se pagó; el flujo existente conserva Caja General como centro.

Nueva decisión del usuario, 21/10: aprobar un gasto operativo confirma que
ya se pagó de contado, eligiendo su medio. Ese pago completo y la aprobación
comparten transacción y documento de pago a proveedor; el rechazo no crea
salida. Recibir sigue sin registrar pagos por sí solo. SQL062, sólo local.
