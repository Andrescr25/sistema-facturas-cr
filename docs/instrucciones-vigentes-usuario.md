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
**75/24** (99 IDs): recepción (049) y
[archivo individual](informes/archivo-ordenes-2026-10-06.md) (050) comprobados.
Compras nuevas registradas después del vínculo esperan entrega física para
stock; compras anteriores mantienen su tratamiento comercial sin nueva entrada.
Históricos sin kardex propio no se importan como stock por recibirlos.
Retiro semanal y archivo 24 h comprobados: Historial conserva documentos/
cobertura; parciales activas. Siguiente: carga/entregas y pendientes de vista
stock/comprometido y cierre de enviada. Mantener lanzador seguro para salidas
de otros módulos; nunca ejecutar código de limpieza antigua. Factura con varias órdenes aún necesita
asignación explícita por línea/cantidad, sin contarla completa dos veces.
