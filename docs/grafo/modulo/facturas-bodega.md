---
id: modulo/facturas-bodega
tipo: modulo
titulo: Facturas en Bodega — el despacho de cada pedido, sobre la factura propia y sin Alegra
estado: vigente
archivos:
  - backend/src/modules/rutas/operacionCiclo.service.js
  - backend/tests/operacionCiclos.test.js
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/ContextoCicloDocumento.jsx
  - frontend/src/hooks/useFiltroCicloOperacion.js
  - backend/src/modules/warehouse/warehouse.controller.js
  - frontend/src/hooks/useFacturasBodega.js
  - frontend/src/pages/FacturasBodega.jsx
  - frontend/src/utils/facturasBodegaUtils.js
  - backend/tests/bodegaUtils.test.js
  - backend/src/modules/warehouse/bodegaPropia.js
  - backend/src/utils/guardarFaltantes.js
  - backend/migrations/independencia/031_bodega_en_factura.sql
  - frontend/src/services/bodegaPropiaService.js
  - backend/tests/bodegaPropia.test.js
  - backend/src/modules/reprinting/colaImpresion.js
aristas:
  relacionado: [modulo/faltantes, modulo/permisos, decision/permisos-por-prefijo-mas-especifico, leccion/fecha-utc-costa-rica, modulo/facturacion, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-05
---

SOBRE LA FACTURA PROPIA (sección 11 del checklist, terminada el
2026-09-30). La pantalla lista las facturas EMITIDAS de `factura` con sus
líneas (`bodegaPropia.js`, `GET /bodega/facturas-propias`), con
`factura_id` como identidad; el estado de alistado vive en `factura`
(migración 031). Lo guardado en el teléfono va bajo claves nuevas
(`facturasBodegaPropia:*`): con las viejas, un borrador de la factura 12 de
Alegra se habría aplicado a la factura propia 12.

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
