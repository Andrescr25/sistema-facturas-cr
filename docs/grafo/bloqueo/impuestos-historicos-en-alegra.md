---
id: bloqueo/impuestos-historicos-en-alegra
tipo: bloqueo
titulo: Lo ya registrado con la tarifa equivocada sigue así — decisión del usuario y su contador
estado: vigente
archivos:
  - backend/src/modules/precios/costo.js
  - backend/src/modules/reporte-contador/desdeElSistema.js
aristas:
  relacionado: [leccion/el-impuesto-es-de-cada-linea]
medido: 2026-10-04
---

El código está corregido ([[leccion/el-impuesto-es-de-cada-linea]]); los
registros viejos, no:

- **Compras en Alegra (ids equivocados, 2026-07-10 → 09-11):** en 170
  facturas de proveedor, 82 líneas al 1 % quedaron al 4 %, 19 al 2 % al 8 % y
  22 exentas al 0,5 % — ≈ ₡16.674 de IVA de compras de más. Además 9
  productos quedaron al 4 % y 3 al 8 %.
- **Compras antes del 2026-07-10 (13 % fijo):** 687 de las 689 facturas
  procesadas hasta entonces se enviaron así. No se midió cuántas tienen
  líneas de otra tarifa.
- **Ventas emitidas por Facturación (hasta 2026-09-12):** 213 líneas en 147
  facturas de productos al 1 % cobradas al 13 %, 13 líneas al 2 %, 6 exentas.
  En sentido contrario, 67 líneas de productos al 13 % facturadas al 0 % y 13
  al 0,5 %, que PUEDEN ser exoneraciones legítimas.

POR QUÉ NO SE TOCA: son comprobantes que Hacienda ya recibió. Corregirlos en
Costa Rica normalmente es con notas de crédito o débito formales, no editando
en silencio. Lo deciden el usuario y su contador, junto con el resto del
trabajo de Hacienda. No reabrir el arreglo del código: ya está bien.
