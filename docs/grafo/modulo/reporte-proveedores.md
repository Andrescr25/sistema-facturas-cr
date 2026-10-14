---
id: modulo/reporte-proveedores
tipo: modulo
titulo: Reporte de Proveedores — faltantes y fichas, órdenes independientes
estado: vigente
archivos:
  - docs/informes/proveedores-modal-pdf-2026-10-14.md
  - frontend/src/components/reporte-proveedores/ModalEnviarProveedor.jsx
  - backend/tests/modalEnvioProveedor.test.js
  - backend/tests/confirmacionEnvioProveedor.test.js
  - backend/src/modules/orders-whatsapp/reservasBorradorReporte.service.js
  - frontend/src/services/api.js
  - docs/informes/proveedores-envio-409-2026-10-14.md
  - backend/src/modules/reports/proveedorCompra.sql.js
  - backend/tests/identidadEnvioProveedor.test.js
  - backend/src/modules/orders-whatsapp/temporalesProveedor.service.js
  - backend/src/modules/orders-whatsapp/revisionTemporalesProveedor.service.js
  - backend/src/modules/orders-whatsapp/historialEnviosProveedor.service.js
  - backend/src/modules/orders-whatsapp/comprobacionEnviosReporte.service.js
  - backend/tests/temporalesProveedores.test.js
  - frontend/src/utils/reporteProveedoresUtils.js
  - docs/informes/proveedores-correccion-2026-10-14.md
  - backend/tests/proveedoresCritico.test.js
  - backend/src/modules/orders-whatsapp/envioDesdeReporte.service.js
  - backend/src/modules/orders-whatsapp/temporalesVisibles.sql.js
  - backend/src/modules/orders-whatsapp/ordenesReporte.service.js
  - backend/tests/envioReporteProveedor.test.js
  - backend/tests/proveedoresInterfaz.test.js
  - frontend/src/utils/proveedoresVista.js
  - frontend/src/components/reporte-proveedores/OrdenEnviadaDetalle.jsx
  - backend/src/modules/reports/faltantesCompra.sql.js
  - docs/informes/despliegue-main-2026-10-13.md
  - docs/informes/proveedores-simplificados-2026-10-13.md
  - backend/migrations/independencia/058_ordenes_proveedor_sin_ciclos.sql
  - backend/src/modules/orders-whatsapp/ordenesProveedor.service.js
  - backend/src/modules/orders-whatsapp/ordenesProveedor.controller.js
  - backend/src/modules/orders-whatsapp/ordenesProveedor.routes.js
  - backend/tests/proveedoresSimple.test.js
  - frontend/src/hooks/useEdicionFaltantesProveedor.js
  - frontend/src/hooks/useEnvioOrdenProveedor.js
  - frontend/src/components/reporte-proveedores/ProcedenciaFaltante.jsx
  - docs/informes/ordenes-automaticas-proveedores-2026-10-13.md
  - frontend/src/pages/ReporteProveedores.jsx
  - frontend/src/components/ui/NavegacionSecciones.jsx
  - frontend/src/components/ui/PanelSeccion.jsx
  - frontend/src/components/ui/Boton.jsx
  - frontend/src/components/ui/Insignia.jsx
  - frontend/src/components/pagos/TarjetasResumen.jsx
  - frontend/src/components/reporte-proveedores/ListaProveedores.jsx
  - frontend/src/components/reporte-proveedores/ProveedorDetalle.jsx
  - frontend/src/components/reporte-proveedores/ListaFichasProveedor.jsx
  - frontend/src/hooks/useReporteProveedores.js
  - docs/informes/proveedores-redisenados-2026-10-07.md
aristas:
  depende_de: [modulo/faltantes, modulo/ordenes-compra-por-ciclo, modulo/permisos]
  relacionado: [modulo/rutas-clientes, modulo/facturas-ordenes-compra, modulo/recepcion-ordenes-compra, modulo/cierre-ordenes-compra, modulo/archivo-ordenes-compra, decision/orden-enviada-y-archivo-por-recepcion, decision/rotacion-por-cliente-sin-ciclos]
medido: 2026-10-14
---

## Corrección vigente — 2026-10-14

**Confirmación solicitada después de la corrección:** el botón abre un modal
con destino/mensaje exactos. POST /proveedor/revisar-envio prepara la copia
desde las cantidades revisadas, devuelve número normalizado y mensaje de esa
copia, sin reclamar el canal. Confirmar usa el mismo cuerpo/UUID en /enviar;
no reconstruye ni cambia destino/PDF entre ambas acciones. Cancelar deja la
copia preparada en historia, sin envío activo ni mensajes. La preparación se
puede verificar con las salidas locales bloqueadas; enviar conserva su guarda.
Un borrador cambiado exige volver a revisar. Un resultado perdido se consulta
con su mismo cuerpo/UUID, sin preparar ni reenviar otra compra.
El formato comercial anterior se recupera en las copias nuevas: código y
descripción del proveedor, factor y cantidad destacada. Los documentos
históricos conservan sus bytes. Generador compartido y paginación en
[[modulo/ordenes-compra-por-ciclo]]. [Verificación conjunta](../../informes/proveedores-modal-pdf-2026-10-14.md).

**409 al enviar, confirmado después de la entrega:** «Un producto ya no tiene
faltantes libres». Un borrador de otro proveedor podía conservar la reserva de
un faltante reasignado: GET lo mostraba actual, pero preparar descontaba esa
reserva obsoleta. Al revisar el envío se cierran sólo los borradores/pendientes
que retienen esos orígenes, sin envío ni intento activo, conservando líneas,
orígenes y PDF. Sus demás productos siguen pendientes para revisión; un fallo
posterior revierte el cierre. Nunca libera una enviada o incierta. La consola
ahora conserva el motivo real del servidor, en lugar del rótulo de Axios.
[Reproducción y verificación](../../informes/proveedores-envio-409-2026-10-14.md).

El reporte muestra necesidades **actuales sin enviar**, no el histórico resuelto:
solo faltantes pendientes de facturas vigentes con el producto en sus líneas.
Una decisión revisada por línea (completo/parcial/no llegó), factura procesada
o en cola pendiente de Impresión deja de ser una compra actual. Recuperar
una factura sí puede reabrirla; una cola procesada antigua no la bloquea.
La cobertura enviada se descuenta; el borrador sigue editable en la pantalla.

Tarjetas Sin enviar arriba; cada enviada abajo, tachada e independiente, con
cantidades/códigos de su snapshot. Sin ciclos, modal de órdenes, preparación
adicional ni descarga global duplicada. Solo **Enviar PDF a WhatsApp** desde
el detalle ya revisado: el modal posterior solicitado sólo confirma número
y mensaje. POST /orden-compra/proveedor/revisar-envio toma ese contenido,
comprueba la revisión del reporte y guarda PDF, mensaje predeterminado y un
único teléfono de la ficha. /enviar confirma esa copia. Manuales derivan conversión desde el proveedor,
sin inventar un cliente. La UUID/cuerpo sobreviven a una respuesta perdida;
el mismo intento solo consulta el resultado, nunca retransmite. Un resultado
incierto conserva su fotografía bloqueada; nuevas necesidades separadas pueden
formar otro pedido. Una prueba de transporte no iniciado permite otro clic
explícito con clave nueva. Confirmado/incierto retiran solo las ediciones temporales
que acompañaron ese envío, conservando cambios concurrentes posteriores.
Enviando las oculta al leer para no contaminar el siguiente pedido; un fallo
anterior al transporte las devuelve a la revisión. Claves internas por id de
producto, sin mezclar cantidades si dos productos tienen el mismo código.
Se revalida el filtro de fecha y solo se reservan sus orígenes visibles.

Procedencia usa producto/factura/cliente propios; notas se recortan a las
facturas de ese producto en ese proveedor, sin mezclar clientes homónimos ni
necesidades históricas. Consultar nunca asigna proveedor ni crea compras.
Una asignación legada sólo por nombre usa la ficha exacta única para resolver
su mapping, incluso si esa ficha tiene cédula o el mapping conserva otro nombre.
Reporte y envío comparten la selección por id propio/cédula: no inventan un
cambio de producto/conversión al enviar una revisión recién consultada. Los
homónimos sin cédula quedan sin resolver; los identificados conservan cantidades,
orígenes y destinatarios separados. Nombre, cédula e id públicos del reporte
mantienen sus claves anteriores para conservar los intentos guardados en la
pestaña. La consulta sigue sin escribir asignaciones ni preparar órdenes.
Tras Revisión de precios, indicadores mínimos Facturado/parcial/No facturado
comparan la compra registrada con la orden enviada. Una candidata confiable
se vincula automáticamente; varias o una comparación incierta requieren elegir
en Revisión de precios. Una factura parcial mantiene su orden como candidata
hasta completar las cantidades; no se infiere por orden de llegada. La identidad
automática mostrada se vuelve a comprobar al registrar, sin perder precios ante
un cambio concurrente. [[modulo/facturas-ordenes-compra]].

**Cantidades enteras confirmadas por el usuario:** edición/guardado/manuales
rechazan fracciones sin truncar; cero excluye. Un saldo calculado fraccionario
por conversión conserva precisión, incluso al sumar un extra entero, mediante
aritmética de micros. Agregar el mismo producto suma en una línea y persiste el
total revisado; si la línea original está excluida, el extra queda independiente.
Consolidar o separar extras es atómico y comprueba su cantidad/timestamp exactos
para no pisar una edición de otra pestaña. Deshacer conserva la clave almacenada
y verifica la identidad, también con una referencia literal como «id:2».

Los ajustes nuevos guardan huella/fecha del reporte en la bitácora ya existente.
La escritura comparte el bloqueo de envío y relee tras bloquear factura/faltante;
un reporte anterior devuelve409 sin guardar. La pantalla descarta buffers si
cambia la huella o el proveedor desaparece, y aplica temporales tagueados sólo
a su revisión. Ediciones legadas sin huella mantienen compatibilidad, siempre
con identidad resuelta única. Nunca se cambia cuerpo/UUID de un intento incierto.
Una prueba exacta orden/UUID fuera del filtro de fecha confirma que el servidor
ya separó un envío anterior, permitiendo enviar la necesidad nueva sin mostrar
una orden oculta ni desbloquear/retransmitir la incierta.

Las reglas temporales e historial se separan del servicio de PDF; éste vuelve
al tope de700 líneas y sale de la deuda estructural. No hay SQL nuevo.

Sin SQL nuevo. Ver [evidencia y límites](../../informes/proveedores-correccion-2026-10-14.md).

## Antecedentes

## Entrada vigente — simplificación del 2026-10-13

El usuario pide únicamente **Faltantes** (por defecto, igual a main) y
**Proveedores** (ficha, información y contacto). Se retiran Compras, Necesidades,
Órdenes como área separada, semanas/Sin ciclo, ruta y los paneles de factura,
recepción y cierre. Se borran los componentes/hooks que quedaron sin uso.
Sus APIs y registros históricos siguen conservados; retirarlos de esta pantalla
no equivale a borrar documentos, recepciones ni inventario.

Faltantes mantiene la consulta global de main, tarjetas → proveedor, búsqueda,
fecha, cantidades, notas, edición, asignación, agregados manuales, Excel y descarga.
Procedencia muestra cliente/factura/cantidad, sin agrupar por semanas.
La descarga de faltantes conserva el reporte; **Revisar y enviar orden** abre
las órdenes persistidas del proveedor. La revisión comercial de cada orden
muestra cantidades propias/proveedor y usa su PDF guardado, no el PDF global.
La tarjeta distingue una orden nueva pendiente aunque haya otra ya enviada.

## Una orden abierta por proveedor

Bodega y asignación preparan automáticamente dentro de su transacción: buscar
borrador/pendiente sin intento de envío del proveedor, sin comparar ciclos.
Los borradores históricos existentes también acumulan: no se reclasifican sus
snapshots. Una orden nueva tiene ciclo/ruta/semana NULL. La SQL 058 quita solo
la igualdad de ciclo al validar procedencia; mantiene identidad y límites de
cantidades/cobertura, con protección de las órdenes enviadas.

Enviada, parcial, recibida, cancelada/cerrada o intento incierto nunca recibe
nuevos productos ni cantidades. A10/B5 enviado → C8/A3 nuevo conserva la
primera orden y crea otra con C8/A3. La cobertura evita pedir dos veces el
mismo faltante. Un aumento en pendiente cambia revisión e invalida la copia
preparada anterior, sin borrar sus bytes; exige revisar nuevamente antes de enviar.

El modal muestra referencia, creación y estado de todas las órdenes del proveedor,
incluidas antiguas archivadas. Revisa cantidades antes de enviar y conserva el
control de número/mensaje/PDF; no ofrece recepciones, adjuntos ni cierres de enviadas.
GET /orden-compra/proveedor/ordenes es READ ONLY/REPEATABLE READ; estados es
solo SELECT. Preparar faltantes pendientes es POST explícito para faltantes
anteriores/liberados. Abrir o refrescar nunca prepara una orden ni manda mensajes.
Las direcciones /por-ciclo continúan como contrato interno de documentos; su
nombre no aparece en la pantalla, PDF nuevo ni mensaje propuesto.

Estructura: página arma las dos áreas; hooks llevan estado/API; componentes
presentan; reglas puras existentes en utils. useReporteProveedores vuelve al
tope de 500 líneas separando la edición manual; disminuye la deuda de estructura.
Diseño conserva Boton, Insignia y Modal con la paleta por rol.

[Verificación y límites](../../informes/proveedores-simplificados-2026-10-13.md):
copia local con ROLLBACK, comparación contra el reporte de main y transporte
simulado. SQL 055/057/058 ya aplicadas en producción con el despliegue autorizado. Las partes ROT-06/07 y el resto de ROT-08 siguen
pendientes; esta entrega solo simplifica proveedores.


## Despliegue autorizado — 2026-10-13

El usuario pide llevar todo a main. Codex aplica 055/057/058 en producción
con respaldo restaurable y ensayo local: 144 tablas conservadas y los seis
cuerpos de función verificados. 056 ya estaba aplicada. El bloqueo anterior
por migraciones queda resuelto; la publicación incluye rotación, Reporte
Clientes, Preventa, Carga/entregas y Proveedores. Ver
[registro del despliegue](../../informes/despliegue-main-2026-10-13.md).
Los párrafos de entregas previas describen su estado histórico al publicarlas.
