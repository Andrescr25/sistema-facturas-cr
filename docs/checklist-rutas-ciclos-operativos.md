# Checklist: clientes, rutas y ciclos operativos

Solicitud y aclaración del usuario: **2026-10-05**.
Estado: rutas/ciclos, ficha, pedidos/facturas y PDF terminados; filtros de
bodega/reportes, procedencia y órdenes con PDF revisado, envío inmutable y
cobertura pendiente de recibir implementados. Factura/PDF del proveedor y
comparación y recepción física parcial/final implementadas; archivo individual
24 h y retiro semanal comprobados; consulta de recorrido/carga/Maps
y registro físico de carga/entrega implementados. Necesidades/cobertura
con stock general, demanda y procedencia completa disponibles. Cierre enviado
con motivo, recibido conservado y solo cobertura pendiente liberada.
[Primera parte](informes/rutas-clientes-2026-10-05.md) y
[segunda parte](informes/pedidos-ciclos-2026-10-05.md) y
[tercera parte](informes/preventa-enlaces-2026-10-05.md) y
[ampliación PDF con fotos](informes/preventa-pdf-2026-10-05.md) y
[catálogo visual](informes/catalogo-visual-2026-10-05.md) y
[paginación de cuatro productos](informes/catalogo-paginacion-2026-10-05.md) y
[operación por ciclos](informes/operacion-ciclos-2026-10-05.md) y
[borradores por ciclo](informes/ordenes-ciclo-2026-10-05.md) y
[envío inmutable y cobertura](informes/envio-ordenes-ciclo-2026-10-06.md) y
[factura/PDF y comparación](informes/facturas-ordenes-2026-10-06.md) y
[recepción física](informes/recepcion-ordenes-2026-10-06.md) y
[archivo individual](informes/archivo-ordenes-2026-10-06.md) y
[recorrido y carga](informes/carga-entregas-2026-10-06.md) y
[registro físico](informes/registro-entregas-2026-10-06.md) y
[necesidades y cobertura](informes/necesidades-cobertura-2026-10-06.md) y
[cierre de enviada](informes/cierre-ordenes-2026-10-06.md) y
[Excel operativo completo](informes/exportaciones-ciclos-2026-10-06.md) y
[contexto visible y lecturas](informes/contexto-operativo-2026-10-06.md) y
[históricos y copias](informes/historicos-contexto-2026-10-06.md) y
[contexto de toda la cadena](informes/contexto-cadena-2026-10-06.md).
Estado vigente: **92 listos / 7 pendientes (99 IDs)**. Las cifras en las
entregas anteriores son históricas; este estado incluye cierre de enviada, recepción y registro físico.
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
- [x] RUT-08 — Conservar el contexto de documentos al cambiar la ruta de un
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
- [x] PRE-03 — Preparar catálogos personalizados para los clientes de ese ciclo.
- [x] PRE-04 — Facilitar envío explícito del catálogo/enlace por cliente;
  automatización posterior debe conservar destinatario y ciclo correctos.
- [x] PRE-05 — Pedido en línea conserva cliente, ruta, ciclo y origen anticipado.
- [x] PRE-06 — Pedido adicional del agente conserva el ciclo de la visita,
  sin confundirlo con el pedido en línea anterior.
- [x] PRE-07 — Facturar un pedido conserva su ciclo y sus vínculos.
- [x] PRE-08 — Preparar y llevar pedidos anticipados para entregarlos al
  realizar la visita de la semana siguiente.
- [x] PRE-09 — Conservar idempotencia y pedidos offline existentes al añadir
  contexto; no duplicar ni borrar colas pendientes.
- [x] PRE-10 — Catálogo/enlace no da acceso a pedidos o saldos de otro cliente.

- [x] PRE-11 — Generar/descargar PDF personalizado por cliente y ciclo, con
  códigos, precios con IVA y referencia para pedir por WhatsApp.
- [x] PRE-12 — Adjuntar el PDF revisado junto al enlace en el envío explícito;
  conservar destinatario/ciclo y registro de éxito o fallo, sin mensajes reales.
- [x] PRE-13 — Cliente sin cuenta puede recibir el PDF y responder por
  WhatsApp; invitación opcional para el portal, sin alta automática de pedidos.
- [x] PRE-14 — Incluir fotos reales del producto, conservar originales y
  avisar cuáles no tienen foto disponible. Guardar un ejemplo real en Descargas.

- [x] PRE-15 — Ordenar PDF por categoría/subcategoría y su configuración
  manual; conservar productos sin clasificar bajo Otros.
- [x] PRE-16 — Incluir todas las rebajas/liquidaciones vigentes mezcladas con
  los demás productos, etiquetas Oferta/Liquidación y precio anterior, sin
  duplicación ni doble aplicación de rebajas.
- [x] PRE-17 — PDF como catálogo: dos tarjetas por fila, fotos grandes y
  datos debajo, con paginación y nombres largos legibles. Corrección del
  usuario: cuatro productos por hoja, mezclando categorías/subcategorías
  sin huecos de separación, con ambos títulos sobre cada ficha; solo la
  última página puede quedar parcial.
- [x] PRE-18 — Mensaje WhatsApp explícito: CATÁLOGO DE PRODUCTOS en PDF.

Corrección PRE-17: 29 pruebas focalizadas de PDF/fotos, cuatro nuevas de
páginas físicas/grupos impares/textos largos. PDF nativo real: 58 productos,
58 fotos y 15 ofertas en **15 páginas**, antes 33; completo 1.859 en 465.
Nuevo ejemplo compacto en Descargas; conservar el anterior. Refina PRE-17,
sin cerrar compras/recepción/entregas: **48 listos / 51 pendientes (99 IDs)**.
Evidencia y relevo en informe de paginación.

Segunda parte: PRE-01/02/05/06/07/09 y FIL-02 implementados con 045,
commit `d87ee54`, 1.962 pruebas aprobadas y aplicación local verificada.
Portal selecciona su semana; el agente toma pedidos en Facturación (catálogo
sigue de consulta). Históricos sin ciclo y colas/claves antiguas conservados.
Tercera parte (`7d44a3e`, solo local): PRE-03/04/10 y FIL-03 comprobados con enlaces personales por
cliente/ciclo, invitación explícita, copia y revisión/envío por WhatsApp;
la portada usa solo la cuenta autenticada y el pedido conserva la semana.
1.974 pruebas aprobadas; navegador 1440/390 con login/activación, cuenta ajena
404 y cierre 409 sin consumir carrito. Transporte local 423 registrado como
fallo, sin mensajes reales. No requiere migración nueva. Evidencia en el
tercer informe. RUT-08/FIL-11 quedan abiertos por la propagación a
faltantes/compras/reportes; PRE-08 aún requiere preparación/carga/entrega.

Ampliación PDF (`05cb0fe`, solo local): PRE-11/12/13/14 comprobados. PDF personal con fotos y precios
con IVA, descarga privada y copia revisada adjunta al enlace; WhatsApp sin
cuenta, invitación opcional, sin pedido automático. 1.991 pruebas, grafo 12,
build y Chromium 1440/390 aprobados. Ejemplo real en Descargas (60 productos,
60 fotos); completo verificado con 1.859 productos/1.827 fotos. Aviso de fotos
faltantes. Checklist **34 listos / 61 pendientes** (95 IDs).
Ver informe PDF para aislamiento, evidencia y límites del envío real.

Ampliación visual (`427e257`, solo local): PRE-15/16/17/18 comprobados. Categorías y
subcategorías respetan configuración y orden manual; todas las rebajas y
liquidaciones vigentes se mezclan con los productos normales y se etiquetan,
sin duplicar ni descontar dos veces. Fotos grandes arriba, datos debajo, dos
tarjetas por fila y paginación con nombres completos. WhatsApp identifica
explícitamente CATÁLOGO DE PRODUCTOS en PDF. **1.999 pruebas**, grafo 12,
build y Chromium 1440/390; ejemplo real nuevo en Descargas: 58 productos,
58 fotos y 15 ofertas. No hay liquidaciones activas en el origen local; se
comprobaron con fixtures propios y ROLLBACK. Checklist vigente:
**38 listos / 61 pendientes (99 IDs)**. Ver informe de catálogo visual.

## 4. Contexto y filtros en toda la operación

- [x] FIL-01 — Clientes: ruta y orden visibles, filtro de ruta.
- [x] FIL-02 — Pedidos: filtros de ruta/ciclo y origen presencial/en línea.
- [x] FIL-03 — Preventa: ruta/ciclo actual y próximo claramente identificados.
- [x] FIL-04 — Reporte Clientes: filtrar ruta/ciclo y mostrar orden de entrega.
- [x] FIL-05 — Reporte Proveedores: filtrar ruta/ciclo y ver desglose de origen.
- [x] FIL-06 — Preparación de pedidos: filtrar ruta/ciclo.
- [x] FIL-07 — Entregas: filtrar ruta/ciclo y conservar su avance propio.
- [x] FIL-08 — Faltantes de bodega: filtrar ruta/ciclo.
- [x] FIL-09 — Pantallas muestran ruta y semana seleccionadas sin depender
  de una fecha global de reinicio.
- [x] FIL-10 — Exportaciones respetan filtros e incluyen ruta/ciclo/procedencia.
- [x] FIL-11 — Históricos no clasificados se distinguen de los ciclos actuales,
  sin asignaciones automáticas supuestas.

Parte de operación (`8e656fa`, solo local): FIL-04/05/06/08, FAL-02 y ENT-02
implementados. Bodega y reportes filtran el recorrido fijo de la factura;
Sin ciclo conserva históricos sin reasignarlos. Bodega prepara por parada,
selector incluye semana/estado y Maps del recorrido se abre en el detalle.
Proveedor muestra procedencia por faltante/factura/cliente/ciclo; notas y
Excel respetan filtros (hoja Procedencia). Consulta filtrada de proveedor
no aplica el borrador global ni su marca de envío. Órdenes persistentes,
cobertura y recepción siguen pendientes. FIL-09/10/11, RUT-08 y FAL-01
siguen parciales por propagación a órdenes/entregas y pedidos sin facturar.
2.011 pruebas, grafo 12, build y navegador 1440/390 aprobados; dos Excel
releídos y permisos HTTP comprobados. Checklist vigente **44 listos / 55
pendientes (99 IDs)**. Ver informe de esta parte.

**Excel operativo `f0fd815`, 2026-10-06:** FIL-10 comprobado. Necesidades/órdenes/carga y
entregas exportan filtros completos, todas las páginas y detalle elegido con
procedencia. Origen fijo, desconocidos vacíos, cantidades físicas/cobertura,
Activas/Historial y posición global de carga conservados.2.211pruebas/362suites
fail0/skip0,99focalizadas y20nuevas; grafo12/build/Chromium1440/390,9XLSX
releídos y21huellas iguales. Sin migración;053 libre. **88/11 (99 IDs)**.
Aplicación/relevo en informe exportaciones-ciclos-2026-10-06. FIL-09/11,
RUT-08 y validación integral siguen pendientes; prueba de Excel no los cierra.


**Contexto visible, 2026-10-06:** FIL-09 cerrado. Pedidos/reportes/notes no
muestran la consulta anterior bajo otra semana, incluso A→B→A o error503;
selección completa visible en celular y reintento sin conclusión de lista
vacía. Bodega conserva copia/drafts y filtra documentos guardados de la semana.
Ficha añade contexto original a facturas/pedidos y distingue Sin ciclo.
Quince vistas/30capturas Chromium1440/390, siete respuestas demoradas,
18huellas iguales y reporte legado de fondo0.2.213pruebas/362suites fail0/skip0,
14focalizadas/dosnuevasPG/grafo12/build. Sin migración:053 libre.
**89 listos/10 pendientes (99 IDs)**. Aplicación y límites en informe
contexto-operativo-2026-10-06. RUT-08/FIL-11 y VAL integral siguen abiertos;
esta verificación de pantallas no los cierra. Cifras/textos anteriores históricos.


**Históricos/copias `3c10bf1`, 2026-10-06:** FIL-11 cerrado. Sin ciclo confirmado se
distingue de datos de ruta/semana aún sin descargar. Facturación/listas,
detalle/edición y cola muestran contexto propio; PUT y acuses conservan
fotografía aun tras cambiar cliente/cerrar semana, sin nuevos documentos.
Tres reenvíos mantienen cuerpo/clave y líneas al cambiar id; fallo al guardar
no retira cola/copia. Procedencia histórica conservada sin usar ids de Alegra
como propios. **2.228 pruebas/362 suites** fail0/skip0,15 nuevas, grafo12/build;
Chromium1440/390,6vistas/12capturas/6casos IndexedDB real/16huellas iguales.
Sin nueva SQL:053 libre. **90 listos/9 pendientes (99 IDs)**.
Informe historicos-contexto-2026-10-06. RUT-08 conserva revisión integral de
compras/recepción/carga/entrega tras mover cliente/promover ciclos; VAL integral
abierto. Los cierres/cifras anteriores son históricos.

## 5. Faltantes y cobertura de compras

- [x] FAL-01 — Cada necesidad enlaza producto, pedido/factura, cliente y ciclo.
- [x] FAL-02 — Mostrar agregado y desglose: ejemplo 10 = 6 actual + 4 próxima.
- [x] FAL-03 — Separar stock actual, requerido y comprometido con clientes.
- [x] FAL-04 — Separar faltante, ya pedido, pendiente de recibir y recibido.
- [x] FAL-05 — Descontar cobertura válida de órdenes existentes al sugerir
  nuevas compras, aun antes del ingreso físico a bodega.
- [x] FAL-06 — Una cantidad comprada no cubre dos necesidades/ciclos a la vez.
- [x] FAL-07 — Recepción parcial actualiza pendiente y cobertura sin contar
  dos veces el inventario ni ignorar conversiones de unidad del proveedor.
- [x] FAL-08 — Cancelación/cierre sin recepción libera solo la cobertura que
  corresponde y conserva el motivo/historial.


**Necesidades/cobertura `c8ecc37`, 2026-10-06:** FAL-01/03/04 comprobados. Consulta
por semana/producto con pedido/factura/cliente/parada/ciclo fijo, stock general
y demanda separada: requerido=compromiso facturado pendiente+pedido sin factura.
Facturar sustituye pedido; entregar reduce compromiso, no descontar stock otra
vez. Faltantes registrados se leen aparte; no fabricar faltantes desde pedidos
por facturar ni asignar stock general automáticamente a dos rutas. Productos
sin relación e históricos sin entrega se distinguen sin inventar vínculos/
pendientes. Cambio operativo/reimpresión requiere revisión y muestra totales
desconocidos, conservando subtotal verificado. Borrador e incierto separados
de solicitado confirmado, pendiente y recibido físicos; línea completa de
compra se cuenta una vez aunque cubra6+4. Final6 de10 conserva solicitado10,
pendiente0, recibido6/sin cobertura4; archivo24h conserva recepción/cobertura.
21 casos nuevos,79focalizados, **2.169pruebas/362suites**, fail0/skip0; grafo12,
build y Chromium1440/390.24productos/páginas, cantidades10=7+3, compras10/6/4,
incierto, próxima semana y2líneas sin relación, respuestas tardías/revisión
comprobados.21huellas iguales por consultas, reporte legado no consultado
de fondo. READ ONLY/REPEATABLE READ reales, permisos401/403/400. Sin esquema
nuevo:052 libre. **85/14 (99 IDs)**. Aplicación/relevo en informe de necesidades.
Datos sin relación/conteo/entrega histórica siguen requiriendo revisión manual;
no cerrar las casillas del usuario por tener esta vista.

## 6. Órdenes de compra persistentes

- [x] OC-01 — Guardar orden propia por proveedor y procedencia por ciclo.
- [x] OC-02 — Estados Borrador y Pendiente de enviar.
- [x] OC-03 — Estados Enviada, Parcialmente recibida, Recibida y Cerrada.
- [x] OC-04 — Crear/revisar cantidades y productos antes de enviar.
- [x] OC-05 — Facilitar envío por WhatsApp y guardar exactamente lo enviado.
- [x] OC-06 — Bloquear cambios de productos/cantidades tras enviar, también
  desde API; nuevas necesidades no se agregan automáticamente.
- [x] OC-07 — Proponer/crear orden nueva para faltantes posteriores.
- [x] OC-08 — Mostrar cantidades pendientes sin volver a comprarlas.
- [x] OC-09 — Manejar concurrencia, reintentos y envío incierto sin duplicar
  solicitudes ni afirmar que el proveedor recibió un mensaje no confirmado.
- [x] OC-10 — Mantener correspondencia entre documento WhatsApp y orden guardada.

Primera parte de órdenes (`004ba50`, 046): OC-01/02/04/07 implementados. Proveedor propio,
semana fija o Sin ciclo, líneas por producto propio y origen por factura.
Revisión con cantidades del proveedor/conversión conservadas; reserva por
faltante impide duplicar borradores. Nueva necesidad libre genera otra orden,
sin ampliar ninguna automáticamente. Pendiente bloquea líneas hasta volver
explícitamente a borrador. Cierre SIN envío requiere motivo, libera reservas
y conserva cantidades/procedencia en Historial de cierres. No es archivo 24 h.
Concurrencia, claves repetidas y revisión obsoleta verificados en copia propia.
Reserva no es solicitado ni pendiente de recibir: FAL-04/05/06/07/08 y
OC-03/05/06/08/09/10 siguen abiertos por envío/recepción; OC-09 está parcial
por incertidumbre del transporte aún pendiente. VAL-02 sigue abierto: el caso
10+3 comprobado aquí es de reservas, no de envío. Checklist vigente:
**48 listos / 51 pendientes (99 IDs)**. Evidencia en informe de esta parte.
2.032 pruebas, grafo 12, build y Chromium 1440/390 aprobados; 21 casos nuevos.
Compartida solo GET y 19 huellas iguales respecto al estado previo a integrar;
se conservaron acciones locales concurrentes de rutas/clientes (ver informe).
046 local con respaldo, cero órdenes nuevas/stock provisional intacto.

Segunda parte de órdenes (`a929ca9`, 047, 2026-10-06): OC-05/06/08/09/10, FAL-05/06
y VAL-02 comprobados. PDF/número/mensaje guardados e inmutables; descarga
autorizada y revisión explícita antes de enviar. Intento confirmado en DB
antes del transporte; reintentos consultan sin reenviar. Incertidumbre bloquea
la orden y conserva cobertura; confirmación manual exige verificación/motivo.
Enviada no admite cambios ni cierre sin recepción, también en SQL. Caso 10
enviadas + 3 nuevas conserva 10 y sugiere solo 3; próximo ciclo independiente.
Cantidad pendiente total de la línea y cobertura asignada por origen son
distintas: una caja sobrante no cubre otra ruta. Envío global retirado de UI
y rechazado por API (409), sin convertir sus históricos. FAL-04 sigue parcial
por cantidad recibida; OC-03 sigue parcial por recepción/cierre de enviada.
2.059 pruebas, grafo 12, build, Chromium 1440/390 y PDF nativo aprobados.
047 local con respaldo y 22 huellas idénticas; cero órdenes/copias/stock nuevo.
Validación y relevo en el informe de esta parte. No mensajes reales.

**Cierre enviado `ef464c3` /052, 2026-10-06:** FAL-08/OC-03 comprobados. Cierre
con revisión/confirmación/motivo, recibido conservado y pendiente liberado
por sus mismos orígenes; conserva pedido/PDF/envío/recepciones y stock/CxP.
UUID/cuerpo y concurrencia con recepción sin doble evento. Historial
inmediato con actor/hora, distinta regla del archivo24h de recibida.
2191 pruebas/362 suites fail0/skip0,138focalizadas; grafo12/build/
Chromium1440/390, respuesta perdida seguida del MISMO reintento comprobada.
**87/12 (99 IDs)**. Informe de cierre para aplicación/relevo local.

## 7. Factura del proveedor y recepción

- [x] REC-01 — Vincular factura electrónica del proveedor a la orden correcta.
- [x] REC-02 — Mostrar/abrir PDF dentro de la orden, con acceso autorizado.
- [x] REC-03 — Si falta el original, facilitar carga/recuperación y distinguir
  una representación del XML del PDF original del proveedor.
- [x] REC-04 — Comparar producto y cantidad pedidos contra facturados.
- [x] REC-05 — Registrar cantidad físicamente recibida separada de facturada.
- [x] REC-06 — Mostrar lo recibido conforme a la orden.
- [x] REC-07 — Mostrar faltantes y motivo; «agotado» solo si fue confirmado,
  sin adivinar la causa de una línea que no aparece.
- [x] REC-08 — Mostrar productos o cantidades facturados de más y su diferencia.
- [x] REC-09 — Recepción parcial conserva lo pendiente y permite otra recepción.
- [x] REC-10 — Recepción final registra fecha/hora y conserva auditoría.
- [x] REC-11 — Vinculación/recepción repetida no duplica compra ni entrada de stock.

**Parte de factura/PDF, 2026-10-06:** REC-01/02/03/04/08 cerrados con 048: vínculo
explícito del proveedor, revisión/version/firma, PDF adjuntado privado o
representación IDENTIFICADA de datos del buzón/compra, visor y comparación en
unidades propias. No recuperar ni afirmar XML histórico inexistente. Varias
facturas por orden; misma factura completa no suma en dos órdenes/ciclos.
Motivo sin confirmar para diferencias; agotamiento no inferido. Corrección con
motivo preserva snapshots/PDF e historia. REC-07/11 parciales: no hay registro
físico ni segunda entrada de stock; permanecen abiertos para recepción.
Código `f41ce85`, solo local: 2.081 pruebas/364 suites sin fallos/omitidas,
grafo 12, build, Chromium 1440/390 y PDF nativo aprobados. 048 local con
respaldo, dos tablas vacías y 23 huellas iguales; stock/conteos/movimientos cero.
Evidencia y limitaciones: [informe de esta parte](informes/facturas-ordenes-2026-10-06.md).


**Recepción física, `5396049` / 049, 2026-10-06:** REC-05/06/07/09/10/11 y FAL-07
comprobados. Cantidades nuevas por entrega en unidades propias; parcial conserva
pendiente y cobertura, final exige motivo confirmado para toda diferencia,
fecha del servidor y eventos inmutables con actor. «Agotado» solo por selección
y detalle explícitos; no deducido de factura o faltante. Reintento y dos
operadores no duplican compra ni stock. Compras NUEVAS registradas después del
vínculo aceptan finanzas/precios/CxP, pero stock entra según recibido. Las
anteriores conservan su entrada comercial y no se acreditan de nuevo; históricos
sin kardex propio no se importan como mercadería nueva. Conversión revisada,
delta físico y costo por partida; no aceptar mercadería sin compra revisada.
Final 6 de 10 conserva cobertura 6 y libera solo 4, sin resolver automáticamente
faltantes de clientes ni mezclar la semana próxima. FAL-04 sigue parcial por
vista completa de todos los conceptos/stock comprometido; OC-03 por cierre de
orden enviada. VAL-03 se cierra con la parte 050 abajo; VAL-04–07 validación
integral pendiente. Informe, pruebas y aplicación local:
[informe de recepción](informes/recepcion-ordenes-2026-10-06.md).
2.103 pruebas/364 suites sin fallos/omitidas, grafo 12, build y Chromium 1440/390
aprobados; 049 solo local con respaldo/32 huellas iguales y stock cero. Próxima 050: archivo 24 h
y retiro de limpieza semanal por código, luego carga/entregas. Sin push/producción.

## 8. Preparación, carga y entrega

- [x] ENT-01 — Mostrar clientes/pedidos en orden real de entrega del ciclo.
- [x] ENT-02 — Usar el orden en preparación y bodega.
- [x] ENT-03 — Sugerir orden de carga que deje el primer pedido más accesible.
- [x] ENT-04 — Mostrar ese contexto en Reporte Clientes y entregas.
- [x] ENT-05 — Agente/chofer puede abrir Maps y consultar la parada desde celular.
- [x] ENT-06 — Registrar avance de preparación/carga/entrega sin cerrar ni
  alterar el trabajo del siguiente ciclo.

**Consulta de carga/entregas `393ee66`, 2026-10-06:** ENT-01/03/04/05 comprobados.
Nuevo módulo Carga y Entregas, permiso propio. Semana explícita, recorrido y
Maps fijos, facturas emitidas/pedidos pendientes con origen/anticipado. Carga
inversa sobre toda la ruta, incluyendo paradas de otras páginas, únicamente
facturas con revisión de bodega. Pedido facturado se muestra una vez; Sin
ciclo no recibe ruta/Maps supuestos. Reporte Clientes conserva mismo contexto.
13 pruebas PostgreSQL + permiso; 2.125 pruebas/362 suites sin fallos/omitidas,
grafo12/build y Chromium1440/390. Ruta23, carga23→2→1, detalle entre páginas,
Maps original, dos semanas/otra ruta, anticipado y respuesta lenta comprobados.
READ ONLY/REPEATABLE READ reales y14 huellas iguales durante consultas propias.
Sin migración nueva ni escritura de negocio; aplicación local/relevo en informe.
79/20, 99 IDs. **ENT-06, PRE-08 y FIL-07** siguen pendientes por registro físico
con actor/fecha/reintentos y conservación tras revisión de documentos; tener
una consulta no equivale a confirmar carga/entrega real. Próxima SQL051.


**Registro físico `5c9e90a` / 051, 2026-10-06:** ENT-06/PRE-08/FIL-07 comprobados.
Carga nueva, entrega parcial/completa, descarga e incidencia por factura y
recorrido fijo, cantidades propias, actor/hora del servidor e historia
inmutable. Reintentar mismo UUID/cuerpo no duplica; dos operadores con igual
versión confirman solo uno. Cambios de factura/bodega/reimpresión requieren
revisión admin explícita con motivo y cantidades actuales verificadas; fotos
y productos anteriores conservados. Factura anulada/ciclo cerrado conservan
descarga del físico anterior. Preventa anticipada puede cargarse antes;
entrega exige promoción controlada de SU semana a Entrega. Próxima intacta.
No nueva venta/cobro/compra ni segundo movimiento de stock por marcar entrega.
23 casos nuevos, **2.148 pruebas/362 suites**, sin fallos/omitidas; grafo12,
build y Chromium1440/390. Respuesta perdida tras commit, reintento, parcial/
completa/incidencia/descarga/recarga, anticipado facturado una vez, dos semanas,
reimpresión y admin comprobados;20huellas comerciales iguales durante eventos.
READ ONLY/REPEATABLE READ y concurrencia PostgreSQL real. **82/17 (99 IDs)**;
validaciones integrales VAL-01/04–07 quedan para los pendientes de compras/
stock/propagación. Aplicación local y relevo en informe de registro físico.

## 9. Fin de limpieza semanal y archivo

- [x] ARC-01 — Retirar cron global del domingo a las 23:59 del arranque.
- [x] ARC-02 — Retirar los caminos de limpieza global equivalentes del botón/API.
- [x] ARC-03 — Tras recepción completa, ocultar orden de lista activa a las 24 h.
- [x] ARC-04 — Conservar orden, líneas, factura/PDF, comparación e historial.
- [x] ARC-05 — Vista de historial permite consultar la orden archivada.
- [x] ARC-06 — No archivar parciales ni reiniciar todas las rutas al cambiar
  la semana; verificar los límites de 24 h y fecha/hora de recepción.

**Decisión confirmada:** retirar de la lista activa y conservar historial.
No implementar borrado físico en sustitución de la antigua limpieza.

**Archivo individual `e8b1b67` / 050, 2026-10-06:** ARC-01–06 y VAL-03 comprobados.
Vista por hora PostgreSQL: solo recibida con final a las 24 h sale de Activas;
Historial mantiene estado/comparación/PDF/recepción y cobertura. Parciales
antiguas permanecen; fronteras exactas con microsegundos y UTC/CR verificadas.
Cron retirado del arranque; compatibilidad/API antigua 410 sin consulta,
botón/calls frontend retirados y corte del lunes eliminado. Nunca ejecutar
limpieza anterior. Navegador confirma transición automática en lista abierta,
PDF posterior, historia filtrada y mantenimiento sin botón; 1440/390 sin
fallos. 2.111 pruebas/362 suites, sin fallos ni omitidas; grafo 12 y build.
75/24, 99 IDs. Evidencia/aplicación local en informe archivo; cierre de enviada,
carga/entrega y comprobaciones integrales VAL-04–07 siguen pendientes.

## 10. Validación y entregas por partes

- [x] VAL-01 — Pruebas de separación: misma ruta en semanas distintas, actual
  y próxima simultáneas, y cliente que cambia de ruta.
- [x] VAL-02 — Caso de compra: 10 enviadas, aparece nuevo faltante 3; orden
  anterior sigue en 10 y nueva sugerencia solo cubre las 3 sin cobertura.
- [x] VAL-03 — Pruebas de recepción parcial/final, exceso facturado y archivo 24 h.
- [ ] VAL-04 — Pruebas de permisos, reintentos/concurrencia y unidades.
- [ ] VAL-05 — Verificar flujo en navegador escritorio/celular y build.
- [ ] VAL-06 — Migraciones/pruebas que escriben en base desechable propia;
  aplicar a copia local con respaldo y comparación cuando cada parte pase.
- [ ] VAL-07 — Comprobar que inventario provisional cero e históricos se
  conservan; no importar stock previo ni enviar mensajes reales para probar.
- [ ] VAL-08 — Revisión manual del usuario del flujo completo.

**Cadena integral, 2026-10-06:** RUT-08 y VAL-01 comprobados con los servicios
reales: portal/agente → factura → bodega/faltantes → orden/PDF → compra →
recepción → carga/entrega. Misma ruta en dos semanas y un histórico Sin ciclo;
mover/renombrar cliente/ruta, cambiar Maps y cerrar/promover conserva los
documentos anteriores. Recepción posterior acredita solo 6 nuevas en la orden
original que ya tenía 4; cierre conserva recibido y libera su propio pendiente.
Carga anticipada continúa en su semana, entrega exige promover y reintentos no
duplican eventos ni stock. PDF y fotografías originales permanecen idénticos.
Nueve casos nuevos PostgreSQL con ROLLBACK, **2.237 pruebas/362 suites**, sin
fallos ni omitidas; grafo 12, build y Chromium 1440/390 aprobados: 11 vistas,
22 capturas, 17 huellas conservadas en las lecturas, sin escrituras HTTP ni
reporte legado de fondo. Sin cambios de servicios ni SQL nueva; 053 libre.
**92 listos / 7 pendientes (99 IDs)**. Evidencia y aplicación local en
[informe de la cadena](informes/contexto-cadena-2026-10-06.md).
VAL-04–07 conservan la verificación global; probar estos escenarios no completa
su matriz de permisos/concurrencia/unidades ni las revisiones del usuario.
Los pendientes citados en las etapas anteriores son históricos.

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
