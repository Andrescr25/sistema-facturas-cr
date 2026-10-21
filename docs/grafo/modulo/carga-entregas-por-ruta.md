---
id: modulo/carga-entregas-por-ruta
tipo: modulo
titulo: Carga y entregas — todas las facturas pendientes de la ruta sin semanas
estado: vigente
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - docs/informes/despliegue-main-2026-10-13.md
  - backend/migrations/independencia/057_entregas_por_ruta.sql
  - backend/src/modules/entregas/entregas.controller.js
  - backend/src/modules/entregas/entregas.routes.js
  - backend/src/modules/entregas/entregas.service.js
  - backend/src/modules/entregas/entregasLineas.service.js
  - backend/src/modules/entregas/registroFisico.service.js
  - backend/src/modules/entregas/entregas.excel.js
  - backend/src/modules/facturacion/saldo.sql.js
  - backend/tests/entregasPorRuta.test.js
  - backend/tests/dobles/entregasPorRuta.js
  - backend/tests/registroEntrega.test.js
  - backend/tests/estructura.test.js
  - frontend/src/pages/Entregas.jsx
  - frontend/src/hooks/useEntregas.js
  - frontend/src/hooks/useRegistroEntrega.js
  - frontend/src/utils/registroEntrega.js
  - frontend/src/components/entregas/FiltroRutaEntrega.jsx
  - frontend/src/components/entregas/ListaEntrega.jsx
  - frontend/src/components/entregas/ParadaDetalle.jsx
  - frontend/src/components/entregas/RegistroFisico.jsx
  - docs/informes/entregas-por-ruta-2026-10-13.md
aristas:
  reemplaza: [modulo/carga-entregas-por-ciclo]
  relacionado: [decision/rotacion-por-cliente-sin-ciclos, modulo/rutas-clientes, modulo/registro-carga-entrega, modulo/facturas-bodega, modulo/faltantes, modulo/permisos, modulo/exportaciones-operativas-ciclo, modulo/contexto-cadena-operativa, modulo/validacion-cadena-operativa, bloqueo/prisma-no-se-regenera]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


ROT-05. Usuario eligió: **incluir automáticamente todas las facturas
pendientes de la ruta**, sin semanas. Menú Ventas → Carga y Entregas conserva
su permiso `entregas`; la pantalla elige ruta o Sin ruta y Pendientes o
Historial físico. No concede permisos nuevos, ni crea salidas/pedidos/envíos
al leer. No crea otra reserva de inventario: la venta ya tiene su kardex.

## Qué es pendiente y qué ruta tiene

Factura emitida vigente, sin entrega física completa; incluye las que aún
esperan Bodega, sin filtro de fecha ni ciclo. Una anulada o acreditada
completamente no entra como venta pendiente. Si mantiene carga en camión,
sigue visible para descargarla físicamente; no habilita cargar/entregar.
Al completar todas las líneas sale de pendientes y queda en el historial.
Pedidos sin factura/borradores no son facturas pendientes de entregar.

**No se infiere una entrega histórica.** Facturas importadas sin eventos
físicos aparecen como pendientes si siguen vigentes. Bodega procesada no
confirma entrega al cliente. No se inventa un corte de fecha para esconderlas
ni se fabrica una entrega automática. Esa es una limitación explícita de
los datos históricos, no una migración que los complete por su cuenta.

Antes del primer evento usa ruta/orden/Maps actuales de la ficha. Con el
primer evento fija `documento.factura.ruta` en la fotografía operativa;
cambios posteriores de cliente/ruta/Maps no trasladan una carga ya registrada.
Facturas nuevas siguen entrando en la ruta actual sin modificar los eventos
anteriores. Eventos previos a 057 conservan el recorrido de su fotografía:
no añadirles una ruta actual por backfill ni reescribir su JSON.

## Consulta, orden y detalle

`GET /entregas/rutas`: metadatos mínimos, también rutas inactivas para poder
consultar una carga/historia que quedó allí. `GET /entregas/plan?rutaId=…`
requiere selección; admite `vista=pendientes|historial`, página/tamaño hasta50.
`GET /entregas/paradas/:clave` hereda ese ámbito; otra ruta/vista404.

Agrupa por id de ficha y fotografía de ruta/orden/Maps, separa homónimos y
conserva documentos sin ficha por factura. Clave `f-id` de la primera factura
del grupo, orden estable por orden/nombre/id. Si la factura que daba esa
clave salió de pendientes, actualizar el detalle puede devolver404; volver
al recorrido lo recalcula. No abrir el detalle de otra ficha por nombre.

Sugerencia de carga de **toda la ruta**, inversa al orden de entrega; incluye
pendientes de Bodega para prepararlas, con aviso y físico bloqueado hasta
revisión. Carga no equivale a disponibilidad ni entrega confirmada. Detalle
con cantidades y faltantes; contacto financiero/precios/costos/saldos fuera.
`READ ONLY` + `REPEATABLE READ` reales para consultas/Excel; no asignaciones,
faltantes nuevos ni estados por consultar. Excel completo, sin semana en la
vista actual; detalle/recorrido conservan el ámbito y todas las páginas.

La API con `cicloId` explícito conserva **lectura histórica** aislada en
`entregasHistoricas.service.js`, incluida exportación; la pantalla ya no la
usa. Se mantienen documentos/recorridos previos, no se deduce semana activa.
La operación física nueva ya no depende del estado del ciclo, incluso para
facturas con una FK histórica. Retiro de los demás consumidores sigue ROT-08.

## SQL 057 y registro físico

057 hace nullable `entrega_evento.recorrido_id`, conserva su FK y no modifica
filas existentes. Añade helpers de ruta operativa, vigencia y firma, sustituye
`entrega_documento` y el trigger conservando eventos inmutables, cantidades
NUMERIC y versión única. No cambia `entrega_calcular_saldos` ni reinterpreta
cantidades de una línea borrada por Impresión. Actor activo y admin para
corregir, motivo/fecha del servidor, fotografía/cantidades/solicitud coherentes.

Factura `FOR UPDATE` y ficha/actor bloqueados durante registro. Firma incluye
ruta antes del primer evento y vigencia fiscal: formulario observado antes de
cambiar ruta o anular con nota total409. Una nota parcial/cobro no retira venta.
Carga/entrega requieren Bodega procesada y factura vigente, **sin promoción
de ciclo**. Descarga/incidencia conservan la fotografía anterior aunque
cambie/anule el documento. Revisión explícita de acumulados exige admin y
factura vigente. Evento/bitácora atómicos; UUID/cuerpo igual no duplica;
versiones rivales confirman una y rechazan409 la otra.

La regla fiscal/tolerancia es la de `SIN_CREDITO_TOTAL`; la función SQL la
hace valer también en el trigger, fuera del servicio. La fotografía no expone
precios ni saldo. No se toca Prisma ni se instalan dependencias.

Frontend: el servidor se llama desde hooks. Se retiró RegistroFisico de la
lista de deuda de estructura. Ayudantes puros en utils con prueba; página
arma filtro/lista/detalle, reusa Boton/Insignia/TarjetasResumen. Invalidación
por identidad evita A→B→A; reintentos independientes. Al foco actualiza el
plan **sin desmontar un registro incierto**. Una respuesta perdida conserva
UUID/cuerpo y bloquea otro registro hasta reintentar el mismo.

Pruebas y despliegue: [informe](../../informes/entregas-por-ruta-2026-10-13.md).
**057 aplicada/verificada en producción en el despliegue autorizado del 13
de octubre a las 19:31, junto a 055/058.** El relevo anterior se publicó solo
en developer; ahora el usuario pide llevar el conjunto a main.


## Despliegue autorizado — 2026-10-13

El usuario pide llevar todo a main. Codex aplica 055/057/058 en producción
con respaldo restaurable y ensayo local: 144 tablas conservadas y los seis
cuerpos de función verificados. 056 ya estaba aplicada. El bloqueo anterior
por migraciones queda resuelto; la publicación incluye rotación, Reporte
Clientes, Preventa, Carga/entregas y Proveedores. Ver
[registro del despliegue](../../informes/despliegue-main-2026-10-13.md).
Los párrafos de entregas previas describen su estado histórico al publicarlas.
