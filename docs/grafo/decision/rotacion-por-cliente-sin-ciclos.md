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
  relacionado: [modulo/carga-entregas-por-ruta, modulo/preventa-agenda, modulo/rutas-clientes, modulo/carga-entregas-por-ciclo, modulo/registro-carga-entrega, modulo/pedidos-por-ciclo, modulo/necesidades-por-ciclo, modulo/ordenes-compra-por-ciclo, modulo/faltantes, modulo/facturacion, modulo/facturas-bodega, modulo/reporte-proveedores, modulo/preventa-por-enlace]
medido: 2026-10-15
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
- [x] **ROT-03 — Reporte de clientes solo por ruta.** Filtro por ruta de la
  ficha (`factura.cliente_id → cliente.ruta_id`), sin selector de semana;
  incluye rutas sin ciclos y sin ruta. Próxima visita calculada, estados
  atrasado/hoy/próximo y sin frecuencia; orden por próxima visita. Fichas
  homónimas separadas por id propio, selección/Excel del detalle exactos.
  Consultar no guarda asignaciones. Historia, ajustes y cola conservados.
  [Implementación y límites](../modulo/reporte-clientes.md). Entrega en
  `developer`, continuación autorizada del relevo de Claude; sin SQL nueva.
- [x] **ROT-04 — módulo «Preventa».** La agenda: se elige una ruta y salen sus
  clientes ordenados por próxima visita, separados en ATRASADOS, HOY y
  PRÓXIMOS (más «sin rotación» y «sin facturas», para que nadie desaparezca).
  Implementado y probado en `developer`: [agenda](../modulo/preventa-agenda.md).
  Ojo con los nombres que ya existen y son otra cosa: `preventa-por-enlace`
  (el catálogo que se le manda al cliente), `usePreventaCliente`,
  `ModalPreventa` y la columna `preventa_anticipada`.
- [x] **ROT-05 — Carga y entrega sin ciclos.** [Implementación por ruta](../modulo/carga-entregas-por-ruta.md): incluye automáticamente todas las
  facturas pendientes, Bodega pendiente visible pero físico bloqueado hasta
  revisión, carga/entrega sin promoción de semana, entregada pasa al historial.
  Carga registrada conserva ruta/Maps/orden; nueva factura entra sin modificar
  historia. **SQL 057 aplicada en producción el 13/10 a las 19:31.**
  El usuario autoriza llevar ahora todo lo implementado a main. Los eventos históricos
  no se reescriben y las cantidades/UUID/versión/admin siguen protegidos.
- [ ] **ROT-06 / ROT-07 — impresos 24 horas sin movimiento e historial.**
  **Aclaración del usuario al continuar ROT-04:** después de enviar una
  factura del Reporte Clientes a Impresión, pasa al historial cuando lleva
  24 horas **sin movimiento**, para que no se acumule en la vista activa.
  No basta contar desde `fecha_creacion` si se vuelve a gestionar. Leer no
  reinicia el plazo; las modificaciones/gestiones sí. Nunca correr limpieza
  semanal: lectura por antigüedad e historial conservado. Falta implementar
  qué gestiones actualizan el último movimiento y cómo mostrar la historia.
- [ ] **ROT-08 — lo que quede.** Facturación (`SelectorCiclo`,
  `clientesParaOperar` manda `ciclos`, `documentosCiclo.validarEn`, y
  `facturaPropia.service` no deja cambiar el cliente de una factura con
  recorrido), pedidos del portal/agente/WhatsApp (`ciclo_id`), la pantalla
  de Rutas (crear semanas), filtros de Bodega,
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

## Decisiones para continuar

Las fichas empiezan sin frecuencia; se configuran individualmente, sin
inventar plazos. Carga: **todas las facturas pendientes de la ruta**, decidido.
Historial: **24 horas sin movimiento desde que se mandó a Impresión**,
aclarado; no se retira a las 24 horas de envío si hubo una gestión posterior.
La pregunta de foto/cálculo de próxima visita recibió esta aclaración del
objetivo, no una elección expresa; no inferir que el usuario aprobó una
foto persistida ni una migración por esa pregunta.

## Coordinación

Órdenes automáticas de Codex (`e5b1cd2`) ya están en `developer` y `main`:
se acumulan faltantes solo en borrador/pendiente sin envío. La integración de
la rotación parte de ese commit. Se conserva el contexto histórico opcional
de ciclo mientras llega ROT-08. Antes de tocar Reporte de Proveedores u
órdenes: mirar `git worktree list` y su nodo.


## ROT-08, parte proveedores — simplificado a petición del usuario

Faltantes globales iguales a main + fichas; sin ciclos ni áreas adicionales.
Orden abierta por proveedor, borradores antiguos reutilizables; enviada/incierta
inmutable y nuevos faltantes en otra orden. SQL 058 aplicada solo localmente;
pendiente en producción antes de main, además de 057. Se mantiene ROT-08 abierto
por Facturación/pedidos/rutas/Bodega/exportaciones y ROT-06/07 por impresión.
Evidencia: [[modulo/reporte-proveedores]] y su informe de simplificación.


## Cambio de destino autorizado — 2026-10-13

«Perfecto, despliega todo a main» reemplaza el destino solo developer del
relevo anterior. Codex aplica 055/057/058 con respaldo y conserva las 144
huellas; 056 ya presente. Se despliegan las partes implementadas, con el
trabajo firmado de Claude incluido. ROT-06/07 y el resto de ROT-08 no se
acreditan por desplegar. Registro: docs/informes/despliegue-main-2026-10-13.md.


## ROT-06/07 completados — 2026-10-15

[[modulo/reporte-clientes]] agrega Activos/Historial por factura, con 24 h sin
movimiento después del envío y recuperación. El archivo es una lectura SQL,
sin cron, sin eliminación ni migración. Consulta, resumen y Excel usan la
misma vista; una factura nueva del cliente sigue activa. Validación PostgreSQL
en ROLLBACK y navegador con corte, actualización automática y reenvío. Los
párrafos anteriores que dicen pendiente describen las entregas de esas fechas.
No acredita el resto de ROT-08 ni redefine la agenda de Preventa.
