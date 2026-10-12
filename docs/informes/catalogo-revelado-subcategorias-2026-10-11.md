# Subcategorías y entrada de productos al desplazarse — 2026-10-11

El [ajuste posterior de foco por categoría](catalogo-foco-scroll-2026-10-11.md)
sustituye la entrada de cabecera por oscuro → categoría → claro, al avanzar
el scroll. Se conservan navegación de familias y entradas de productos.

Después de revisar localhost, el usuario indicó que no distinguía las
subcategorías ni veía transiciones durante el recorrido. La primera versión
animaba únicamente las cabeceras y la subcategoría quedaba como texto pequeño
en la ficha. Los datos estaban presentes: la API del clon entrega las familias.

## Resultado

Cada categoría tiene una barra horizontal de subcategorías con nombre y
cantidad. Permanece bajo las categorías mientras se recorre esa colección;
al tocar una familia se llega a su primera fila. Los títulos separan
visualmente las familias y cada ficha lleva una etiqueta más visible.

Se conservan las filas completas: una familia puede comenzar junto al último
producto de la anterior. En esa fila aparecen los nombres de ambas familias,
sin cambiar el orden manual, la selección ni la clasificación. Dos columnas
en móvil/tablet, tres desde 1024 px y cuatro desde 1280 px. Buscar conserva el
orden de relevancia y muestra sus resultados directamente, sin introducciones.

Las tarjetas aparecen una vez con opacidad y desplazamiento vertical de 36 px,
duración 700 ms y desfase de 65 ms entre productos de la fila. La cabecera
entra con texto de 800 ms y foto con zoom suave de 1 s. El usuario sigue
desplazándose durante la carga o animación; no se fija una pantalla intermedia.

## Implementación y rendimiento

Se revisó el enfoque de entradas al entrar en pantalla de
[Motion](https://motion.dev/docs/react-scroll-animations), incluyendo entradas
una sola vez. Para este efecto se reutilizan CSS y el
[IntersectionObserver nativo](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API),
sin añadir dependencias ni aumentar el trabajo JavaScript por frame.

- Un solo observador compartido para cabeceras y **próximas cuatro filas de
  las colecciones en pantalla**. Al entrar una fila, deja de observarse y se prepara la
  siguiente. Fuera de pantalla se retiran sus filas. No se observan miles de
  fichas a la vez.
- Las filas que aún no están preparadas son visibles por defecto. Saltarlas
  rápidamente, buscar, desmontar una colección o fallar la observación no deja
  productos ocultos. El salto por familia prepara su destino y próximas filas.
- En una pasada mayor a 4.000 px/s, las fichas aparecen directamente. La velocidad
  se estima únicamente cuando notifica el observador; las cabeceras conservan
  su efecto. Evita gastar animaciones en productos que se están pasando de largo.
- Solo `opacity` y `transform`, sin filtros, parallax continuo, listeners de
  scroll, timers por producto ni actualizaciones de estado React durante la entrada.
  Al finalizar se retira la animación; las fichas visitadas quedan sin transform.
- Dos consultas de ancho compartidas por todas las colecciones, con listeners
  solo de sus cambios de breakpoint. Filas con tarjetas directamente dentro de
  una sola cuadrícula de categoría mediante `display: contents`: la primera
  ficha sirve como referencia del observador y se revela su fila completa.
  Sin cientos de cuadrículas pequeñas ni alturas estimadas.
- Preferencia de movimiento reducido: todo visible y sin animaciones. Sin
  observador o si falla, también. La navegación sigue funcionando.

Se mantienen las imágenes WebP optimizadas, lazy loading, altura reservada y
caché sin señal de la [primera entrega](catalogo-categorias-visuales-2026-10-11.md).
Esta corrección no necesita cambios del backend ni SQL adicional. SQL 055 de
la entrega anterior sigue siendo necesario para guardar imágenes de categoría
en un entorno que todavía no tenga esa columna.

## Validación de esta corrección

Chromium contra la copia local en backend 3000, frontend 5173. Contextos de
navegador privados; no se modifica la caché ni la sesión del usuario.

- **1.859 productos, 19 categorías y 182 familias con productos**, de las 183
  subcategorías configuradas. 934 filas en móvil. Un único observador, máximo
  42 destinos simultáneos, en lugar de observar todas las filas.
- Se comprobó una ficha DURANTE la entrada: opacidad entre 0 y 1, desplazamiento
  activo y animación `catalogo-producto`. Después: opacidad 1, transform y
  animación `none`. Volver a la fila visitada no repite el efecto.
- Ferretería conserva sus 393 productos. El salto «Discos y Lijas» deja el
  título visible por debajo de las barras fijas.
- 320, 390, 640, 1100 y 1440 px: sin desbordamiento horizontal; todas las filas
  intermedias completas, con sus 2/3/4 productos. Capturas con fotos reales del clon.
- Búsqueda «alicate»: seis resultados visibles directamente. Movimiento
  reducido y navegador sin observador: fichas visibles sin animación.
- Cero errores de ejecución JavaScript en el recorrido.

**78 pruebas pasan, incluidas 12 del grafo.** Las pruebas cubren empaquetado
de filas sin reordenar, títulos y
destinos de familia, ausencia de familias, familias vacías, observador compartido,
retiro de filas, callbacks tardíos, fallo de observación, movimiento reducido y
pasadas rápidas. También se verifican orden canónico, búsqueda, promociones,
Cliente nuevo y grafo.

## Comparación de fluidez

Las mediciones comparan la vista anterior con cabeceras y esta corrección, con
2.000 fichas en Chromium, 390×844 y CPU ralentizada ×4. Se usan las categorías
y familias del clon y tres fotos repetidas, en ambas versiones. Son ensayos
locales de renderizado; no equivalen a medir un teléfono físico o una red móvil.

Recorridos habituales de **2.000 px/s**, tres vueltas por versión: medianas
anteriores 16,7 ms; nuevas 16,7–17,1 ms. Dos vueltas nuevas dieron p95 de
17,7 ms; una dio 49,5 ms y una tarea de 96 ms. Una pasada de control sin las
otras verificaciones concurrentes dio 16,7 ms / p95 17,6 ms y cero tareas de
más de 50 ms para el diseño nuevo. La variabilidad del ensayo queda registrada;
no se presenta como garantía de 60 fps en cualquier dispositivo.

La pasada extrema de **10.000 px/s** mostró mayor costo en el diseño nuevo:
medianas 17,3–32,8 ms y p95 34,1–49,9 ms frente a 16,7 ms y 17,6–33,4 ms de
la vista anterior. En la última vuelta, 130 filas se mostraron directamente y
el p95 fue 34,1 ms. El catálogo sigue desplazándose y conserva productos; este
escenario requiere aceptación en el equipo físico del agente. No se atribuye
al cambio una mejora en todas las condiciones.

Con las mismas 2.000 fichas, DOM 22.393 → 25.602 nodos, por filas, títulos y
navegación de familias. Los destinos simultáneos del observador no superaron
42 en el ensayo. JS+CSS comprimidos del build 412.022 → 414.448 bytes:
**aproximadamente 2,4 KiB adicionales**, sin dependencias nuevas. El montaje del
catálogo completo sigue teniendo un costo; esta entrega no introduce
virtualización, que exigiría comprobar posición recordada, búsqueda y navegación
por familias. El bundle general de la aplicación sigue siendo grande.

## Entrega y entorno

Worktree propio sobre `developer`; Facturación/Hacienda de Claude conservadas.
Vista del usuario actualizada en **localhost:5173**, con API **localhost:3000**
y el mismo clon local/almacenamiento de la revisión anterior. Sus cambios de
imágenes se conservan allí. Los demás servidores de desarrollo continúan
detenidos por pedido del usuario. No se aplican cambios a producción ni `main`.
No se instalan dependencias, no se regenera Prisma, no se ejecuta limpieza
semanal ni se envían mensajes de prueba.
