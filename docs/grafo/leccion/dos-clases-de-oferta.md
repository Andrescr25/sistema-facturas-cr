---
id: leccion/dos-clases-de-oferta
tipo: leccion
titulo: Exceso y baja de precio son ofertas distintas — confundirlas descuenta dos veces
estado: vigente
archivos:
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - backend/src/modules/precios/ofertasPorBaja.js
  - backend/src/modules/portal-clientes/preventaPdf.service.js
aristas:
  relacionado: [modulo/catalogo-agente, leccion/precio-sin-iva-costo-con-iva, modulo/preventa-por-enlace]
medido: 2026-10-05
---

Los catálogos (agente y cliente) muestran dos clases de oferta:

- **Exceso de inventario** (`descuentoPorcentaje`): el precio del catálogo es
  el normal y el descuento se aplica ENCIMA al vender. La tarjeta lo calcula.
- **Baja de precio** (`precioAntes`): se decidió en Revisión de Precios
  resignando margen, y el precio del catálogo YA es el rebajado.

Pasarle `descuentoPorcentaje` a una baja de precio la descuenta dos veces, y
el agente le promete al cliente un precio que no existe. Son dos props
separadas en `TarjetaProductoAgente.jsx`. En el catálogo de "Cliente nuevo"
la baja de precio dice "OFERTA" en vez del porcentaje (`comoOferta`), pero
sigue siendo `precioAntes`: el precio de antes se ve tachado y no se descuenta
nada encima.

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
