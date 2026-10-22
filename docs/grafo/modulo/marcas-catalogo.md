---
id: modulo/marcas-catalogo
tipo: modulo
titulo: Marcas del catálogo — foto general y presentaciones con vista previa
estado: vigente
archivos:
  - docs/informes/despliegue-marcas-2026-10-22.md
  - docs/informes/marcas-catalogo-2026-10-22.md
  - backend/migrations/independencia/064_marcas_catalogo.sql
  - backend/src/modules/productos/marcas.service.js
  - backend/src/modules/productos/marcas.controller.js
  - backend/src/modules/productos/marcas.imagenes.js
  - backend/src/modules/productos/productos.routes.js
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/tests/marcasCatalogo.test.js
  - backend/tests/marcasCatalogoLocal.test.js
  - frontend/src/hooks/useMarcasCatalogo.js
  - frontend/src/components/gestion-catalogo/MarcasSubcategoria.jsx
  - frontend/src/components/gestion-catalogo/ModalMarcasCatalogo.jsx
  - frontend/src/components/catalogo-agente/TarjetaMarca.jsx
  - frontend/src/components/catalogo-agente/VistaPreviaProducto.jsx
  - frontend/src/components/catalogo-agente/Cuadricula.jsx
  - frontend/src/utils/marcasCatalogo.js
  - frontend/src/utils/precioCatalogoAgente.js
  - frontend/src/utils/cacheImagenesCatalogo.js
  - frontend/src/utils/buscarCatalogoAgente.js
  - frontend/src/utils/filasCatalogo.js
  - backend/tests/filasCatalogo.test.js
aristas:
  depende_de: [tabla/subcategoria]
  relacionado: [modulo/gestion-catalogo, modulo/catalogo-agente, decision/orden-canonico-compartido, leccion/fotos-del-catalogo-en-la-tablet, leccion/precio-sin-iva-costo-con-iva, leccion/lo-publico-no-lleva-costo-ni-margen]
medido: 2026-10-22
---

## La foto de marca es una portada — 2026-10-22

Pedido del usuario: «la foto de marca es una foto con fondo, todo llamativo…
no una card más de producto, sino una portada para dar a presentar los
productos». `TarjetaMarca` ocupa dos casillas (`anchoEnFila`: la fila entera
en tablet y teléfono). El póster va a sangre sobre su propia foto ampliada y
desenfocada, sin recortar el arte; el nombre de la marca va al lado (abajo en
el teléfono), nunca encima de las letras del póster. Sin foto, la portada es
el nombre sobre los colores del sistema. Si la portada no cabe en lo que queda
de la fila, la siguiente ficha suelta de la misma subcategoría se adelanta
para no dejar hueco (se respeta «llenar las filas» del 2026-10-07); entre
subcategorías no se adelanta nada.

Vista previa: la MARCA es el título y el producto va abajo con su precio
(«hazlo al revés sino confunde»). Un producto sin marca conserva su nombre
de título.

La agrupación es una **marca dentro de una subcategoría**, con foto propia.
Tricicle en Candados puede tener otra foto que Tricicle en otra subcategoría.
Para separar diseños distintos se crean agrupaciones con nombres descriptivos.
No se intenta adivinar marcas por códigos o nombres ni fusionar productos.

Gestión conserva el diseño y agrega Marcas al encabezado de la subcategoría.
El modal lista marcas, permite crear/renombrar, asignar productos existentes y
subir/reemplazar/quitar foto. Las selecciones incluyen ocultos/inactivos,
identificados como tales: editarlos no los publica. Guardar usa una transacción
con subcategoría y productos bloqueados; mover desde otra marca es explícito
mediante la selección y la etiqueta de su asignación actual. Retirar la marca
conserva los productos en su subcategoría.

SQL064 crea marca_catalogo y producto.marca_catalogo_id. El trigger suelta la
marca anterior al cambiar categoría/subcategoría, incluso desde las rutas
preexistentes. Asignar una marca incompatible se rechaza. El nombre es único
sin distinguir mayúsculas dentro de la subcategoría; los ids propios deciden
la identidad, nunca el nombre o prefijo de referencia. No cambia documentos,
precios, impuestos, inventario ni imágenes de productos.

POST/PUT de marcas y POST/DELETE de imagen quedan bajo /maestro, protegidos por
Gestión de Catálogo. La subida admite JPG/PNG/WebP reales hasta8MiB y24MP:
WebP estático de hasta1000×1000/300KiB, sin ampliar ni recortar. Almacenamiento,
bitácora y transacciones reutilizados. Un fallo limpia el archivo nuevo y
conserva el anterior. La lectura pública arma campos explícitos de marca/foto;
nunca entrega costos o metadatos arbitrarios del JSON.

La página del agente incorpora marca/foto en la consulta de clasificación que
ya existía: no hay petición por tarjeta. IndexedDB guarda esos mismos datos;
fotosEnOrden incorpora las fotos generales e individuales en la caché existente.
La sincronización incompleta conserva la copia anterior. No se cambia el espacio
de ids ni se abre la base que contiene pedidos pendientes.

Cuadricula agrupa sólo los productos recibidos, respetando categorías,
subcategorías y filtros de ofertas/nuevos/habituales. La posición de la marca
es la primera presentación recibida; sus variantes siguen orden natural por
nombre (25 antes de100). Los sueltos conservan tarjetas normales. Búsqueda
mantiene resultados planos por relevancia e incluye marca. Precios compartidos
en ficha, fila y vista previa: tarifa real y promociones sin doble descuento.
Tocar una presentación abre Modal con la foto individual, nombre, código y
precio; sin petición adicional, con cierre Escape y conservación del scroll.
Fotos lazy y decodificación asíncrona; animaciones y observador existentes.

El usuario autoriza publicar a main el2026-10-22, después de suavizar la
tipografía del título. SQL064 aplicada a producción antes del push, con respaldo
restaurado y ensayo local: las145 tablas anteriores y29 triggers se conservan.
[Publicación y comprobaciones](../../informes/despliegue-marcas-2026-10-22.md).

Verificado: suite239 archivos/2941 correctas/0fallos/3históricasomitidas;
10casos con PostgreSQL y disco desechables,30 comprobaciones Chromium390/700/1440
y recarga offline, sin erroresJS. Build y lint de archivos cambiados correctos.
En la entrega inicial SQL064 se aplicó a clones y vista local limpia5173/3000;
la publicación posterior a producción está registrada arriba.
[Evidencia y alcance](../../informes/marcas-catalogo-2026-10-22.md).

El título de marca usa el mismo tipo de letra del sistema con peso medio,
tamaño16/18px, espacio entre letras más compacto y color neutro. Respeta las
mayúsculas/minúsculas guardadas, sin transformación forzada ni fuentes nuevas.


El pedido posterior del mismo día reutiliza VistaPreviaProducto también al
pulsar la foto de una tarjeta normal del catálogo. No se duplica el modal ni
se cambia la presentación de marcas; ver [[modulo/catalogo-agente]].
