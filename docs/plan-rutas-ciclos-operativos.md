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
Estado actual: primera entrega de rutas/ciclos y ficha implementada;
[informe y límites](informes/rutas-clientes-2026-10-05.md). La vinculación de
pedidos/facturas/faltantes al ciclo sigue pendiente; siguientes partes incorporan
pedidos, filtros y compras.
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
- [ ] Pedidos de portal/agente y facturas conservan ciclo explícito.
- [ ] Preventa próxima ruta con enlace por cliente y envío controlado.
- [ ] Bodega, reportes, faltantes y exportaciones filtran ruta/ciclo.
- [ ] Órdenes propias: estados, foto enviada, procedencia y cobertura.
- [ ] Recepción parcial/final, comparación de factura y PDF privado.
- [ ] Carga/entrega ordenadas y avance por cliente/documento.
- [ ] Retirar limpieza semanal; archivo por fecha de recepción, sin borrado.
- [ ] Pruebas PostgreSQL, permisos, concurrencia, navegador y build.
- [ ] Aplicación local con respaldo, grafo/checklist/memoria e informe final.

El estado de estas filas se actualiza solo con implementación y evidencia;
una especificación no demuestra que el flujo esté operativo.
