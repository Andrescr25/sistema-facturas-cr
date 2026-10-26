---
id: decision/solo-llega-lo-que-ingreso
tipo: decision
titulo: En Reporte Clientes solo «llega» lo que ingresó por Revisión de precios, y lo que ingresó se reparte
estado: vigente
archivos:
  - backend/migrations/independencia/067_faltante_ingreso.sql
  - backend/src/modules/missing-items/ingresoFaltante.js
  - backend/src/modules/missing-items/missing-items.service.js
  - backend/src/modules/reprinting/colaImpresion.js
  - backend/src/modules/reports/reporteClientes.service.js
  - backend/src/modules/compras/compraManual.service.js
  - backend/src/modules/compras/liberarCuentaPorPagar.js
  - frontend/src/utils/reporteClientesUtils.js
  - frontend/src/components/reporte-clientes/FilaProducto.jsx
  - frontend/src/utils/facturaManualUtils.js
  - frontend/src/hooks/useFacturaManual.js
  - frontend/src/components/revision-precios/ModalFacturaManual.jsx
  - backend/tests/ingresoFaltanteLocal.test.js
  - backend/tests/ingresoFaltanteReglas.test.js
  - backend/tests/dobles/compraIngresada.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea]
  relacionado: [modulo/faltantes, modulo/reporte-clientes, modulo/revision-precios, leccion/fecha-utc-costa-rica]
medido: 2026-10-25
---

## Qué pidió el usuario (2026-10-25)

«Crear algo para que el sistema sepa cuándo el producto del proveedor entra,
y así no dejar al usuario marcar algo como que sí llegó desde Reporte
Clientes si el sistema no ha detectado que el producto ingresara a través de
Revisión de precios.» Para lo que llega sin factura electrónica: «hay que
crear algo en Revisión de precios para meter una factura de compra a mano».
Sobre la cantidad eligió **repartir lo que ingresó**: lo que se usó para un
cliente no sirve para otro.

Medido antes en producción (45 días): de 674 faltantes marcados «Llegó todo»,
83 no tenían ninguna compra del producto detrás. 23 de esos productos venían
de proveedores que no mandan factura electrónica.

## La regla

**Ingresó** = una compra `registrada` con una línea de ese producto,
registrada después de anotarse el faltante. Se acepta hasta 12 horas antes,
porque la compra de la mañana puede registrarse antes de que Bodega anote el
faltante. Cuenta en unidades propias (`compra_linea.cantidad_propia`, que ya
trae el factor del proveedor).

- «Llegó todo» o «Parte» con N reparte N unidades **de la compra más vieja
  a la más nueva** y anota cada pedazo en `faltante_ingreso` (migración 067).
  Si no alcanza, el servidor responde 409 y dice cuánto hay.
- Lo que tiene asignado el mismo faltante no se le descuenta: confirmar la
  revisión lo vuelve a repartir sin chocar consigo mismo.
- «No llegó» siempre se puede, y suelta lo asignado. Quitar la respuesta
  también.
- Una compra anulada o devuelta deja de contar. Lo entregado en una factura
  anulada vuelve a quedar libre.
- Al enviar a Impresión se revisa otra vez que cada entrega siga respaldada,
  porque una compra pudo anularse después de marcar (`encolarDesdeReporte`).
- Un candado por producto (`pg_advisory_xact_lock(67001, producto)`) impide
  que dos faltantes se repartan la misma unidad al mismo tiempo.
- `compra.creado_en` se escribe con `AHORA_CR_SQL` en Registrar compra y en
  la compra a mano, porque se compara contra `faltantes.created_at`, que está
  en hora de Costa Rica ([[leccion/fecha-utc-costa-rica]]).

Reporte Clientes recibe `ingreso_disponible` por faltante pendiente. La
pantalla apaga los botones que no alcanzan y avisa: «Todavía no ingresa por
Revisión de precios» o «Ingresaron N de M». Lo que manda es el servidor: el
dato de la pantalla puede quedar viejo si otro cliente del mismo producto se
marca primero.

## La factura cargada a mano

En Revisión de precios, «Cargar factura a mano» (`POST /compras/manual`, con
el mismo permiso que Registrar compra). Se cargan:

- proveedor, número del papel y fecha;
- contado, o crédito con su plazo;
- líneas con producto, cantidad en unidades propias y costo por unidad con
  IVA.

El IVA sale de la tarifa del producto, nunca de un 13 % fijo.

Hace lo mismo que Registrar compra: entra al inventario
(`reconciliarDocumentoEn`), actualiza el costo (`actualizarProductoDeLinea`)
y deja la cuenta por pagar, que es PENDIENTE de contado o a crédito
(`crearCuentaACredito`).

No tiene clave ni XML, así que no se acepta ante Hacienda.
`factura_proveedor_id` queda en NULL. Un índice único parcial de la 067
impide cargar dos veces el mismo número del mismo proveedor.

Por ahora aparece en la hoja «Compras» del Excel del contador como cualquier
otra compra, porque la regla vigente de ese reporte es «todas las compras».
Si el usuario quiere sacarla de ahí, es un filtro por `clave IS NOT NULL` en
`reporte-contador/desdeElSistema.js`.
