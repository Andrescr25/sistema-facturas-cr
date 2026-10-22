---
id: modulo/gastos-operativos
tipo: modulo
titulo: Gastos operativos — aprobación y pago de contado desde Revisión de precios
estado: vigente
archivos:
  - backend/migrations/independencia/061_gastos_operativos.sql
  - backend/migrations/independencia/062_gastos_aprobacion.sql
  - backend/src/modules/gastos-operativos/gastos.aprobacion.js
  - backend/src/integrations/hacienda/gastosPendientes.js
  - backend/tests/gastosAprobacionPg.test.js
  - frontend/src/hooks/useAprobarGasto.js
  - frontend/src/hooks/useAprobacionGastoForm.js
  - frontend/src/components/revision-precios/GastosPorAprobar.jsx
  - frontend/src/components/revision-precios/ModalAprobarGasto.jsx
  - frontend/src/components/gastos-operativos/EstadoFiscalGasto.jsx
  - backend/src/modules/gastos-operativos/gastos.recepcion.js
  - backend/src/modules/gastos-operativos/gastos.registro.js
  - backend/src/modules/gastos-operativos/gastos.service.js
  - backend/src/modules/gastos-operativos/gastos.originales.js
  - backend/src/modules/gastos-operativos/gastos.validacion.js
  - backend/src/modules/gastos-operativos/gastos.archivos.js
  - backend/src/modules/gastos-operativos/gastos.controller.js
  - backend/src/modules/gastos-operativos/gastos.routes.js
  - backend/src/modules/compras/registrarSinInventario.js
  - backend/src/modules/pagos-proveedores/pagoProveedorIdempotencia.js
  - backend/src/integrations/hacienda/gastoOperativo.js
  - frontend/src/pages/GastosOperativos.jsx
  - frontend/src/hooks/useGastosOperativos.js
  - frontend/src/hooks/useProcesarFacturaGasto.js
  - frontend/src/utils/gastosOperativos.js
  - frontend/src/components/gastos-operativos/DetalleGasto.jsx
  - frontend/src/components/gastos-operativos/RevisionFiscalGasto.jsx
  - backend/tests/gastosOperativos.test.js
  - backend/tests/gastosOperativosPg.test.js
  - backend/tests/gastoOperativoHaciendaPg.test.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea, tabla/facturas-proveedores, tabla/cuentas-por-pagar]
  relacionado: [modulo/compras, modulo/revision-precios, modulo/reporte-proveedores, modulo/hacienda, modulo/reporte-contador, decision/caja-general-es-el-centro, decision/la-ruta-no-el-contenido, decision/el-total-manda-sobre-las-lineas]
medido: 2026-10-21
---

La ficha del proveedor elige Comercial (predeterminado), Combustible,
Alimentación/viáticos o Mixto. Se identifica por cédula, nunca por parecido
de nombre. Los existentes quedan comerciales. Mixto no reutiliza mapeos
automáticos; cada factura puede continuar como compra o pasar a gasto desde
Revisión de Precios. La preferencia futura es explícita y no transforma historia.
Desactivar un proveedor conserva su tratamiento. Varias fichas con la misma
cédula normalizada requieren revisión; no se escoge una al azar.

Se reutilizan XML/buzón, almacenamiento privado, compra con producto NULL
de Pagos Recurrentes, CxP/pagos/Caja y bitácora. `gasto_operativo` agrega datos
y revisión, no otra factura ni otro movimiento. El total es el del original.
La recepción usa una transacción y bloqueo por clave. XSD 4.4, emisor/receptor,
clave, número y total se validan desde el XML. Un documento que requiere revisión
queda visible con el motivo, sin compra ni pago habilitado; se puede completar
un XML faltante y revalidarlo. Se conserva el XML íntegro en disco y sus datos
de líneas/impuestos. El PDF se recibe sólo con correspondencia inequívoca o
se adjunta explícitamente. No se reemplazan originales.

GASTO_RECURRENTE es el enum interno reutilizado para excluir documentos sin
catálogo (Prisma compartido no se regenera); `tratamiento` distingue ambos gastos.
Pagos Recurrentes excluye operativos para evitar otro registro. Los triggers
061 bloquean productos/relaciones incluso ante llamadas tardías. Una compra
comercial registrada no se convierte en silencio: puede haber movido stock o
tener reserva fiscal. Reclasificar combustible/alimentación exige motivo y
bitácora. La versión evita sobrescribir cambios ajenos.

## Aprobación sencilla solicitada después — 2026-10-21

El usuario pide que el gasto siga en Revisión de Precios y baste aprobar o
rechazar; al aprobar elige el medio porque siempre lo paga de contado.
Confirma usar la condición de IVA ya elegida en Configuración → Hacienda.
Esto reemplaza los formularios por factura del flujo inicial, conservados
sólo para revisión documental pendiente y compatibilidad histórica.

Recibir sigue sin pagar ni enviar: la sección Gastos por aprobar consulta
los pendientes con su propio permiso/paginación. Aprobar confirma decisión,
revisión fiscal y pago del saldo completo en UNA transacción con la función
registrarPagoEn de Pago Proveedores/Caja. No otra salida ni saldo guardado.
Fecha del pago: la del comprobante de contado, visible antes de confirmar.
Sólo medio obligatorio, sin inventar referencias bancarias. XML válido/CRC
requeridos; no se inventan conversiones. UUID, huella, bloqueo y versión
impiden doble pago incluso con respuesta perdida u otro UUID de reintento.

Condición 01 usa sólo IVA elegible del XML, 04 no acredita y 05 conserva
deducción/crédito pendientes sin enviarlos como cero. Impuesto único de
combustible nunca se convierte en IVA. El operador confirma el gasto de la
actividad al aprobar. Una configuración ausente impide aprobar sin elegir
declaración por omisión. Se congela la condición de la decisión.

Rechazar no paga: bloquea la CxP y anula la compra documental sin inventario;
rechazo fiscal (mensaje 3) sin deducción/crédito. Con pagos/notas ya aplicados
exige revisión, no los borra. El rechazo no anula la factura original del
proveedor. Sin XML válido se conserva el rechazo local y el motivo fiscal
pendiente, sin inventar un mensaje. Revalidar un rechazado no libera su deuda.

Gastos operativos abre en Aprobados: proveedor/categoría/fecha/total/medio,
comprobante, pagos y estado real de Hacienda; Rechazados consultables aparte.
Desaparecen de los pendientes al decidir. Formularios fiscales ocultos en
decisiones confirmadas; reintentar sólo la respuesta fiscal no vuelve a pagar.
Rechazados quedan fuera de los totales del contador, conservados como respaldo.

La red corre después del COMMIT. Si falla, informa pago conservado y respuesta
pendiente; el trabajador fiscal retoma decisiones sin comprobante preparado
tras 2 minutos (hasta 3 días), y luego conserva sus reintentos existentes.
La excepción que permite preparar desde compra anulada está limitada al rechazo
explícito de un gasto; no abre aceptación de otras compras anuladas.

El control vive también bajo el bloqueo fiscal de compra; la API genérica
no sustituye los importes aprobados por la condición global comercial. La
clasificación y los importes fiscales preparados se conservan. Validación local no significa
aceptación del proveedor por Hacienda ni verificación de confianza del certificado.

Permiso propio; Revisión conserva POST /desde-factura y tiene su lista/decisión
en /revision-precios/gastos-operativos. No presta pagos genéricos ni la lista
general por ese permiso. Investigación y verificación inicial en
[el informe](../../informes/gastos-operativos-2026-10-21.md).

El Reporte Contador incluye gastos por mes de emisión, también pendientes,
en sección/hoja aparte. Sólo importes revisados se suman como deducción/crédito;
los otros quedan vacíos. El envío mensual existente adjunta Excel y ZIP de
originales con faltantes indicados. No duplica compra ni pago.
[[modulo/reporte-contador]].

SQL061 aplicada en producción por Codex el 21/10 a las 17:20:18 CR,
con respaldo restaurado y 144 tablas conservadas. Usuario autoriza publicar
Gastos y Reporte Contador en main. [Registro](../../informes/despliegue-gastos-contador-2026-10-21.md).

SQL062 aplicada en producción por Codex el 21/10 a las 21:46 CR, antes de
publicar la aprobación nueva. Respaldo restaurado y datos anteriores conservados.
[Validación inicial](../../informes/gastos-aprobacion-2026-10-21.md) y
[publicación con Caja General](../../informes/despliegue-aprobacion-caja-2026-10-21.md).
