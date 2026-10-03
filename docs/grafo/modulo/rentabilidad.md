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
  - frontend/src/pages/Rentabilidad.jsx
  - frontend/src/hooks/useRentabilidad.js
  - frontend/src/components/rentabilidad/GraficoBarras.jsx
  - frontend/src/components/rentabilidad/CuandoSeVende.jsx
  - frontend/src/utils/rentabilidadFormato.js
  - backend/tests/rentabilidad.test.js
  - backend/tests/rentabilidadFormato.test.js
  - backend/tests/rotacionVentas.test.js
aristas:
  depende_de: [tabla/venta-linea, tabla/alegra-products-cache]
  relacionado: [leccion/precio-sin-iva-costo-con-iva, leccion/un-borrador-no-es-una-venta, modulo/catalogo-agente, modulo/gestion-catalogo]
medido: 2026-10-03
---

Rehecho el 2026-09-25 a pedido del usuario: una sola pantalla, sin pestañas
(Competencia y el monitoreo de márgenes por fotos semanales se borraron).
Arriba el negocio entero; abajo los productos como tarjetas grandes; al tocar
uno, su detalle con sus propias gráficas (lista → detalle, como Cuentas por
Cobrar).

TRES RUTAS, TODAS DE LECTURA: `GET /api/rentabilidad/resumen`,
`/productos` (filtros `buscar`, `categoria`, `clase`, `costo`, `orden`,
`pagina`; 30 por página) y `/productos/:alegraItemId` (404 si está inactivo u
oculto).

DE DÓNDE SALE CADA CIFRA

- **Margen de hoy**: `clasificarProducto` (`precios/auditoria.js`), con la
  tarifa real del producto y el costo de las facturas si Alegra no lo tiene.
  La misma fórmula que Gestión de Catálogo — ver
  [[leccion/precio-sin-iva-costo-con-iva]].
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
