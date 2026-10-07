# Catálogo agente: filas completas dentro de cada categoría

José Andrés pidió el **2026-10-07** unir las subcategorías de cada categoría
en una cuadrícula continua, especialmente en «Cliente nuevo». Autorizó
expresamente publicar **este cambio en main**. Se lleva el ajuste visual
desde su desarrollo local; no se fusiona la rama de migración.

## Comportamiento

Las familias siguen en su orden manual y sus productos quedan contiguos.
Una familia pequeña continúa en la misma fila que la anterior; una categoría
distinta inicia otro bloque. Solo al terminar una categoría puede quedar
una fila incompleta. Cada tarjeta identifica la subcategoría en una línea
propia, con hasta dos líneas y el texto completo en `title`. «Sin
subcategoría» identifica los sueltos de las categorías que tienen familias;
siguen al final. Fotos, precios y columnas responsivas conservados.

Ejemplo Ferretería: dos clavos, una hoja de segueta y las amarras comparten
la fila de escritorio, con su familia indicada en cada tarjeta. No se
intercalan productos de otras categorías para completar espacio.

Se reutilizan `Cuadricula` y `BloquesPorCategoria` en catálogo completo,
Cliente nuevo, rebajas y nuevos. Búsqueda conserva el orden por parecido;
oferta/liquidación/A/B conservan precedencia y evitan duplicados. Precio de
rebaja no se descuenta otra vez; liquidación sigue con su porcentaje.
Nombre accesible de «Elegir cliente» también en celular.

## Checklist de entrega

- [x] Una cuadrícula por categoría; familias contiguas sin huecos interiores.
- [x] Rótulo por tarjeta y familias sin clasificar al final.
- [x] Misma selección de recomendaciones, descuentos y orden canónico.
- [x] 42 pruebas existentes de orden/familias/Cliente nuevo/búsqueda aprobadas.
- [x] Build sobre main aprobado; aviso previo de bundle grande conservado.
- [x] Recorrido en Chromium con cuatro anchos y estados de borde.

Pruebas de UI a 1.440/1.100/640/390 px con una **muestra de 1.859 productos
de la copia LOCAL**, traducida solo en el navegador al contrato de ids de
esta rama. 429 recomendaciones, 42 bloques. Casos de borde a 1.440/640/390
px: familias pequeñas, sin familia/categoría, promociones superpuestas y C.
Orden, rótulos y coordenadas de cada tarjeta comprobados; búsqueda de C,
selector, pestañas, recarga y navegación sin señal. Cero peticiones de
escritura y cero excepciones JavaScript. Fotos remotas abortadas.

La vista nueva reduce las filas de esa misma muestra de 216 a 126 en cuatro
columnas, de 236 a 156 en tres y de 277 a 226 en dos. No son conteos del
catálogo de producción: no se consultó su base ni Alegra para probar.

## Protección de producción

Respaldo privado previo de código/refs, copia y caché Vite propias, sin
backend iniciado ni archivos de entorno de producción. Parche restringido
a cuatro archivos del frontend, este informe y dos nodos del grafo.
No cambios de hooks, contratos, esquema, caché offline, permisos, pedidos,
facturación, SQL, Prisma, dependencias ni configuración de Hacienda.
No pruebas comerciales ni mensajes reales; limpieza semanal no ejecutada.

El trabajo local de migración permanece en `independencia-alegra`, visible en
`http://localhost:5174/catalogo-agente`. `developer` conserva su estado previo.
Evidencia privada en `/private/tmp/codex-catalogo-agente-main-20261007`.
Una publicación de código no acredita pruebas comerciales en producción ni
aceptación fiscal real.
