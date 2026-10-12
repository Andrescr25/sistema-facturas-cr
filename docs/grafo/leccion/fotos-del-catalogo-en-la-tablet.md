---
id: leccion/fotos-del-catalogo-en-la-tablet
tipo: leccion
titulo: Las fotos de Alegra cambian de firma en cada pedido y cada una le cuesta a Chrome ~14,7 MB de cuota
estado: vigente
archivos:
  - frontend/src/utils/cacheImagenesCatalogo.js
  - frontend/public/sw.js
  - frontend/src/services/api.js
  - backend/tests/cacheImagenesCatalogo.test.js
  - frontend/src/utils/urlArchivo.js
  - frontend/src/hooks/useCatalogoAgente.js
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
aristas:
  relacionado: [modulo/catalogo-agente]
medido: 2026-10-11
---

Reportado desde una tablet (la app instalada como acceso directo): al
actualizar el catálogo, todo iba bien hasta las fotos y ahí salía al inicio
de sesión; después el catálogo quedaba en orden alfabético y las fotos iban
apareciendo de a una. Eran tres problemas, uno encima del otro.

1. **La actualización mandaba al ingreso a la mitad.** El orden de Gestión de
   Catálogo (`config-catalogo`) y la rotación piden sesión; la sesión dura 12
   horas. Con ella vencida respondían 401, y el interceptor de `api.js`
   manda al ingreso ante cualquier 401 — justo antes de bajar las fotos. Los
   productos ya estaban guardados; el orden y las fotos no. Ahora, en
   `/catalogo-agente`, un 401 no saca de la pantalla: se conserva el orden
   guardado y se avisa que hay que iniciar sesión para traerlo. Abrir esas
   dos rutas sin sesión es decisión del usuario (se propuso, no se hizo).
2. **La firma de cada foto cambia en cada pedido.** Alegra devuelve URLs
   firmadas (`?Expires=…&Signature=…`, vencen en ~8 días) y firma de nuevo en
   cada respuesta. La caché guardaba con la URL completa: después de cada
   actualización ninguna foto coincidía, se bajaban todas y los duplicados
   se acumulaban. La llave ahora es origen + ruta (la ruta ya lleva un hash
   del archivo). Una firma vencida no se guarda: su error es opaco,
   indistinguible de una foto, y dejaría la foto rota bajo la llave estable.
3. **Cada foto guardada le cuesta a Chrome ~14,7 MB de cuota** (medido: una
   foto de 14 KB). El CDN no manda CORS, así que las respuestas son "opacas"
   y Chrome les suma un relleno para no revelar su tamaño. Las ~1.900 fotos
   serían ~27 GB: no caben, y con la cuota llena también falla guardar el
   catálogo en IndexedDB. Por eso el worker ya no guarda lo que se mira;
   la sincronización guarda en el orden en que se ve el catálogo y para con
   un 20 % de la cuota libre. Lo que no cabe se ve con internet.

La salida de fondo para 3 es servir las fotos desde nuestro propio dominio
(un proxy limitado al CDN de Alegra): respuestas no opacas, tamaño real, y
todas caben (~45 MB). Es una ruta pública nueva: decisión del usuario.

La lección de método: "es un problema de caché" era cierto a medias. Lo que
lo desarmó fue reproducir la actualización en un navegador limpio, sin
sesión, mirando qué respondía cada pedido — y medir la cuota en vez de
suponerla.

## Después del corte: las fotos son propias (2026-10-11)

Lo de arriba describe las fotos de Alegra. Desde el corte la foto es una
ruta nuestra (`/archivos/productos/<id>-<hora>-<azar>.jpg`) que sirve el
backend, y el punto 3 dejó de ser un límite: nuestro backend manda CORS, la
foto se guarda legible y pesa lo que pesa. Pero el día del corte el catálogo
sin señal quedó SIN NINGUNA foto, por dos huecos que se tapaban uno al otro:

- `fotosEnOrden` descartaba toda dirección que no fuera completa
  (`new URL('/archivos/…')` lanza). No se guardaba nada, sin error ni aviso.
- `public/sw.js` solo buscaba en lo guardado las fotos de `cdn*.alegra.com`,
  y a todo otro dominio lo dejaba pasar — y en Render el backend es otro
  dominio que la web.

Cómo quedó:

- **La llave de lo guardado es la dirección que pide el `<img>`.** La tarjeta
  la arma con `urlArchivo()` y el guardado recibe esa misma función
  (`fotosEnOrden(enOrden, urlArchivo, configParaOrden)`). Si las dos no coinciden, la foto
  está guardada y no se encuentra. Una prueba ata las dos puntas.
- La foto propia se pide con `mode: 'cors'`: respuesta legible, tamaño real,
  y un 404 no se guarda bajo la llave de la foto.
- El worker reconoce la foto propia por la RUTA (`/archivos/`), antes de
  descartar otros dominios, y busca con `ignoreVary`: el backend contesta
  `Vary: Origin`, se guardó pedida con CORS y el `<img>` la pide sin él.
- Las de Alegra que quedaban guardadas se borran en la primera actualización
  (ya no están en el catálogo): eso devuelve los ~14,7 MB de cuota de cada una.
- El aviso de "no cupieron" quedó solo para falta de lugar; lo que no se pudo
  bajar (señal cortada, archivo ausente, firma vencida) se cuenta y se dice
  aparte, porque se arregla actualizando de nuevo.

MEDIDO en Chromium con la web y la API en dos direcciones, como en Render:
una actualización guardó 1.827 fotos (268 MB, todas `cors/200`); con los dos
servidores APAGADOS se recargó la página y se bajó por todo el catálogo: 45
de 45 fotos a la vista cargaron y el servidor no recibió ningún pedido. Una
foto no guardada falló, como corresponde. En producción: 1.844 productos
activos con foto propia; el backend contesta `access-control-allow-origin`
con el origen de la web y `cross-origin-resource-policy: cross-origin`.

Lo que cada tablet tiene que hacer una vez: abrir el catálogo con internet
(toma el worker nuevo) y actualizar. La primera vez baja todas las fotos
(~250 MB): conviene con wifi. Después solo baja las nuevas.

La lección de método, otra vez: las pruebas del guardado pasaban todas —
con direcciones de Alegra. Cuando cambia DE DÓNDE sale un dato, hay que
volver a correr el recorrido entero con el dato nuevo, no solo las pruebas.

2026-10-11, introducciones visuales: `fotosEnOrden` incluye también las dos
variantes de cada `categoria_config.imagen`, después de las fotos de productos
para conservar su prioridad. Usan `urlArchivo` y la misma llave/cache; así
la limpieza de fotos retiradas no las descarta en cada actualización. Ambas
versiones se guardan para que girar o cambiar de tamaño sin señal también
funcione. Un fallo/cuota insuficiente conserva nombre y altura de la cabecera,
y permite seguir recorriendo. [Validación](../../informes/catalogo-categorias-visuales-2026-10-11.md).
