---
id: modulo/gastos-operativos
tipo: modulo
titulo: Gastos operativos — combustible y alimentación sin catálogo ni pago automático
estado: vigente
archivos:
  - backend/migrations/independencia/061_gastos_operativos.sql
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

Recibir no paga: el saldo se calcula en CxP y la ficha registra el MISMO pago
de Pago Proveedores/Caja. La clave y huella de reintento evitan otro abono al
perder conexión. La ficha paga en CRC, sin disfrazar moneda extranjera.

Renta, IVA y respuesta del receptor quedan pendientes. No hay aceptación
automática, ni siquiera después de revisar: se confirma y envía expresamente.
El control vive también bajo el bloqueo fiscal de compra; la API genérica
no sustituye los importes aprobados por la condición global comercial. La
clasificación y los importes fiscales preparados se conservan. El impuesto
único de combustible no se interpreta como IVA. Validación local no significa
aceptación del proveedor por Hacienda ni verificación de confianza del certificado.

Permiso propio; Revisión sólo toma prestado POST /desde-factura. No abre lista,
pagos ni archivos por ese permiso. Investigación y verificación en
[el informe](../../informes/gastos-operativos-2026-10-21.md).

El Reporte Contador incluye gastos por mes de emisión, también pendientes,
en sección/hoja aparte. Sólo importes revisados se suman como deducción/crédito;
los otros quedan vacíos. El envío mensual existente adjunta Excel y ZIP de
originales con faltantes indicados. No duplica compra ni pago.
[[modulo/reporte-contador]].

SQL061 aplicada en producción por Codex el 21/10 a las 17:20:18 CR,
con respaldo restaurado y 144 tablas conservadas. Usuario autoriza publicar
Gastos y Reporte Contador en main. [Registro](../../informes/despliegue-gastos-contador-2026-10-21.md).
