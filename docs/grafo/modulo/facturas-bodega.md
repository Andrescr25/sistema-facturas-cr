---
id: modulo/facturas-bodega
tipo: modulo
titulo: Facturas en Bodega — el despacho de cada pedido, sobre la factura propia y sin Alegra
estado: vigente
archivos:
  - backend/tests/ordenesAutomaticas.test.js
  - backend/src/modules/orders-whatsapp/ordenesAutomaticas.service.js
  - backend/src/modules/rutas/operacionCiclo.service.js
  - backend/tests/operacionCiclos.test.js
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/ContextoCicloDocumento.jsx
  - frontend/src/hooks/useFiltroCicloOperacion.js
  - backend/src/modules/warehouse/warehouse.controller.js
  - frontend/src/hooks/useFacturasBodega.js
  - frontend/src/hooks/useFacturaBodegaAbierta.js
  - frontend/src/pages/FacturasBodega.jsx
  - frontend/src/utils/facturasBodegaUtils.js
  - backend/tests/bodegaUtils.test.js
  - backend/src/modules/warehouse/bodegaPropia.js
  - backend/src/modules/warehouse/vigenciaFactura.js
  - backend/src/modules/facturacion/saldo.sql.js
  - backend/tests/bodegaAnuladasLocal.test.js
  - backend/tests/bodegaHook.test.js
  - docs/informes/bodega-anuladas-2026-10-12.md
  - backend/src/utils/guardarFaltantes.js
  - backend/migrations/independencia/031_bodega_en_factura.sql
  - frontend/src/services/bodegaPropiaService.js
  - backend/tests/bodegaPropia.test.js
  - backend/src/modules/reprinting/colaImpresion.js
aristas:
  relacionado: [modulo/contexto-visible-operacion, modulo/carga-entregas-por-ciclo, modulo/faltantes, modulo/permisos, decision/permisos-por-prefijo-mas-especifico, leccion/fecha-utc-costa-rica, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-13
---

SOBRE LA FACTURA PROPIA (sección 11 del checklist, terminada el
2026-09-30). La pantalla lista las facturas EMITIDAS de `factura` con sus
líneas (`bodegaPropia.js`, `GET /bodega/facturas-propias`), con
`factura_id` como identidad; el estado de alistado vive en `factura`
(migración 031). Lo guardado en el teléfono va bajo claves nuevas
(`facturasBodegaPropia:*`): con las viejas, un borrador de la factura 12 de
Alegra se habría aplicado a la factura propia 12.

ANULACIÓN CON NOTA COMPLETA (2026-10-12). Facturación muestra «Anulada con
nota de crédito» cuando las notas vigentes cubren el total, pero conserva
`factura.estado = 'emitida'`. El filtro anterior la seguía mostrando pendiente.
Bodega excluye ahora también ese crédito total, antes de aplicar el límite y
contar el resumen. Reutiliza `ACREDITADO` de Facturación: suma notas vigentes,
ignora anuladas y respeta la misma tolerancia de medio colón. Una nota parcial
o un cobro completo no retiran el pedido; anular una nota vuelve a habilitarlo
si deja de estar acreditado por completo. No se borran registros históricos.

EL DESPACHO ABIERTO TAMBIÉN SE VALIDA. Abrir cualquier factura pide sus estados
al servidor; al volver a la pestaña o al refresco, valida la abierta sin
reemplazar lo marcado. `FACTURA_NO_VIGENTE` la cierra, la retira de la lista y
la caché conjunta y muestra el motivo; conserva el borrador. Una respuesta
anterior no afecta otra apertura, incluso A → cerrar → A. Un error de red
conserva el trabajo. Guardar faltantes y cambiar estado toman el bloqueo de
factura y después releen créditos, en la misma transacción de la escritura:
una nota confirmada mientras esperaban no puede pasar por un despacho válido.
No hay migración nueva. [Pruebas y alcance](../../informes/bodega-anuladas-2026-10-12.md).

LOS FALTANTES Y LA COLA cuelgan de `factura.id` y `producto.id` desde la
migración 032 (ver [[modulo/faltantes]]): la pantalla manda el `producto_id`
propio de cada línea, y lo registrado vuelve con él (`aplicarEstadosGuardados`
empareja primero por ese id: dos productos con la misma referencia ya no se
pisan). Despachar sin faltantes encola la factura por su id propio, en la
misma transacción.

SIN PUENTE NI ALEGRA (2026-09-30). Durante la migración cada despacho se
copiaba también a la tabla vieja `facturas` (enlazada por
`facturas.factura_propia_id`), porque Faltantes, la cola de impresión y la
línea de tiempo del portal la leían. Todos leen `factura` ahora: despachar
escribe solo ahí. Se retiraron también las rutas por id de Alegra
(`/bodega/facturas/:alegraId`), que le pedían la lista a Alegra con una caché
por ventana de días: en `main` siguen así.

EL CERO EN UNA COLUMNA ÚNICA: la copia de cada factura propia entraba con
`facturas.alegra_id = 0`, y esa columna es única: la SEGUNDA factura propia
chocaba con la primera y no se podía facturar. La 031 soltó el NOT NULL; la
copia ya no existe.

EL HISTORIAL VA EN ORDEN DE DESPACHO: la última despachada primero
(`ordenarHistorial`, por `despachada_en`); las anteriores al 25 de agosto,
sin hora, al final.

TRAMPAS QUE YA COSTARON
- Abrir una factura le pedía el detalle a Alegra y, al llegar, pisaba lo que
  el bodeguero ya había marcado. Lo registrado sale de la base
  (`GET /bodega/facturas-propias/:id/estados`) y los botones esperan quietos.
- Bodega registra también los productos COMPLETOS (tipo 'completo') para poder
  reabrir la factura igual: cualquier conteo de faltantes tiene que excluirlos
  (`tipo_faltante <> 'completo' AND cantidad_faltante > 0`), o se infla. Esta
  pantalla ya no cuenta faltantes (decisión del usuario, 2026-09-23: se
  siguen en su propio módulo); solo Por preparar e Historial.
- Al reabrir una del historial, 'completo' tiene que volverse 'ninguno' en la
  pantalla; si no, guardar la modificación lo registraba como 'parcial' con 0.
  Quedaron 10 filas así en 3 facturas (14910, 14915, 14919): corregidas en
  producción el 2026-09-23, con autorización y copia previa.
- Las fechas 'YYYY-MM-DD' se leen como día local (`fechaLocal`): con
  `new Date()` la lista mostraba cada factura con un día menos.
- `/bodega` es del módulo. Mientras la pantalla llamó a `/alegra/bodega`
  (hasta el 2026-10-04) hubo que declararlo aparte: `/alegra` era compartida
  y cualquiera con sesión podía marcar facturas como despachadas.

## Operación por ciclos — 2026-10-05

Bodega/reportes/notas/Excel leen JOIN_CICLO de la factura, nunca ruta actual
del cliente. Filtros rutaId/cicloId estrictos y Sin ciclo; incompatibles
producen vacío, inválidos 400. Recorrido/Maps fijo, semana/orden/anticipado
en documentos. Selector propio por permiso del módulo; solo metadatos,
sin exponer paradas/Maps/saldos en esa consulta. Listas de reportes y notas
ahora tienen dueño específico en usuarios/modulos: llevan contexto privado.
Bodega de un ámbito explícito no se recorta a ventana/límite del conjunto.
Filtros también protegen la lista cacheada en el teléfono; drafts conservados.
Proveedor agrega origen por faltante con cantidad, factura/cliente/parada y
ciclo; notas/exportación mismo ámbito. Agrupación distingue proveedores de
un producto; Excel añade Procedencia y conserva lectura sin asignar.
Consulta filtrada no reutiliza borrador/envío GLOBAL por proveedor: órdenes
persistentes/cobertura/recepción pendientes, no interpretar la consulta como
compra pendiente de recibir. Pedidos sin facturar tampoco se alistan todavía.
Limpieza semanal aún pendiente por código: lanzador seguro y nunca probarla.
Relevo/evidencia en docs/informes/operacion-ciclos-2026-10-05.md.

2026-10-06, consulta de carga/entregas: [[modulo/carga-entregas-por-ciclo]]
usa ciclo/documentos fijos y Maps; no pide permiso Clientes al chofer.
Orden inverso sugerido desde revisión de bodega, sin confirmar entrega.
Estado operativo vigente en informe carga; textos de partes anteriores
son históricos. Limpieza global ya retirada por código en 050, ver
[[modulo/archivo-ordenes-compra]]. ENT-06/avance físico sigue pendiente.

## Contexto visible y lecturas — 2026-10-06

Revisión vigente en [[modulo/contexto-visible-operacion]]: selección clara,
respuestas tardías descartadas, notas por semana y contexto original en la
ficha. Los párrafos anteriores son avances históricos, incluidos sus pendientes.
RUT-08/FIL-11 y validación integral se conservan abiertos; no cerrar por probar
una sola consulta, exportación o cambio de maestro. No hay nueva SQL.

## Faltante → compra automática — 2026-10-13

Registrar una cantidad nueva o su aumento guarda faltante, asignación conocida y
orden en una transacción. Primero advisory46005/1, después la vigencia/bloqueo
de factura. Guardar otra vez la misma cantidad no repone exclusiones manuales.
Proveedor/ciclo abiertos acumulan; envío confirmado o incierto conserva el
snapshot y reserva, y los faltantes nuevos preparan otra orden. Sin ficha o
conversión válida se guarda el faltante para revisión. No se envía WhatsApp
al registrar faltantes. Ver [[modulo/ordenes-compra-por-ciclo]].
