---
id: modulo/rentabilidad
tipo: modulo
titulo: Rentabilidad — margen por producto, rotación real y cuándo se vende, en una sola pantalla
estado: vigente
archivos:
  - backend/src/modules/rentabilidad/rentabilidad.service.js
  - backend/src/modules/rentabilidad/rentabilidad.routes.js
  - backend/src/modules/ventas/rotacion.js
  - backend/src/modules/ventas/estadisticas.js
  - backend/src/modules/precios/costoDerivado.js
  - backend/src/modules/precios/costoHistorico.js
  - backend/migrations/independencia/037_costo_historico_con_producto.sql
  - backend/tests/costoDerivadoPropio.test.js
  - frontend/src/pages/Rentabilidad.jsx
  - frontend/src/hooks/useRentabilidad.js
  - frontend/src/components/rentabilidad/GraficoBarras.jsx
  - frontend/src/components/rentabilidad/CuandoSeVende.jsx
  - frontend/src/utils/rentabilidadFormato.js
  - backend/tests/rentabilidad.test.js
  - backend/tests/rentabilidadFormato.test.js
  - backend/tests/rotacionVentas.test.js
  - backend/tests/rotacionMensual.test.js
  - backend/src/modules/rentabilidad/rentabilidad.excel.js
  - frontend/src/components/rentabilidad/ListaProductos.jsx
  - frontend/src/components/rentabilidad/DetalleProducto.jsx
  - docs/informes/rotacion-productos-2026-10-14.md
aristas:
  depende_de: [tabla/venta-linea]
  relacionado: [leccion/precio-sin-iva-costo-con-iva, leccion/un-borrador-no-es-una-venta, modulo/catalogo-agente, modulo/gestion-catalogo, modulo/exportaciones-reportes, modulo/relacionar-productos]
medido: 2026-10-14
---

Rehecho el 2026-09-25 a pedido del usuario: una sola pantalla, sin pestañas
(Competencia y el monitoreo de márgenes por fotos semanales se borraron).
Arriba el negocio entero; abajo los productos como tarjetas grandes; al tocar
uno, su detalle con sus propias gráficas (lista → detalle, como Cuentas por
Cobrar).

CINCO RUTAS, TODAS DE LECTURA: `GET /api/rentabilidad/resumen`,
`/productos` (filtros `buscar`, `categoria`, `clase`, `costo`, `orden`,
`pagina`; 30 por página) y `/productos/:productoId` (404 si está inactivo u
oculto, o si el id no es un entero); `/exportar` y
`/productos/:productoId/exportar` descargan Excel. La primera toma TODOS los
productos filtrados en el mismo orden de la lista, sin paginación, con el
resumen y las seis series del negocio completo. La segunda, la ficha y sus
propias series. Ver [[modulo/exportaciones-reportes]].

TODO VA POR `producto.id` (2026-10-03): la lista, el detalle, las ventas, la
rotación y el costo. La ficha ya no lleva `alegraItemId`, y el id de Alegra
de un producto NO abre su detalle: aceptar los dos espacios habría abierto
otro producto en silencio el día que coincidan los números.

DE DÓNDE SALE CADA CIFRA

**Promedio mensual, aclaración del usuario 2026-10-14:** unidades vendidas
en los últimos **tres meses calendario completos / 3**, incluidos meses sin
ventas. En octubre se promedian julio, agosto y septiembre; octubre entra
en noviembre. La fórmula previa dividía una ventana móvil entre tres, que
incluía parte del mes en curso. Rentabilidad pide ahora
`rotacionPorProducto({ promedioMesesCompletos: true })`. El SQL lee ambas
ventanas en una sola consulta; filtros de agregación conservan los totales,
semanas, facturas, clientes y Pareto vigentes. Incluye productos que sólo
vendieron al inicio del primer mes completo, aunque su total móvil sea cero.
La tarjeta y el detalle destacan **Promedio mensual / Últimos 3 meses
completos**; el Excel exporta la misma cifra. Catálogo y el motor de precios
conservan sus ventanas anteriores. [Pruebas y límites](../../informes/rotacion-productos-2026-10-14.md).

- **Margen de hoy**: `clasificarProducto` (`precios/auditoria.js`), con la
  tarifa real del producto y, si la ficha no tiene costo, el de las compras.
  La misma fórmula que Gestión de Catálogo — ver
  [[leccion/precio-sin-iva-costo-con-iva]].
- **Costo de las compras** (`precios/costoDerivado.js`): la mediana de las
  últimas 6 compras válidas de `costo_historico`, por `producto_id`. Tres
  cosas que no se ven:
  - La fila del historial NACE con su `producto_id` (`costoHistorico.js`).
    Antes solo lo rellenaba la migración 005, y toda compra registrada después
    quedaba fuera del costo del producto. La 037 empareja lo que quedó atrás.
  - Dos compras el mismo día empataban y Postgres elegía cuáles entraban a la
    ventana: 6 de 1.356 productos cambiaban de costo entre consultas. Se
    desempata por `id`. Con eso, el costo por id propio y por id de Alegra
    coinciden en los 1.356.
  - La VALIDEZ de una fila también es por el producto propio: cuenta si su
    línea del buzón sigue relacionada y sigue siendo de ESE producto
    (`productos_factura_proveedor.producto_id`, migración 038). Mientras se
    comparaban los ids de Alegra de los dos lados, un producto sin ficha allá
    no podía tener costo de compras; ya puede
    ([[modulo/relacionar-productos]]). Medido al cambiarlo: 7.886 filas
    válidas antes y las mismas 7.886 después.
- **Lo que dejó en 3 meses**: lo cobrado sin IVA menos lo que esas unidades
  cuestan HOY sin IVA. Es estimado (el historial no guarda el costo del día de
  la venta) y solo se calcula con costo confiable; si no, queda vacío, no en
  cero. El margen ponderado del negocio es sobre lo vendido CON costo.
- **Rotación** (`ventas/rotacion.js`): unidades de los últimos 3 meses,
  Pareto — A hasta el 80 % de las unidades, B hasta el 95 %, C el resto; el
  que cruza el corte queda arriba. Se calcula en cada consulta desde
  [[tabla/venta-linea]] (las facturas propias, por `producto.id`); ya no hay
  foto, script ni sincronización con Alegra
  (`producto_rotacion` y `scripts/calcular-rotacion.js` quedaron sin uso).
  El mismo SQL lo leen el catálogo de "Cliente nuevo" y Gestión de Catálogo;
  el motor de precios (Revisión de Precios, `simular-precios.js`) lo lee con
  12 meses para no descalibrar sus umbrales.
- **Cuándo se vende** (`ventas/estadisticas.js`): últimas 26 semanas, 24
  meses, cada año (con desde/hasta si está a medias), y promedios por día del
  mes, día de la semana y mes del año. Los promedios son POR DÍA DE
  CALENDARIO: "el 31 se vende más" no puede salir de que solo 7 meses tienen
  31. Para el negocio se grafica la plata (sumar clavos con galones no dice
  nada); para un producto, las unidades.

Los días son de Costa Rica, calculados en la base
(`now() AT TIME ZONE 'America/Costa_Rica'`); las fechas viajan como texto
AAAA-MM-DD para no correrse de día en el servidor ni en el navegador.

La lista vive 30 s en memoria del proceso: ir y volver del detalle no
recalcula 1.900 productos. El resumen tarda ~3 s contra producción.

LAS GRÁFICAS son SVG a mano (`GraficoBarras.jsx`): un solo tono, el período
en curso más claro, las más altas resaltadas, tooltip al pasar o enfocar y
"Ver tabla" como alternativa accesible. `rentabilidadFormato.js` no puede
tener imports: lo carga `rentabilidadFormato.test.js` con `new Function`.
