# Rutas y ciclos operativos

Solicitud del usuario, 2026-10-05. Construir la relación cliente → ruta →
ciclo fechado → preventa/pedido → preparación → faltante → orden de compra
→ factura/recepción → carga → entrega. Revisiones y datos reales quedan al
usuario. Trabajo únicamente en independencia-alegra, copia propia y base de
prueba desechable; no se cambian producción ni sus existencias.

**2026-10-05, petición de continuidad:** guardar todas las instrucciones y
avanzar poco a poco. La lista detallada para tachar está en
[checklist-rutas-ciclos-operativos.md](checklist-rutas-ciclos-operativos.md),
y las decisiones consolidadas en
[instrucciones-vigentes-usuario.md](instrucciones-vigentes-usuario.md).
Estado actual: rutas/ciclos, ficha, pedidos/facturas y enlaces de preventa
por cliente/ciclo y PDF visual con fotos implementados.
[Primera parte](informes/rutas-clientes-2026-10-05.md) y
[segunda parte](informes/pedidos-ciclos-2026-10-05.md) y
[tercera parte](informes/preventa-enlaces-2026-10-05.md) y
[catálogo visual](informes/catalogo-visual-2026-10-05.md),
[operación por ciclos](informes/operacion-ciclos-2026-10-05.md) y
[borradores de compra](informes/ordenes-ciclo-2026-10-05.md) y
[envío de órdenes](informes/envio-ordenes-ciclo-2026-10-06.md). Bodega/reportes,
procedencia, PDF revisado, envío inmutable y cobertura pendiente de recibir
implementados. Vínculo/PDF privado y comparación de factura implementados, ver
[factura/PDF](informes/facturas-ordenes-2026-10-06.md). Recepción física parcial/final con kardex idempotente implementada (049);
siguen carga/entrega y archivo. Operativo 68/31.
El usuario reiteró que se hace todo local en la rama de migración existente
`independencia-alegra`: `developer`, `main` y base de producción quedan fuera
de este trabajo. Las pruebas parten de una copia de la base local.

## Decisiones de negocio

- Una ruta describe el recorrido; un ciclo identifica una ejecución fechada.
  Un pedido nunca cambia de ciclo porque cambie la semana activa o su cliente
  se mude de ruta. Histórico sin clasificación se muestra como “Sin ciclo”,
  sin deducirlo por nombre/fecha ni reasignarlo masivamente.
- Dos horizontes simultáneos: ciclo en preventa y ciclo en preparación/entrega.
  Activación mediante acción explícita, sin reinicio del domingo.
- Orden manual de clientes, ubicación Maps y día opcional. Guardar una foto
  del recorrido del ciclo permite explicar una entrega aunque cambie la ruta.
  Carga sugerida inversa a la entrega, con el primer cliente más accesible.
- El catálogo personalizado usa la cuenta existente y el ciclo autorizado;
  compartir un enlace no concede acceso a compras/saldos ajenos. Facilitar
  envío explícito por WhatsApp; ninguna prueba envía mensajes reales.
- Orden enviada conserva cabecera, líneas y cantidades. Un faltante posterior
  exige otra orden; envío incierto conserva los bytes y requiere revisión,
  sin asumir entrega ni reenviar automáticamente.
- Separar requerido, comprometido, faltante, solicitado, recibido y pendiente
  de recepción. Una cantidad pedida cubre únicamente sus necesidades/ciclos
  asignados; no se cuenta simultáneamente para dos rutas.
- Factura del proveedor no demuestra recepción física. Mostrar PDF original
  o representación identificada del XML, y comparar solicitado/facturado/
  recibido, agotado declarado, faltante y exceso sin adivinar causas.
- Usuario confirmó: tras recepción completa, retirar de la lista activa a
  las 24 horas y conservar historial, factura y comparación. No borrar datos
  fiscales/comerciales ni limpiar faltantes globalmente.

## Ejecución

- [ ] Modelo SQL de rutas, ciclos, asignaciones y contexto de documentos.
- [x] API de rutas/orden manual/Maps/ciclos con permisos y transacciones.
- [x] Clientes reorganizados, ficha por secciones y vista de rutas móvil.
- [x] Pedidos de portal/agente y facturas conservan ciclo explícito.
- [x] Preventa próxima ruta con enlace por cliente y envío controlado.
- [x] Ampliación: PDF personalizado con fotos, descarga y envío junto al enlace;
  respuesta por WhatsApp sin cuenta, invitación opcional para pedir en línea.
- [x] Ampliación visual: categorías/subcategorías, ofertas y liquidaciones
  integradas con etiquetas, dos columnas/fotos grandes y WhatsApp explícito.
- [x] Bodega y reportes de faltantes filtran ruta/ciclo; procedencia en Excel.
- [ ] Completar exportaciones/carga/entrega y contexto en órdenes persistentes.
- [ ] Órdenes propias: estados, foto enviada, procedencia y cobertura.
  Borrador/pendiente/enviada, revisión/PDF exacto, origen, cobertura e
  incertidumbre implementados. Parcial/recibida y cantidades físicas implementadas; falta cierre de enviada. Reserva sin confirmación no es envío confirmado.
- [x] Recepción parcial/final (049): unidades físicas, motivos, auditoría y
  kardex por delta; aceptación comercial explícita separada, sin doble entrada.
  PDF/vínculo (048) permanece privado. Archivo/correcciones físicas pendientes.
- [ ] Carga/entrega ordenadas y avance por cliente/documento.
- [ ] Retirar limpieza semanal; archivo por fecha de recepción, sin borrado.
- [ ] Pruebas PostgreSQL, permisos, concurrencia, navegador y build.
- [ ] Aplicación local con respaldo, grafo/checklist/memoria e informe final.

El estado de estas filas se actualiza solo con implementación y evidencia;
una especificación no demuestra que el flujo esté operativo.
