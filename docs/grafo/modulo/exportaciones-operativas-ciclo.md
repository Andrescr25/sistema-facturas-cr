---
id: modulo/exportaciones-operativas-ciclo
tipo: modulo
titulo: Excel operativo — necesidades, órdenes y recorrido completos por ciclo
estado: vigente
archivos:
  - backend/src/modules/rutas/operacionExcel.js
  - backend/src/modules/rutas/operacionCiclo.service.js
  - backend/src/modules/reports/necesidades.excel.js
  - backend/src/modules/reports/necesidades.service.js
  - backend/src/modules/reports/report.routes.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.excel.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.routes.js
  - backend/src/modules/entregas/entregas.excel.js
  - backend/src/modules/entregas/entregas.service.js
  - backend/src/modules/entregas/entregas.routes.js
  - backend/src/utils/exportarExcel.js
  - backend/tests/exportacionesCiclos.test.js
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/reporte-proveedores/NecesidadesPorCiclo.jsx
  - frontend/src/components/reporte-proveedores/OrdenesCompraCiclo.jsx
  - frontend/src/pages/Entregas.jsx
  - docs/informes/exportaciones-ciclos-2026-10-06.md
aristas:
  depende_de: [modulo/exportaciones-reportes, modulo/necesidades-por-ciclo, modulo/ordenes-compra-por-ciclo, modulo/carga-entregas-por-ciclo]
  relacionado: [decision/ciclo-de-ruta-como-contexto, modulo/registro-carga-entrega, modulo/cierre-ordenes-compra, modulo/permisos, modulo/pedidos-por-ciclo]
medido: 2026-10-06
---

ALCANCE. Botón Exportar Excel en Necesidades, Órdenes por ciclo y Carga y
Entregas. Listas exportan todos los resultados de los filtros, nunca solamente
página visible. Detalle exporta producto/orden/parada elegido, sin ampliar su
ámbito. Borrador con edición sin guardar no descarga una revisión inventada:
exporta únicamente la orden persistida. Excel no sustituye PDF enviado.

API GET con permisos del módulo:
- /reportes/faltantes/proveedor/necesidades/exportar (Reporte Proveedores).
- /orden-compra/por-ciclo/exportar y /:id/exportar (Reporte Proveedores).
- /entregas/exportar (Entregas, sin Clientes ni finanzas).

LECTURA. Cada exportación usa UNA transacción READ ONLY/REPEATABLE READ.
Servicios reutilizan las mismas consultas/agrupaciones de lista, antes de
paginar; nunca juntar múltiples respuestas por página. Recorrido/detalle
consulta líneas por lote y conserva carga inversa calculada sobre toda ruta.
Órdenes filtra usando listarEn, sin FOR SHARE, transmisión ni PDF regenerado.
No proveedor asignado, reserva, recepción, inventario, bitácora ni estados al
exportar. Sin migración/dependencias nuevas; no ocupar053 para estas lecturas.

NECESIDADES. Necesidades, Procedencia, Cobertura, Compras y Sin relación.
Factura sustituye pedido, requerido/compromiso y stock general separados.
Producto → todos sus orígenes; faltante → cantidad original/cubierta/recibida
por orden. Cada línea de compra una vez, incluso con asignaciones6+4. NULL
por desconocido/revisión y subtotal verificado separados; no ceros supuestos.
Sin relación mantiene documento/cliente/ciclo/líneas, no relacionar por nombre.

ÓRDENES. Activas/Historial y proveedor/ruta/ciclo compartidos con pantalla.
Detalle conserva incluso cerrada tras recepción, aunque salga de Activas.
Pedido original proveedor/propias y conversión guardada; recibido físico y
pendiente propio. Borrador/incierto no pendiente confirmado: vacío; enviada
cerrada original10/recibida6/pendiente0 y cobertura6. Recibida archivada conserva
cobertura/recepción. Motivo/hora del cierre y metadatos originales de envío,
sin teléfono/mensaje/PDF binario, precios, deuda o cuenta de portal.

ENTREGAS. Recorrido, Documentos, Productos y Carga sugerida, orden real e
inverso. Todo el recorrido, también páginas posteriores. Detalle conserva su
posición GLOBAL de carga. Facturado aparece una vez, pendiente por facturar
se distingue. Cantidad documento no afirma paquetes completos ni entrega.
Avance por factura: revisión0 sin evento; cambio operativo deja cantidades
actuales vacías y cantidades anteriores bajo Por revisar. Sin reasignarlas a
producto/línea nueva. Entregada sale de carga sugerida, permanece en recorrido.

CONTEXTO. Foto de ciclo/cliente/parada, nunca ruta/Maps actuales de la ficha.
Cambiar maestro/semana activa no reclasifica filas. Sin ciclo queda explícito,
sin fecha/Maps/orden supuestos. Información declara filtros, ruta/semana/estado,
detalle elegido y significado de cantidades. Filtro de ruta sin semana muestra
su nombre completo en pantalla. IDs32bits inválidos400; ámbitos incompatibles
vacíos, detalle fuera del ámbito404. No deducir semana del lunes/domingo.

CELDAS. Códigos/documentos texto, ceros y nombres que parecen fórmulas
preservados como strings. Cantidades operativas muestran hasta seis decimales
sin cambiar formato monetario de los Excel anteriores. Fechas de calendario
como seriales sin zona; eventos en Costa Rica. Encabezados aun sin resultados,
Información/no-store/descarga autenticada y error JSON visible sin XLSX falso.

EVIDENCIA.2.211pruebas/362suites fail0/skip0,99focalizadas/20nuevas,
grafo12/build/Chromium1440/390.9XLSX releídos,21huellas iguales y GET legado0.
Informe exportaciones-ciclos-2026-10-06 registra integración local/relevo.
Operativo88/11; FIL-09/11/RUT-08 e integral aún abiertos.

LOCAL. Códigof0fd815 integrado solo independencia-alegra con backup0600,
36+9huellas iguales y stock/órdenes/recepciones/eventos0. Sin nueva SQL:053libre.
Compartida solo GET/SQL READ ONLY, tres Excel vacíos200/sin sesión401.
App5174→3002/PID36152 seguro; original3000/PID5370/main/developer intactos.
Base/puertos/copia/rama propios retirados al cierre, evidencia conservada y
15decisiones literales preservadas en memoria. Siguiente: revisión global de
pantallas/contexto/Sin ciclo/Maps locales y validación integral;88/11 vigente.
