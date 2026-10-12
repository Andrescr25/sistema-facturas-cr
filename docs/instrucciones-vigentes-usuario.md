# Instrucciones vigentes del usuario

Consolidado el **2026-10-05**, a pedido de José Andrés: «Guarda en memoria
todas las instrucciones que te di, para ir tachándolas e ir poco a poco».
Este archivo conserva las decisiones; los checklists conservan su ejecución.
Una petición documentada no significa que ya esté implementada.

## Continuidad y forma de trabajar

1. Leer la documentación, la memoria local de Claude y el grafo para retomar
   el punto real del trabajo, sin repetir partes terminadas. Si falta acceso
   a una parte del progreso, decirlo claramente.
2. Consultar el checklist antes de elegir la siguiente tarea. Avanzar por
   partes y tachar cada punto cuando su resultado esté comprobado.
3. Revisar commits, `git status` y worktrees antes de empezar e integrar.
   El usuario pidió averiguar así qué hace Claude, sin pedirle que reparta
   las tareas. Si vuelve otro agente, no tocar sus cambios ni procesos.
4. Actualizar memoria, grafo y checklist al cerrar cada parte. Los comentarios
   deben explicar claramente el porqué de las reglas para que cualquier
   modelo pueda continuar.
5. Dar informes claros de lo listo, lo pendiente, lo verificado y el siguiente
   paso. Conservar evidencia en el repositorio y datos privados fuera de él.
6. El usuario autorizó continuar con el trabajo descrito; no repetir pedidos
   de autorización ya resueltos. Las decisiones nuevas y los datos reales
   faltantes se distinguen de esa autorización.
7. Trabajar en `independencia-alegra`, siguiendo [AGENTS.md](../AGENTS.md) y
   [CLAUDE.md](../CLAUDE.md). La copia `sistema-facturas-cr` usa producción;
   un worktree separado no separa por sí solo la base de datos.

**Alcance reiterado expresamente por el usuario el 2026-10-05:** «esto lo
vamos hacer en la rama de migracio-alegra; developer y main, no los tocamos;
la db tampoco, todo esto será local». En este repositorio la rama de esa
migración se llama `independencia-alegra`. Para este trabajo no cambiar
`developer`/`main`, no conectar con la base de producción ni hacer el corte.
Implementación y pruebas únicamente en copias locales; la base desechable
del nuevo flujo se obtuvo de la copia local, no de producción.

**Orden de lectura para el relevo:** este archivo →
[checklist operativo](checklist-rutas-ciclos-operativos.md) →
[plan operativo](plan-rutas-ciclos-operativos.md) →
[grafo](grafo/README.md) y código del módulo elegido. Los pendientes anteriores
siguen en [checklist de independencia](checklist-independencia-alegra.md).

## Decisiones anteriores que siguen vigentes

- **Inventario y auditorías desde cero.** El físico está desordenado: iniciar
  las existencias y el trabajo activo nuevo en cero provisional, sin migrar
  stock, auditorías, descuentos ni regalos activos del sistema anterior.
  Conservar el histórico. El inventario completo real se hace al salir a
  producción; cero provisional no equivale a mercadería contada.
- **Revisiones y correcciones manuales:** las realiza el usuario. No inventar
  datos de clientes/productos ni cerrar casillas que necesitan su revisión.
- **Datos demo del Reporte Proveedores:** el usuario los revisó y pidió
  eliminarlos; ya se retiraron. No volver a insertarlos sin otro pedido.
- **Hacienda:** la exclusión nocturna quedó reemplazada por la autorización
  posterior de planificar e implementar la integración completa. Mantenerla
  en carpetas propias dentro del mismo proyecto para facilitar mantenimiento,
  escala y actualización. Consultar la versión oficial vigente al cambiar
  la integración; el estado documentado actual es 4.4. El frontend de
  Configuración debe permitir cargar .p12, PIN y credenciales por ambiente.
  La implementación existe; aceptación real, datos ciertos y corte siguen
  pendientes. Ver [plan Hacienda](plan-integracion-hacienda.md).
- **Producción:** la implementación local no es un corte. Mantener separados
  desarrollo, verificaciones con dobles, recepción real y puesta en marcha.
- **Seguridad del relevo:** no guardar claves/certificados/credenciales en
  memoria o Git. No ejecutar la limpieza semanal para probar ni enviar
  mensajes reales de prueba. Preservar archivos fiscales y respaldos.

## Prioridad actual — 2026-10-07

**Actualización 2026-10-11:** el usuario confirmó que ya se pasó a producción.
La separación histórica de migración/corte descrita arriba corresponde al
trabajo anterior. Ahora solicita mejorar la navegación del **catálogo del
agente**: introducción visual breve por categoría, nombre e imagen, productos
inmediatamente debajo; moderna, mínima, rápida en móvil con miles de fichas,
lazy loading y animaciones ligeras que no bloqueen el scroll. La imagen debe
asignarse en **Gestión de Catálogo junto a donde se edita el nombre**.
Preparación en worktree propio y base desechable; `main` requiere autorización
específica nueva. Facturación/Hacienda quedan a cargo de Claude.
[Implementación inicial](informes/catalogo-categorias-visuales-2026-10-11.md).

Después de revisar localhost pidió subcategorías visibles y entradas de objetos
al hacer scroll «tipo Apple». Se refuerzan categorías y fichas, con navegación
y títulos de familia, preservando filas completas, orden y fluidez móvil.
[Refinamiento y comprobaciones](informes/catalogo-revelado-subcategorias-2026-10-11.md).
Mantener la vista solicitada en 5173/3000 y su clon local; los otros servicios
se detuvieron por pedido del usuario para reducir consumo. Esta corrección
sigue en revisión local antes de una autorización nueva para `main`.

Después de consultar los pendientes de migración, el usuario indicó «esto lo
vemos después» y pidió «ahora, rediseña el módulo de clientes; siento que está
muy desordenado». Clientes quedó reorganizado. Después pidió **rediseñar el
Reporte de Proveedores** porque las nuevas funciones quedaron desordenadas,
**manteniendo el diseño del sistema y reciclando código**. Ambos rediseños
quedaron integrados localmente, conservando funciones y ruta/ciclo. Mientras
configura Hacienda, pidió mejorar el **catálogo del agente**, especialmente
«Cliente nuevo»: llenar las filas dentro de cada categoría, mantener familias
contiguas e identificadas en las tarjetas y separar solo al cambiar de
categoría. Mantener recomendaciones, promociones y el diseño de tablet.
Después autorizó **llevar este ajuste visual del catálogo directamente a
`main`**. Esa autorización es específica: no incluye otros cambios de la
migración, la base de producción ni modificar su configuración de Hacienda.
La migración total y el corte
quedan aplazados; no interpretar el rediseño como aceptación visual final,
recuperación de Maps ni autorización para tocar producción.

Respetar la preferencia de diseño anterior: tarjetas grandes y legibles,
título simple y recorrido lista → ficha, con secciones de encabezado neutro.
Resultados y verificaciones en el
[informe de Clientes](informes/clientes-redisenados-2026-10-07.md) y el
[informe de Proveedores](informes/proveedores-redisenados-2026-10-07.md).
Catálogo: [informe y comprobaciones](informes/catalogo-agente-sin-huecos-2026-10-07.md).
Después pidió **otro cambio del catálogo agente**: ofertas mezcladas con los
productos de su categoría/familia, sin sección superior de ofertas, y tarjeta
de oferta más llamativa. En Cliente nuevo, Todo reúne las recomendaciones por
familia; las cuatro selecciones anteriores quedan como filtros. En catálogo
general, búsqueda e historial la promoción viaja con la ficha. Conservar
precios/precedencia de liquidación, filas completas y rótulos de subcategoría.
[Informe de esta ampliación](informes/catalogo-ofertas-familias-2026-10-07.md).

**Autorización específica, 2026-10-08:** publicar en `main` la corrección de
Impresión que aplica precios y faltantes confirmados del Reporte de Clientes,
y adaptarla a `independencia-alegra` respetando su lógica distinta. El ejemplo
confirmado es 6 unidades facturadas y 3 faltantes: quedan 3. Esa autorización
no adelanta el corte ni autoriza pruebas con la base de producción. La
adaptación usa factura, productos e inventario propios y se prueba en una
copia local desechable; ver [Faltantes](grafo/modulo/faltantes.md).
El ajuste anterior de filas se publicó en main (`cfddb83`); este segundo
pedido se realiza en la rama local. No ampliar su autorización específica
de publicación a otros cambios ni modificar Hacienda mientras la configura.
Reutilizar la navegación y los componentes de tarjetas, botones y estados;
separar los pasos de una orden sin perder lo escrito al navegar. La aceptación
visual de ambas pantallas sigue al usuario, sin cerrar CLI-10/VAL-08 por este trabajo.

## Operación solicitada: clientes, rutas, pedidos y compras

**Flujo actual de referencia:** lunes y martes preventa presencial; martes
empieza el empaque; miércoles y jueves compras de faltantes; jueves y viernes
entregas. La mejora debe reducir tiempos, duplicaciones y mezcla de rutas o
semanas, permitiendo adelantar trabajo de la siguiente ruta.

1. **Cliente y ruta:** cada cliente debe tener ruta, orden manual y ubicación
   de Google Maps. Evaluar día habitual de visita/entrega si ayuda a la lógica.
   Aprovechar y conservar ubicaciones ya guardadas.
2. **Ciclo de ruta fechado:** relacionar pedido, faltante y orden de compra
   con una ejecución concreta, por ejemplo `Ruta 1 · semana 12/10/2026`.
   La ruta sola no distingue el trabajo de semanas diferentes.
3. **Dos horizontes:** mantener separadas la ruta actual en preparación/
   entrega y la próxima en preventa anticipada. Promover la próxima mediante
   acción controlada o automatización explícita; no mezclar ni reasignar
   pedidos históricos al cambiar la semana.
4. **Preventa anticipada:** mientras se visita una ruta, facilitar el envío
   de catálogos personalizados a los clientes de la próxima. Permitir sus
   pedidos en línea para preparar y llevarlos al visitarlos la semana siguiente.
   El agente puede tomar pedidos adicionales en esa visita.
   **Adición expresa del usuario:** enviar también un PDF del catálogo junto
   al enlace, para clientes que prefieren revisarlo y pedir por WhatsApp.
   **El PDF debe contener las fotos de los productos.** El usuario pidió
   además un ejemplo con datos reales en Descargas de su computadora.
   Después de revisarlo pidió quitar del PDF el bloque «Para pedir por
   WhatsApp, respondé al mensaje…». Mantener esas indicaciones en el mensaje
   de envío y dejar el PDF sin ese bloque.
   **Nueva ampliación visual:** ordenar el PDF por categorías y subcategorías;
   incluir todas las rebajas vigentes y liquidaciones activas junto a los
   demás productos, con etiquetas «Oferta» y «Liquidación», sin apartarlas
   ni duplicarlas. Fotos más grandes, dos tarjetas por fila con información
   debajo. El mensaje predeterminado debe decir explícitamente que es un
   CATÁLOGO DE PRODUCTOS en PDF.
   **Corrección de paginación, 05/10/2026:** máximo cuatro productos por
   página, en dos columnas y dos filas. Completar los espacios aunque cambie
   la categoría o subcategoría; conservar ambos títulos sobre cada ficha.
   No empezar filas/hojas nuevas para separar grupos. Solo la última página
   puede quedar con menos de cuatro productos.
   Preparar/descargar el PDF por cliente/ciclo, adjuntarlo en el envío y
   permitir ese flujo sin obligar a crear cuenta en el portal. La invitación
   sigue disponible para quien elija pedir en línea; no interpretar una
   respuesta por WhatsApp como pedido registrado automáticamente.
5. **Clientes reorganizados:** separar información general, contacto, ruta,
   orden de visita, ubicación, historial de pedidos, facturas pendientes,
   pedidos en línea, notas y estado. Incluir una vista de Rutas para ordenar
   clientes, idealmente arrastrando y soltando.
6. **Maps móvil:** botón «Ver ubicación» que abra directamente Google Maps,
   disponible a usuarios con permiso de clientes/rutas. Debe ser fácil de
   tocar desde el teléfono para agente y chofer.
7. **Ruta/ciclo en toda la operación:** organizar y filtrar clientes, pedidos,
   preventa, reporte de clientes, reporte de proveedores, preparación,
   entregas y faltantes. Mostrar siempre ruta, semana y origen del trabajo.
8. **Entrega y carga:** mostrar clientes en su orden real de entrega en
   preparación, bodega, carga, reporte de clientes y entregas. Sugerir la
   carga que deje más accesible el pedido del primer cliente a entregar.
9. **Faltantes trazables:** cada necesidad debe mostrar su pedido/factura,
   cliente, ruta y ciclo. Ejemplo: de 10 unidades, 6 para la ruta actual y
   4 para la próxima. No agruparlas ocultando de dónde salen.
10. **Órdenes de compra propias:** estados claros: Borrador, Pendiente de
    enviar, Enviada, Parcialmente recibida, Recibida y Cerrada.
11. **Inmutabilidad tras envío:** una orden enviada al proveedor por WhatsApp
    queda bloqueada. Si luego faltan otras 3 unidades del mismo producto,
    deben ir a otra orden nueva o propuesta, sin modificar las 10 enviadas.
12. **Evitar compra duplicada:** reconocer lo solicitado aunque aún no esté
    físicamente en bodega. Separar stock actual, requerido, comprometido con
    clientes, faltante, ya pedido, pendiente de recibir y recibido realmente.
    Lo que ya cubre una orden no se vuelve a sugerir como compra nueva.
13. **Factura electrónica del proveedor:** mostrar su PDF dentro de la orden
    de compra y comparar lo pedido, lo facturado y lo recibido. Identificar
    productos correctos, faltantes por agotamiento declarado y productos o
    cantidades facturados de más. Una factura no confirma recepción física.
14. **Eliminar el reinicio semanal:** retirar la limpieza global del domingo
    a las 23:59. Las rutas/ciclos conservan su trabajo sin reinicios globales.
15. **Órdenes recibidas: archivo a las 24 horas.** El usuario aclaró
    expresamente: **«Retirar de la lista activa y conservar historial»**.
    Contar desde la recepción completa de esa orden; conservar historial,
    factura y comparación. No borrar documentos ni archivar recepciones
    parciales como si estuvieran completas.

**Objetivo:** Cliente → Ruta → Ciclo → Preventa → Pedido → Bodega → Faltante
→ Compra al proveedor → Recepción → Carga → Entrega, con trazabilidad y sin
duplicar compras ni perder información entre semanas.

## Punto real de continuación

Primera entrega: rutas/ciclos y ficha implementados; segunda: pedidos y
facturas conservan su ciclo (044/045 aplicadas solo LOCAL con respaldo).
Tercera: enlaces personalizados desde el recorrido de preventa, invitación
explícita para clientes sin acceso, copia y revisión/envío por WhatsApp.
El enlace conserva cliente y semana; exige sesión propia, no permite abrir
cuentas ajenas y se comprueba de nuevo al enviar. No necesita migración nueva.
[Informe vigente](informes/preventa-enlaces-2026-10-05.md).

El trabajo sigue exclusivamente local, con una base desechable para pruebas.
Inventario cero provisional, históricos sin ciclo, sin datos inventados en la
base habitual. Lo ya implementado no se vuelve a abrir: el checklist de
independencia conserva 133 hechos / 14 abiertos, incluidos aceptación REAL de
Hacienda y corte. El operativo se cuenta por separado.

Continuidad al 2026-10-06: catálogo de cuatro productos por hoja, rutas/ciclos,
pedidos, bodega/reportes, órdenes con PDF/envío inmutable, vínculo/PDF privado
y comparación solicitada/facturada ya implementados. Recepción física 049:
parcial/final, cantidades propias, motivos confirmados, auditoría y kardex
idempotente, sin confundir aceptación financiera con entrega. Operativo
**88/11** (99 IDs): recepción (049) y
[archivo individual](informes/archivo-ordenes-2026-10-06.md) (050) comprobados.
Compras nuevas registradas después del vínculo esperan entrega física para
stock; compras anteriores mantienen su tratamiento comercial sin nueva entrada.
Históricos sin kardex propio no se importan como stock por recibirlos.
Retiro semanal y archivo 24 h comprobados: Historial conserva documentos/
cobertura; parciales activas. Consulta de carga/entregas, recorrido fijo/Maps
y carga inversa comprobados: [informe](informes/carga-entregas-2026-10-06.md).
Registro físico051 comprobado: carga/entrega parcial/completa, descarga,
incidencias, actor/hora y reintentos sin duplicar. Revisión admin con motivo
conserva fotos/productos tras reimpresión; la próxima semana no se altera.
[Informe de registro](informes/registro-entregas-2026-10-06.md). Vista de
[necesidades/cobertura](informes/necesidades-cobertura-2026-10-06.md) comprobada:
stock general, requerido/comprometido, faltantes, compras/recepción y origen
por semana, sin volver a restar stock ni duplicar pedido/factura. Cierre de enviada052:
confirmación/motivo, físico conservado y pendiente liberado, sin cambiar
PDF/stock/CxP; [informe](informes/cierre-ordenes-2026-10-06.md). Exportaciones completas
con filtros/procedencia y todas las páginas comprobadas: [informe](informes/exportaciones-ciclos-2026-10-06.md). Siguiente:
revisión global de pantallas/contexto/históricos y validación integral. Mantener lanzador seguro para salidas
de otros módulos; nunca ejecutar código de limpieza antigua. Factura con varias órdenes aún necesita
asignación explícita por línea/cantidad, sin contarla completa dos veces.


## Etapa previa de ejecución — contexto visible, 2026-10-06

Código9fc8d8e sólo local: FIL-09 cerrado, **89 listos/10 pendientes (99 IDs)**.
Pedidos/reportes/notas descartan selecciones anteriores y respuestas tardías;
Bodega conserva copia/drafts y ficha muestra el contexto original. Quince
vistas/30capturas1440/390,2.213pruebas/362suites/grafo12/build;36+9huellas
idénticas y stock0. Sin SQL nueva:053 libre. Memoria conserva las15decisiones
originales; esta sección registra implementación, no las sustituye.
[Informe vigente](informes/contexto-operativo-2026-10-06.md).
RUT-08/FIL-11, fuente LOCAL Maps RUT-03 e integral siguen pendientes;
CLI-10/VAL-08 del usuario. No cerrar esos IDs por esta revisión de pantallas.
Independencia133/14 permanece separada y no acredita aceptación real/corte.


## Etapa previa de ejecución — recorrido visual, 2026-10-07

VAL-05 cerrado, operativo **94 listos/5 pendientes (99 IDs)**; independencia
**133/14 (147 IDs)** separada. Flujo real de UI en escritorio/celular y build,
catálogo→pedido anticipado→factura→bodega→compra separada→recepción→entrega→
archivo. Correcciones de asignación por ciclo, GET filtrado sin asignaciones
y respuesta tardía conservando la edición. Informe recorrido-visual-2026-10-07;
grafo modulo/recorrido-visual-operativo.2.263 pruebas/363 suites/grafo12/build.
Sin SQL nueva:053 libre. Solo local; pruebas escriben exclusivamente al clon
propio y documentos se envían a un doble sin red. Nunca limpieza semanal.
Sigue VAL-06/07 global; RUT-03 Maps LOCAL, CLI-10/VAL-08 del usuario pendientes.
Las quince decisiones originales se conservan; no volver a pedirlas ni
acreditar Hacienda/producción/conteo por esta validación.


## Relevo vigente de ejecución — auditoría global local, 2026-10-07

VAL-06/07 cerrados: operativo **96 listos / 3 pendientes (99 IDs)**.
Independencia **133/14 (147 IDs)** separada. Reconstrucción local 043→052,
93 tablas anteriores conservadas, fallo/rollback y rechazo de segunda
aplicación comprobados. 2.270 pruebas/363 suites sin fallos ni omitidas;
grafo 12/build. Auditoría habitual READ ONLY: 106 tablas/80 secuencias idénticas,
stock/conteo/apertura cero e históricos conservados; 2.023 fotos idénticas.
[Informe vigente](informes/auditoria-local-2026-10-07.md) y
[módulo del grafo](grafo/modulo/auditoria-operacion-local.md).
Sin SQL nueva: 053 libre, servicios habituales conservados, sin salidas reales.
Sigue RUT-03 para hallar Maps anteriores exclusivamente en una fuente LOCAL;
CLI-10/VAL-08 del usuario. Las quince decisiones anteriores siguen vigentes.
No convertir esta auditoría de rutas en aceptación fiscal/conteo físico/corte
ni ejecutar los ensayos de importación contra producción.


## Continuidad de datos — búsqueda Maps local, 2026-10-07

Sin cambiar decisiones ni cerrar RUT-03: base local106 tablas/247 clientes,
tres dumps locales, respaldo tar y dos JSON de ventas no permitieron hallar
la fuente anterior. [Informe](informes/busqueda-maps-local-2026-10-07.md) y
[bloqueo](grafo/bloqueo/maps-anteriores-sin-fuente-local.md). Operativo96/3
e independencia133/14 conservados. El usuario debe identificar la procedencia
cuando esté disponible; no consultar producción ni fabricar enlaces.


## Decisión de corte — mismo repositorio, 2026-10-08

El usuario confirmó: el sistema propio queda en este mismo repositorio y,
cuando llegue el momento, todo `independencia-alegra` pasa a `main` para
dejar de usar Alegra. Está solicitando el acceso a Hacienda para terminar
esa configuración; cargar credenciales y obtener la aceptación real siguen
siendo suyos. Esto NO autoriza todavía la fusión ni el corte.

Revisión de la rama ese día, sin tocar la base compartida: suite, pruebas
con PostgreSQL sobre copia desechable, grafo y build sin fallos. Los
requisitos del servidor que faltaban quedaron en
[el plan de corte](plan-corte-independencia.md) y en la sección 15 del
[checklist](checklist-independencia-alegra.md). Operativo **96/3** sin
cambio; independencia pasa a **133/18** por esos cuatro pendientes nuevos.
Falta que el usuario confirme si producción sigue en Render + Supabase.

## 2026-10-11 — Asignar clientes desde la ruta

El usuario va a poner a un empleado que se sabe las rutas a asignarlas, y
pidió, textual: «quiero que dentro de rutas, si yo toco una ruta y le doy
asignar clientes NO me redirija al portal de clientes sino que me traiga una
lista de esos clientes donde puedo darle click y poner un check para
asignarlo, para que sea más rápido asignarle a cada cliente su ruta y
demás… apegate al diseño».

**Hecho** el mismo día: [el nodo de rutas](grafo/modulo/rutas-clientes.md),
sección "Asignar clientes desde la ruta". Decisión de Claude, a revisar por
él si no le sirve: los toques se guardan juntos con un botón al final, no
uno por uno (el porqué está en ese nodo). Del «y demás» solo se hizo la
ruta: día de visita, día de entrega y ubicación Maps se siguen poniendo en
la ficha de cada cliente; falta que diga si también los quiere en lote.

## 2026-10-11 — Emitir electrónicamente con un clic

Textual: «ocupo que con solo darle a este botón ya se emita electrónicamente
y no me abra el modal de antes, sino que con solo darle click. Además
necesito que en la misma factura, cuando le doy al botón, me indique qué va
pasando, si se envió, o si la aceptó Hacienda. Además que esta factura se le
tiene que enviar al cliente por correo el pdf con los 2 XML».

**Hecho** el mismo día: [el nodo de Hacienda](grafo/modulo/hacienda.md),
sección "UN CLIC EMITE", y [el del correo](grafo/modulo/correo-facturas.md).

Decisiones de Claude para que el clic no pregunte, a revisar por él:

- va a **producción** si ese ambiente está habilitado, y si no a pruebas (el
  botón lleva la marca "Pruebas" cuando es así);
- **factura electrónica** si el cliente tiene identificación, **tiquete** si
  no;
- el correo sale **solo en producción**, una vez, al correo de la **ficha**
  del cliente; si no tiene, la factura lo dice y se manda después con un
  botón;
- una factura **con descuento** no sale sin que alguien elija el motivo
  (regalía, comercial, volumen…): Hacienda lo exige y no se adivina. Se pide
  dentro de la misma factura. Si siempre es el mismo motivo, falta que lo
  diga para dejarlo fijo.

Contestó esa misma noche, textual: «si, los descuentos dejalos así y empieza
la factura electrónica con 2481».

- **Descuentos:** quedan como están: la factura con descuento pide el motivo
  en la misma factura. No volver a proponer dejarlo fijo.
- **Numeración:** la factura electrónica sigue desde el **2481**. Para
  entonces la primera real ya había salido con el 4947 (14:19 de ese día).
  Hecho: [nodo de Hacienda](grafo/modulo/hacienda.md), "LA NUMERACIÓN LA
  DECIDE EL DUEÑO". El número se pone desde Configuración → Hacienda →
  Numeración; **falta que él lo ponga en producción**.

## 2026-10-11 — Medio de pago al emitir y seguimiento de la nota de crédito

Textual: «cuando quiero emitir me sale este mensaje: Medio de pago: falta un
dato fiscal válido. Pero la factura dice que es de contado». Y: «haz bien el
seguimiento de la nota de crédito, esta no se sabe bien si se aplicó, si
anuló el documento o qué pasó… también que indique si la nota de crédito es
aplicada a una factura electrónica o una de venta normal. Lo que me pasó
antes fue que apliqué la nota de crédito y no avisó nada y solo me salió la
factura como pagada».

**Hecho** el mismo día: [Hacienda](grafo/modulo/hacienda.md), "EL MEDIO DE
PAGO" y "LA NOTA DE CRÉDITO, DE UN CLIC", y
[Facturación](grafo/modulo/facturacion.md), "LA NOTA DE CRÉDITO CUENTA QUÉ
HIZO".

Decisiones de Claude, a revisar por él:

- en una venta de **contado sin cobrar**, la factura pregunta con qué paga el
  cliente al emitir (no se asume efectivo); a **crédito** sale sin ese dato;
- al emitir una **nota de crédito** se pregunta qué hace (anula, devolución,
  corrige el monto…): no se deduce del motivo con que se creó;
- una factura acreditada entera dice **«Anulada con nota de crédito»**, no
  "Pagada".

Sin hacer, por si los pide: anular una nota desde la pantalla y mandarle la
nota electrónica al cliente por correo.

## 2026-10-11 — "Emitidas" en dos pestañas

Textual: «ocupo que el tab que dice "emitidas" se divida mejor en 2 tabs que
diga Facturas de venta y Facturas electrónicas para que no me salgan ambas en
emitidas».

**Hecho**: [Facturación](grafo/modulo/facturacion.md), "EMITIDAS SON DOS
LISTAS". Electrónica = aceptada por Hacienda (factura o tiquete). "Anuladas"
y "Todas" siguen mezclando las dos; falta que diga si también las quiere
partidas.

Después, textual: «y quita el tab que dice con saldo, porque eso lo veo en
cuentas por cobrar entonces no es necesario». **Hecho**: la pestaña se quitó
y la pantalla abre en "Facturas de venta". No volver a ponerla.

## 2026-10-11 — Solo dos ramas: developer y main

Textual: «la rama independencia alegra la podemos borrar y ya dejar solo
developer y main».

**Hecho**: se borró `independencia-alegra` local y en GitHub (estaba en el
mismo commit que `developer`: no se perdió nada). [CLAUDE.md](../CLAUDE.md) y
[AGENTS.md](../AGENTS.md) ya lo dicen.

Se le preguntó por la carpeta `sistema-facturas-cr-independencia` y contestó
que sí, que se quitara. **Hecho** ese mismo día, sin perder nada: su
configuración aislada, las fotos y los archivos de la base local se mudaron a
`~/.local/share/sistema-facturas-cr/entorno-aislado/`, y las dependencias de
Hacienda —que la carpeta principal y las de trabajo tomaban de ahí por un
enlace— quedaron como copia real en la carpeta principal.

