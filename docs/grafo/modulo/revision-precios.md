---
id: modulo/revision-precios
tipo: modulo
titulo: Revisión de Precios — costos y precios de la factura del proveedor, contra el maestro propio
estado: vigente
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - backend/src/modules/revision-precios/revision-precios.controller.js
  - backend/src/modules/compras/compras.controller.js
  - frontend/src/pages/RevisionPrecios.jsx
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/src/modules/revision-precios/revision-precios.routes.js
  - backend/src/modules/compras/compras.service.js
  - backend/src/modules/precios/costo.js
  - backend/src/modules/precios/config.js
  - backend/migrations/add_margenes_bolsas_y_moto.sql
  - backend/src/modules/ventas/rotacion.js
  - backend/tests/revisionPreciosPropia.test.js
  - backend/tests/revisionPreciosRedondeo.test.js
  - backend/tests/registrarCompra.test.js
  - frontend/src/hooks/useRevisionPrecios.js
  - frontend/src/components/revision-precios/RevisionFactura.jsx
  - frontend/src/components/revision-precios/TarjetaFactura.jsx
  - frontend/src/utils/revisionPreciosUtils.js
aristas:
  depende_de: [tabla/supplier-product-mapping, tabla/facturas-proveedores]
  relacionado: [modulo/relacionar-productos, modulo/compras, modulo/facturas-ordenes-compra, decision/la-regalia-no-es-costo, leccion/factura-enviada-no-se-repite, leccion/el-impuesto-es-de-cada-linea, leccion/precio-sin-iva-costo-con-iva, leccion/ids-propios-y-de-alegra-no-se-mezclan, modulo/gastos-operativos]
medido: 2026-10-21
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


## Orden de compra en la revisión (2026-10-14)

`GET /revision-precios/facturas/:facturaId/ordenes-compra` consulta, con el permiso
de esta pantalla, pedidos con envío confirmado del proveedor exacto cuya
facturación comercial no esté completa y confiable. READ ONLY/REPEATABLE READ,
sin preparar nada. Una factura parcial conserva la orden como candidata para
otras facturas. Si hay una candidata confiable se asigna automáticamente al
Registrar compra; si hay varias o la única conserva una fuente incierta aparece
un único selector junto al encabezado. No obliga a entrar a paneles en Reporte
Proveedores. Si no hay candidatas, la compra se registra como siempre.

El hook separado usa la identidad de la factura para ignorar consultas tardías.
Un error de consulta ofrece Reintentar y bloquea el registro; una selección
ambigua también. El servidor revalida con el mismo bloqueo/transacción de compra.
El registro conserva la revisión hasta terminar: un conflicto permite elegir de
nuevo sin perder precios. Hacienda continúa después del COMMIT, como antes.

La comparación comercial usa el vínculo por UUID/ficha propia y compra_linea;
detalle en [[modulo/facturas-ordenes-compra]]. Facturado/Parcial/No facturado se
muestra sólo tras el registro revisado, sin afirmar llegada física de mercancía.

Una orden de 10 facturada primero por 6 admite después el comprobante de 4. Si
además hay una nueva orden sin factura, la persona elige: no se usa FIFO, fecha
ni parecido de productos para desviar el comprobante. Una compra anterior
alterada o un vínculo del buzón todavía sin registrar requieren elección y no
prueban que el pedido esté completo. Un vínculo previo de la factura que se está
revisando muestra y conserva su propia OC, aunque existan otras candidatas.
La identidad automática mostrada viaja también al guardar: una parcial completada
por otro registro no desvía en silencio la factura hacia otra candidata única.

Las facturas de los proveedores llegan al buzón, se relacionan línea por
línea ([[modulo/relacionar-productos]]) y acá se mira cómo cambió el costo y
se ajusta el precio de venta antes de **Registrar compra**
([[modulo/compras]]).

## De dónde sale lo que muestra (2026-10-04)

Todo del maestro propio, por `producto.id`:

- **Las facturas** (`GET /facturas`, `/facturas-relacionadas`) traen cada
  línea con su `productoPropioId`. `producto_id` no está en el esquema de
  Prisma, así que se agrega aparte, en una consulta.
- **Los productos de la factura** (`POST /productos-batch` con `productoIds`):
  nombre, precio con IVA, costo con IVA y tarifa, de `producto` e `impuesto`.
- **El precio sugerido** (`GET /facturas/:id/sugerencias-precio`): el costo de
  ESTA compra, el margen meta de la categoría del producto (`config_precios`,
  llaveada por nombre de categoría) y su rotación de 12 meses
  (`SQL_ROTACION_PRECIOS`, por `producto.id`).

Antes la pantalla le pedía el precio y el costo a **Alegra en vivo**, un
producto por llamada, y las sugerencias salían por el id de Alegra con la
categoría de la caché. Dos consecuencias: el precio que se comparaba era el
de Alegra y no el del sistema —y "Registrar compra" cambia el precio en
`producto`—, y un producto sin ficha en Alegra no se podía revisar.

Comparado al cambiarlo, sobre las 60 facturas más recientes: las mismas 499
líneas con sugerencia; 411 idénticas y 88 distintas **solo** porque el
maestro tiene la categoría de hoy y la caché local estaba vieja.

## 0 % es una tarifa; "sin impuesto" es otra cosa

Con Alegra, un producto exento y uno al que nunca se le puso el impuesto
llegaban igual, y a los dos se los analizaba al 13 %. En el maestro propio
son dos estados distintos y se tratan distinto (`tarifaDeAnalisis`):

- **exento** (impuesto de 0 %): se analiza con 0 %. Al 13 % se le quitaba a
  su costo un IVA que no trae y el margen salía más alto de lo que es (en la
  prueba: 29 % en vez de 20 %);
- **sin impuesto asignado** (`null`): se sigue asumiendo 13 %, como siempre.
  Son productos a corregir, no exentos.

## Registrar compra usa el producto de la LÍNEA

`registrarCompra` tomaba el producto del mapeo (`SELECT l.*, m.producto_id`:
las dos columnas se llaman igual y ganaba la del mapeo sin que se notara).
Casi siempre coinciden; cuando no —el código del proveedor se volvió a
relacionar con otro producto después—, la revisión mostraba un producto y el
costo y el precio se le escribían a otro. Ahora es el de la línea, con el del
mapeo de respaldo. Ninguna factura pendiente de la copia local estaba en ese
caso al medirlo.

## El margen meta se busca por el NOMBRE de la categoría

`config_precios` guarda el margen meta y el mínimo de cada categoría, llaveada
por su nombre; la que no tiene fila usa `__default__` (25 % / 12 %). Los
valores son la mediana real del margen de cada categoría, no números redondos.

**Bolsas y Desechables** y **Línea de Moto** (204 productos activos) no tenían
fila: se crearon al reordenar el catálogo, separándolas de Línea Plástica y
Línea de Ciclo, y nadie se las puso. El usuario delegó la decisión el
2026-10-04 y se les dio la mediana medida ese día con el cálculo de
Rentabilidad, el mismo criterio del resto de la tabla: **29,1 % / 17 %** y
**28,4 % / 16 %**. Es más de lo que venían usando: el motor les sugería
precios por debajo de lo que ya dejan. Ese cálculo reproduce lo que estaba
configurado (Ferretería 25,0 contra 25; Librería 28,9 contra 29,2), que es lo
que da confianza en el método. Aplicado en producción y en la copia local;
cómo deshacerlo está en `backend/migrations/add_margenes_bolsas_y_moto.sql`.

Al crear una categoría nueva hay que ponerle su fila; si no, cae en el margen
por defecto y nadie se entera. No hay pantalla para editar estos márgenes.

## Ya no queda nada de Alegra

`enviarFacturaAlegra` —el "Enviar a Alegra" de antes: `POST /bills` y un
`PUT /items` por producto— se retiró el 2026-10-04 con sus ayudantes
(`construirItemsFactura`, `actualizacionDeLinea`, `POST /enviar-alegra`) y con
`utils/impuestosAlegra.js`, que elegía el impuesto de Alegra para cada línea.
La pantalla no lo llamaba desde que existe "Registrar compra". El servicio
pasó de 941 líneas a 308 en dos días.

Lo que ese camino cuidaba sigue cuidado en `compras.service.js`:
[[decision/la-regalia-no-es-costo]] y no registrar dos veces la misma factura
([[leccion/factura-enviada-no-se-repite]], que acá queda como historia).

Se quitaron el 2026-10-04, por no tener pantalla, pruebas ni nadie que las
llamara: `/productos-pendientes` (sugerencias desde la caché),
`/confirmar-producto` y `/rechazar-producto` (relacionaban por el id de
Alegra), `/estadisticas`, y `/actualizar-precio`, que además reescribía el
precio de la línea de la factura RECIBIDA. También el botón "Sincronizar",
que traía de Alegra los costos y precios.

AL REGISTRAR, LA COMPRA SE ACEPTA SOLA ANTE HACIENDA (2026-10-12). El botón
«Respuesta a Hacienda» y su formulario se fueron: el servidor prepara y envía
la aceptación total apenas la compra queda registrada, el aviso dice cómo
salió, la compra ya registrada muestra el avance y la lista de Registradas
lo resume en una etiqueta («Aceptada en Hacienda», «Aceptación en camino»,
«Falta aceptarla en Hacienda», «Hacienda la rechazó»; las anteriores al corte
siguen diciendo «Registrada»). Todo el detalle en [[modulo/hacienda]], "LA
COMPRA SE ACEPTA SOLA".



## Gastos operativos — 2026-10-21

El menú de cada factura pendiente permite procesarla como gasto operativo sin relacionar productos. La preferencia futura es opcional. Los gastos no se devuelven al catálogo ni se registran por el botón comercial.
Ver [[modulo/gastos-operativos]]; requiere SQL 061, pendiente de producción.
