# Marcas y presentaciones del catálogo — 2026-10-22

Gestión conserva sus categorías, subcategorías y filas. El único acceso nuevo
es **Marcas**, junto a las acciones de cada subcategoría. Allí se crea la marca,
se eligen productos existentes y se asigna una foto general. El agente muestra
marca/foto/lista de presentaciones/precio con IVA. Tocar32mm abre su foto
individual, código y precio, conservando el lugar al cerrar.

## Implementación

Se reutilizan maestro producto, taxonomía, permiso /maestro, transacciones,
bitácora, almacenamiento, Modal/Boton, agrupado y observador del catálogo,
IndexedDB y caché de fotos. No se agregan dependencias ni se regenera Prisma.
SQL064 crea marca_catalogo y su FK opcional desde producto, sin duplicar fichas
ni alterar nombres/precios/impuestos/inventario/fotos individuales. El trigger
suelta una marca incompatible al mover el producto por las rutas existentes.
El nombre identifica la agrupación visual dentro de su subcategoría; no se
infiere del código ni se comparte una foto entre clases distintas de productos.

La subida valida bytes,8MiB/24MP, genera un WebP estático de hasta1000×1000 y
300KiB sin recortar ni ampliar. Un fallo de bitácora revierte y limpia sólo el
archivo nuevo. La clasificación pública se incorpora a la consulta por página
ya existente; marca/imagen tienen lista explícita de campos sin costos.

Los grupos sólo reúnen productos del filtro actual; ofertas y cliente nuevo
no recuperan variantes excluidas. Las presentaciones usan orden natural.
Búsqueda sigue plana por relevancia y encuentra también marca. El cálculo de
precio se extrae del componente existente para compartir IVA/promociones entre
ficha normal, presentación y vista previa. No se descuenta otra vez una baja.
Las fotos generales e individuales entran en la misma caché sin señal; no se
abren ni se borran las colas de facturación. Una página cuya clasificación
falla cancela la actualización y conserva la copia anterior completa.

## Verificación

- Suite completa por archivo con base desechable y red externa bloqueada:
  **239 archivos,2944 pruebas,2941 correctas,0fallos,3omitidas históricas**.
  Auditoría/corte que exigen inventario en cero se mantienen fuera de esa
  activación; no se puso a cero el inventario para hacerlas pasar.
-10casos nuevos reales con PostgreSQL/disco y BEGIN/ROLLBACK: clasificación,
  identidad, traslados, nombres, retiro, idempotencia SQL064, bytes de imagen,
  tamaño/proporción y reversión de archivos/bitácora. Pruebas puras de agrupado,
  impuestos, ofertas, búsqueda y fotos sin conexión; lista pública explícita.
- **30comprobaciones de navegador**, sin erroresJS: crear/asignar por la UI,
  multipart real de foto, permisos401/403, diseño390/700/1440, orden25/32/38/50,
  sueltos visibles, búsqueda, foto individual correcta y cero peticiones API al
  abrirla, cierre Escape sin perder scroll, recarga offline y ambas fotos
  decodificadas desde caché. Las imágenes faltantes del respaldo se sustituyen
  sólo en el servidor de ensayo; las fotos general/individual comprobadas son
  archivos reales independientes generados para el fixture desechable.
- Build correcto y lint de todos los archivos de frontend cambiados correcto.
  El lint global conserva **9errores/25avisos preexistentes**, reproducidos sin
  el cambio en7ab6e1c; no se altera código ajeno para silenciarlos.
- Estructura y grafo:23comprobaciones correctas; revisión visual de capturas.
  Evidencia privada en /private/tmp/codex-marcas-catalogo-20261022/.

## Entrega local

SQL064 se aplicó únicamente a bases locales desechables y al clon limpio de
la vista, con respaldo previo. Vista5173/3000 actualizada; GET de pantalla,
salud, catálogo y marcas devuelven200. No se asignan marcas ficticias a los
productos del clon de vista: el usuario puede organizar sus productos ahí.
No se consultó ni modificó producción ni se enviaron mensajes reales.

Publicación **sólo developer**. Main conserva7ab6e1c; SQL064 debe aplicarse
como paso explícito de una publicación posterior, antes del push de main.
