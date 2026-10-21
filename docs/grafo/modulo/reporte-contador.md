---
id: modulo/reporte-contador
tipo: modulo
titulo: Reporte del Contador — el mes de ventas y compras, de las tablas propias
estado: vigente
archivos:
  - backend/src/modules/reporte-contador/desdeElSistema.js
  - backend/src/modules/reporte-contador/reporte-contador.service.js
  - backend/src/modules/reporte-contador/reporte-contador.routes.js
  - frontend/src/pages/ReporteContador.jsx
  - frontend/src/hooks/useReporteContador.js
  - frontend/src/components/reporte-contador/TarjetaPeriodo.jsx
  - backend/tests/reporteContadorPropio.test.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea]
  relacionado: [modulo/compras, modulo/facturacion, bloqueo/impuestos-historicos-en-alegra, leccion/el-impuesto-es-de-cada-linea, modulo/gastos-operativos]
medido: 2026-10-03
---

QUÉ ES HOY

El control mensual que se le manda al contador: base e IVA de ventas, de
compras y de notas de crédito, por tarifa. El botón "Traer del sistema"
(`POST /reporte-contador/periodos/importar-sistema`) arma el mes desde
`factura`, `nota_credito` y `compra` (`desdeElSistema.js`) y lo guarda en
`reporte_contador_periodo` / `reporte_contador_linea`. De ahí en adelante todo
sigue igual: revisar, excluir, exportar a Excel y enviar.

Hasta el 2026-10-03 el mes se traía de la API de Alegra (`/invoices`,
`/credit-notes`, `/bills`). Ese camino se quitó entero. Queda la subida del
Excel que exportaba Alegra, para revisar un mes viejo contra su archivo.

LAS REGLAS

- Solo documentos vigentes: factura y nota de crédito `emitida`, compra que no
  esté `anulada`.
- En ventas, las líneas con `impuesto_id` (la exenta va, con 0 %; la que no
  tiene impuesto asignado, no).
- El impuesto es el del documento (`impuesto_monto`), redondeado por línea.
  No se vuelve a multiplicar base × tarifa.
- Las notas de crédito van aparte, en positivo, con la factura que rectifican.
- En compras, `compra_linea` guarda el MONTO del impuesto que vino en el XML,
  no la tarifa: se despeja (impuesto ÷ base) y se lleva a la tarifa legal más
  cercana, con medio punto de tolerancia. Una bonificación (descuento del
  100 %) se despeja contra el precio sin descontar. De 8.465 líneas con
  impuesto, 20 no calzan con ninguna tarifa legal y salen con el porcentaje
  que resulta, sin tipo de tarifa.
- En compras traídas del sistema NO se buscan duplicados. El detector existía
  porque en Alegra la misma compra quedaba registrada dos veces; `compra` es
  única por la clave de Hacienda. Lo único que encontraba en una compra propia
  era al proveedor que facturó lo mismo en dos renglones, y lo excluía.

LO QUE SE MIDIÓ (contra los períodos guardados, que se trajeron de Alegra)

Ventas, el mismo resultado:

| Mes | Documentos | Base | IVA |
|---|---|---|---|
| Julio 2026 | 189 = 189 | ₡6.288.936 = ₡6.288.936 | ₡776.747 contra ₡776.748 |
| Agosto 2026 | 186 = 186 | ₡5.771.050 = ₡5.771.050 | ₡709.453 = ₡709.453 |

Junio da una factura más (la 14822, hecha en setiembre con fecha 30 de junio,
después de que se trajo ese mes).

Compras, a propósito NO da lo mismo. Lo guardado tenía tres errores que venían
de Alegra y el sistema no tiene:

1. Compras registradas dos veces (cada línea repetida). Había que excluirlas a
   mano cada mes: 188, 140 y 142 líneas en junio, julio y agosto.
2. La tarifa era la del producto en Alegra, no la de la factura del proveedor.
   En las compras que están en los dos lados, el IVA guardado era mayor que el
   de las facturas: ₡34.106 en junio (todo salía al 13 %), ₡14.873 en julio y
   ₡3.284 en agosto. Es lo que anota
   [[bloqueo/impuestos-historicos-en-alegra]], ahora medido también para junio.
3. Combustible con un 0,5 % que el proveedor no cobró.

TRAMPA

"Volver a traer" reemplaza el período guardado y sus exclusiones. En un mes
que YA se le entregó al contador con los números de Alegra, traer las compras
del sistema cambia el IVA (da el del proveedor, que es menor). Lo ya entregado
lo deciden el usuario y su contador: ver el bloqueo.

El reporte no incluye gastos que no entran como `compra` (los que en Alegra se
cargaban a mano y nunca pasaron por el buzón).


## Gastos operativos — 2026-10-21

Las líneas originales de gastos operativos no se convierten en crédito de IVA por despejar una tarifa. Se excluyen de la importación automática comercial; su revisión, importes y originales se consultan en la ficha del gasto.
Ver [[modulo/gastos-operativos]]; requiere SQL 061, pendiente de producción.
