---
id: leccion/el-impuesto-es-de-cada-linea
tipo: leccion
titulo: Un impuesto "principal" usado como si fuera el de cada línea — tres veces
estado: vigente
archivos:
  - backend/src/modules/precios/costo.js
  - backend/src/modules/productos-revision/productoDesdeLinea.js
  - frontend/src/hooks/useFacturacion.js
  - frontend/src/utils/revisionPreciosUtils.js
  - backend/tests/porcentajeIva.test.js
aristas:
  relacionado: [bloqueo/impuestos-historicos-en-alegra, modulo/revision-precios, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


**En esta rama (2026-10-04):** la lección sigue valiendo, pero el código donde
nació ya no está. `utils/impuestosAlegra.js` —elegir el impuesto de Alegra
para cada línea de una compra— se retiró con `enviarFacturaAlegra`. Lo que
queda es su aritmética, `calcularPorcentajeIva` (en `precios/costo.js`): el
IVA REAL de la línea, del que salen el costo de cada compra y el impuesto que
se le propone a un producto nuevo (`productoDesdeLinea.js`). La cuarta vez que
apareció fue en la pantalla de Revisión de Precios: un producto exento se
analizaba al 13 % (`tarifaDeAnalisis`).

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
