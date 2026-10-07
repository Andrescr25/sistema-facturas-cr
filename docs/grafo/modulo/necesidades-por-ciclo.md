---
id: modulo/necesidades-por-ciclo
tipo: modulo
titulo: Necesidades y cobertura — stock general, demanda y compras por semana
estado: vigente
archivos:
  - backend/src/modules/reports/necesidades.service.js
  - backend/src/modules/reports/report.routes.js
  - backend/tests/necesidadesCiclo.test.js
  - frontend/src/components/reporte-proveedores/NecesidadesPorCiclo.jsx
  - frontend/src/hooks/useNecesidadesCiclo.js
  - frontend/src/hooks/useReporteProveedores.js
  - frontend/src/pages/ReporteProveedores.jsx
  - docs/informes/necesidades-cobertura-2026-10-06.md
aristas:
  depende_de: [modulo/inventario, modulo/faltantes, modulo/ordenes-compra-por-ciclo, modulo/recepcion-ordenes-compra, modulo/registro-carga-entrega]
  relacionado: [modulo/exportaciones-operativas-ciclo, modulo/cierre-ordenes-compra, decision/ciclo-de-ruta-como-contexto, modulo/permisos, modulo/pedidos-por-ciclo, decision/inventario-desde-cero]
medido: 2026-10-06
---

ALCANCE. Faltantes y Compras abre en Necesidades y cobertura. Elegir ciclo
explícito o Sin ciclo; producto → detalle con stock/demanda, bodega/compras,
procedencia y órdenes. GET /reportes/faltantes/proveedor/necesidades pertenece
a Reporte Proveedores; no pedir Clientes, Inventario ni Entregas al comprador.
No exponer costos, precios, cuenta de portal, PDF ni datos privados del proveedor.
No asignar proveedores, reservar stock, generar faltantes/órdenes ni resolver
faltantes al consultar. READ ONLY + REPEATABLE READ en una transacción real.
Sin cambio de esquema: no ocupar052 para una consulta.

STOCK. inventario_saldo muestra el saldo GENERAL del kardex, con estado de
conteo. Las facturas ya lo descontaron al emitir: no restar compromiso otra
vez ni añadir recepción física encima del saldo que ya contiene su entrada.
El mismo stock visible al consultar otra semana NO es una segunda reserva.
Cero provisional y negativos visibles, no inferir disponibilidad física sin
conteo. Producto no inventariable conserva demanda pero no inventa saldo.
No modificar catálogos ni agregar etiquetas de stock al catálogo del agente.

DEMANDA. Requerido por atender = compromiso facturado pendiente de entrega +
pedidos pendientes SIN factura. Facturar sustituye la demanda de pedido,
sin duplicar; factura emitida excluye anulada/borrador, pedido pendiente excluye
rechazado/facturado/con factura. Entrega verificada reduce compromiso, descarga
no es entrega. Reimpresión/cambio operativo impide reasignar balances viejos:
requerido/compromiso null, subtotal verificado separado y motivo visible.
Histórico importado sin evento físico no se considera venta NUEVA por entregar;
permanece por revisar, sin inventar ciclo/entrega. Una referencia/nombre similar
no relaciona un producto: líneas sin id propio separadas, con documento/
cliente/ciclo y revisión manual; no mezclarlas entre sí ni con otra ficha.

FALTANTES. cantidades registradas en bodega se leen aparte de la demanda,
no se suman como otro pedido. Incluye pendiente/procesado, positivos y tipo
no completo sobre factura emitida. Cada uno conserva factura/cliente/parada/
ciclo fijo y asignaciones por orden. No deducir proveedor del maestro ni
reclasificar al cambiar la ruta/nombre del cliente. Cobertura de la vista049,
sin cobertura=max(registrado-cubierto,0), exceso de cobertura se advierte.
Es faltante explícito después de reservas, no demanda menos stock general.
Pedido por facturar requiere revisión; no fabricar faltante para comprarlo.

COMPRAS. Apartado de borrador/pendiente distinto de solicitado confirmado.
Enviando/incierto conserva su cobertura bajo Envío por verificar, nunca afirmar
solicitado confirmado. Cantidad SOLICITADA original por línea enviada se cuenta
UNA VEZ, aunque cubra varios orígenes. Recibida física y pendiente por línea
se suman UNA VEZ, en unidades propias, con conversión revisada del documento.
Final6 de10: solicitado original10, recibido6, pendiente0 y sin cobertura4.
Recepción/archivo no borran cobertura recibida. Excedente de caja no se asigna
a otra semana. Vista detalle distingue línea completa de compra de cantidad
asignada/cubierta/recibida por cada faltante. Recibida archivada sigue presente.
Cerrada sin envío excluida/libera reserva; cierre de enviada sigue en FAL-08.

FRONTEND. Vista nueva por defecto; hook legado del reporte sólo carga cuando
se abre Faltantes y órdenes. Es necesario: ese GET puede ASIGNAR proveedores
aunque parezca lectura. No lanzarlo de fondo para Necesidades/Órdenes/Fichas.
Búsqueda y paginación por producto20/máximo50; toda la procedencia del producto
viaja junta. Líneas sin relación paginadas aparte con el mismo límite. Cambiar
ruta/ciclo/búsqueda limpia detalle; respuestas tardías no pisan la semana nueva.
Escritorio/celular, controles táctiles y cantidades exactas hasta6dec.

EVIDENCIA.21casos,20 PostgreSQL + permiso: demanda/no duplicación,2semanas/
maestro cambiado, kardex ya descontado, borrador/cierre/incertidumbre,10+3,
parcial/final/archivo, conversión/excedente, entrega/reimpresión, históricos/
sin relación, fracciones/validación/páginas y17huellas iguales durante consulta.
GET nativo sobre fixture confirmado comprueba READ ONLY/REPEATABLE READ real.
Ver informe para suite/build/navegador y estado de integración local.

CIERRE LOCAL. Códigoc8ecc37, sin migración; backup0600,36+7huellas iguales
y stock/conteos/movimientos/eventos0. Datos del usuario, permisos/históricos/
catálogo4/hoja conservados.2.169pruebas/362suites, fail0/skip0, grafo12/build/
Chromium1440/390 aprobados,21huellas iguales por consultas, GET legado0.
App5174→3002 PID26021/Vite98892 con lanzador seguro, producción/main/developer
intactos. Base/puertos propios retirados; reserva se libera al cerrar memoria.
85/14 operativo; independencia133/14 aparte. Siguiente FAL-08/OC-03, cierre
de enviada con motivo y liberación de cobertura no recibida, preservando
documento/PDF y mercadería ya recibida.052 sólo si hace falta esquema.

CIERRE ENVIADO (052). [[modulo/cierre-ordenes-compra]] sustituye la limitación
anterior de cierre: confirmación/motivo, recibido conservado y solo pendiente
liberado. No cambiar PDF, recepción física, compra, CxP ni archivo24h.
Necesidades incluye originales y recibido de enviada cerrada con pendiente0.

EXPORTACIÓN OPERATIVA. [[modulo/exportaciones-operativas-ciclo]] añade
Excel de necesidades/órdenes/recorrido, filtros completos y detalle con
procedencia, sin paginación truncada ni escrituras de negocio. Los textos
de etapas anteriores son históricos; archivo/cierre/avance actuales se
conservan al descargar. Sin migración nueva.
