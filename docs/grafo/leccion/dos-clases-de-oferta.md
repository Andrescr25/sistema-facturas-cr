---
id: leccion/dos-clases-de-oferta
tipo: leccion
titulo: Exceso y baja de precio son ofertas distintas — confundirlas descuenta dos veces
estado: vigente
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - backend/src/modules/precios/ofertasPorBaja.js
aristas:
  relacionado: [modulo/catalogo-agente, leccion/precio-sin-iva-costo-con-iva, modulo/preventa-por-enlace]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


Los catálogos (agente y cliente) muestran dos clases de oferta:

- **Exceso de inventario** (`descuentoPorcentaje`): el precio del catálogo es
  el normal y el descuento se aplica ENCIMA al vender. La tarjeta lo calcula.
- **Baja de precio** (`precioAntes`): se decidió en Revisión de Precios
  resignando margen, y el precio del catálogo YA es el rebajado.

Pasarle `descuentoPorcentaje` a una baja de precio la descuenta dos veces, y
el agente le promete al cliente un precio que no existe. Son dos props
separadas en `TarjetaProductoAgente.jsx`. Desde el 2026-10-07 la baja dice
«OFERTA» con el porcentaje en cualquier vista. Sigue siendo `precioAntes`:
antes tachado y precio base intacto. `conPromocionesDelCatalogo` adjunta la
promoción a su familia, búsqueda e historial sin aplicar descuentos ni mutar
la caché. Si también hay liquidación, esta etiqueta/cálculo tiene prioridad.

Qué entra en "Bajamos el precio" lo decide `ofertasPorBaja.js`: precio más
bajo Y al menos `PUNTOS_MARGEN_MINIMO` (5) puntos de margen menos. Un precio
que bajó porque bajó el costo no es oferta: se gana lo mismo de siempre.

El PDF de preventa mezcla ambas clases dentro de categoría/subcategoría:
Oferta para la baja vigente del precio base, Liquidación para el descuento
activo con existencia física. Puede tener ambas etiquetas en una sola ficha.
mapProducto aplica la liquidación una vez; el PDF no vuelve a descontar la
baja ni la liquidación. Comparar la revisión de precio con precioLista si
hay liquidación y tachar precio anterior solo si supera el final. La opción
interna limite:null incluye todas las bajas; la ruta pública conserva sus
topes. Históricos, regalías, porcentajes ≥100 o existencia cero no se
promocionan como liquidación vendible. Casos PostgreSQL con rollback en
preventaPdf.test.js y evidencia en el informe de catálogo visual.
