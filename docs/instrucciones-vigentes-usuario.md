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

## Corrección prioritaria — 2026-10-14

**Rotación de productos, decisión inicial del día:** el usuario aclara que
la rotación mensual en **Rentabilidad** debe ser la media de unidades
vendidas por mes. Confirma usar los **últimos 3 meses completos**: sumar las
ventas de esos tres meses y dividir entre tres, contando los meses sin
ventas como cero. Excluir el mes en curso, que aún no es comparable con un
mes cerrado. La tarjeta y el detalle deben explicar ese período.

**Alcance y publicación posteriores:** «ok, subelo al main» y consulta si
se muestra en Rentabilidad y Gestión de Catálogo. Ambos campos mensuales
deben usar el mismo promedio de tres meses completos, también en la búsqueda
global y por categoría. Conservar decimales y mostrar cero sin ventas. La
autorización incluye publicar el conjunto verificado a main.

**Regla vigente tras el caso del bombillo, mismo día:** el usuario compró
70 unidades y se agotaron en menos de un mes. Inspección autorizada sólo en
lectura:74 vendidas en30 días; el16,33 correspondía a49/3 en los meses
cerrados. El usuario elige explícitamente **«Rotación = unidades vendidas
en los últimos 30 días»** en Rentabilidad y Gestión de Catálogo. Sustituye
la regla anterior de tres meses completos para estos campos. Incluir hoy
y los29 días anteriores, excluir fechas futuras y mostrar cero sin ventas.
Las compras se revisan como evidencia; no se suman como ventas.

Reporte Proveedores conserva solo Faltantes y fichas. Excluir facturas listas
de Reporte Clientes y procedencia falsa. Nuevos faltantes Sin enviar arriba;
cada orden enviada abajo, tachada y con su fotografía conservada. El detalle
ya es la revisión: solo enviar PDF a WhatsApp con mensaje predeterminado,
sin preparar órdenes ni otro modal. Cuando la factura electrónica pase por
Revisión de precios, indicar mínimamente qué productos fueron facturados y
cuáles no. Si no hay referencia de orden: vincular automáticamente solo con
una candidata; varias requieren elegir en Revisión de precios (confirmado
por el usuario). Quitar rotación/próxima visita de cards de Reporte Clientes;
son información de Preventa. Esta decisión sustituye los pasos adicionales
de órdenes de entregas anteriores. [Implementación y evidencia](informes/proveedores-correccion-2026-10-14.md).

**Cantidades, confirmación del 2026-10-14:** «No, mantener cantidades enteras.»
Guardar, editar y agregar manualmente aceptan enteros; cero permite excluir.
No truncar una fracción escrita. Los saldos calculados por una conversión
siguen exactos y la compra se convierte a unidades enteras del proveedor.
Una edición pertenece a los faltantes revisados, no se arrastra a la siguiente
factura al actualizar la pantalla. Varias facturas parciales pueden completar
la misma orden enviada; una parcial anterior y otra nueva requieren elegir.

**Ajuste posterior del 2026-10-14:** el botón «Enviar PDF a WhatsApp» ahora
debe abrir un modal con el número de destino y el mensaje predeterminado,
antes de confirmar el envío. Sustituye únicamente el envío inmediato; no
reintroduce la lista de órdenes ni la segunda revisión de productos.
Restaurar el formato comercial de PDF que ya estaba: código, descripción,
factor y cantidad del proveedor (el factor lo pidió quitar el 2026-10-20,
ver más abajo). Conservar las cantidades/snapshots y los
PDF históricos; un cambio de lógica no autoriza cambiar su diseño.

**Mensaje predeterminado, ajuste posterior del mismo día:** usar únicamente
«Hola buenas, adjunto pedido» y en la siguiente línea «gracias». Sin agregar
referencia ni indicaciones al texto; la orden sigue identificada en su PDF.

**Teléfonos, ajuste posterior del mismo día:** registrar varios números de
WhatsApp en la ficha del mismo proveedor, y permitir elegir o cambiar el
número en el modal de envío. Otro número escrito corresponde a ese pedido;
los contactos permanentes se gestionan en la ficha. Con varios contactos se
elige uno explícitamente. El número revisado se conserva al confirmar y en
reintentos; elegir otro prepara una copia nueva antes de enviar.

**Rendimiento, solicitud posterior del mismo día:** optimizar consultas de
asignación de productos y carga de números. Probar/publicar primero sólo en
developer, sin enviar este cambio a main. El usuario permite inspeccionar la
base de producción únicamente en lectura; pruebas de escritura en copias
locales. Esta restricción de destino sustituye la autorización anterior de
publicar directamente a main para esta optimización.

**Publicación posterior, mismo día:** «perfecto, mandalo a main». Autoriza
publicar la optimización ya verificada en developer y sustituye la restricción
anterior de destino. No necesita SQL nuevo; se conservan las pruebas locales
y la inspección exclusivamente de lectura en producción.

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

**Solicitud 2026-10-13 — Reporte Proveedores:** simplificar faltantes y órdenes.
Buscar una orden abierta del proveedor; acumular solo en borrador/pendiente.
Enviada es una fotografía inmutable; un faltante posterior crea otra orden.
Mostrar por proveedor faltantes/cantidades actuales, pendientes/enviadas, fecha
y estado. Implementación y comprobaciones locales en
[informe de órdenes automáticas](informes/ordenes-automaticas-proveedores-2026-10-13.md).
Conservar contexto fijo de ruta/semana, revisión del PDF y protecciones de envío.

**Corrección solicitada 2026-10-12:** una factura anulada en Facturación
seguía pendiente en Facturas en Bodega. Se corrige la vigencia por nota de
crédito completa, las aperturas cacheadas y las escrituras de despacho.
Verificado únicamente con copia local desechable y navegador; no requiere
migración. [Resultado y pruebas](informes/bodega-anuladas-2026-10-12.md).

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

Ajuste posterior del mismo recorrido: **oscurecer toda la vista → aparecer
nombre/imagen de categoría al seguir bajando → aclarar y mostrar productos**,
para enfocar al cliente en cada colección. La secuencia depende del scroll,
conservando navegación móvil, imágenes optimizadas y alternativa con movimiento
reducido. [Implementación y validación](informes/catalogo-foco-scroll-2026-10-11.md).
Se mantiene la revisión en 5173/3000 y el clon local; no es una orden de `main`.

Después de publicar esas mejoras, reportó **503 al subir una imagen de
categoría y mala calidad**. Falta SQL 055 en producción; la compresión de las
cabeceras pequeñas también era insuficiente para la escena grande. Se corrige
la resolución/recorte móvil y se comprueba la subida en una copia desechable.
[Corrección y validación](informes/catalogo-imagen-calidad-2026-10-11.md).
El permiso de publicar código en `main` está registrado en `AGENTS.md`; la
migración de producción sigue siendo un paso separado pendiente.

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

## 2026-10-11 — Estructura estricta y permiso de subir a main

Después de pedir una revisión de «si los agentes han respetado la estructura
de lógica y diseño», textual: «ok, corrige todos esos detalles y en memoria
sé más estricto con el mantenimiento de la estructura, es de suma
importancia, solo procura de no romper nada y también agrega en memoria que
sí tienen permiso de subir directo a main y decir quién fue el que subió
qué».

**Hecho**:
- Los desvíos de Claude, corregidos sin cambiar comportamiento:
  [la lección](grafo/leccion/la-estructura-se-cuida-con-una-prueba.md) los
  lista uno por uno. Los de Codex (tres hojas de estilo del catálogo con
  colores a mano) quedaron anotados como deuda: estaba trabajando ahí.
- La estructura quedó escrita en [AGENTS.md](../AGENTS.md) y
  [CLAUDE.md](../CLAUDE.md), y la cuida `backend/tests/estructura.test.js`.
- El permiso de subir a `main`, con sus condiciones y la obligación de decir
  quién subió qué, también está en esos dos archivos y en la memoria.

## 2026-10-11 — La nota de crédito también se le manda al cliente

Revisando Facturación, textual: «en nota de crédito está faltando enviar la
nota de crédito por correo al cliente, el pdf con sus xml».

**Hecho**: una nota de crédito aceptada por Hacienda en producción se le
entrega sola al cliente, al correo de su ficha, con el PDF de la nota, el
XML firmado y la respuesta de Hacienda; la tarjeta de la nota muestra ese
cuarto paso y tiene «Enviar al cliente» y «Ver PDF». La nota no tenía PDF:
se hizo, con el mismo diseño de la factura. Detalle en
[correo-facturas](grafo/modulo/correo-facturas.md).

**Queda para el usuario**: mandarle la nota 82 (aceptada antes de este
cambio) con «Enviar al cliente» si quiere que el cliente la reciba; y
decidir si el pie de los PDF electrónicos debe citar la resolución de
Hacienda (hoy no cita ninguna).

## 2026-10-12 — La compra se acepta sola ante Hacienda

Textual: «revisa que cuando uno termina de registrar una compra en revisión
de precios esta se envíe a Hacienda, investiga bien esto, porque mis
proveedores me envían todo con factura electrónica y esto ya sale en Hacienda
como que yo compré, entonces al momento de yo registrar la compra, esta NO se
duplique, sino que salga que yo le hice recepción o algo similar», «que no me
salga esto [el formulario "Responder comprobante del proveedor"]», «que una
vez termine de revisar precio y la registre, ese formulario se haga solo» y
«que siempre salga como totalmente aceptada y ya en producción».

**Hecho**: al registrar una compra el sistema le confirma a Hacienda la
factura del proveedor (aceptación total, en producción), sin formulario. No
duplica nada: es una confirmación sobre la factura que el proveedor ya
emitió. Detalle y hallazgos en
[hacienda](grafo/modulo/hacienda.md), "LA COMPRA SE ACEPTA SOLA".

**Queda para el usuario, y sin eso no arranca**: elegir UNA vez la condición
del IVA en Configuración → Hacienda → Producción → «Aceptación de las
compras». No se le puso un valor por omisión porque es una declaración
fiscal. Y mirar la primera aceptación real: el mensaje nunca se había probado
contra Hacienda.

## 2026-10-13 — Un producto reactivado tiene que aparecer en Facturación

Textual: «puedes revisar por qué cuando vuelvo a activar un producto en
gestión de catálogo este producto no me aparece en facturación?».

**Hecho**: eran dos causas. Los productos quedaban activos pero ocultos, y la
lista que baja Facturación dejaba fuera los ocultos; y Facturación trabaja con
una copia del catálogo que solo se renovaba al tocar «Actualizar». Ahora todo
lo activo llega a Facturación y la copia se renueva sola cuando algo cambia.
Detalle en [facturacion-offline](grafo/modulo/facturacion-offline.md).

## 2026-10-13 — «Vamos a ir corrigiendo errores y ajustando»

Textual: «ok, vamos a ir corrigiendo errores y ajustando». Primer error de la
tanda: «cuando estoy dentro de una factura de venta editándola y quiero
cambiar el cliente me sale este error» (500, «Invalid time value»).

**Hecho**: el servidor leía mal la fecha de la factura al recalcular el
vencimiento del cliente nuevo. Corregido y probado contra la base real.
Detalle en [facturacion](grafo/modulo/facturacion.md).

## 2026-10-13 — Rotación por cliente: se quitan los ciclos, poco a poco

Textual, completo:

> Quiero corregir y simplificar completamente la lógica de **rotación de
> clientes**.
>
> Actualmente el sistema trabaja con una lógica basada en **ciclos**, pero
> quiero eliminar ese concepto porque genera confusión.
>
> **Nueva lógica de rotación.** Cada cliente debe tener configurada su
> **propia frecuencia de visita o rotación**, independientemente de los demás
> clientes. Por ejemplo, un cliente puede tener una frecuencia de: cada 7
> días, cada 15 días, cada 22 días, cada 30 días. La frecuencia debe ser
> configurable individualmente dentro de la información de cada cliente.
>
> **Funcionamiento esperado.** Cuando se facture a un cliente, el sistema debe
> tomar automáticamente la fecha de esa factura como la última atención o
> visita del cliente. A partir de esa fecha debe calcular la próxima fecha en
> la que corresponde atenderlo nuevamente, utilizando la frecuencia
> configurada para ese cliente. Ejemplo: Cliente A, rotación 22 días, última
> factura 10 de octubre → próxima visita 1 de noviembre. De esta manera, ya
> no existirán ciclos globales. Cada cliente tendrá su propio calendario de
> rotación.
>
> **Rutas.** Las **rutas deben mantenerse**. Cada cliente debe seguir teniendo
> asignada una ruta determinada. La ruta y la rotación son conceptos
> diferentes: **Ruta**: indica a qué recorrido comercial pertenece el
> cliente. **Rotación**: indica cada cuántos días debe volver a ser atendido.
> Por ejemplo, varios clientes pueden pertenecer a la Ruta 1, pero uno puede
> tener rotación de 7 días, otro de 15 días y otro de 22 días.
>
> **Reporte de clientes.** En el módulo de **Reporte de clientes**, quiero
> simplificar los filtros. El filtro principal debe ser únicamente por
> **ruta**. Al seleccionar una ruta, el sistema debe mostrar los clientes
> correspondientes cuya próxima fecha de atención indique que deben ser
> visitados o gestionados. El orden ideal sería por **próxima fecha de
> visita**, mostrando primero los clientes que deben atenderse antes. También
> debería ser posible identificar claramente: clientes que corresponden
> atender hoy; clientes próximos a atender; clientes atrasados cuya fecha de
> atención ya pasó.
>
> (con esto puedes crear un nuevo módulo que se llame Preventa)
>
> también corrige el módulo de Carga y entrega
>
> **Clientes enviados a impresión.** Cuando un cliente sea enviado a impresión
> desde el reporte, debe mantenerse temporalmente en la sección de clientes
> impresos durante **24 horas**. Después de cumplir esas 24 horas, debe
> moverse automáticamente al **historial**. La idea es evitar que los
> clientes impresos se acumulen permanentemente en el reporte operativo. El
> historial debe conservar información como: cliente, ruta, fecha y hora de
> impresión, fecha en que fue enviado al historial, próxima fecha de visita,
> estado correspondiente.
>
> **Objetivo general.** Quiero eliminar completamente la dependencia de ciclos
> y pasar a un sistema de **rotación individual por cliente**. La lógica
> principal debe ser: **Factura realizada → actualizar última atención →
> sumar los días de rotación configurados → calcular próxima visita.** Las
> rutas se mantienen únicamente como una forma de organizar geográficamente o
> comercialmente a los clientes. La solución debe ser sencilla de entender,
> automática y preparada para que diferentes clientes tengan distintas
> frecuencias de visita sin depender de ciclos globales.

Y enseguida: «guarda todo esto en memoria para ir haciéndolo poco a poco».

**Reemplaza** lo decidido el 2026-10-05 sobre ciclos de ruta fechados (ver
más arriba en este archivo): las rutas quedan, los ciclos se van. **Se hace
por partes**, no de una vez. El plan, qué parte va y qué falta decidir:
[rotación por cliente](grafo/decision/rotacion-por-cliente-sin-ciclos.md).

**Hecho (parte 1)**: la frecuencia en la ficha de cada cliente y el cálculo
de última atención y próxima visita.

El mismo día, sobre la migración que eso necesitaba: «ok, sí tienes permiso
para correr esa migración. Sube esto a developer y me das lo que está
pendiente». Claude dejó registrado que aplicó la 056 en producción (12:37).
Al tomar el relevo, la publicación seguía pendiente: GitHub conservaba
`e5b1cd2` en ambas ramas. Codex cerró la integración y publicación de la
parte 1 en `developer`; `main` se conserva: pidió `developer`.

Después: «perfecto, continua en lo quedo claude se termino el uso de claude
entondes quedo a medias». La revisión del relevo también corrige la última
atención ante una anulación con nota de crédito completa; pruebas en copia
local y [estado pendiente](grafo/decision/rotacion-por-cliente-sin-ciclos.md).

Continuación autorizada: «ok, continua». Segunda entrega (ROT-03): el
Reporte de clientes toma la ruta de la ficha actual, elimina la selección de
semana, ordena por próxima visita y muestra atrasados/hoy/próximos. Mantiene
la revisión de faltantes e impresión, y separa homónimos por id propio.
Sin SQL nueva; publicación en `developer` y vista local 5173/3000.
La agenda Preventa para todos los clientes es la parte siguiente (ROT-04).


## 2026-10-13 — Continuación ROT-04 y aclaraciones para las partes siguientes

Textual: «perfecto, continua y dime que falta». Codex implementa
[Preventa (ROT-04)](grafo/modulo/preventa-agenda.md): agenda de todos los
clientes activos por ruta y próxima visita. Publicación solo `developer`,
como el relevo ya autorizado; `main` se conserva.

Al preguntar cómo formar la carga sin semanas, el usuario elige:
«Incluir automáticamente todas las facturas pendientes de la ruta.»
La decisión queda guardada para ROT-05, **todavía sin implementar**.

Sobre el historial aclara, textual: «ok, con esto me refiero a que las
facturas de reporte clientes, una vez se hayan enviado a impresion y no
tenga moviemiento en 24 horas entonces que se vayan a un historial para
que no queden ahí». ROT-06/07 cuentan **24 horas sin movimiento**, no solo
desde el envío inicial. Consultar no es un movimiento; las gestiones sí.
Decisión guardada, **todavía sin implementar**. No respondió expresamente
a foto/cálculo de próxima visita: esa elección no se acredita por la pregunta.

## 2026-10-13 — Continuación ROT-05, Carga/entregas por ruta

Textual: «ok, dale continua» y después «continua». Codex implementa la
elección ya recibida de incluir automáticamente todas las facturas pendientes
de la ruta, sin semanas. [Carga por ruta](grafo/modulo/carga-entregas-por-ruta.md).
Las decisiones guardadas pasan a implementación verificada en developer;
057 aplicada solo localmente, pendiente en producción antes de main.
Se conservan documentos/recorridos/eventos históricos; no se inventa una
entrega para facturas antiguas sin registro físico. Bodega procesada no la
acredita. Historial de impresos tras 24 h SIN MOVIMIENTO sigue ROT-06/07.


## 2026-10-13 — Reporte de proveedores simplificado

Textual: «aún veo muy confuso reporte proveedores, aún salen muchas cosas
respecto a ciclos simplificalo solo quiero faltantes tal cual esta en main ahora
pero que una vez enviado y llegue otra factura con faltante de ese proveedor,
me genere una orden de compra nueva eso es todo lo que ocupo» y «quita todo lo
demas deja faltantes tal cual esta en main y proveedores la ficha para ver la
info de cada uno». Después autoriza continuar.

Reemplaza la entrada Compras y las áreas/paneles extra: únicamente Faltantes y
Proveedores. Acumulación por proveedor en borrador/pendiente; enviada/incierta
conservada y faltante nuevo en otra orden. SQL 058 local; producción pendiente
antes de main. [Implementación y verificación](grafo/modulo/reporte-proveedores.md).
Publicación solo developer, como el relevo; el historial de impresión 24 h
sin movimiento y el resto del retiro de ciclos siguen pendientes.


## 2026-10-13 — Desplegar todo lo implementado a main

Textual: «perfecto, despliega todo a main». Después confirma «continua».
Reemplaza el destino solo developer del relevo. Codex aplica primero las
migraciones pendientes 055/057/058 en producción, con respaldo y ensayo
local; 056 ya presente. Se publica el conjunto verificado, incluido el
trabajo integrado de Claude, por avance sin fusión. No autoriza pruebas que
escriban registros ficticios ni mensajes reales en producción. Los impresos
24 h SIN MOVIMIENTO y el resto del retiro de ciclos siguen pendientes.
[Registro](informes/despliegue-main-2026-10-13.md).


## 2026-10-14 — Descuento global en la ficha del cliente

Textual: «que la ficha de cliente tenga descuento global … un input donde
uno pueda poner cuanto % de descuento en todos los productos tendra el
cliente … un 5%, automaticamente aplicar un 5% a todos los productos que
tengan más de un 21% de margen». Confirma: «Usar el descuento mayor, sin
acumularlos». Después pide continuar.

El margen se mide antes de descuentos, sobre precio y costo sin IVA con
la tarifa del producto; exactamente 21 % queda fuera. Costo no confiable
no concede rebaja automática. La ficha guarda la condición para ventas
nuevas y las anteriores conservan lo cobrado. Vista previa y guardado
comparten porcentajes; un cambio mientras se revisaba requiere revisión
antes de guardar. Se desarrolla y prueba con copias locales, sin mensajes
reales. SQL 060 aplicada en producción tras la autorización posterior
de migrar y publicar en main, registrada abajo.
[Implementación](grafo/modulo/facturacion.md).


## 2026-10-14 — Migrar y publicar el descuento global a main

Textual: «ok, dale adelante haz la migracion y sube a main». Reemplaza el
destino solo developer de esta función. Codex aplica 060 a las 15:31:43 CR
con respaldo completo restaurado, ensayo local y 144 tablas conservadas;
250 clientes comienzan en 0 % y las facturas anteriores conservan lo cobrado.
Se publica el cambio funcional propio 1dead1f y el registro de despliegue,
sin commits nuevos de Claude. Pruebas que escriben solo en copias locales;
la comprobación de Render usa lecturas, sin mensajes ni comprobantes reales.
[Registro](informes/descuento-global-cliente-2026-10-14.md).


## Proveedores dentro de Editar producto — 2026-10-14

El usuario pide recuperar en Gestión de Catálogo una pestaña **Proveedores**:
a quién se compra el producto, costo y nombre tal como lo escribe cada proveedor.
Mostrar además código, moneda/fecha del costo y factor cuando cambia la unidad;
la consulta no modifica compras ni relaciones. Ver [implementación y pruebas](informes/catalogo-proveedores-producto-2026-10-14.md).


## Corrección de historial de Reporte Clientes — 2026-10-15

El usuario pide investigar por qué las facturas listas siguen tras 24 h y crear
la pestaña Historial. Sigue vigente su aclaración de **24 h sin movimiento
tras enviarse a Impresión**. Se implementa por factura para conservar pedidos
nuevos del mismo cliente en Activos; consultar no reinicia el plazo y no se
borra información. [Implementación y pruebas](informes/reporte-clientes-historial-2026-10-15.md).

## 2026-10-18 — El cambio de categoría del catálogo del agente, fluido

Textual: «hay un error en el catálogo agente, se supone que este tiene que ir
súper fluido pero se le agregó unas imágenes en las categorías, cuando el
cliente va por un cambio de categoría la animación es muy brusca y se queda
pegado. Haz que sea más fluido».

Se conserva la secuencia que pidió el 2026-10-11 (oscuro → nombre y foto →
claro con productos). Ahora sigue al dedo con fundidos, nunca queda negra si
se detiene, y tocar una categoría la presenta sola y deja en sus productos.
Detalle y mediciones: [catálogo del agente](grafo/modulo/catalogo-agente.md).

## 2026-10-19 — La categoría no detiene el deslizamiento

Textual, después de probar el arreglo del día anterior en la tablet: «en la
tablet sigue igual, muy pegado. No quiero que la animación se detenga para
mostrar la categoría, quiero que siga el deslizamiento».

**Reemplaza** la secuencia oscuro → nombre y foto → claro (2026-10-11 y
2026-10-18): ya no hay pantalla fija entre categorías. Cada categoría abre
con su tarjeta de foto y nombre dentro del recorrido, que pasa con el scroll.
No volver a fijar nada en pantalla al cambiar de categoría.
[Detalle](grafo/modulo/catalogo-agente.md).

## 2026-10-19 — El descuento global del cliente no se aplicaba

Textual: «el descuento global que le pongo a x cliente, no se le aplica cuando
lo factura, tampoco veo el descuento en el pdf. Ejemplo real: buen precio».

En producción el descuento nunca quedó guardado (SUPER BUEN PRECIO en 0 %,
sin rastro de guardado). La regla de facturación y el PDF funcionan con el
descuento guardado. Cerrar la ficha con cambios sin guardar ahora pregunta
antes. Hay que volver a poner el descuento y tocar «Guardar cambios».
[Detalle](grafo/modulo/rutas-clientes.md).

## 2026-10-19 — Los totales del PDF: subtotal, descuento, impuesto, total

Textual: «ok, pero el formato de pdf no me gusta, quiero que diga subtotal xx
/ descuento xx / impuesto %x / total xx». Antes, el mismo día: «sí, edítala
por mí, recuerda que ese descuento es solo a los productos con más de 21 % de
margen» (5 %, también en la ficha): la factura 001000015061 quedó en
₡257.089,11. El PDF ahora imprime esos cuatro renglones, con el subtotal de
antes del descuento para que la cuenta cierre.
[Detalle](grafo/modulo/facturacion.md).

Y luego: «en el pdf el único error que veo es este: Doscientos cincuenta y
siete mil ochenta y nueve con 11/100 colones costarricenses» → eligió «haz que
el monto en letras sea redondeado»; y «la vista previa del pdf donde la puedo
editar, también quiero que le apliques esos cambios ahí». Hechos los dos.

## 2026-10-19 — «Editar facturas» del teléfono, en orden de llegada

Textual: «el editar factura que es para móvil no está bien hecho, ocupo que
las facturas que salen en editar sean por orden de llegada y no al azar».
Hecho: la última que entró, arriba (por día y, dentro del día, por llegada).
[Detalle](grafo/modulo/facturacion-offline.md).

## 2026-10-19 — Botones de la factura: al final y del sistema

Textual: «ahora en editar facturas dentro de facturas haz que estos btns
salgan al final de la factura y NO al principio: Cancelar, Guardar cambios.
Haz que todo el diseño de btns sea más acorde al sistema y no tan genéricos,
recuerda reciclar código». Hecho con `ui/Boton`.
[Detalle](grafo/modulo/facturacion.md).

Y luego: «esta perfecto, pero ponle color a estos btn: Ver PDF, WhatsApp,
Correo, Editar factura, Emitir electrónicamente, Nota de crédito, y este
módulo hazlo completamente responsive». Hecho: colores por significado con
`ui/Boton` y Facturación comprobada de 320 a 1440 px.

## 2026-10-20 — La nota de crédito, más acorde al sistema

Textual: «perfecto, ahora haz el modal de nota crédito más acorde al sistema
y cuando la nota de crédito se haga haz que se acomode mejor ahí,
actualmente se ve muy desordenado». Hecho: el modal en pasos con el pie del
sistema y el contador compartido (`ui/Contador`, que ya no está copiado), la
tarjeta de la nota en una franja con número, estado y monto, y las acciones
de la factura en dos grupos.
[Detalle](grafo/modulo/facturacion.md).

## 2026-10-20 — Impresión: «Imprimir y emitir» para las que tienen correo

Textual: «ok, ahora hay facturas que siempre se emiten pero estas se emiten
hasta después del proceso de impresión, entonces pongamos un filtro que todas
las facturas que tienen correo en impresión salga el btn así: imprimir y
emitir. Eso sí, que el proceso de rebajas y ajustes de precios en impresión se
haga primero y después se emita». Hecho: guardar → emitir → imprimir (el papel
sale como factura electrónica con su clave).
[Detalle](grafo/modulo/faltantes.md).

## 2026-10-20 — Facturas ante Hacienda trabadas en Bodega

Textual: «me puedes enviar las facturas que están emitidas en Hacienda que
están pegadas en facturas en bodega por este error: No se pudo guardar:
Documento reservado ante Hacienda: conserve el original y use una nota fiscal.
Lo marcado sigue acá; probá de nuevo. Este error mantenlo, solo quiero que
esas facturas que quedaron ahí por error de un empleado las pases a
impresión». Eligió: sacarlas de Bodega con una excepción puntual, imprimirlas
tal cual (el faltante queda para entrega o nota de crédito) y no tocar las dos
pruebas del 11/10. [Detalle](grafo/modulo/faltantes.md).


## 2026-10-20 — Retirar números OC, enlace de compra y semanas redundantes

Pedido a Claude, retomado por Codex por relevo del usuario: «en reporte
proveedor quitemos el hecho de que las ordenes de compra se guarden tipo
Oc-xx […] en revision de precios que tengamos que enlazar un OC a lo que
llego esto quitemoslo […] tambien quita la logica de los clientes de ciclo
[…] Ruta y semana del pedido […] esto solo va a ser con la logica que
tenemos de proxima visita, entonces esa logica no la toques».

Reemplaza RP-04/RP-06 en cuanto al vínculo y los indicadores derivados de
facturas de compra. No se inventa su sustituto: «después te digo cómo lo
trabajaremos». Permanecen los pedidos enviados fijos y separados de nuevos
faltantes, el modal WhatsApp, el PDF comercial y el mensaje acordado.
Se retiran semanas de las pantallas y nuevas escrituras, no la historia,
las rutas actuales ni la frecuencia/próxima visita. Sin SQL nuevo ni acceso
a producción. [Implementación y límites](informes/simplificacion-sin-semanas-2026-10-20.md).


## 2026-10-20 — Publicar la simplificación a main

Después de revisar la entrega del relevo de Claude en developer, el usuario
pide «subelo al main». Autoriza publicar el cambio `a020b89`: sin OC visibles
ni enlace en Revisión de precios, y sin semanas de cliente/pedido. Próxima
visita, documentos anteriores y envíos inmutables conservados. No necesita
migración nueva. [Registro y verificación](informes/simplificacion-sin-semanas-2026-10-20.md).


## 2026-10-20 — Quitar todo lo que quedaba de la semana del pedido

A Claude, después de la publicación: «en facturacion sigo viendo cosas como
estas / Ruta y semana del pedido / Seleccioná la ruta y semana / Request
failed with status code 404 / elimina todo lo recionado con eso». El selector
venía de una pestaña abierta antes del despliegue; se retiran además los
restos de compatibilidad con ciclos en órdenes, colas, Preventa y Reporte
Clientes. Próxima visita y la historia en SQL no cambian. [Detalle](informes/simplificacion-sin-semanas-2026-10-20.md).


## 2026-10-20 — Portal de clientes: pedido editable y sistemas separados

A Claude: «lo que quiero es mejorar el portal de clientes / hay 2 cosas,
cuando se están añadiendo productos no se pueden editar / entonces / ajustar
modal para editar producto en modulo de cliente que sea mas flexible / y hay
que separar los sistemas, no quiero que los clientes puedan llegar al sistema
interno / puedo subir otra img a render».

Se entendió así: «Su pedido» deja cambiar cantidades y sacar productos ahí
mismo, con un alto que se adapta al teléfono, y el portal se publica como
otro servicio de Render que no lleva nada del sistema interno. Hasta que ese
servicio exista, todo sigue en la dirección de siempre. El dominio
distribuidoratachi.com quedó para después, por decisión suya.
[Decisión y pasos en Render](grafo/decision/portal-en-su-propio-sitio.md) ·
[Portal](grafo/modulo/portal-clientes.md).


## 2026-10-20 — Quitar el acceso al portal desde el sistema interno

Con el portal ya en línea: «ocupo que quites el acceso al portal clientes
desde el sistema normal / aún me sale esto [Catálogo de clientes, en el
ingreso del personal] / y aún puedo entrar desde ese acceso». Se quitó del
ingreso y del Dashboard, y el sistema interno ya no trae las páginas del
cliente: sus direcciones viejas solo llevan al portal, con la sesión.
[Decisión](grafo/decision/portal-en-su-propio-sitio.md).


## 2026-10-20 — Las órdenes enviadas salen a los 3 días

«ok, ahora las ordenes de compra que ya fueron enviadas y tienen mas de 3
dias de enviadas se pueden eliminar». Se dejan de mostrar en Reporte
Proveedores pasadas 72 h de enviadas, sin borrarlas de la base: borrarlas
haría volver sus productos a «por pedir» y pedirlos de nuevo.
[Detalle](grafo/modulo/reporte-proveedores.md).


## 2026-10-20 — El PDF de la orden de compra sin factor

«perfecto, ahora el pdf de orden de compra sale el factor / eso quitalo, el
proveedor no ocupa esa info / lo podria confundir». Reemplaza el factor del
formato comercial pedido el 2026-10-14: el PDF queda con cantidad,
descripción y código del proveedor. [Detalle](grafo/modulo/reporte-proveedores.md).


## 2026-10-20 — Modal para buscar el producto a relacionar

«ahora haz bien el diseño del modal de buscar productos para relacionar en
revision de precios / este ahora esta que los productos se ven muy enorme y
casi no se ven / hazlo mas acorde a» (el mensaje llegó cortado; se tomó
«acorde al sistema»). [Detalle](grafo/modulo/relacionar-productos.md).


## 2026-10-21 — Combustible y alimentación sin inventario

El usuario entrega el documento de proveedores de gastos operativos y pide
«recicla codigo y hazlo simple». Proveedor Comercial por omisión, Combustible,
Alimentación/viáticos y Mixto. Recepción sin catálogo/stock; acción por factura
en Revisión y preferencia futura opcional. XML/PDF originales, responsable y
placa opcionales, historial, una sola deuda y pago real desde Caja. Separar
recepción, clasificación, confirmación fiscal, renta, IVA y pago; no conceder
deducción/crédito ni enviar aceptación/rechazo automáticamente. Investigar
Hacienda. Desarrollo/verificación local, sin nueva publicación a producción.
[Implementación y fuentes](informes/gastos-operativos-2026-10-21.md).


## 2026-10-21 — Gastos al contador y cierre mensual del sistema propio

Al explicar que faltaba conectar los gastos al envío mensual, confirma:
«exacto hazlo / esto deberia de salir a final de mes / tambien adapta bien
este modulo al sistema actual porque este aún esta adecuado para alegra».
Se integran ventas/compras/gastos, Excel y comprobantes en el envío existente,
incluyendo pendientes de revisión. Consultar el mes no requiere importar ni
corregir archivos de Alegra o sobrescribir períodos entregados; conservan
consulta histórica. No autoriza envíos reales para probar ni producción.
[Alcance](informes/contador-mensual-2026-10-21.md).


## 2026-10-21 — Publicar Gastos y Contador mensual

Usuario: «ok subelo a main», tras explicar que falta aplicar SQL061 antes
de publicar. Se aplica esa migración necesaria, con respaldo/restauración y
conservación comprobada de las 144 tablas anteriores. El contador recibe
ventas/notas, compras y gastos operativos (combustible/alimentación), con
Excel y originales de gastos en el envío mensual explícito. No implica
programar correos ni enviar comprobantes reales para probar.
[Publicación](informes/despliegue-gastos-contador-2026-10-21.md).


## 2026-10-21 — Excel mensual claro para el contador

Usuario: «el excel que descarga esta muy desordenado / busca que informacion
ocupan realment los contadores [...] colores, tamaños, todo bien presentado
y resumido». Investigar fuentes oficiales de Costa Rica y reorganizar la
descarga y el mismo adjunto del correo: resumen por moneda, ventas/compras/
gastos separados, impuestos registrados por tarifa y pendientes visibles.
Conservar documentos/importes reales, sin decidir deducciones ni crédito al
exportar. Desarrollo y pruebas locales; no solicita otra publicación a main.
[Formato y validación](informes/contador-excel-2026-10-21.md).


## 2026-10-21 — Aprobar gastos de contado sin formularios por factura

Usuario: «los gastos operativos cuando me llegan me sigan saliendo en
revision de precios [...] aprobar o rechazar [...] aprobar, indique conque
medio se pago y listo, se acepte en hacienda, en mi sistema y ya se registre
el pago». Permanecen pendientes en esa pantalla; Aprobar elige medio y paga
el saldo completo, Rechazar no paga. Tras decidir se consultan en Gastos:
proveedor, categoría, fecha, importe, medio, comprobante y estado real fiscal.
Confirmó «Usar la configuración actual de Hacienda» para el IVA, sin pedir
esos datos por factura. Recibir no confirma pagos ni respuestas por sí solo.
La respuesta fiscal se reintenta sin volver a registrar el pago. SQL062 sólo
local; este pedido no incluye nueva publicación a main.
[Validación](informes/gastos-aprobacion-2026-10-21.md).


## 2026-10-21 — Publicar aprobación y mover Caja General a Finanzas

Usuario: «ok dale subelo a main» y mover «tal cual» el tab Caja General de
Cuentas por cobrar a un módulo dentro de Finanzas. Publicar los cambios
verificados del Excel/aprobación junto con esta ubicación, aplicando primero
SQL062 y SQL063 necesarias. Conservar movimientos, filtros e importes;
separar permiso y copiar sólo el acceso que ya tenía CxC. Sin probar con
escrituras de negocio en producción ni enviar mensajes para verificar.


## 2026-10-21 — Excel de sólo tres resúmenes, según imagen

Usuario: «hay demasiada informacion irrelevante [...] solo [...] ventas,
compras y gastos operativos [...] un resumen de todo por hoja». Reemplaza
el diseño de nueve hojas. Exactamente Ventas/Compras/Gastos operativos con
período y tabla corta de subtotal, descuento, impuestos y total, siguiendo la
referencia visual. Sin filas por factura ni hojas auxiliares. Mismos datos
y descuento aplicado una vez, sin inventar IVA de combustible o mezclar monedas.
Desarrollo local y publicación en developer; no solicita otra subida a main.
[Alcance y pruebas](informes/contador-resumen-2026-10-21.md).


## 2026-10-21 — Publicar el Excel simplificado

Usuario: «subelo al main», después de revisar la entrega de tres resúmenes
0a4e7ed. Publicar ese cambio verificado y su registro de Codex, sin migraciones
ni nuevas decisiones fiscales. Conservar la vista local y comprobar el despliegue.
[Alcance y validación](informes/contador-resumen-2026-10-21.md).


## Marcas del catálogo — 2026-10-22

El usuario pide Categoría → Subcategoría → Marca, con una foto representativa
(por ejemplo, candado sin medida) y una lista de presentaciones/precios con
IVA en el agente. Aclara: Gestión de Catálogo se mantiene tal cual, agregando
la opción de asignar la foto de marca; al tocar Candado32mm se abre una vista
previa con SU foto. No sustituir imágenes individuales ni duplicar productos.
Se implementa en worktree propio, con SQL064 y copias PostgreSQL locales;
no se publica a main en esta entrega. Ver [marcas del catálogo](grafo/modulo/marcas-catalogo.md).


## Publicar marcas y suavizar el título — 2026-10-22

Usuario: «subelo a main [...] antes, mejora la tipografia [...] ahora se ve
muy tosco y brusco». Autoriza publicar la función36af6b9 con título más ligero,
legible y discreto. Se conserva la fuente actual y se reduce peso/tamaño,
sin convertir automáticamente el nombre a mayúsculas. SQL064 aplicada antes
del push, con respaldo comprobado y ensayo local; ningún dato ficticio o
prueba de negocio en producción.
[Resultado](informes/despliegue-marcas-2026-10-22.md).


## Vista previa de las fotografías del catálogo — 2026-10-22

El usuario pide que tocar la imagen de los productos en general del catálogo
del agente abra una vista previa para apreciarla mejor. Se reutiliza el modal
existente de las presentaciones de marca, también en búsqueda/ofertas, con
foto individual y sin nueva consulta. Mantener navegación, scroll, teclado,
consulta sin señal y rapidez. Es una ampliación del catálogo recién publicado.


## 2026-10-22 — La foto de marca como portada; la vista previa al revés

Continuando lo de Codex: «la foto de marca es una foto con fondo, todo
llamativo..etc / no una card mas de prouducto, sino una portada para dar a
presentar los productos / hay que cambiar el diseño para que encage mejor» y
«la vista previa viene con el nombre de la linea abajo y el del producto
arriba / hazlo al reves sino confunde». [Detalle](grafo/modulo/marcas-catalogo.md).


## 2026-10-22 — Solo se emite electrónicamente desde Impresión

«volvio a pasar lo del otro dia / No se pudo guardar: Documento reservado
ante Hacienda… / quiero pongamos un stop aca, hagamos que si la factura esta
en bodega o reporte clientes o cualquier modulo que no sea impresion / esta
no pueda emitirse electronicamente». El error en Bodega se conserva (pedido
del 20/10); lo que cambia es que ya no se llega a él.
[Detalle](grafo/modulo/hacienda.md).


## 2026-10-22 — Facturas que vuelven a Reporte Clientes e Impresión

«me aparece la factura de Randall Francisco Bolaños Barboza en reporte
clientes sin importar cuantas veces lo envie a impresion y en impresion me
han aparecido multiples veces la factura de maureen july n-1 y n-2». Sobre lo
que no llegó en una factura ya ante Hacienda: «con el stop que pusimos antes
esto ya no va a pasar». [Detalle](grafo/modulo/faltantes.md).


## 2026-10-22 — Quitar productos de una orden de compra, del todo

«en reporte proveedores cuando estoy dentro de una orden de compra me deja
borrar algun producto, pero estos solo se tachan, necesito poder eliminarlos
por completo para ya cerrar esa orden de compra». Sale de las compras; el
faltante del cliente sigue. [Detalle](grafo/modulo/reporte-proveedores.md).

## 2026-10-22 — Portadas de marca sin franjas

El usuario pide revisar lo de Claude: la portada de llantas se ve bien, pero
la de aldabas deja bordes arriba y abajo. Las imágenes existentes y las que
se suban deben adaptarse al panel automáticamente. Se elimina el límite que
dejaba la foto pequeña y se usa encuadre centrado a todo el panel, reservando
la proporción antes de cargar para que no salte el contenido.
[Detalle y verificación](grafo/modulo/marcas-catalogo.md).

El usuario autoriza después «dale a main y haz la migración pendiente»:
publicar portadas y el cambio previo de Claude sobre retiro de compras,
aplicando SQL065 antes del push, con respaldo comprobado y ensayo local.
[Entrega](informes/despliegue-portadas-065-2026-10-22.md).


## 2026-10-23 — Modal de Cuentas por Cobrar en móvil

«correge el modal de cuentas por cobrar en móvil, la fecha colapsa y se ve
mal». Se acomodaron las fechas del modal de cobro (la del abono y la del
vencimiento ya no se parten) y, de paso, se corrigió que salieran un día
antes. [Detalle](grafo/leccion/fecha-utc-costa-rica.md).

## 2026-10-24 — Separar ventas electrónicas en Reporte Contador

El usuario pide botones y hojas de Excel: «facturas y notas electronicas»,
«compras (aca si van todas)» y «facturas y notas»; sin aclaración adicional
para las que no son electrónicas. Incluye los tiquetes electrónicos en la
primera clase. Aclara después conservar Gastos operativos como una cuarta
pestaña y hoja, aparte de Compras. Se conserva el formato resumido del Excel.
[Alcance y verificación](informes/contador-electronicas-2026-10-24.md).

El usuario autoriza después «perfecto subelo a main». Publicación del cambio
propio de Codex con suite completa local y sin migración ni otros commits
pendientes de otro agente.

## 2026-10-24 — Impresión: plazos, historial y tiquete; PDF de la electrónica

Pedidos del mismo día, en orden (los dos primeros ya publicados por Claude):

- «Poner más restricciones para no poder recuperar facturas ya impresas…
  después de 24 horas no se pueda recuperar… y la que tenga 48 horas en el
  historial… eliminarla; solo el historial de ambos módulos, lo que está en el
  módulo normal dejarlo en cola hasta que se procese». Vigente en **Reporte
  Clientes** (recuperar solo en Activos y con menos de 24 h impresa; su
  historial muestra cada factura 48 h; se oculta, no se borra).
  [Detalle](grafo/modulo/reporte-clientes.md).
- Después, para **Impresión**: «no quiero que se pueda recuperar desde
  historial, quiero que el historial sea solo para ver el PDF y no se borre
  nada, solo que queden ahí». Reemplaza los plazos en ese módulo: sin
  «Recuperar», sin plazo, todas las impresas de a 50. Se quitó también un
  borrado total de `procesamientos` que nadie usaba.
  [Detalle](grafo/modulo/faltantes.md).
- PDF de la factura electrónica: «las facturas de venta mantengan el formato
  que tenemos y las electrónicas el que exige Hacienda». Se agregó lo que el
  XML dice (fecha con hora, estado, plazo en días, medio con código, detalle
  por línea); el usuario quitó el recuadro de resumen al verlo y no hay QR
  porque Hacienda lo tiene suspendido. [Detalle](grafo/modulo/correo-facturas.md).
- «Los clientes que no tienen correo, salga la opción emitir como tiquete e
  imprimir» (la otra mitad de «Imprimir y emitir»). Decisión de Claude a
  revisar por él: se pide **a propósito** (`tipo 04`), también a clientes con
  cédula, porque la regla de siempre los mandaría a factura; la pregunta avisa
  que el tiquete no sirve para gastos ni créditos de IVA. El primero saldría
  con el número 1970 y Hacienda nunca ha aceptado un tiquete de este emisor.
  [Detalle](grafo/modulo/faltantes.md).
