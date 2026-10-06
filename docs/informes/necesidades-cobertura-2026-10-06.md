# Necesidades y cobertura por semana — 2026-10-06

Implementado y verificado en copia propia desde99b02e0, sin commits nuevos de
Claude ni otra reserva al iniciar. Rama tmp/codex-necesidades-20261006;
base tachi_codex_necesidades_20261006 desde dump local051. Solo local,
sin producción, developer/main, Prisma/generate/instalación ni mensajes reales.

## Resultado

Faltantes y Compras abre en Necesidades y cobertura. Elegir una semana o
Sin ciclo; buscar producto y abrir su procedencia. Stock general, requerido
por atender, compromiso facturado pendiente de entrega y pedidos por facturar
se muestran separados. Bodega/compras distingue faltante registrado, apartado
en borradores, envío por verificar, solicitado confirmado, pendiente de
recibir, recibido físicamente y faltante sin cobertura.

Cada demanda conserva pedido/factura/cliente/parada/ciclo. La factura sustituye
al pedido de origen. Entrega física reduce compromiso; una reimpresión exige
revisión, sin reasignar cantidades antiguas. Históricos importados sin entrega
registrada no se convierten en pedidos nuevos pendientes. Productos sin id
propio conservan procedencia en una sección por revisar, sin relaciones por
nombre/código. Maestro movido no reclasifica documentos anteriores.

Stock es el saldo general del kardex: las facturas YA lo descuentan. No restar
compromiso de nuevo, sumar recepción otra vez ni asignar el mismo stock a
dos semanas. Saldo provisional/negativo y conteo pendiente visibles. Consulta
no fabrica reservas ni deduce faltantes de pedidos todavía por facturar.
No agregar etiquetas de stock al catálogo del agente ni cambiar su PDF4/hoja.

Orden enviada10 cubriendo6+4 se cuenta10 una vez; nueva necesidad3 deja solo3
sin cobertura. Parcial6 muestra10 solicitadas/4pendientes/6recibidas. Final6
con faltante confirmado conserva10originales, pendiente0 y libera solo4 de
cobertura. Recibida archivada conserva datos. Caja/conversión y excedente se
separan de asignaciones a faltantes; ninguna unidad cubre dos rutas.

Nueva API sólo GET con Reporte Proveedores, READ ONLY/REPEATABLE READ real y
lista blanca. No nueva tabla/SQL052 ni dato histórico cambiado. La vista nueva
no llama al reporte legado de fondo, porque su GET puede asignar proveedores.
Éste sólo carga al abrir explícitamente su pestaña. No mensajes, faltantes,
órdenes, recepción, inventario ni bitácora por leer la nueva vista.

## Verificación y aplicación

**2.169pruebas/362suites, cero fallos/omitidas**, grafo12 y build aprobados.
21casos nuevos (20PostgreSQL+permiso),79focalizados; invariantes45/45. Primer
intento detectó nombre CTE coincidente con tabla retirada: renombrado a
facturas_del_ciclo, sin consulta real a tabla vieja ni relajar el invariante.
Segundo sufrió error IPC de Node en buzonPorProductoPropio; ese archivo pasó
7/7 solo. Clon restaurado y suite completa repetida pasó. Evidencia de ambos
intentos conservada; nunca restaurar base habitual para repetir pruebas.

Chromium1440/390:24productos, búsqueda/páginas/lista→detalle y misma semana
en toda procedencia. Kardex propio18−facturas14+recepción6=stock general10,
sin segundo descuento. Tras entrega3: requerido10=compromiso7+pedido3;
compra10/recibido6/pendiente4, asignaciones6+4 contadas una sola vez. Envío
incierto5 apartado, solicitado confirmado0. Próxima semana conserva4
requeridas/sin cobertura4 y stock general10, sin una nueva reserva supuesta.
Dos líneas sin relación explícitas; respuesta anterior lenta no pisa ciclo
nuevo. Cambio deliberado de factura sólo en clon exige revisión física.
**21huellas iguales** durante consultas, antes y después de ese cambio;
GET legado de asignación0. Usuario sólo Reporte Proveedores, sin Clientes/
Entregas; API401/403/400 y variantes Express comprobadas. Capturas inspeccionadas,
sin errores JS/desborde. Navegador admite sólo GET en3003/5175; transportes
simulados de fixture únicamente en proceso node --test/base propios.

FAL-01/03/04 cerrados: **85 listos/14 pendientes (99 IDs)**. Datos sin relación,
conteo real y entrega histórica permanecen a revisión manual; no inventarlos.
Aplicación con respaldo y cierre local se documentan tras integrar/verificar.
Los casos focalizados comprueban las cantidades y la procedencia mediante
PostgreSQL real, SAVEPOINT/ROLLBACK; sólo sobre transaccional de las lecturas
se adapta para leer fixtures no confirmados. Un caso nativo confirmado
comprueba READ ONLY/REPEATABLE READ. El reloj de fixture simula una recepción
antigua para probar archivo24h, manteniendo SQL de negocio/protecciones.
Pruebas de envío usan transporte simulado sobre la base propia; nunca mensaje real.

## Siguiente

Cierre de enviada con motivo/liberación de cobertura no recibida (FAL-08/OC-03);
propagación final de filtros/exportaciones/históricos/Maps y validación integral.
Revisiones manuales del usuario separadas; independencia133/14 permanece aparte.
