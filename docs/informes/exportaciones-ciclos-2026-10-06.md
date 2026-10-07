# Excel operativo por rutas y ciclos — 2026-10-06

Implementado, verificado e integrado solo local, código **f0fd815**, desdecf2a639, sin nuevos commits de
Claude ni otra reserva al comenzar. Rama tmp/codex-exportaciones-ciclos-20261006;
clon tachi_codex_exportaciones_ciclos_20261006 desde dump LOCAL052. Integración
exclusivamente local; respaldo y relevo final abajo.

## Resultado

Exportar Excel en Necesidades y cobertura, Órdenes por ciclo y Carga y Entregas.
Lista descarga todos los resultados de sus filtros, incluidas otras páginas.
Detalle descarga el producto/orden/parada seleccionado con su procedencia.
Información indica ruta, semana, estado, filtros y significado de cantidades.
Los reportes de faltantes Clientes/Proveedores conservan sus Excel anteriores,
con procedencia/filtros ya comprobados. El catálogo conserva PDF de cuatro
productos por hoja y contexto de su cliente/semana, sin cambios.

Necesidades: stock general, requerido/comprometido, pedidos, faltantes,
cobertura, solicitado/pendiente/recibido y filas sin relación separadas. Una
factura sustituye su pedido, una compra se cuenta una vez aunque cubra6+4.
Desconocido vacío, subtotal verificado y motivos de revisión; ningún cero
inventado. Detalle de producto incluye todos sus orígenes, sin otros productos.

Órdenes: Activas/Historial y mismos filtros/proveedor. Producto/cantidad
original y conversión guardada, recepción física y cobertura por origen.
Cerrada10/recibida6 conserva original10, pendiente0/cobertura6; borrador e
incierto no pendiente confirmado, celda vacía. PDF enviado intacto, solamente
sus metadatos de estado/documento se exportan. Motivo y hora del cierre en CR.
Una orden abierta que sale de Activas conserva su descarga de detalle.

Carga/Entregas: recorrido completo, documentos y líneas, carga inversa de
TODO el ciclo. Detalle conserva posición GLOBAL, por ejemplo parada3=carga21
entre23paradas. Pedido facturado aparece una vez, pendiente por facturar
separa su origen/anticipado. Entregada sale de carga sugerida y permanece en
recorrido. Reimpresión: avance actual vacío, cantidades anteriores Por revisar;
no trasladarlas a líneas nuevas. Maps/nombre/orden del recorrido fijo, sin
precios, costos, saldos financieros ni cuenta del portal al chofer.

Cada API GET hace UNA transacción READ ONLY/REPEATABLE READ, consultas por
lote y mismas agrupaciones antes de paginar. Exportar no asigna proveedores,
reserva, cambia estados, envía documentos ni actualiza inventario/bitácora.
Sin migración/dependencias nuevas:053 libre. Filtro ruta sin semana muestra su
nombre completo; IDs fuera de32bits400, ámbito incompatible vacío y detalle
ajeno404. Sin ciclo sin semana/Maps/orden supuestos; no reclasificar histórico.
Cantidades operativas hasta seis decimales visibles, códigos/documentos texto
con ceros y nombres que parecen fórmulas siguen strings. Fechas de calendario
sin cambio por zona, eventos en CR. Encabezados/Información aun sin resultados,
descarga autenticada/no-store y error JSON visible sin crear XLSX falso.

## Verificación

**2.211 pruebas/362 suites, cero fallos/omitidas**. **99 focalizadas**,20casos
nuevos (19PostgreSQL + permiso). Grafo12 y build aprobados. Casos propios:
24productos/páginas/búsqueda/detalle, desconocidos/sin relación, misma ruta en
semanas distintas y maestro movido/renombrado, factura sustituye pedido,
parcial/cierre/archivo conservan cantidades/cobertura, borrador/incierto,
23paradas/carga inversa y posición global de detalle, Maps fijo, Sin ciclo,
avance físico/reimpresión, cantidades fraccionarias reales, textos/filtros
inválidos y filas vacías. Tres exportaciones nativas prueban READ ONLY y
REPEATABLE READ reales en una transacción cada una, sin FOR SHARE ni escritura.
SQL de negocio real; SAVEPOINT/ROLLBACK y fixture COMMIT solo en clon propio.

Primer focal detectó que el fixture de factura se redondea a cuatro decimales
por su schema; corregido para verificar conversión de compra a seis decimales
REAL (0,999999 solicitado /0,3333 recibido /0,666699 pendiente), sin cambiar
schema ni relajar precisión. Focal repetido aprobado. Suite completa después
de restaurar SOLO el clon propio. No restaurar la habitual para repetir.

Chromium1440/390, **9XLSX descargados y releídos**: necesidades24 completas
incluida página2 y2filas sin relación, búsqueda/detalle y próxima semana4;
órdenes activas/historial/detalle cerrado10/6/0/cobertura6 y PDF original;
recorrido23/carga23→1, parada3/carga21/Maps fijo, Sin ciclo sin campos supuestos.
Error503 controlado no descarga archivo falso. **21huellas íntegras** durante
consultas/descargas, GET legado de asignación0. ACL401/403/400/404 y variantes
Express; sin errores JS/desborde, capturas inspeccionadas. Navegador SOLO GET
en3003/5175; fixtures/transporte simulado únicamente node--test/clon propio.

FIL-10 cerrado: **88 listos /11 pendientes (99 IDs)**. No cerrar revisión
global de pantallas/históricos/contexto ni validación integral con estas pruebas
parciales. Independencia **133/14 (147 IDs)** sigue separada. Inventario
habitual provisional0; aceptación REAL de Hacienda/corte/datos manuales aparte.

## Siguiente

Revisión global de pantallas y contexto de documentos (FIL-09/11 y RUT-08);
fuente LOCAL de Maps anteriores (RUT-03), sin consultar producción ni inventar
ubicaciones. Validación integral VAL-01/04–07 después. CLI-10/VAL-08 son
revisiones del usuario. La prueba de maestro movido en exportaciones no cierra
la conservación integral de todos los flujos del sistema.

## Cierre local y relevo

Código **f0fd815** integrado con rebase/avance sin fusión a independencia-alegra,
sin push. Respaldo nuevo antes-exportaciones-local.dump0600, únicamente tachi
LOCAL localhost5434. Sin migración nueva ni modificaciones de datos históricos;
053 disponible. App5174→3002/backend **PID36152**, Vite98892, lanzador permanente
seguro /private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs.
No server.js directo por IMAP/ping/Hacienda/salidas; limpieza antigua nunca
se ejecuta, ya retirada por050.

**36 huellas operativas +9 completas adicionales idénticas** al estado previo,
incluyendo íntegros compra/pagos/caja/bitácora/usuarios/permisos/entrega_evento/
orden_compra_ciclo_cierre. Rutas/ciclos/cliente del usuario conservados, órdenes/
recepciones/eventos/cierres0, stock/conteos/movimientos0 y demo no recreada.
Compartida comprobada solo GET/SQL READ ONLY: las tres nuevas exportaciones
releídas con encabezados vacíos200 y sin sesión401; salud/frontend200,
cierre inexistente404. No reporte legado sin filtros, puede asignar proveedor.

Original3000/PID5370 y developer5013270/main e19c3e5 intactos; sin producción,
Prisma/generate/install, Hacienda/IMAP real, mensajes reales ni limpieza.
Catálogo4/hoja, Descargas/fiscal/ensayos anteriores conservados.

Base tachi_codex_exportaciones_ciclos_20261006 y propios3003/5175 se retiran al
cerrar; copia/rama se retiran tras montar documentación. Reserva liberada y
memoria/grafo/checklist/informe actualizados,15decisiones literales preservadas.
Evidencia/dumps/capturas/XLSX privados en /private/tmp/codex-exportaciones-ciclos-20261006
conservados. Guiones dependientes de trabajo retirado son evidencia, no lanzadores.

Los11IDs abiertos: RUT-03/08, CLI-10, FIL-09/11, VAL-01/04/05/06/07/08.
Revisiones CLI-10/VAL-08 a cargo del usuario; no cerrar validación integral
por pruebas de esta parte. Próximo: revisión global de contexto/pantallas/
históricos, fuente local Maps y flujo completo en copia propia.
