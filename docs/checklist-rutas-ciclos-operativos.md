# Checklist: clientes, rutas y ciclos operativos

Solicitud y aclaración del usuario: **2026-10-05**.
Estado: rutas/ciclos, ficha y pedidos/facturas por ciclo implementados; bodega, compras y entregas pendientes.
[Primera parte](informes/rutas-clientes-2026-10-05.md) y
[segunda parte](informes/pedidos-ciclos-2026-10-05.md).
Alcance confirmado: solo local en `independencia-alegra`, sin tocar `developer`,
`main` ni conectar con la base de producción. Copias locales para las pruebas.
Decisiones completas: [instrucciones](instrucciones-vigentes-usuario.md).
Diseño: [plan](plan-rutas-ciclos-operativos.md).

Cada ID permite cerrar una parte sin perder el resto. `- [ ]` = pendiente;
`- [x]` = resultado comprobado. Al marcar, añadir commit, evidencia y límite
real de la verificación. Documentar no equivale a implementar. Las revisiones
manuales del usuario se mantienen separadas de las verificaciones de código.

## 0. Continuidad

- [x] MEM-01 — Guardar instrucciones, plan, checklist y decisiones del grafo;
  actualizar memoria de Claude y entrada común para otros modelos.
- [x] MEM-02 — Al cerrar cada parte de implementación, actualizar sus casillas,
  grafo, comentarios, memoria y un informe de listo/pendiente/siguiente paso.

MEM-01 registra únicamente el guardado documental del 2026-10-05. MEM-02 es
una obligación recurrente, se confirma con cada entrega, no al preparar el plan.
Primera entrega: informe del 2026-10-05, grafo y memoria actualizados.

## 1. Modelo de rutas y ciclos

- [x] RUT-01 — Crear rutas con identidad propia, nombre y estado.
- [x] RUT-02 — Asignar cada cliente a su ruta y guardar su orden de visita.
- [ ] RUT-03 — Guardar ubicación Maps conservando las existentes.
- [x] RUT-04 — Evaluar/documentar e incluir día habitual de visita o entrega
  cuando sea útil; este campo es opcional en la petición.
- [x] RUT-05 — Crear ciclo fechado de ruta: ruta + semana/fechas + estado.
- [x] RUT-06 — Permitir coexistencia de ciclo actual y próximo en estados
  diferentes, sin mezclar sus documentos.
- [x] RUT-07 — Activar/promover un ciclo mediante una acción controlada y
  mostrar qué pasa a preparación/entrega.
- [ ] RUT-08 — Conservar el contexto de documentos al cambiar la ruta de un
  cliente o el ciclo activo; históricos sin clasificación siguen identificados.
- [x] RUT-09 — Crear migraciones SQL y API transaccional con permisos, ids
  propios y validación de ruta/ciclo/cliente.

Primera parte: RUT-06/07 corresponden al estado y recorrido del ciclo. La
separación/vinculación de documentos queda en RUT-08 y PRE-05/07. RUT-03: el
campo Maps está implementado, falta identificar la fuente local de las
ubicaciones anteriores; no consultar producción para completar esa casilla.

## 2. Clientes y vista de rutas

- [x] CLI-01 — Reorganizar lista y ficha para que las funciones no se mezclen.
- [x] CLI-02 — Separar información general y contacto.
- [x] CLI-03 — Mostrar ruta, orden de visita y ubicación como sección propia.
- [x] CLI-04 — Separar historial de pedidos y pedidos en línea.
- [x] CLI-05 — Mostrar facturas pendientes, notas y estado del cliente en
  secciones claras.
- [x] CLI-06 — Crear vista de Rutas con clientes en orden y filtro por ruta.
- [x] CLI-07 — Modificar/persistir orden manual, idealmente drag & drop;
  conservar alternativa sencilla para celular.
- [x] CLI-08 — Botón «Ver ubicación» abre Google Maps directamente.
- [x] CLI-09 — Respetar permisos de clientes/rutas y verificar uso en celular.
- [ ] CLI-10 — Revisión visual y correcciones finales del usuario.

CLI-01–09 y FIL-01 verificados en API y navegador 1440/700/390; arrastre
implementado, flechas/guardado probados. CLI-10 sigue al usuario. Pedidos
en la ficha son los recientes (10), con origen propio distinguido.

## 3. Preventa anticipada y pedidos

- [x] PRE-01 — Mantener el flujo presencial lunes/martes y mostrar el ciclo
  en que se toma el pedido.
- [x] PRE-02 — Seleccionar la próxima ruta/ciclo para la preventa en línea.
- [ ] PRE-03 — Preparar catálogos personalizados para los clientes de ese ciclo.
- [ ] PRE-04 — Facilitar envío explícito del catálogo/enlace por cliente;
  automatización posterior debe conservar destinatario y ciclo correctos.
- [x] PRE-05 — Pedido en línea conserva cliente, ruta, ciclo y origen anticipado.
- [x] PRE-06 — Pedido adicional del agente conserva el ciclo de la visita,
  sin confundirlo con el pedido en línea anterior.
- [x] PRE-07 — Facturar un pedido conserva su ciclo y sus vínculos.
- [ ] PRE-08 — Preparar y llevar pedidos anticipados para entregarlos al
  realizar la visita de la semana siguiente.
- [x] PRE-09 — Conservar idempotencia y pedidos offline existentes al añadir
  contexto; no duplicar ni borrar colas pendientes.
- [ ] PRE-10 — Catálogo/enlace no da acceso a pedidos o saldos de otro cliente.

Segunda parte: PRE-01/02/05/06/07/09 y FIL-02 implementados con 045,
commit `d87ee54`, 1.962 pruebas aprobadas y aplicación local verificada.
Portal selecciona su semana; el agente toma pedidos en Facturación (catálogo
sigue de consulta). Históricos sin ciclo y colas/claves antiguas conservados.
PRE-10: frontera del portal verificada; revisar también los enlaces nuevos
cuando se implemente PRE-03/04. RUT-08/FIL-11 quedan abiertos por la propagación
a faltantes/compras/reportes que sigue pendiente. Evidencia en el segundo informe.

## 4. Contexto y filtros en toda la operación

- [x] FIL-01 — Clientes: ruta y orden visibles, filtro de ruta.
- [x] FIL-02 — Pedidos: filtros de ruta/ciclo y origen presencial/en línea.
- [ ] FIL-03 — Preventa: ruta/ciclo actual y próximo claramente identificados.
- [ ] FIL-04 — Reporte Clientes: filtrar ruta/ciclo y mostrar orden de entrega.
- [ ] FIL-05 — Reporte Proveedores: filtrar ruta/ciclo y ver desglose de origen.
- [ ] FIL-06 — Preparación de pedidos: filtrar ruta/ciclo.
- [ ] FIL-07 — Entregas: filtrar ruta/ciclo y conservar su avance propio.
- [ ] FIL-08 — Faltantes de bodega: filtrar ruta/ciclo.
- [ ] FIL-09 — Pantallas muestran ruta y semana seleccionadas sin depender
  de una fecha global de reinicio.
- [ ] FIL-10 — Exportaciones respetan filtros e incluyen ruta/ciclo/procedencia.
- [ ] FIL-11 — Históricos no clasificados se distinguen de los ciclos actuales,
  sin asignaciones automáticas supuestas.

## 5. Faltantes y cobertura de compras

- [ ] FAL-01 — Cada necesidad enlaza producto, pedido/factura, cliente y ciclo.
- [ ] FAL-02 — Mostrar agregado y desglose: ejemplo 10 = 6 actual + 4 próxima.
- [ ] FAL-03 — Separar stock actual, requerido y comprometido con clientes.
- [ ] FAL-04 — Separar faltante, ya pedido, pendiente de recibir y recibido.
- [ ] FAL-05 — Descontar cobertura válida de órdenes existentes al sugerir
  nuevas compras, aun antes del ingreso físico a bodega.
- [ ] FAL-06 — Una cantidad comprada no cubre dos necesidades/ciclos a la vez.
- [ ] FAL-07 — Recepción parcial actualiza pendiente y cobertura sin contar
  dos veces el inventario ni ignorar conversiones de unidad del proveedor.
- [ ] FAL-08 — Cancelación/cierre sin recepción libera solo la cobertura que
  corresponde y conserva el motivo/historial.

## 6. Órdenes de compra persistentes

- [ ] OC-01 — Guardar orden propia por proveedor y procedencia por ciclo.
- [ ] OC-02 — Estados Borrador y Pendiente de enviar.
- [ ] OC-03 — Estados Enviada, Parcialmente recibida, Recibida y Cerrada.
- [ ] OC-04 — Crear/revisar cantidades y productos antes de enviar.
- [ ] OC-05 — Facilitar envío por WhatsApp y guardar exactamente lo enviado.
- [ ] OC-06 — Bloquear cambios de productos/cantidades tras enviar, también
  desde API; nuevas necesidades no se agregan automáticamente.
- [ ] OC-07 — Proponer/crear orden nueva para faltantes posteriores.
- [ ] OC-08 — Mostrar cantidades pendientes sin volver a comprarlas.
- [ ] OC-09 — Manejar concurrencia, reintentos y envío incierto sin duplicar
  solicitudes ni afirmar que el proveedor recibió un mensaje no confirmado.
- [ ] OC-10 — Mantener correspondencia entre documento WhatsApp y orden guardada.

## 7. Factura del proveedor y recepción

- [ ] REC-01 — Vincular factura electrónica del proveedor a la orden correcta.
- [ ] REC-02 — Mostrar/abrir PDF dentro de la orden, con acceso autorizado.
- [ ] REC-03 — Si falta el original, facilitar carga/recuperación y distinguir
  una representación del XML del PDF original del proveedor.
- [ ] REC-04 — Comparar producto y cantidad pedidos contra facturados.
- [ ] REC-05 — Registrar cantidad físicamente recibida separada de facturada.
- [ ] REC-06 — Mostrar lo recibido conforme a la orden.
- [ ] REC-07 — Mostrar faltantes y motivo; «agotado» solo si fue confirmado,
  sin adivinar la causa de una línea que no aparece.
- [ ] REC-08 — Mostrar productos o cantidades facturados de más y su diferencia.
- [ ] REC-09 — Recepción parcial conserva lo pendiente y permite otra recepción.
- [ ] REC-10 — Recepción final registra fecha/hora y conserva auditoría.
- [ ] REC-11 — Vinculación/recepción repetida no duplica compra ni entrada de stock.

## 8. Preparación, carga y entrega

- [ ] ENT-01 — Mostrar clientes/pedidos en orden real de entrega del ciclo.
- [ ] ENT-02 — Usar el orden en preparación y bodega.
- [ ] ENT-03 — Sugerir orden de carga que deje el primer pedido más accesible.
- [ ] ENT-04 — Mostrar ese contexto en Reporte Clientes y entregas.
- [ ] ENT-05 — Agente/chofer puede abrir Maps y consultar la parada desde celular.
- [ ] ENT-06 — Registrar avance de preparación/carga/entrega sin cerrar ni
  alterar el trabajo del siguiente ciclo.

## 9. Fin de limpieza semanal y archivo

- [ ] ARC-01 — Retirar cron global del domingo a las 23:59 del arranque.
- [ ] ARC-02 — Retirar los caminos de limpieza global equivalentes del botón/API.
- [ ] ARC-03 — Tras recepción completa, ocultar orden de lista activa a las 24 h.
- [ ] ARC-04 — Conservar orden, líneas, factura/PDF, comparación e historial.
- [ ] ARC-05 — Vista de historial permite consultar la orden archivada.
- [ ] ARC-06 — No archivar parciales ni reiniciar todas las rutas al cambiar
  la semana; verificar los límites de 24 h y fecha/hora de recepción.

**Decisión confirmada:** retirar de la lista activa y conservar historial.
No implementar borrado físico en sustitución de la antigua limpieza.

## 10. Validación y entregas por partes

- [ ] VAL-01 — Pruebas de separación: misma ruta en semanas distintas, actual
  y próxima simultáneas, y cliente que cambia de ruta.
- [ ] VAL-02 — Caso de compra: 10 enviadas, aparece nuevo faltante 3; orden
  anterior sigue en 10 y nueva sugerencia solo cubre las 3 sin cobertura.
- [ ] VAL-03 — Pruebas de recepción parcial/final, exceso facturado y archivo 24 h.
- [ ] VAL-04 — Pruebas de permisos, reintentos/concurrencia y unidades.
- [ ] VAL-05 — Verificar flujo en navegador escritorio/celular y build.
- [ ] VAL-06 — Migraciones/pruebas que escriben en base desechable propia;
  aplicar a copia local con respaldo y comparación cuando cada parte pase.
- [ ] VAL-07 — Comprobar que inventario provisional cero e históricos se
  conservan; no importar stock previo ni enviar mensajes reales para probar.
- [ ] VAL-08 — Revisión manual del usuario del flujo completo.

## Orden para avanzar poco a poco

1. Rutas/ciclos y ficha del cliente: §1 y §2.
2. Contexto del pedido y preventa próxima: §3.
3. Filtros, preparación y origen de faltantes: §4 y §5.
4. Órdenes de compra, bloqueo y cobertura: §6.
5. PDF, comparación y recepción: §7.
6. Carga/entrega y archivo individual: §8 y §9.
7. Verificación final: §10; documentación/validación también al cerrar cada parte.

El [checklist de independencia](checklist-independencia-alegra.md) conserva
los pendientes anteriores de datos, conteo, aceptación fiscal y corte; estas
nuevas funciones no los sustituyen ni se mezclan con sus cifras anteriores.
