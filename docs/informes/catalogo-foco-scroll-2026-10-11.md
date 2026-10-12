# Foco de categoría: oscuro → imagen/nombre → productos — 2026-10-11

El usuario pidió que cambiar de categoría haga oscurecer toda la vista,
que la categoría con su imagen aparezca al seguir desplazándose y que después
regrese el fondo claro con los productos. Busca que el cliente reconozca la
colección que está explorando, en lugar de pasar por ella sin prestar atención.

## Comportamiento

Cada separador de categoría tiene un recorrido de 85 svh, limitado entre
440 y 900 px. Cuando se acerca al centro de la vista:

1. Toda la pantalla se oscurece y muestra «Seguí bajando para explorar».
2. Al avanzar aparecen el nombre, la imagen, el contador y la posición de la
   categoría, centrados sobre el fondo oscuro.
3. El siguiente avance retira esa escena y aclara la vista, con los primeros
   productos y la navegación de subcategorías ya visibles.

El progreso lo controla la posición del scroll. Detenerse mantiene la etapa;
volver hacia arriba recorre la secuencia en sentido inverso. No se retiene el
scroll, no se altera su velocidad ni se exige esperar o cerrar una pantalla.
Un salto rápido pasa por las fases con el mismo avance del usuario. Se añade
espacio de recorrido por categoría, a petición suya; no cambia el orden de las
familias, productos, precios, promociones ni selección de cliente.

El título lógico sigue disponible para lectores de pantalla. Las capas visuales
dejan pasar los eventos de puntero, y los controles con foco de teclado mantienen
su acceso. Selector de cliente y sincronización se muestran sobre el efecto.
La búsqueda sigue siendo plana, sin escenas; pasar a buscar o a otra colección
retira el oscurecimiento anterior. Movimiento reducido, ausencia de observador
o fallo de observación muestran cabeceras compactas sobre el catálogo claro.
La preferencia de movimiento reducido también se puede cambiar durante una escena.

## Técnica

`RecorridoCategorias` contiene un único velo fijo para la página. Cada
`TransicionCategoria` reutiliza `IntroduccionCategoria` para el nombre y la
foto, con el mismo respaldo de producto/icono y las mismas variantes WebP.
Gestión de Catálogo mantiene su previsualización compacta y su edición de imagen.

`focoCategoria.js` calcula la oscuridad, la entrada de imagen/nombre y la
salida desde la geometría del separador. Un observador compartido entre los
separadores limita los candidatos a los próximos a la vista. Mientras existen
candidatos, un listener pasivo programa una actualización con
`requestAnimationFrame`; se leen sus rectángulos antes de escribir estilos.
No se recorre el catálogo ni se actualiza React durante cada cuadro.
Al alejarse o desmontar se retiran listeners, frames y estilos del efecto.

Se revisó el enfoque de
[animaciones vinculadas al scroll](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines).
La documentación de [eventos de scroll](https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event)
advierte sobre trabajo costoso en esos eventos: aquí el evento solo programa
el cálculo de separadores próximos. `requestAnimationFrame` agrupa escrituras
para el pintado; no se presenta como un mecanismo para reducir la frecuencia
del scroll. La animación visual usa opacidad y transform, sin filtros ni
dependencias adicionales.

Las escenas fijas podrían hacer que un lazy loading convencional cargue todas
sus imágenes al inicio. Por eso cada foto se prepara una sola vez al acercarse
al separador. Después se conserva montada y usa las variantes y la caché
existentes. Una foto lenta no cambia la altura ni detiene el recorrido.
La vista clara conserva la entrada de productos y las filas completas del
[refinamiento anterior](catalogo-revelado-subcategorias-2026-10-11.md).

## Validación

- **1.859 productos**, 19 categorías y 182 familias con productos del clon local.
- Cambio a Ferretería en el navegador: oscuridad 1 con contenido 0; luego
  oscuridad 1 con imagen/nombre visibles; fase de aclarado intermedia; finalmente
  oscuridad 0 y productos visibles. Una sola escena activa.
- Capturas de las cuatro fases. Detener el scroll conserva la etapa.
- Solo dos imágenes de categoría preparadas al explorar las dos primeras;
  no se preparan las 19 por estar en escenas fijas.
- Buscar limpia el foco; salto «Discos y Lijas» llega a sus productos con vista
  clara. Ferretería conserva sus 393 fichas.
- 320, 390, 640 y 1440 px: sin desbordamiento horizontal. Movimiento reducido
  y navegador sin observador: cabeceras compactas y catálogo claro.
- Sin errores de ejecución JavaScript en ese recorrido.
- **86 pruebas pasan**, incluidas las 12 del grafo. Cubren cálculo y orden de fases, candidatos cercanos, eventos agrupados,
  desmontaje, callbacks antiguos, fallos, preparación de imagen y preferencia
  cambiada durante la escena. También orden, búsqueda, promociones, Cliente nuevo,
  filas y grafo.

La medición de fluidez usa 2.000 fichas, fotos repetidas y CPU ralentizada ×4,
incluyendo el paso real por la segunda categoría. Dos recorridos por versión:
mediana anterior **16,7 ms**, nueva **16,7–16,8 ms**; p95 anterior 17,6–33,8 ms,
nuevo 33,4 ms. Hubo cero/una tareas de más de 50 ms en el nuevo recorrido
(la mayor 77 ms), frente a tres/cero en el anterior. Se conserva variabilidad
entre vueltas; no se afirma una mejora general ni velocidad idéntica en todos
los dispositivos. DOM 25.602 → 25.715 nodos; las fichas siguen siendo 2.000.
JS+CSS comprimidos 414.448 → 416.187 bytes, aproximadamente
1,7 KiB adicionales. Es un ensayo local de renderizado; la revisión del usuario
en su dispositivo sigue siendo la aceptación visual. El catálogo conserva todas las fichas montadas, como antes.

## Entrega

Frontend actualizado en 5173, API 3000 y el mismo clon local 5552. Se conservan
las imágenes guardadas por el usuario y los mismos procesos. Los demás servicios
de desarrollo permanecen apagados. Solo frontend, pruebas y documentación:
sin SQL adicional, instalación de dependencias, regeneración de Prisma ni
cambios de datos de producción. Worktree propio, integración/publicación en
`developer`; `main` queda para la revisión y publicación del usuario.
