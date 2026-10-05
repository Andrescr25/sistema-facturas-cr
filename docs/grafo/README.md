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

- [Portal — carrito, cuenta y pedidos con ids propios; facturar crea una factura propia](modulo/portal-clientes.md)
- [Inicio — trabajo pendiente contado desde las tablas propias](modulo/dashboard.md)
- [Excel de los reportes propios — filtros y descarga sin modificar datos](modulo/exportaciones-reportes.md)
- [Demostración local de Reporte de Proveedores — retirada tras la revisión del usuario](modulo/demo-reporte-proveedores.md)
- [Conciliación de ventas — diferencias con Alegra por mes, documento y línea](modulo/conciliacion-ventas.md)
- [Conciliación de cobros — destino de cada recibo y saldo actual de las facturas](modulo/conciliacion-cobros.md)
- [Conciliación de compras — vínculos históricos y candidatos sin confirmar](modulo/conciliacion-compras.md)
- [Conciliación de notas — aplicaciones a facturas y débitos históricos](modulo/conciliacion-notas-credito.md)
- [Débitos históricos — el documento original y su vínculo de crédito propio](modulo/historico-debitos-ingreso.md)
- [Ensayo de corte y auditoría de fichas — candidata separada y plan de vuelta atrás](modulo/ensayo-corte.md)
- [Lectura histórica para migración — GET sin capacidad de escritura](modulo/lectura-migracion-alegra.md)
- [Originales electrónicos de ventas — PDF, XML y huellas fuera de Git](modulo/archivo-ventas-electronicas.md)

- [Compras — ya no toca Alegra para registrar una compra](modulo/compras.md)
- [Cotizaciones — en la base propia, y facturarlas crea una factura propia](modulo/cotizaciones.md)
- [Facturación de venta — ya cerrado en la migración](modulo/facturacion.md)
- [Facturación sin señal — copia propia y colas conservadas](modulo/facturacion-offline.md)
- [Facturas por correo — PDF propio y destinatario confirmado](modulo/correo-facturas.md)
- [Facturas en Bodega — el despacho de cada pedido, sobre la factura propia y sin Alegra](modulo/facturas-bodega.md)
- [Faltantes — del despacho a la reimpresión, sobre la factura y el producto propios](modulo/faltantes.md)
- [Gestión de Catálogo — el rediseño de main, sobre el maestro propio](modulo/gestion-catalogo.md)
- [Catálogo del agente — el mismo orden que Gestión de Catálogo, de solo mirar](modulo/catalogo-agente.md)
- [Relacionar Productos — la línea del proveedor se cuelga de `producto.id`](modulo/relacionar-productos.md) · *relacionar, crear producto y el buzón: todo por `producto.id`*
- [Revisión de Precios — costos y precios de la factura del proveedor, contra el maestro propio](modulo/revision-precios.md)
- [Usuarios y permisos — cada ruta de la API tiene un dueño](modulo/permisos.md)
- [Inventario propio — apertura en cero, conteo y kardex](modulo/inventario.md)
- [Reporte del Contador — el mes de ventas y compras, de las tablas propias](modulo/reporte-contador.md)
- [Rentabilidad — margen por producto, rotación real y cuándo se vende, en una sola pantalla](modulo/rentabilidad.md) · *todo por `producto.id`, también el costo de las compras*
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
- [Las ventas — una vista sobre las facturas propias emitidas](tabla/venta-linea.md) — `venta_linea`
- [El historial de ventas viejo — ya no se lee ni se llena](tabla/venta-historico.md) — `venta_historico` · *retirado en esta rama*
- [Productos nuevos — lista manual por producto propio, retiro por entrada](tabla/producto-nuevo-catalogo.md)

## Decisiones

- [El buzón y la compra son tablas distintas, a propósito](decision/el-buzon-no-es-la-compra.md)
- [El total del comprobante manda, no la suma de las líneas](decision/el-total-manda-sobre-las-lineas.md)
- [El avance de una factura del buzón se cuenta desde sus líneas — soltar una relación no inventa un estado](decision/el-avance-de-la-factura-sale-de-sus-lineas.md)
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
- [Cambiar los ids del catálogo conserva pedidos y facturas pendientes](leccion/cache-con-ids-propios-no-borra-pendientes.md)
- [Un doble de Prisma no valida tipos — un NULL donde el cliente espera un texto revienta todas las lecturas](leccion/el-doble-de-prisma-no-valida-tipos.md)
- [El precio va sin IVA y el costo con IVA — compararlos crudos da un margen falso](leccion/precio-sin-iva-costo-con-iva.md)
- [Un impuesto "principal" usado como si fuera el de cada línea — tres veces](leccion/el-impuesto-es-de-cada-linea.md)
- [Exceso y baja de precio son ofertas distintas](leccion/dos-clases-de-oferta.md)
- [Una ruta pública entrega una lista de campos, nunca el objeto entero — salían el costo y los márgenes](leccion/lo-publico-no-lleva-costo-ni-margen.md)
- [El permiso se saltaba cambiando una mayúscula — el guardián comparaba distinto que Express](leccion/el-permiso-se-compara-como-express.md)
- [El proveedor de un producto sale del mapeo, por cédula](leccion/proveedor-por-cedula.md)
- [ENVIADA prueba que la compra ya existe en Alegra — reenviarla duplica el gasto](leccion/factura-enviada-no-se-repite.md) · *lado Alegra*
- [El día del calendario no se saca con toISOString()](leccion/fecha-utc-costa-rica.md)
- [Los teléfonos de Alegra vienen sucios](leccion/telefonos-sucios.md)
- [Un borrador no es una venta — el historial contaba 24 borradores y 132 anuladas](leccion/un-borrador-no-es-una-venta.md)
- [Las fotos de Alegra cambian de firma en cada pedido y cada una le cuesta a Chrome ~14,7 MB de cuota](leccion/fotos-del-catalogo-en-la-tablet.md)

## Bloqueos

- [Carga histórica electrónica — estado real pendiente de revisión fiscal](bloqueo/carga-electronica-historica.md)
- [Conteo real pendiente para producción; inventario propio ya implementado](bloqueo/conteo-fisico.md)
- [Inventario nuevo en cero provisional, conteo completo al salir a producción](decision/inventario-desde-cero.md)
- [Kardex propio, documento de origen y apertura provisional](tabla/movimiento-inventario.md)
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
