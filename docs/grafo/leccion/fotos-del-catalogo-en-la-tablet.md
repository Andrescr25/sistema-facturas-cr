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
aristas:
  relacionado: [modulo/catalogo-agente]
medido: 2026-09-27
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
