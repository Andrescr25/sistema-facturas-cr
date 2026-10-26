---
id: modulo/marcas-catalogo
tipo: modulo
titulo: Marcas del catálogo — foto general y presentaciones con vista previa
estado: vigente
archivos:
  - frontend/src/hooks/useListaCatalogo.js
  - backend/src/modules/productos/taxonomia.service.js
  - backend/src/modules/productos/nombresCatalogo.service.js
  - backend/scripts/catalogo/corregir-nombres.js
  - backend/tests/nombresCatalogoLocal.test.js
  - docs/informes/nombres-marcas-2026-10-25.md
  - frontend/src/components/catalogo/PortadaMarca.jsx
  - backend/src/utils/marcaPublica.js
  - docs/informes/marcas-clientes-2026-10-24.md
  - docs/informes/despliegue-portadas-065-2026-10-22.md
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
  relacionado: [modulo/portal-clientes, modulo/gestion-catalogo, modulo/catalogo-agente, decision/orden-canonico-compartido, leccion/fotos-del-catalogo-en-la-tablet, leccion/precio-sin-iva-costo-con-iva, leccion/lo-publico-no-lleva-costo-ni-margen]
medido: 2026-10-25
---

## La foto de marca es una portada — 2026-10-22

Pedido del usuario: «la foto de marca es una foto con fondo, todo llamativo…
no una card más de producto, sino una portada para dar a presentar los
productos». `TarjetaMarca` ocupa dos casillas (`anchoEnFila`: la fila entera
en tablet y teléfono). La foto llena el panel con encuadre centrado; el nombre
de la marca va al lado (abajo en el teléfono), nunca encima de las letras del
póster. Sin foto, la portada es
el nombre sobre los colores del sistema. Si la portada no cabe en lo que queda
de la fila, la siguiente ficha suelta de la misma subcategoría se adelanta
para no dejar hueco (se respeta «llenar las filas» del 2026-10-07); entre
subcategorías no se adelanta nada.

Vista previa: la MARCA es el título y el producto va abajo con su precio
(«hazlo al revés sino confunde»). Un producto sin marca conserva su nombre
de título.

Corrección posterior del mismo día: el usuario compara aldabas (cinco
presentaciones) y llantas (dos) y pide quitar las franjas de la portada. El
tope de22rem dejaba la foto pequeña dentro de un panel que crecía con la
lista. Ahora el panel reserva la proporción ancho/alto guardada al subir la
foto (2:3 para copias antiguas sin dimensiones), y se estira si la lista
necesita más alto. `object-cover` llena todo el panel con un posible recorte
centrado de presentación; no modifica ni recorta el archivo guardado.
`min-w-0 w-full` impide que la proporción ensanche la columna al estirarla.
En teléfono la portada ocupa su propia fila y conserva su proporción.
Una sola imagen lazy/asíncrona, sin copia desenfocada, límite de altura,
dependencias ni consultas nuevas; aplica a imágenes existentes y nuevas sin
volver a subirlas. Se conservan precios, agrupación y vista previa individual.

Verificación del ajuste:59 pruebas dirigidas (estructura/grafo, marcas,
filas y caché), build y lint correctos;171 comprobaciones Chromium a
390/700/1100/1440px con fotos verticales/cuadradas/horizontales,2/5/20
presentaciones, copia sin dimensiones, imagen lenta sin salto de contenido,
recarga offline y vista previa con Escape/foco/scroll. Sin erroresJS ni
desbordamientos. Evidencia privada:codex-portadas-marcas-20261022.
La corrección de imagen no requiere SQL. Su entrega inicial quedó en
developer porque1a62b95 de Claude requería SQL065. El usuario autoriza después
migrar y publicar ambos: SQL065 aplicada el22/10 a las23:53:47CR, con respaldo
restaurado y verificación de integridad antes de main.
[Publicación y pruebas](../../informes/despliegue-portadas-065-2026-10-22.md).

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


2026-10-24: Catálogo Clientes incorpora marcas y familias. Ambos catálogos
comparten `PortadaMarca` (foto sin franjas, título, cantidad y pie) y el
agrupador natural, que acepta el nombre de ambos DTO. Cada pantalla conserva
su precio y sus acciones: el agente solo muestra; el portal ofrece carrito
por presentación a cuentas autenticadas y vista previa pública. Los dos
servicios usan `marcaPublica` para proyectar la imagen sin metadatos privados.
No cambia Gestión ni requiere SQL nuevo; ver [[modulo/portal-clientes]].


2026-10-25: el usuario pide un patrón legible para todos los productos en
marcas, conservando medidas y empaque. La corrección es un plan revisado de
nombres del maestro, no una transformación automática de lo que escriba cada
proveedor. El servicio permite previsualizar, aplica en una transacción con
respaldo previo y bitácora, comprueba el nombre y marca esperados y es
idempotente. Sólo actualiza nombre/fecha; referencias, precios, asociaciones,
fotos y líneas históricas se conservan. No tiene una ruta pública ni requiere
migración. Alcance y comprobaciones en el informe enlazado.

`compararPresentaciones` comparte el alfabeto español y el orden de medidas
entre agrupación de ambos catálogos, lista de Gestión y selección de Marcas. Interpreta
fracciones y números mixtos: 1/2, 3/4, 1, 1 1/4, 1 1/2, 2; `numeric: true`
por sí solo ordenaba mal esas medidas. No cambia el orden manual de categorías,
subcategorías o productos sueltos, ni modifica los objetos recibidos.

La consulta de Gestión incluye marca_catalogo_id en su proyección existente,
sin JOIN ni petición adicional. Sus filas sólo intercambian posiciones entre
presentaciones de la misma marca: los productos sueltos conservan su lugar.
