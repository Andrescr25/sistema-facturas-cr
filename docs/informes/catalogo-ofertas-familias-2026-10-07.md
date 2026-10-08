# Ofertas dentro de la familia en el catálogo del agente

Segundo pedido del **2026-10-07**: las ofertas deben convivir con los productos
de su familia, con una tarjeta más llamativa. Reemplaza la separación superior
de ofertas del diseño anterior, conservando sus productos y precios.

## Resultado

- En Cliente nuevo, Todo reúne oferta, liquidación, A y B en una lista por
  categoría/subcategoría. Una familia aparece una vez, con sus promociones
  y productos normales contiguos, en el orden manual. Solo el cambio de
  categoría inicia otro bloque; filas continuas y rótulos conservados.
- Las pestañas Oferta, Liquidación, Lo más vendido y También se vende bien
  son filtros de las mismas selecciones anteriores. No cambia qué se
  recomienda: C promocionada entra; C normal queda en el buscador.
- En el catálogo general, la promoción está en la ficha de su familia,
  búsqueda, habituales, perdidos y nuevos. No hay un bloque superior de
  ofertas/liquidación ni una segunda copia creada por esa promoción.
  La sección manual de Nuevos y las de historial conservan su función.
- Oferta: borde naranja doble, sombra suave, fondo naranja claro, rótulo
  «OFERTA · −N%» y área del precio resaltada. Imagen y tamaño responsivo
  conservados. Liquidación conserva su etiqueta porcentual y morado.
- La baja ya aplicada al precio base no se descuenta otra vez. Si coincide
  con liquidación, esta aplica su descuento adicional una vez y prevalece
  en la selección, sin duplicar el producto. IVA permanece por tarifa.

## Reutilización

`catalogoClienteNuevo` añade `todos` sin retirar las listas ni los contadores
anteriores. Reutiliza `enOrdenDelCatalogo`, el mismo orden de Gestión, sin
imports nuevos en el helper canónico. `Cuadricula`/`BloquesPorCategoria` y
`Etiqueta` se conservan. `conPromocionesDelCatalogo` recibe las listas ya
cruzadas por el hook con ids de esta rama, adjunta datos a la ficha y
conserva la identidad de productos normales para `memo`.

La caché original no se modifica: al retirar una promoción desaparece el
realce al volver a calcular. Descarga, versión de caché, colas y guardas de
sesión/fotos permanecen con su contrato anterior.

## Verificación

49 pruebas existentes y nuevas aprobadas: orden, familias, Cliente nuevo,
búsqueda y promociones. Siete regresiones nuevas comprueban integración de
familias A/B/oferta, C promocionada, falta de rotación, precio base intacto,
coincidencias, retirada de promoción y conservación de fichas/caché.
Build aprobado; aviso previo de bundle grande conservado, sin instalación.

Navegador Chromium: catálogo LOCAL de 1.859 productos y 247 clientes,
18 ofertas y 429 recomendaciones. Cuatro anchos 1.440/1.100/640/390 px:
orden completo, rótulos, coordenadas, columnas, filtros, búsqueda de C,
regreso al catálogo, recarga y navegación sin señal. Tres recorridos de borde
a 1.440/640/390: promociones coincidentes, familias pequeñas, sin familia,
sin categoría, C normal y C promocionada. También catálogo general, búsqueda
de oferta, filtro general sin duplicados y oferta del cliente habitual.
Los datos de borde existen solo en la caché privada del navegador, sin
clientes ni productos inventados en PostgreSQL. Liquidación real local en
cero; se valida su presentación con esos casos de borde.

Las mismas 429 recomendaciones pasan de 42 bloques por sección/categoría
a 18 categorías completas. Filas de productos:

| Ancho | Diseño anterior `d5797d5` | Diseño actual |
|---|---:|---:|
| 1.440 (4 columnas) | 126 | 115 |
| 1.100 (3 columnas) | 156 | 150 |
| 640 / 390 (2 columnas) | 226 | 221 |

No se eliminan recomendaciones para ahorrar espacio. Las fotos locales son
reales; recursos externos y toda petición de escritura se abortan. Cero
mutaciones HTTP y cero excepciones JavaScript en los recorridos aprobados.
No se comprueba una recepción comercial ni aceptación fiscal con estas pruebas.

## Alcance

Solo local en `independencia-alegra`, visible tras integrar en
`http://localhost:5174/catalogo-agente`. Sin SQL, backend, Prisma,
dependencias nuevas, base creada, datos demo, salidas ni limpieza semanal.
Servicios habituales y configuración de Hacienda del usuario conservados.
No se hace auditoría global de DB mientras el usuario guarda su configuración
ni se restaura su trabajo para que coincida con una foto anterior.

Main conserva `cfddb83`, ajuste anterior publicado por autorización específica;
developer conserva `5013270`. Este segundo pedido no publica un cambio nuevo
en producción. Operativo **96/3** e independencia **133/14** conservados;
quince decisiones originales literalmente intactas. CLI-10/VAL-08 del usuario,
RUT-03 necesita fuente LOCAL de Maps; migración y corte aplazados.

Memoria, grafo, instrucciones y checklists actualizados al cerrar.
Evidencia privada en `/private/tmp/codex-ofertas-familia-20261007`, 0700/0600;
capturas/clientes reales fuera de Git.
