# Marcas y subcategorías en Catálogo Clientes — 2026-10-24

Pedido: aprovechar en el portal las marcas y familias configuradas en Gestión
para el agente. Implementado por Codex en worktree aislado desde bfe4441.

El catálogo presenta categoría, subcategoría y portada de marca con tabla de
presentaciones y precios con IVA. Cada fila abre su foto individual y, con
cuenta, permite agregar o ajustar su cantidad en el carrito existente.
Productos sin marca mantienen tarjetas; sin familia, Otros cuando corresponda.
Nombre visible de categoría conservando el real en el filtro. Búsqueda por
nombre, referencia, marca o subcategoría sin acentos.

Se reutilizan el agrupador de marcas, la portada común sin franjas, el modal
y los controles de cantidad. El visitante abre la ficha ya cargada sin API
privada; la cuenta consulta historial propio como antes. Componentes dibujan,
useFichaProductoCliente concentra la llamada. La portada personal conserva
su ranking/ofertas en tarjetas normales, mostrando marca/familia cuando existe.

Consulta SQL con clasificación compatible y posiciones manuales, paginación
60, desempate por id. El agrupador continúa marcas entre páginas sin portada
duplicada ni recuperar productos ajenos al filtro. No hay peticiones por
marca/producto, descarga completa del maestro, librería o esquema nuevos.
Fotos lazy/async con espacio reservado. Proyección explícita y tipada de
imagen también en el agente: nunca costo, margen, inventario o JSON libre.

## Verificación

Verificado en dos clones desechables de la base local, sin conexiones a
producción, mensajes, cron ni limpieza. Los fixtures se revierten con ROLLBACK.
SQL064 ya estaba aplicada; no requiere migraciones nuevas.

- Suite completa:245 archivos,3010 casos;3007 aprobados,0fallos y3omisiones
  históricas de los ensayos que requieren apertura original en cero.
- 55 dirigidas finales:14 contra PostgreSQL (10 marcas existentes y4 públicas
  nuevas), proyección sin costo, agrupación entre páginas, estructura, grafo
  y separación de los dos sitios.
- 84 comprobaciones Chromium sobre portal compilado a320/390/700/1440px,
  visitante y cuenta real de prueba local: búsqueda/filtros,80 presentaciones
  a través de dos páginas sin duplicados, marca sin foto, producto suelto,
  foto propia, Escape/foco/scroll, cantidades, recarga y salida de cuenta.
  Sin erroresJS/HTTP ni desborde. La fuente externa existente se sustituye
  por CSS vacío en la prueba; ningún acceso a una API remota.
- 171 regresiones visuales del agente a390/700/1100/1440px: imágenes
  verticales/cuadradas/horizontales,2/5/20 variantes, dimensiones antiguas,
  imagen lenta sin salto, vista previa y recarga offline;0erroresJS.
- Build interno y build:portal correctos y separados; lint de archivos
  modificados y diff --check correctos. Se mantienen los avisos previos
  de Browserslist desactualizado y tamaño del paquete interno.

Evidencia privada: `/private/tmp/codex-marcas-clientes-20261024/`, sin datos
de producción nuevos. Se integra/publica únicamente el cambio propio sobre
developer; main conserva bfe4441 hasta una publicación posterior. No se
modifica el entorno5173/3000 de otro agente ni quedan servidores de prueba.

