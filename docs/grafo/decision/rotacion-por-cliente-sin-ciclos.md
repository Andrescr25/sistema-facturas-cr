---
id: decision/rotacion-por-cliente-sin-ciclos
tipo: decision
titulo: Cada cliente rota con su propia frecuencia; los ciclos globales se retiran por partes
estado: vigente
archivos:
  - docs/instrucciones-vigentes-usuario.md
  - backend/migrations/independencia/056_rotacion_por_cliente.sql
  - backend/src/modules/clientes/rotacion.js
  - backend/src/modules/clientes/clientes.service.js
  - backend/src/modules/clientes/clientes.resumen.service.js
  - backend/src/modules/facturacion/saldo.sql.js
  - backend/src/modules/warehouse/vigenciaFactura.js
  - backend/src/utils/fechaCR.js
  - frontend/src/utils/rotacionTexto.js
  - frontend/src/components/clientes/CampoRotacion.jsx
  - frontend/src/components/clientes/RotacionCliente.jsx
  - frontend/src/components/clientes/ModalCliente.jsx
  - frontend/src/components/clientes/FichaCliente.jsx
  - backend/tests/rotacionCliente.test.js
  - docs/informes/rotacion-clientes-relevo-2026-10-13.md
aristas:
  reemplaza: [decision/ciclo-de-ruta-como-contexto]
  relacionado: [modulo/rutas-clientes, modulo/carga-entregas-por-ciclo, modulo/registro-carga-entrega, modulo/pedidos-por-ciclo, modulo/necesidades-por-ciclo, modulo/ordenes-compra-por-ciclo, modulo/faltantes, modulo/facturacion, modulo/facturas-bodega, modulo/reporte-proveedores, modulo/preventa-por-enlace]
medido: 2026-10-13
---

**Decisión del usuario, 2026-10-13.** «Quiero eliminar completamente la
dependencia de ciclos y pasar a un sistema de rotación individual por
cliente.» El pedido textual está en
[instrucciones vigentes](../../instrucciones-vigentes-usuario.md). Y enseguida:
«guarda todo esto en memoria para ir haciéndolo poco a poco». **Se hace por
partes**; este nodo es el plan y dice en cuál va.

## La regla

> Factura realizada → actualizar última atención → sumar los días de rotación
> configurados → calcular próxima visita.

- **Rotación**: cada cuántos días se vuelve a atender a ESE cliente (7, 15,
  22, 30 o lo que sea). Vive en su ficha: `cliente.rotacion_dias`.
- **Última atención**: la fecha de su última factura EMITIDA y vigente. Un
  borrador no es una venta y una anulada no es una visita. Una nota completa
  también la retira aunque la factura conserve `estado = 'emitida'`; una
  nota parcial o un cobro completo no la retiran. Bodega y rotación usan
  `SIN_CREDITO_TOTAL` de `facturacion/saldo.sql.js`, con la tolerancia de
  medio colón de Facturación. Anular esa nota restaura la atención.
- **Próxima visita**: última atención + rotación. 22 días desde el 10 de
  octubre → 1 de noviembre (el ejemplo del usuario; es una prueba).
- **Ruta**: a qué recorrido pertenece. NO dice cuándo le toca. Las rutas se
  mantienen tal cual; solo se desacoplan de los ciclos.

**Solo se guarda la frecuencia.** Última atención y próxima visita se
calculan al leer, igual que el saldo: facturar, anular o corregir la fecha
de una factura las mueve solas. No hay columna que pueda quedar vieja ni
trabajo de fondo que las recalcule. La cuenta está en un solo lugar,
`modules/clientes/rotacion.js` (`rotacionDe` y `ULTIMA_ATENCION_SQL`); la
pantalla solo la pone en palabras (`utils/rotacionTexto.js`) y no vuelve a
sumar fechas.

Estados: `sin_rotacion` (no se le definió: no se inventa una), `sin_facturas`
(tiene frecuencia pero no hay desde cuándo contar), `atrasado`, `hoy`,
`proximo`. «Hoy» es el día de Costa Rica (`hoyEnCostaRica`).

## Las partes

- [x] **ROT-01 / ROT-02 — frecuencia en la ficha y cálculo.** Claude lo hizo
  en `479ffb2`; Codex lo integró sobre las órdenes automáticas en `201d07b`
  y cerró la revisión/publicación en `developer`. Migración 056 (una columna). El formulario
  del cliente tiene «Rotación: cada cuántos días se le visita», con 7/15/22/30
  a un toque y campo libre de 1 a 365; la ficha muestra rotación, última
  atención, próxima visita y su estado. `GET /clientes/:id/resumen` devuelve
  `rotacion`. **La 056 quedó aplicada en producción el 2026-10-13 a las
  12:37** por Claude, con la autorización del usuario («ok, sí tienes permiso
  para correr esa migración»): una transacción con `lock_timeout`, los 250
  clientes con la misma huella antes y después, y el estado previo guardado
  fuera del repositorio. Codex conservó ese registro de Claude sin volver a
  conectar con producción. **La entrega es solo a `developer`**, conforme
  al último pedido guardado; `main` conserva `e5b1cd2`. Pruebas y límites en
  [el informe del relevo](../../informes/rotacion-clientes-relevo-2026-10-13.md).
- [ ] **ROT-03 — Reporte de clientes solo por ruta.** Hoy
  (`reports/report.service.js`, `useFiltroCicloOperacion`,
  `FiltroCicloOperacion`) filtra por ruta Y semana, y la ruta sale del ciclo
  del documento: como casi ninguna factura tiene ciclo, elegir una ruta deja
  el reporte vacío. Pasa a filtrar por la ruta de la FICHA del cliente
  (`factura.cliente_id → cliente.ruta_id`) y se va el selector de semana.
- [ ] **ROT-04 — módulo «Preventa».** La agenda: se elige una ruta y salen sus
  clientes ordenados por próxima visita, separados en ATRASADOS, HOY y
  PRÓXIMOS (más «sin rotación» y «sin facturas», para que nadie desaparezca).
  Ojo con los nombres que ya existen y son otra cosa: `preventa-por-enlace`
  (el catálogo que se le manda al cliente), `usePreventaCliente`,
  `ModalPreventa` y la columna `preventa_anticipada`.
- [ ] **ROT-05 — Carga y entrega sin ciclos.** `entregas.service.js` exige
  `cicloId`, y `entrega_evento.recorrido_id` es NOT NULL hacia
  `ciclo_ruta_cliente`, con un trigger que pide el ciclo en estado `entrega`
  (migración 051). Necesita migración y que el usuario diga qué facturas
  forman «la carga» de una ruta cuando ya no hay semana que las agrupe.
- [ ] **ROT-06 / ROT-07 — impresos 24 horas y después al historial.** Lo que se
  manda a Impresión desde el reporte deja una fila en `facturas_reimpresion`
  (`fecha_creacion` = cuándo se mandó). Hoy nada lo saca de «listos» (lo hacía
  la limpieza semanal, que no se corre nunca). La propuesta es la misma idea
  de la regla: pasadas 24 horas de esa hora, el reporte deja de mostrarlo y lo
  muestra el historial, sin trabajo de fondo. Falta decidir si la «próxima
  visita» del historial es una foto del momento o la de hoy.
- [ ] **ROT-08 — lo que quede.** Facturación (`SelectorCiclo`,
  `clientesParaOperar` manda `ciclos`, `documentosCiclo.validarEn`, y
  `facturaPropia.service` no deja cambiar el cliente de una factura con
  recorrido), pedidos del portal/agente/WhatsApp (`ciclo_id`), Reporte de
  Proveedores (necesidades y órdenes «por ciclo»; sus tablas ya admiten
  `ciclo_id` NULL), la pantalla de Rutas (crear semanas), filtros de Bodega,
  los Excel y `ContextoCicloDocumento`. Las tablas `ciclo_ruta*` y las
  columnas `ciclo_ruta_cliente_id` NO se borran: son historia y sus triggers
  lo impiden; dejan de usarse.

## Cuánto se usan hoy los ciclos (producción, leído el 2026-10-13)

250 clientes activos, 152 con ruta, en 5 rutas (Palmares 51, Orotina 23,
Barranca 21, La Costa 30, Puerto-Caldera 27). Dos ciclos, los dos en
`preventa` y de la semana del 12/10 (Palmares 49 paradas, Orotina 23).
**3 facturas de 5.596 tienen ciclo**; ningún pedido, ninguna orden de compra
por ciclo y ningún registro de carga o entrega. Retirarlos no deja
operación a medias.

Cada cuánto se les factura de verdad (clientes con al menos tres días de
factura desde abril, mediana entre facturas): ~7 días 13 clientes, ~15 días
20, **~22 días 51**, ~30 días 10, más de 35 días 16. La frecuencia de cada
ficha empieza vacía: no se inventa; si el usuario quiere, esa mediana se le
puede proponer cliente por cliente para que la apruebe.

## Lo que decide el usuario cuando se llegue a cada parte

1. Si las 250 fichas empiezan sin frecuencia y se van llenando, o si quiere
   la propuesta por su ritmo real para aprobarla en lote.
2. Qué entra en la carga de una ruta sin semanas (ROT-05).
3. Historial de impresos: foto del momento o cálculo (ROT-07).

## Coordinación

Órdenes automáticas de Codex (`e5b1cd2`) ya están en `developer` y `main`:
se acumulan faltantes solo en borrador/pendiente sin envío. La integración de
la rotación parte de ese commit. Se conserva el contexto histórico opcional
de ciclo mientras llega ROT-08. Antes de tocar Reporte de Proveedores u
órdenes: mirar `git worktree list` y su nodo.
