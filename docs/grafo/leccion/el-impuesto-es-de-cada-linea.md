---
id: leccion/el-impuesto-es-de-cada-linea
tipo: leccion
titulo: Un impuesto "principal" usado como si fuera el de cada línea — tres veces
estado: vigente
archivos:
  - backend/utils/impuestosAlegra.js
  - frontend/src/hooks/useFacturacion.js
  - backend/src/modules/revision-precios/revision-precios.service.js
aristas:
  relacionado: [bloqueo/impuestos-historicos-en-alegra, modulo/revision-precios, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-09-25
---

La misma familia de error, tres veces:

1. **2026-07-09 — compras a Alegra con 13 % fijo.** El envío de facturas de
   compra mandaba todas las líneas con `tax: [{ id: 1, percentage: 13 }]`,
   ignorando la tarifa del XML.
2. **2026-07-10 → 09-11 — ids de impuesto equivocados.** El mapeo tarifa → id
   de Alegra estaba escrito a mano y no era el de la cuenta: las líneas al
   1 % quedaban al 4 %, las de 2 % al 8 %, las exentas al 0,5 %. Ahora
   `cargarImpuestosAlegra` los toma de `GET /taxes` (caché de 6 h; 503 si
   Alegra no responde, nunca un id inventado).
3. **Hasta 2026-09-12 — Facturación armaba cada línea con el impuesto de la
   factura.** `agregarProductoAFactura` usaba el impuesto principal en vez de
   `producto.tax`: productos al 1 % y 2 % facturados al 13 %.

CÓMO APLICARLO: antes de dar por buena una corrección de impuestos, buscar si
algún otro lugar toma el impuesto de la factura (o un 13 %) en vez del de la
línea o el producto. El campo `impuesto` de una línea de factura de proveedor
guarda el MONTO en colones, no el porcentaje: el % sale de
`impuesto / (totalLinea − impuesto)` (`calcularPorcentajeIva`).

Lo ya registrado con la tarifa equivocada no se corrigió: ver
[[bloqueo/impuestos-historicos-en-alegra]].
