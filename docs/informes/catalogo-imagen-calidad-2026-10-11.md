# Imagen de categoría: subida habilitada y resolución para la escena grande

Pedido: error 503 al subir en Gestión de Catálogo y mala calidad de la foto.

## Causa y corrección

El despliegue de las categorías visuales requiere SQL 055: columna nullable
`categoria_config.imagen JSONB`. Producción quedó sin ese paso, según la
inspección registrada después de publicar `418134f`. La lectura lo tolera,
pero guardar devolvía 503. El push no ejecuta migraciones y el endpoint tampoco
debe modificar el esquema. Se detecta ahora antes de comprimir/guardar archivos
y se conserva un mensaje claro para el administrador.

La compresión inicial era para cabeceras pequeñas: WebP 960×540 y 480×270,
calidad 72 y presupuestos 180/60 KiB que podían bajar todavía más la resolución.
Al pasar a una escena de hasta 1000×550 en escritorio y casi 500 px de alto en
teléfono, esas miniaturas se ampliaban; el recorte horizontal agravaba el efecto
en móvil.

Ahora se preparan, solo al subir:

- Escritorio: hasta 1920×1080, máximo 800 KiB.
- Móvil: hasta 960×1280, máximo 400 KiB, recorte central vertical.
- Calidad 84; primero baja a 80/76 y solo después cambia ancho a 1600/1440 o
  800/720. Una foto que siga excediendo el presupuesto se rechaza, sin reducirla
  a miniatura. Fuentes pequeñas nunca se agrandan; pueden conservar su proporción
  si Sharp evita ampliar. El navegador completa el recorte con `object-fit: cover`.
- JPG/PNG/WebP hasta 8 MiB y 24 megapíxeles, orientación corregida y EXIF eliminado.
- Mismo JSON, dos URLs y la misma caché sin señal. `picture` sigue eligiendo solo
  la variante apropiada, con lazy loading, decoding async y prioridad baja.

Las fotos ya comprimidas no recuperan detalle automáticamente: hay que volver
a subir el original. El selector recomienda una fuente de 1920×1280 o mayor
con el motivo central, para que ambos recortes lo incluyan.

El estado y envío del modal se extrajeron a `useImagenCategoria.js`, y las tres
hojas de animación usan la paleta por rol con `theme()`. Se retiró su excepción
de la prueba de estructura; no se añadió deuda ni dependencia.

## Verificación aislada

- Suite completa: 2623 casos, 2295 pasan, 328 se omiten por sus condiciones,
  cero fallos. Se usó PostgreSQL desechable en el puerto local existente 5552,
  dotenv deshabilitado y bloqueo de conexiones externas. La copia requiere zona
  `America/Costa_Rica`: `createdb` no conserva la zona de la base original; sin
  ella una prueba de sugerencias contaba 99 días para una venta de hace 100.
- 21 pruebas adicionales de imagen/taxonomía con `PROBAR_BASE_LOCAL=1`, todas
  pasan: multipart, nombres/orden conservados, reemplazo, borrado, reversión
  ante fallo de bitácora y migración repetible. Ausencia de la columna → 503;
  misma subida después de SQL 055 → 200. No quedan archivos de la subida fallida.
- Las diez pruebas de calidad siempre se ejecutan: fuente grande para móvil 2x,
  límites con ruido de mucho detalle, motivo central, orientación EXIF,
  fuente pequeña, bytes corruptos y límite de píxeles.
- Build de frontend correcto. Chromium real contra las rutas nuevas, disco
  propio y PostgreSQL dentro de una transacción: subir sin migración, aplicar
  SQL únicamente en esa copia, guardar, guardar otra vez y quitar. Se envió el
  archivo desde el navegador, sin reconstruir multipart desde CDP, que omite
  los bytes del archivo. Todas las escrituras fueron sobre una categoría ZZ;
  la transacción se revierte y sus archivos se retiran.
- Catálogo con 1859 productos locales: oscuro → foto/nombre → aclarar → claro;
  sin errores JS ni desbordamiento en 320, 390, 640 y 1440 px. Variante móvil y
  escritorio seleccionadas por `picture`. La foto real de prueba es de 768×1024;
  en móvil 390 se sirve sin ampliarla a una escena de 364×488, suficiente para
  densidad 2x. La prueba de resolución grande usa una fuente separada de 2400×1600.

No se prueban endpoints de escritura de producción ni se ejecuta limpieza
semanal. Se conservan la base, fotos y configuración de la vista 5173/3000;
no se reinician servicios ajenos ni se instalan/regeneran dependencias.

## Paso de producción pendiente

SQL a aplicar, antes de publicar la corrección:

```sql
ALTER TABLE categoria_config ADD COLUMN IF NOT EXISTS imagen JSONB;
```

El archivo completo es `backend/migrations/independencia/055_imagen_categoria_catalogo.sql`
y agrega también el comentario de la columna. Es repetible y no cambia productos,
nombres, orden ni registros comerciales. Falta autorización específica para ese
paso en la base de producción; la autorización de Git no la incluye. El arreglo
se prepara en `developer`, sin desplegarlo como prueba en `main`.
