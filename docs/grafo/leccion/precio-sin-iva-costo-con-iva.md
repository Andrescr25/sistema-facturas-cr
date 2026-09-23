---
id: leccion/precio-sin-iva-costo-con-iva
tipo: leccion
titulo: El precio va sin IVA y el costo con IVA — compararlos crudos da un margen falso
estado: vigente
archivos:
  - backend/src/modules/precios/costo.js
  - backend/src/modules/precios/auditoria.js
  - backend/src/modules/catalogo-clientes/precio.js
  - backend/tests/auditoria.test.js
aristas:
  relacionado: [tabla/alegra-products-cache, modulo/gestion-catalogo, decision/la-regalia-no-es-costo]
medido: 2026-09-23
---

En Alegra `price` va SIN impuesto y `cost` (`inventory.unitCost`) CON él.
Compararlos crudos da un margen falso: ₡5.625 contra ₡4.764,64 se lee como
15 % cuando el real es 25 %.

Y la tarifa no es siempre 13 %: Costa Rica tiene 0/1/2/4/8/13 %. Hasta
2026-09-23 `clasificarProducto` asumía 13 % para todos, así que un producto
al 1 % con margen real de 20 % aparecía con 28,5 % en Gestión de Catálogo y
en Rentabilidad (76 productos visibles no van al 13 %). Ahora recibe
`tasaIva`, y `tasaIvaDe` cae al 13 % solo si la tarifa no se sincronizó.

CÓMO APLICARLO

- Costo real por unidad: `calcularCostoUnitarioPropio` (`precios/costo.js`).
- Precio con impuesto: `precioConImpuesto` (`catalogo-clientes/precio.js`).
- Margen: `clasificarProducto` con `tasaIva: tax_percentage`.
- Nunca multiplicar ni dividir por 1,13 a mano. `tax_percentage` NULL es "no
  sincronizado", no "exento".
- Al corregir precios en masa: solo subir, nunca bajar. Una sugerencia menor
  que el precio actual señala un costo mal medido (un empaque de 144 sin
  factor de conversión), no un precio mal puesto.
