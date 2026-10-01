# Mapa del grafo — rama `independencia-alegra`

Por acá se entra. Cada nodo es un archivo con un frontmatter que lee la
máquina (`archivos:` que existen de verdad, `aristas:` hacia otros nodos) y un
cuerpo para la persona. `npm test` valida todo — incluido que este mapa nombre
cada nodo (`backend/tests/grafo.test.js`).

**Antes que nada, [CLAUDE.md](../../CLAUDE.md)**: los invariantes que rompen
algo real si se ignoran (en qué worktree la base es producción, qué no se
toca, qué no se regenera).

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

- [Compras — ya no toca Alegra para registrar una compra](modulo/compras.md)
- [Cotizaciones — en la base propia, y facturarlas crea una factura propia](modulo/cotizaciones.md)
- [Facturación de venta — ya cerrado en la migración](modulo/facturacion.md)
- [Facturas en Bodega — el despacho de cada pedido, sobre la factura propia y sin Alegra](modulo/facturas-bodega.md)
- [Faltantes — del despacho a la reimpresión, sobre la factura y el producto propios](modulo/faltantes.md)
- [Gestión de Catálogo — el rediseño de main, sobre el maestro propio](modulo/gestion-catalogo.md)
- [Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar](modulo/catalogo-agente.md)
- [Revisión de Precios — la factura del proveedor se manda a Alegra y actualiza costos](modulo/revision-precios.md) · *lado Alegra*
- [Usuarios y permisos — cada ruta de la API tiene un dueño](modulo/permisos.md)
- [Inventario — todavía no existe nada propio](modulo/inventario.md) · *pospuesto*
- [Rentabilidad — margen por producto, rotación real y cuándo se vende, en una sola pantalla](modulo/rentabilidad.md) · *productos del maestro propio; ventas todavía de Alegra*
- [WhatsApp — adentro del sistema con Baileys, con Evolution API de respaldo durante la mudanza](modulo/whatsapp.md) · *en esta rama no sale nada*

## Tablas

- [La compra es nuestra, el buzón es otra cosa](tabla/compra.md)
- [La cantidad se guarda dos veces, a propósito](tabla/compra-linea.md) — `compra_linea`
- [El buzón — lo que llegó por correo, aceptado o no](tabla/facturas-proveedores.md) — `facturas_proveedores`
- [Se crea al recibir el correo, se libera al aceptar](tabla/cuentas-por-pagar.md) — `cuentas_por_pagar`
- [La copia local del catálogo de Alegra, con columnas nuestras pegadas por SQL](tabla/alegra-products-cache.md) — `alegra_products_cache`
- [Subcategorías — nuestras, colgadas del NOMBRE de la categoría de Alegra](tabla/subcategoria.md) — `subcategoria`
- [Orden y nombre visible de las categorías de Alegra](tabla/categoria-config.md) — `categoria_config`
- [Quién vende qué — el vínculo producto ↔ proveedor, por cédula](tabla/supplier-product-mapping.md) — `supplier_product_mapping`
- [El historial de ventas — una línea por producto y factura, de donde sale la rotación](tabla/venta-historico.md) — `venta_historico`

## Decisiones

- [El buzón y la compra son tablas distintas, a propósito](decision/el-buzon-no-es-la-compra.md)
- [El total del comprobante manda, no la suma de las líneas](decision/el-total-manda-sobre-las-lineas.md)
- [Los archivos grandes se guardan como ruta, no como columna](decision/la-ruta-no-el-contenido.md)
- [Caja General es el centro — todo cobro entra, todo pago sale](decision/caja-general-es-el-centro.md)
- [El orden del catálogo vive en UN archivo del frontend, y ese archivo no puede importar nada](decision/orden-canonico-compartido.md)
- [Cambiar la categoría de muchos productos es un trabajo de fondo que se sondea](decision/cambio-de-categoria-en-segundo-plano.md) · *lado Alegra; acá es inmediato*
- [A quién pertenece una ruta — gana el prefijo más largo](decision/permisos-por-prefijo-mas-especifico.md)
- [Una línea de regalía (100 % de descuento) nunca toca el costo del producto](decision/la-regalia-no-es-costo.md)

## Lecciones

- [En los worktrees main/developer, "local" es producción](leccion/la-db-local-es-produccion.md)
- [Dos funciones `texto` con firmas opuestas](leccion/dos-helpers-texto.md)
- [Un id propio y uno de Alegra no son intercambiables](leccion/ids-propios-y-de-alegra-no-se-mezclan.md)
- [El precio va sin IVA y el costo con IVA — compararlos crudos da un margen falso](leccion/precio-sin-iva-costo-con-iva.md)
- [Un impuesto "principal" usado como si fuera el de cada línea — tres veces](leccion/el-impuesto-es-de-cada-linea.md)
- [Exceso y baja de precio son ofertas distintas](leccion/dos-clases-de-oferta.md)
- [El proveedor de un producto sale del mapeo, por cédula](leccion/proveedor-por-cedula.md)
- [ENVIADA prueba que la compra ya existe en Alegra — reenviarla duplica el gasto](leccion/factura-enviada-no-se-repite.md) · *lado Alegra*
- [El día del calendario no se saca con toISOString()](leccion/fecha-utc-costa-rica.md)
- [Los teléfonos de Alegra vienen sucios](leccion/telefonos-sucios.md)
- [Un borrador no es una venta — el historial contaba 24 borradores y 132 anuladas](leccion/un-borrador-no-es-una-venta.md)
- [Las fotos de Alegra cambian de firma en cada pedido y cada una le cuesta a Chrome ~14,7 MB de cuota](leccion/fotos-del-catalogo-en-la-tablet.md)

## Bloqueos

- [Inventario espera un conteo físico que es del usuario](bloqueo/conteo-fisico.md)
- [node_modules es un enlace al árbol de producción](bloqueo/prisma-no-se-regenera.md)
- [Las 882 facturas de compra viejas no tienen su XML — las nuevas sí lo guardan](bloqueo/xml-historico-sin-recuperar.md)
- [Lo ya registrado con la tarifa equivocada sigue así — decisión del usuario y su contador](bloqueo/impuestos-historicos-en-alegra.md)

## Lo que vino de `developer`

Desde la fusión del 2026-09-24 este mapa incluye los nodos de
`developer`/`main`. Los marcados *lado Alegra* describen cómo trabaja eso
allá, donde Alegra sigue siendo el sistema: en esta rama ya lo reemplazó lo
propio (Compras no manda nada a Alegra, sección 8) o lo va a reemplazar. Se
conservan porque explican el código que sigue vivo en `main` hasta el corte.
Cada rama sigue describiendo SU código: el validador exige que cada archivo
citado exista en la rama.
