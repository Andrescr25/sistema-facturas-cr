# Portadas completas en marcas con muchas presentaciones — 2026-11-03

El usuario encuentra que las marcas con muchos productos alargan la foto y
recortan sus lados. La portada compartida usaba un panel estirado hasta la
altura de la lista y una imagen absoluta con `object-cover`. Además, las
marcas cortas se estiraban para igualar a la tarjeta vecina de su fila.

## Formato

- Desde cinco presentaciones, foto y nombre forman una cabecera compacta.
  La marca ocupa su propia fila. Debajo, las presentaciones van a todo el
  ancho: una columna en móvil y dos desde 640 px, en orden de lectura.
- La imagen utiliza su proporción natural, con ancho derivado de sus
  dimensiones para que la cabecera no supere 14 rem en móvil o 18 rem en
  escritorio. Se muestra el archivo completo; no se recorta ni se deforma.
- Con hasta cuatro presentaciones se conserva la composición lateral en
  escritorio y vertical en móvil. La foto y la tarjeta se alinean al inicio,
  por lo que otra tarjeta más alta tampoco las estira.
- Los productos permanecen visibles en la página: sin acordeón, paginación
  interna ni otro scroll. Vista previa, precios con IVA, ofertas y controles
  del carrito siguen usando los mismos productos y callbacks.

`esMarcaExtensa`, en `marcasCatalogo.js`, comparte el criterio entre portada,
filas, agente y clientes. `anchoEnFila` asigna la fila entera a estas marcas
sin duplicar o perder fichas ni alterar los destinos de subcategorías. Solo
se adelantan fichas sueltas de la misma familia para completar una fila:
no se adelanta otra marca. El servicio de imágenes, los archivos almacenados,
los DTO y la caché no cambian. Sin consultas, dependencias o migraciones nuevas.

## Comprobaciones

- Regresión del armado de filas a dos, tres y cuatro columnas: una marca de
  25 productos ocupa su propia fila; no se pierde ninguna ficha ni familia.
  Al cargar la quinta presentación cambia el ancho, sin mutar los productos.
- Recorrido local de las 61 marcas reales en ambos catálogos: Chromium para
  agente/clientes y WebKit para clientes, a 390/1280 px. Se mide la proporción
  de cada imagen contra sus dimensiones naturales y se abre la foto individual.
- Escenarios de 2/4/5/13/25/50/100 productos, imágenes verticales/cuadradas/
  horizontales, sin metadatos, sin foto y nombres largos a 320/390/700/1100/
  1440 px en Chromium y WebKit. Pasar de 5 a 100 productos no estira la foto;
  la prueba conserva el ancho disponible para aislar el scrollbar de WebKit.
- Imagen retenida mientras se añaden productos: los controles funcionan antes
  de terminar la carga y el espacio reservado conserva sus dimensiones.
- Suite completa con PostgreSQL desechable, build, lint y estructura/grafo.
  Cifras finales registradas al cerrar la verificación.

Las pruebas usan clones propios, con salidas de red bloqueadas; la copia de
Hacienda queda deshabilitada, sin secretos ni condición de IVA preexistente.
No se desarrolló ni se probó escribiendo en producción. Capturas y resultados
privados: `~/.local/share/sistema-facturas-cr/codex-portadas-proporcion-20261103/`.
