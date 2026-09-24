---
id: leccion/dos-clases-de-oferta
tipo: leccion
titulo: Exceso y baja de precio son ofertas distintas — confundirlas descuenta dos veces
estado: vigente
archivos:
  - frontend/src/components/catalogo-agente/TarjetaProductoAgente.jsx
  - backend/src/modules/precios/ofertasPorBaja.js
aristas:
  relacionado: [modulo/catalogo-agente, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-09-23
---

Los catálogos (agente y cliente) muestran dos clases de oferta:

- **Exceso de inventario** (`descuentoPorcentaje`): el precio del catálogo es
  el normal y el descuento se aplica ENCIMA al vender. La tarjeta lo calcula.
- **Baja de precio** (`precioAntes`): se decidió en Revisión de Precios
  resignando margen, y el precio del catálogo YA es el rebajado.

Pasarle `descuentoPorcentaje` a una baja de precio la descuenta dos veces, y
el agente le promete al cliente un precio que no existe. Son dos props
separadas en `TarjetaProductoAgente.jsx`.

Qué entra en "Bajamos el precio" lo decide `ofertasPorBaja.js`: precio más
bajo Y al menos `PUNTOS_MARGEN_MINIMO` (5) puntos de margen menos. Un precio
que bajó porque bajó el costo no es oferta: se gana lo mismo de siempre.
