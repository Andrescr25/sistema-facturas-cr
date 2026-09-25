# Mapa del grafo — ramas `developer` / `main`

Por acá se entra. Cada nodo es un archivo con un frontmatter que lee la
máquina (`archivos:` que existen de verdad, `aristas:` hacia otros nodos) y un
cuerpo para la persona. `npm test` valida todo — incluido que este mapa nombre
cada nodo (`backend/tests/grafo.test.js`).

**Antes que nada, [CLAUDE.md](../../CLAUDE.md)**: los invariantes que rompen
algo real si se ignoran. El primero: en este worktree la base, Alegra y el
correo son los de PRODUCCIÓN.

## Cómo usarlo

1. Buscá el **módulo** de lo que vas a tocar. Es el nodo con más contexto.
2. Seguí sus aristas: `depende_de` (tablas), `bloqueado_por` (qué impide
   avanzar), `relacionado`.
3. Antes de cambiar una tabla o un flujo, leé las **decisiones** y
   **lecciones** que lo tocan: dicen por qué es así y qué salió mal antes.
4. Si cambiás algo que un nodo describe, actualizalo en el mismo commit —
   `npm test` avisa en su salida qué nodos tienen código más nuevo que su
   fecha `medido`.

## Módulos

- [Gestión de Catálogo — categorías, subcategorías y fotos, en el orden del agente](modulo/gestion-catalogo.md)
- [Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar](modulo/catalogo-agente.md)
- [Revisión de Precios — la factura del proveedor se manda a Alegra y actualiza costos](modulo/revision-precios.md)
- [Usuarios y permisos — cada ruta de la API tiene un dueño](modulo/permisos.md)
- [Facturas en Bodega — el despacho de cada pedido, sin hacer esperar a Alegra](modulo/facturas-bodega.md)
- [Rentabilidad — margen por producto, rotación real y cuándo se vende, en una sola pantalla](modulo/rentabilidad.md)

## Tablas

- [La copia local del catálogo de Alegra, con columnas nuestras pegadas por SQL](tabla/alegra-products-cache.md) — `alegra_products_cache`
- [Subcategorías — nuestras, colgadas del NOMBRE de la categoría de Alegra](tabla/subcategoria.md) — `subcategoria`
- [Orden y nombre visible de las categorías de Alegra](tabla/categoria-config.md) — `categoria_config`
- [Quién vende qué — el vínculo producto ↔ proveedor, por cédula](tabla/supplier-product-mapping.md) — `supplier_product_mapping`
- [El historial de ventas — una línea por producto y factura, de donde sale la rotación](tabla/venta-historico.md) — `venta_historico`

## Decisiones

- [El orden del catálogo vive en UN archivo del frontend, y ese archivo no puede importar nada](decision/orden-canonico-compartido.md)
- [Cambiar la categoría de muchos productos es un trabajo de fondo que se sondea](decision/cambio-de-categoria-en-segundo-plano.md)
- [A quién pertenece una ruta — gana el prefijo más largo](decision/permisos-por-prefijo-mas-especifico.md)
- [Una línea de regalía (100 % de descuento) nunca toca el costo del producto](decision/la-regalia-no-es-costo.md)

## Lecciones

- [En los worktrees main/developer, "local" es producción](leccion/la-db-local-es-produccion.md)
- [El precio va sin IVA y el costo con IVA — compararlos crudos da un margen falso](leccion/precio-sin-iva-costo-con-iva.md)
- [Un impuesto "principal" usado como si fuera el de cada línea — tres veces](leccion/el-impuesto-es-de-cada-linea.md)
- [Exceso y baja de precio son ofertas distintas](leccion/dos-clases-de-oferta.md)
- [El proveedor de un producto sale del mapeo, por cédula](leccion/proveedor-por-cedula.md)
- [ENVIADA prueba que la compra ya existe en Alegra — reenviarla duplica el gasto](leccion/factura-enviada-no-se-repite.md)
- [El día del calendario no se saca con toISOString()](leccion/fecha-utc-costa-rica.md)
- [Los teléfonos de Alegra vienen sucios](leccion/telefonos-sucios.md)
- [Un borrador no es una venta — el historial contaba 24 borradores y 132 anuladas](leccion/un-borrador-no-es-una-venta.md)

## Bloqueos

- [node_modules es un enlace al árbol de producción](bloqueo/prisma-no-se-regenera.md)
- [Lo ya registrado con la tarifa equivocada sigue así — decisión del usuario y su contador](bloqueo/impuestos-historicos-en-alegra.md)

## El grafo de la otra rama

`independencia-alegra` tiene su propio grafo, con lo que vive allá (Compras
sin Alegra, facturación propia, el buzón de XML…). Cada rama describe SU
código —el validador exige que cada archivo citado exista en la rama—, y se
juntan cuando las ramas se unan.
