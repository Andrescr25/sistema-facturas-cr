# Categorías visuales del catálogo del agente — 2026-10-11

> **Actualización 2026-10-25:** el recorte y la franja fija que describe este
> informe cambiaron. La foto se sube sin recortar (`fit: 'inside'`) y el
> banner toma su proporción real, con topes de 260/340/420 px. Ver
> [[modulo/catalogo-agente]] y [[modulo/gestion-catalogo]]. Las medidas de las
> tablas de abajo son las de la primera versión.

Este informe conserva la primera implementación (solo entradas de cabecera).
El [refinamiento posterior solicitado por el usuario](catalogo-revelado-subcategorias-2026-10-11.md)
añade subcategorías visibles y entrada de productos; sus mediciones son las vigentes.

Cada categoría comienza con una cabecera horizontal: nombre, foto, cantidad
de productos y posición en la colección. Los productos empiezan inmediatamente
debajo; el usuario puede seguir desplazándose mientras carga la imagen o se
anima. No hay pantalla intermedia, espera, cierre ni desplazamiento obligado.

En **Gestión de Catálogo → abrir categoría → Imagen**, junto al nombre y su
lápiz, se puede elegir una foto, previsualizarla, guardar, reemplazar o quitar.
Conviene una imagen horizontal de la categoría. Se aceptan JPG, PNG y WebP de
hasta 8 MiB; sin imagen asignada, el catálogo aprovecha una foto de sus productos.
Si tampoco hay foto disponible, conserva nombre y fondo ilustrado con un icono.

## Estructura y decisiones

El catálogo existente ya agrupa y ordena categorías/familias y guarda productos
y configuración en IndexedDB. Se reutiliza ese agrupado y las tarjetas actuales,
en catálogo general, Cliente nuevo, Ofertas y Nuevos. Se mantienen recomendaciones,
familias contiguas, promociones, selección, precios y resultados planos al buscar.
Elegir una categoría en la barra vuelve al comienzo de su colección.

La introducción es un componente memoizado. Un único `IntersectionObserver`
observa solo las cabeceras; al aparecer, marca un atributo del DOM y retira esa
observación. No añade listeners de scroll, cálculos por producto, actualizaciones
React durante la entrada ni dependencias. CSS anima únicamente opacidad y
transformación: texto 650 ms y zoom de foto 950 ms. Sin soporte del observador,
o con movimiento reducido, todo continúa visible sin esa animación.

La optimización ocurre **al subir**, usando Sharp ya instalado. Se eliminan
metadatos y se generan dos WebP estáticos, sin agrandar fotos pequeñas:

| Variante | Resolución máxima | Peso máximo |
|---|---:|---:|
| Móvil | 480 × 270 | 60 KiB |
| Escritorio/tablet ancha | 960 × 540 | 180 KiB |

Si una foto detallada supera el peso, se reduce su resolución. `<picture>`
escoge móvil hasta 767 px; imágenes con lazy loading, decodificación asíncrona
y prioridad baja. La cabecera reserva 168 px en móvil, 200/216 en pantallas
más anchas; una imagen lenta o fallida no modifica su altura ni oculta el nombre.
Nombres largos pueden aumentar la altura según el texto, antes de cargar la foto.

Ambas variantes se incluyen en la actualización de fotos del catálogo, después
de las fotos de productos para conservar su prioridad. Reutilizan la misma caché,
cuota, claves canónicas y Service Worker; cambiar de ancho sin señal no requiere
una descarga nueva. En la navegación normal solo se pide la variante necesaria;
actualizar para uso sin conexión descarga las dos.

## Persistencia y compatibilidad

SQL **055_imagen_categoria_catalogo.sql** agrega `categoria_config.imagen JSONB`
nulable; no altera productos, nombres, clasificación ni orden. La imagen viaja
desde la misma lectura de categorías al árbol de Gestión y a la configuración
que descarga el agente. Esa lectura también funciona antes de aplicar SQL 055;
intentar guardar sin la columna devuelve un error legible y limpia los archivos
nuevos. La migración se verificó dos veces, sin cambiar datos existentes.

POST/DELETE `/maestro/categorias/:id/imagen` requieren el permiso Gestión de
Catálogo. El servidor valida bytes y limita píxeles, guarda en almacenamiento
propio y comparte el bloqueo de categoría con su renombre real. Imagen y
bitácora se confirman juntas; fallar conserva la anterior. Reemplazar/quitar
borra solo las variantes propias de esa categoría después del commit. Se
conservan la foto del producto, el nombre visible y el orden. La interfaz parchea
la categoría por id, incluso si se cambió de vista durante el guardado.

## Validación

- **104 pruebas relacionadas, 104 pasan:** carga WebP, límites con foto de ruido,
  foto pequeña, archivos inválidos, exceso de píxeles, PostgreSQL real, rollback
  por fallo de bitácora, reemplazo, borrado, renombre y orden, ausencia de SQL,
  migración idempotente, multipart real, caché de ambas variantes, observador
  compartido, movimiento reducido, búsqueda, promociones y Cliente nuevo.
- **93 comprobaciones complementarias, 93 pasan:** grafo, fotos propias,
  permisos, ids propios, navegación sin sesión y respuesta pública sin costos.
- Chromium, frontend/API en orígenes locales distintos, con **2.000 productos
  simulados en 20 categorías**: móvil 390 px y escritorio 1440 px, revisión de
  capturas, sin desbordamiento, versión móvil de imagen y una sola cabecera
  animada inicialmente. Entrada en siguiente categoría, búsqueda sin cabeceras,
  filtro que vuelve arriba y movimiento reducido. Sin errores de ejecución JS.
- Gestión probada desde el navegador: elegir, guardar, reemplazar, quitar y
  rechazo HTTP conservando formulario/archivo para reintentar. Vista previa móvil.
- Solicitudes de imagen pendientes y luego fallidas: desplazamiento de más de
  7.500 px sin esperarlas; altura antes/después 168 px y nombre visible.
- Actualización desde el botón real: 38 variantes de las 19 categorías aún con
  imagen asignada y las fotos de productos guardadas. Sin conexión, recarga de
  la página con las 2.000 fichas y foto de Ferretería visible desde la caché.

## Comparación de rendimiento y límites

Chromium headless, viewport 390×844 y CPU ralentizada ×4; versión anterior
`bd266c0` y cambio con los mismos datos. Tres recorridos de 3,5 s por versión,
alternando el orden. Las dos últimas vueltas, ya calientes, dieron intervalos
medianos de **16,7 ms** en ambas; percentil 95 **17,5 ms anterior / 17,6 ms nuevo**.
En la primera hubo variación de arranque (67,3/33,7 ms de p95); no se usa para
atribuir una mejora a las cabeceras. La última vuelta nueva tuvo una tarea de
60 ms; la anterior no tuvo ninguna. No se observa una degradación sostenida
del scroll por la introducción en este escenario.

20.255 → 20.437 nodos DOM: **182 nodos adicionales para 20 categorías**, con las
mismas 2.000 fichas. La animación y observación crecen con las categorías,
no con los productos. El incremento comprimido del build visual es aproximadamente
**2,8 KiB** entre JS y CSS. Sigue existiendo el bundle general grande del sistema;
esta tarea no cambia su estrategia de empaquetado.

Es un ensayo comparativo local, no una garantía de velocidad en todo teléfono:
usa tres fotos de producto repetidas y 19/20 cabeceras con variantes propias.
El montaje inicial mantiene todas las fichas del catálogo actual. Una futura
virtualización necesitaría validar búsqueda, posición recordada y navegación
por categorías; no se introdujo ese cambio de comportamiento en esta entrega.
La prueba de imagen pendiente cubre el bloqueo de navegación, no todas las
condiciones de red móvil. La aceptación visual en el teléfono del agente queda
a revisión del usuario.

## Entrega

Preparado en worktree propio desde `developer`, separado del trabajo de Claude
en Facturación/Hacienda. Pruebas de escritura únicamente en PostgreSQL
desechable y almacenamiento temporal; la base local fuente, producción,
Alegra, Gmail y procesos reales quedaron intactos. No se instaló ni regeneró
Prisma ni se ejecutó limpieza semanal. Evidencia de navegador y mediciones
guardada en carpeta temporal privada; código, pruebas y documentación en Git.

**SQL 055 no se aplicó en producción.** Para publicar hacen falta esta columna
y la versión conjunta de backend/frontend; los archivos van al volumen público
existente. Esta solicitud prepara el cambio; no contiene una nueva autorización
específica para publicar en `main`.
