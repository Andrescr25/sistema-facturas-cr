---
id: modulo/reporte-contador
tipo: modulo
titulo: Reporte Contador — ventas, compras y gastos del mes con sus comprobantes
estado: vigente
archivos:
  - backend/src/modules/reporte-contador/desdeElSistema.js
  - backend/src/modules/reporte-contador/contador.mes.js
  - backend/src/modules/reporte-contador/contador.excel.js
  - backend/src/modules/reporte-contador/contador.comprobantes.js
  - backend/src/modules/reporte-contador/contador.historico.js
  - backend/src/modules/reporte-contador/reporte-contador.service.js
  - backend/src/modules/reporte-contador/reporte-contador.controller.js
  - backend/src/modules/reporte-contador/reporte-contador.routes.js
  - frontend/src/pages/ReporteContador.jsx
  - frontend/src/hooks/useReporteContador.js
  - frontend/src/utils/reporteContadorUtils.js
  - frontend/src/components/reporte-contador/ResumenMes.jsx
  - frontend/src/components/reporte-contador/MovimientosMes.jsx
  - frontend/src/components/reporte-contador/DetalleMovimiento.jsx
  - frontend/src/components/reporte-contador/ModalEnviarContador.jsx
  - backend/tests/reporteContadorPropio.test.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea, tabla/facturas-proveedores, tabla/cuentas-por-pagar]
  relacionado: [modulo/compras, modulo/facturacion, modulo/gastos-operativos, modulo/exportaciones-reportes, decision/la-ruta-no-el-contenido, bloqueo/impuestos-historicos-en-alegra]
medido: 2026-10-21
---

## El mes del sistema actual

Al abrir consulta el último mes completo de Costa Rica; Mes actual muestra
el avance. Cinco consultas por clase dentro de REPEATABLE READ READ ONLY:
ventas emitidas, sus notas de crédito, compras vigentes, notas de proveedor
no eliminadas y gastos operativos. Sin importar Excel ni rellenar períodos.
Toda línea entra, también exenta o sin impuesto asignado. Identidad propia,
sin mezclar documentos del mismo número. Total del documento y detalle con
sus importes originales, sin redondear cada línea al colón ni adivinar crédito.
Cada moneda se suma aparte. Documentos sin líneas también se muestran.

## Gastos y entrega al contador

Gastos por mes de emisión (inclusive último segundo), no recepción/pago.
No se repiten en compras. Pendientes de validación/revisión también viajan:
deducción y crédito aprobados quedan vacíos. Anulados visibles fuera de sumas.
Saldo/pagado/métodos vienen de los pagos vigentes, sin crear movimientos.
Notas de proveedor aparte, sin compensar automáticamente el IVA de gastos.

Excel conjunto reutiliza utils/exportarExcel: Información, Resumen,
Documentos, Detalle comercial y Gastos operativos, con números, fechas y
claves tipados. ZIP reutiliza CFB de SheetJS instalado; XML/PDF originales,
nombres por id de gasto y LEEME con faltantes. No inventa comprobantes ni
publica rutas privadas en JSON. Tope 32 MB originales y 18 MB adjuntos de
correo; al superarlo informa y conserva descargas individuales de Gastos.

Contactos y correo existentes, por acción explícita con mes/destino visibles.
Una huella evita enviar un mes cambiado desde su consulta: 409 para actualizar.
No hay envío programado, pago, aceptación fiscal ni declaración tributaria
al consultar/cerrar el mes. Sólo se totalizan deducciones/créditos revisados.

## Reportes anteriores

Períodos entregados y sus correcciones/exclusiones conservados y descargables
en Reportes guardados anteriormente. Exportador antiguo de sólo lectura en
contador.historico. Se retiran carga/reimportación que sobrescribía meses,
edición artificial de líneas y detector de duplicados de Alegra. No altera
históricos ni documentos fiscales. Se elimina la deuda del servicio de 964 líneas.

Depende de SQL 061 de Gastos, pendiente de producción. Sin SQL adicional.
[Alcance y verificación](../../informes/contador-mensual-2026-10-21.md).
